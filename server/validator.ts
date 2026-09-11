import { parse, Statement, SelectStatement } from 'pgsql-ast-parser';
import { TableMetadata } from './schema.ts';
import { config } from './config.ts';

export interface ValidationCheckResult {
  status: 'passed' | 'failed' | 'not_applicable';
  message: string;
}

export interface ValidationReport {
  isValid: boolean;
  checks: {
    syntax: ValidationCheckResult;
    readOnly: ValidationCheckResult;
    objects: ValidationCheckResult;
    functions: ValidationCheckResult;
    limits: ValidationCheckResult;
  };
  errors: string[];
  normalizedSql?: string;
  referencedTables: string[];
}

const ALLOWED_FUNCTIONS = new Set([
  'avg',
  'sum',
  'count',
  'min',
  'max',
  'round',
  'coalesce',
  'nullif',
  'lower',
  'upper',
  'trim',
  'length',
  'date_trunc',
  'extract',
  'to_char',
  'abs',
  'concat',
  'ceil',
  'floor',
  'mod',
  'sqrt',
  'power',
  'cast',
]);

const FORBIDDEN_WORDS = [
  /\binsert\b/i,
  /\bupdate\b/i,
  /\bdelete\b/i,
  /\bdrop\b/i,
  /\balter\b/i,
  /\bcreate\b/i,
  /\btruncate\b/i,
  /\bgrant\b/i,
  /\brevoke\b/i,
  /\bcopy\b/i,
  /\bcall\b/i,
  /\bdo\b/i,
  /\bselect\s+into\b/i,
  /\bpg_sleep\b/i,
  /\bpg_read_file\b/i,
  /\bpg_catalog\b/i,
  /\binformation_schema\b/i,
  /\bclarity_app\b/i,
];

