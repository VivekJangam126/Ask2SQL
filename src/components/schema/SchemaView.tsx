import React, { useState, useMemo } from 'react';
import { useData } from '../../context/DataContext.tsx';
import {
  Layers,
  Search,
  Key,
  Link,
  Table as TableIcon,
  RefreshCw,
  Hash,
  FileText,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export function SchemaView() {
  const { activeDataset, schema, isLoadingSchema, refreshSchema } = useData();
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Toggle table expansion
  const toggleTable = (tableName: string) => {
    setExpandedTables(prev => ({
      ...prev,
      [tableName]: prev[tableName] === false ? true : false,
    }));
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshSchema();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Filter tables and columns by search term
  const filteredTables = useMemo(() => {
    if (!schema?.tables) return [];
    if (!searchTerm.trim()) return schema.tables;

    const term = searchTerm.toLowerCase();
    return schema.tables.filter(table => {
      const matchTableName = table.name.toLowerCase().includes(term);
      const matchColumnName = table.columns.some(col => col.name.toLowerCase().includes(term));
      return matchTableName || matchColumnName;
    });
  }, [schema, searchTerm]);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <Layers className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            <span>Schema Explorer</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Structural metadata, column datatypes, primary keys, and foreign key relations
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {schema?.fingerprint && (
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
              <span className="text-slate-400">Fingerprint:</span>
              <span className="font-mono font-medium text-indigo-600 dark:text-indigo-400">
                {schema.fingerprint}
              </span>
            </div>
          )}

          <button
            id="refresh-schema-explorer-btn"
            onClick={handleRefresh}
            disabled={isRefreshing || isLoadingSchema}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing || isLoadingSchema ? 'animate-spin text-indigo-600' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search tables and column names..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl pl-10 pr-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-900 dark:text-white"
        />
      </div>

      {/* Tables List */}
      {!schema || schema.tables.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-400 text-sm">
          No tables found in active schema. Select a dataset with tables to explore.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredTables.map(table => {
            const isCollapsed = expandedTables[table.name] === false;

            return (
              <div
                key={table.name}
                id={`schema-table-${table.name}`}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden"
              >
                {/* Table Header Row */}
                <div
                  onClick={() => toggleTable(table.name)}
                  className="p-4 sm:p-5 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors select-none"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                      <TableIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono">
                          {table.name}
                        </h3>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono">
                          {table.rowCount.toLocaleString()} rows
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {table.columns.length} columns • {table.primaryKeys.length > 0 ? `PK: ${table.primaryKeys.join(', ')}` : 'No explicit PK'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button className="p-1 text-slate-400">
                      {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Columns Table */}
                {!isCollapsed && (
                  <div className="border-t border-slate-100 dark:border-slate-800 overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50/70 dark:bg-slate-800/40 text-[11px] uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-100 dark:border-slate-800">
                          <th className="px-5 py-2.5">Column Name</th>
                          <th className="px-5 py-2.5">Data Type</th>
                          <th className="px-5 py-2.5">Nullable</th>
                          <th className="px-5 py-2.5">Keys & Constraints</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                        {table.columns.map(col => (
                          <tr
                            key={col.name}
                            className="hover:bg-indigo-50/20 dark:hover:bg-indigo-950/10 transition-colors"
                          >
                            <td className="px-5 py-2.5 font-semibold text-slate-900 dark:text-white">
                              {col.name}
                            </td>
                            <td className="px-5 py-2.5 text-indigo-600 dark:text-indigo-400">
                              {col.dataType}
                            </td>
                            <td className="px-5 py-2.5">
                              {col.isNullable ? (
                                <span className="text-slate-400">NULL</span>
                              ) : (
                                <span className="text-[10px] uppercase font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                  NOT NULL
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-2.5">
                              <div className="flex items-center gap-2">
                                {col.isPrimaryKey && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                                    <Key className="w-3 h-3" />
                                    <span>PK</span>
                                  </span>
                                )}
                                {col.foreignKey && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                    <Link className="w-3 h-3" />
                                    <span>
                                      FK → {col.foreignKey.targetTable}.{col.foreignKey.targetColumn}
                                    </span>
                                  </span>
                                )}
                                {!col.isPrimaryKey && !col.foreignKey && (
                                  <span className="text-slate-400 text-[11px]">—</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
