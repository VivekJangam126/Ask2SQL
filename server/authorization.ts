import crypto from 'crypto';
import { DatabaseAdapter, getDb } from './db.ts';
import { User } from './auth.ts';

export type DatabaseAction =
  | 'read'
  | 'insert'
  | 'update'
  | 'delete_records'
  | 'import_csv'
  | 'export'
  | 'admin_create_database'
  | 'admin_delete_database'
  | 'admin_create_table'
  | 'admin_alter_table'
  | 'admin_drop_table'
  | 'admin_manage_users'
  | 'admin_view_activity'
  | 'admin_manage_org';

export interface AuthorizationResult {
  authorized: boolean;
  status: number;
  code?: string;
  reason?: string;
}

export interface ResourceContext {
  organizationId?: string;
  databaseId?: string;
  databaseName?: string;
  databaseLifecycleState?: string;
  tableName?: string;
  permissionRevision?: number;
  schemaRevision?: number;
  dataRevision?: number;
}

/**
 * Authoritative Server-Side RBAC Enforcement Layer
 */
export function authorizeOperation(
  user: User | undefined,
  resource: ResourceContext,
  action: DatabaseAction
): AuthorizationResult {
  if (!user) {
    return {
      authorized: false,
      status: 401,
      code: 'UNAUTHORIZED',
      reason: 'Your session ended. Sign in to continue.',
    };
  }

  // Check account state
  if (user.account_state && user.account_state !== 'active') {
    return {
      authorized: false,
      status: 403,
      code: 'ACCOUNT_DISABLED',
      reason: `Your account is ${user.account_state}. Contact your organization administrator.`,
    };
  }

  // Check membership existence
  if (!user.organization || !user.membership) {
    return {
      authorized: false,
      status: 403,
      code: 'NO_ORGANIZATION_MEMBERSHIP',
      reason: 'No organization membership found for this account.',
    };
  }

  // Check membership status
  const mStatus = user.membership.status;
  if (mStatus === 'PENDING') {
    return {
      authorized: false,
      status: 403,
      code: 'MEMBERSHIP_PENDING',
      reason: 'Your membership is awaiting administrator approval. You can access data after an administrator approves your account.',
    };
  }

  if (mStatus === 'REJECTED') {
    return {
      authorized: false,
      status: 403,
      code: 'MEMBERSHIP_REJECTED',
      reason: user.membership.rejectionReason || 'Your access request was not approved by the organization administrator.',
    };
  }

  if (mStatus === 'SUSPENDED') {
    return {
      authorized: false,
      status: 403,
      code: 'MEMBERSHIP_SUSPENDED',
      reason: user.membership.rejectionReason || 'Your access has been temporarily suspended by an administrator.',
    };
  }

  if (mStatus === 'INVITED') {
    return {
      authorized: false,
      status: 403,
      code: 'INVITATION_PENDING',
      reason: 'Your account setup is not yet complete. Please use your invitation link to activate your account.',
    };
  }

  if (mStatus !== 'APPROVED') {
    return {
      authorized: false,
      status: 403,
      code: 'MEMBERSHIP_INACTIVE',
      reason: 'Your organization membership is not active.',
    };
  }

  // Multi-tenant check: ensure resource belongs to the user's organization
  if (resource.organizationId && resource.organizationId !== user.organization.id) {
    return {
      authorized: false,
      status: 403,
      code: 'TENANT_FORBIDDEN',
      reason: 'Access denied: Resource does not belong to your organization.',
    };
  }

  // Check if database is currently being deleted
  if (resource.databaseLifecycleState === 'deleting' || resource.databaseLifecycleState === 'deleted') {
    return {
      authorized: false,
      status: 409,
      code: 'DATABASE_BEING_DELETED',
      reason: 'This database is in the process of being deleted or is unavailable.',
    };
  }

  const role = user.membership.role;

  // ----------------------------------------------------
  // ORG_ADMIN Role: Full control within their organization
  // ----------------------------------------------------
  if (role === 'ORG_ADMIN') {
    return { authorized: true, status: 200 };
  }

  // ----------------------------------------------------
  // MEMBER Role: Strictly controlled permissions
  // ----------------------------------------------------
  if (role === 'MEMBER') {
    // Member CANNOT perform administrative actions
    const adminActions: DatabaseAction[] = [
      'admin_create_database',
      'admin_delete_database',
      'admin_create_table',
      'admin_alter_table',
      'admin_drop_table',
      'admin_manage_users',
      'admin_view_activity',
      'admin_manage_org',
    ];

    if (adminActions.includes(action)) {
      return {
        authorized: false,
        status: 403,
        code: 'ADMIN_ONLY',
        reason: 'This action is restricted to organization administrators.',
      };
    }

    // Database-specific actions require assigned database permissions
    if (resource.databaseId) {
      const grant = user.permissions?.find(p => p.databaseId === resource.databaseId);

      if (!grant) {
        return {
          authorized: false,
          status: 403,
          code: 'NO_DATABASE_ACCESS',
          reason: 'You do not have access to this database. Ask an organization administrator to assign permissions.',
        };
      }

      // Read requirement: All actions require read access
      if (!grant.canRead) {
        return {
          authorized: false,
          status: 403,
          code: 'READ_PERMISSION_REQUIRED',
          reason: 'Read access is required to interact with this database.',
        };
      }

      if (action === 'read') {
        return { authorized: true, status: 200 };
      }

      if (action === 'insert') {
        if (!grant.canInsert) {
          return {
            authorized: false,
            status: 403,
            code: 'INSUFFICIENT_PERMISSIONS',
            reason: 'You do not have permission to insert records into this database.',
          };
        }
        return { authorized: true, status: 200 };
      }

      if (action === 'update') {
        if (!grant.canUpdate) {
          return {
            authorized: false,
            status: 403,
            code: 'INSUFFICIENT_PERMISSIONS',
            reason: 'You do not have permission to update records in this database.',
          };
        }
        return { authorized: true, status: 200 };
      }

      if (action === 'delete_records') {
        if (!grant.canDeleteRecords) {
          return {
            authorized: false,
            status: 403,
            code: 'INSUFFICIENT_PERMISSIONS',
            reason: 'You do not have permission to delete records from this database.',
          };
        }
        return { authorized: true, status: 200 };
      }

      if (action === 'import_csv') {
        // CSV append requires both insert and import_csv
        if (!grant.canInsert || !grant.canImportCsv) {
          return {
            authorized: false,
            status: 403,
            code: 'INSUFFICIENT_PERMISSIONS',
            reason: 'Appending CSV requires both Insert and CSV Import permissions.',
          };
        }
        return { authorized: true, status: 200 };
      }

      if (action === 'export') {
        if (!grant.canExport) {
          return {
            authorized: false,
            status: 403,
            code: 'INSUFFICIENT_PERMISSIONS',
            reason: 'You do not have permission to export data from this database.',
          };
        }
        return { authorized: true, status: 200 };
      }
    }

    return { authorized: true, status: 200 };
  }

  return {
    authorized: false,
    status: 403,
    code: 'UNKNOWN_ROLE',
    reason: 'Unrecognized user role.',
  };
}

/**
 * Log structured audit events to clarity_app.audit_events
 */
export async function logAuditEvent(
  db: DatabaseAdapter,
  event: {
    organizationId: string;
    actorId?: string | null;
    actorName?: string | null;
    actorEmail?: string | null;
    action: string;
    targetType: string;
    targetId?: string | null;
    targetName?: string | null;
    summary: string;
    details?: Record<string, any>;
    outcome?: 'success' | 'failed';
    affectedRows?: number;
  }
): Promise<void> {
  try {
    const id = crypto.randomUUID();
    await db.query(`
      INSERT INTO clarity_app.audit_events (
        id, organization_id, actor_id, actor_name, actor_email,
        action, target_type, target_id, target_name, summary,
        details_json, outcome, affected_rows
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [
      id,
      event.organizationId,
      event.actorId || null,
      event.actorName || null,
      event.actorEmail || null,
      event.action,
      event.targetType,
      event.targetId || null,
      event.targetName || null,
      event.summary,
      JSON.stringify(event.details || {}),
      event.outcome || 'success',
      event.affectedRows || 0,
    ]);
  } catch (err) {
    console.error('Failed to log audit event:', err);
  }
}