export function validateSql(
  sql: string,
  authorizedTables: TableMetadata[]
): ValidationReport {
  const errors: string[] = [];
  const referencedTables: string[] = [];

  const checks: ValidationReport['checks'] = {
    syntax: { status: 'passed', message: 'SQL parsed successfully into PostgreSQL AST.' },
    readOnly: { status: 'passed', message: 'Only non-destructive SELECT operations allowed.' },
    objects: { status: 'passed', message: 'All referenced tables belong to active authorized schema.' },
    functions: { status: 'passed', message: 'All functions are verified safe analytical primitives.' },
    limits: { status: 'passed', message: `Row limits verified within maximum bound of ${config.maxResultRows}.` },
  };

  const trimmedSql = sql.trim().replace(/;+$/, '').trim();

  // Basic sanity check
  if (!trimmedSql) {
    return {
      isValid: false,
      checks: {
        syntax: { status: 'failed', message: 'Query string is empty.' },
        readOnly: { status: 'failed', message: 'Empty query.' },
        objects: { status: 'not_applicable', message: 'No tables analyzed.' },
        functions: { status: 'not_applicable', message: 'No functions analyzed.' },
        limits: { status: 'not_applicable', message: 'No limit analyzed.' },
      },
      errors: ['SQL query is empty.'],
      referencedTables: [],
    };
  }

  // 1. AST Parsing
  let ast: Statement[];
  try {
    ast = parse(trimmedSql);
  } catch (err: any) {
    checks.syntax = { status: 'failed', message: `Syntax error: ${err.message}` };
    errors.push(`SQL syntax error: ${err.message}`);
    return {
      isValid: false,
      checks,
      errors,
      referencedTables: [],
    };
  }

  // 2. Must be exactly one statement
  if (ast.length !== 1) {
    checks.syntax = { status: 'failed', message: `Expected 1 statement, but received ${ast.length}. Multi-statement execution is blocked.` };
    errors.push('Multiple SQL statements are prohibited.');
  }

  const statement = ast[0];

  // 3. Must be SELECT or WITH statement
  if (statement.type !== 'select' && statement.type !== 'with') {
    checks.readOnly = { status: 'failed', message: `Statement type '${statement.type}' is forbidden. Only SELECT queries are permitted.` };
    errors.push(`Disallowed statement type: ${statement.type}. Only SELECT queries are permitted.`);
  }

  const statementAny = statement as any;

  // Check CTE names to treat as authorized tables
  const cteNames = new Set<string>();
  if (statement.type === 'with' && Array.isArray(statementAny.bind)) {
    for (const b of statementAny.bind) {
      if (b.alias?.name) {
        cteNames.add(String(b.alias.name).toLowerCase());
      }
      if (b.statement && b.statement.type !== 'select') {
        checks.readOnly = { status: 'failed', message: 'Data-modifying operations inside WITH / CTE clauses are blocked.' };
        errors.push('CTE contains non-SELECT statement.');
      }
    }
  }

  // Set of valid schema table names
  const validTableNames = new Set(authorizedTables.map(t => t.name.toLowerCase()));

  // Walk AST to inspect tables and functions
  function walk(node: any) {
    if (!node || typeof node !== 'object') return;

    // Check table references
    if (node.type === 'table') {
      const rawName = typeof node.name === 'string' ? node.name : node.name?.name;
      const tableName = (typeof rawName === 'string' ? rawName : '').toLowerCase();

      const rawSchema = typeof node.name?.schema === 'string' ? node.name.schema : typeof node.schema === 'string' ? node.schema : '';
      const schemaName = (typeof rawSchema === 'string' ? rawSchema : '').toLowerCase();

      if (schemaName && schemaName !== 'public' && !schemaName.startsWith('data_')) {
        checks.objects = {
          status: 'failed',
          message: `Direct reference to schema '${schemaName}' is prohibited. Only active dataset tables are accessible.`
        };
        errors.push(`Unauthorized schema reference: ${schemaName}`);
      }

      if (tableName) {
        if (!referencedTables.includes(tableName)) {
          referencedTables.push(tableName);
        }

        if (!cteNames.has(tableName) && !validTableNames.has(tableName)) {
          checks.objects = {
            status: 'failed',
            message: `Table '${tableName}' does not exist in the active dataset schema.`
          };
          errors.push(`Table '${tableName}' was not found in dataset.`);
        }
      }
    }

    // Check function calls
    if (node.type === 'call') {
      const funcName = (node.function?.name || '').toLowerCase();
      if (funcName && !ALLOWED_FUNCTIONS.has(funcName)) {
        checks.functions = {
          status: 'failed',
          message: `Function '${funcName}' is not in the safe analytical allowlist.`
        };
        errors.push(`Disallowed function: ${funcName}`);
      }
    }

    // Recurse into object properties
    for (const key of Object.keys(node)) {
      if (key === 'type') continue;
      const child = node[key];
      if (Array.isArray(child)) {
        for (const item of child) {
          walk(item);
        }
      } else if (typeof child === 'object') {
        walk(child);
      }
    }
  }

  walk(statement);

  // Check limits
  const targetSelect = statement.type === 'with' ? statementAny.in : statementAny;
  if (targetSelect?.limit) {
    const limitVal = targetSelect.limit.limit;
    if (limitVal && limitVal.type === 'integer') {
      const num = parseInt(limitVal.value, 10);
      if (num > config.maxResultRows) {
        checks.limits = {
          status: 'failed',
          message: `Requested limit (${num}) exceeds maximum allowed of ${config.maxResultRows}.`
        };
        errors.push(`Limit of ${num} exceeds maximum permitted ${config.maxResultRows}.`);
      } else {
        checks.limits = {
          status: 'passed',
          message: `Query explicitly limits output to ${num} rows.`
        };
      }
    }
  } else {
    checks.limits = {
      status: 'passed',
      message: `No explicit limit provided; default server limit of ${config.maxResultRows} will be enforced.`
    };
  }

  const isValid = errors.length === 0;

  return {
    isValid,
    checks,
    errors,
    normalizedSql: trimmedSql,
    referencedTables,
  };
}
