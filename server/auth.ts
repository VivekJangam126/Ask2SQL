import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { getDb } from './db.ts';
import { config } from './config.ts';

export type AppRole = 'ORG_ADMIN' | 'MEMBER';
export type MembershipStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | 'INVITED';

export interface DatabasePermissionGrant {
  databaseId: string;
  databaseName?: string;
  canRead: boolean;
  canInsert: boolean;
  canUpdate: boolean;
  canDeleteRecords: boolean;
  canImportCsv: boolean;
  canExport: boolean;
  version: number;
}

export interface OrganizationInfo {
  id: string;
  name: string;
  handle: string;
  state: string;
  createdAt: string;
}

export interface MembershipInfo {
  id: string;
  userId: string;
  organizationId: string;
  role: AppRole;
  status: MembershipStatus;
  note?: string | null;
  rejectionReason?: string | null;
  permissionRevision: number;
  requestedAt: string;
  approvedAt?: string | null;
}

export interface User {
  id: string;
  name: string;
  email: string;
  account_state?: string;
  organization?: OrganizationInfo | null;
  membership?: MembershipInfo | null;
  permissions?: DatabasePermissionGrant[];
  created_at: string;
  updated_at: string;
}

export interface AuthRequest extends Request {
  user?: User;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, originalHash] = storedHash.split(':');
  if (!salt || !originalHash) return false;
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(originalHash, 'hex'));
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function getSessionCookieOptions(req: any) {
  const isHttps = req.secure || req.headers?.['x-forwarded-proto'] === 'https' || config.nodeEnv === 'production';
  return {
    httpOnly: true,
    secure: isHttps,
    sameSite: (isHttps ? 'none' : 'lax') as 'none' | 'lax',
    maxAge: config.sessionTtlHours * 3600 * 1000,
    path: '/',
  };
}

export async function createSession(userId: string): Promise<string> {
  const db = await getDb();
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + config.sessionTtlHours * 3600 * 1000).toISOString();

  await db.query(
    `INSERT INTO clarity_app.sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, $3)`,
    [tokenHash, userId, expiresAt]
  );

  return token;
}

export async function revokeSession(token: string): Promise<void> {
  const db = await getDb();
  const tokenHash = hashToken(token);
  await db.query('DELETE FROM clarity_app.sessions WHERE token_hash = $1', [tokenHash]);
}

export async function getUserBySessionToken(token: string): Promise<User | null> {
  const db = await getDb();
  const tokenHash = hashToken(token);
  const now = new Date().toISOString();

  const res = await db.query<User>(
    `SELECT u.id, u.name, u.email, u.account_state, u.created_at, u.updated_at
     FROM clarity_app.sessions s
     JOIN clarity_app.users u ON s.user_id = u.id
     WHERE s.token_hash = $1 AND s.expires_at > $2`,
    [tokenHash, now]
  );

  if (res.rows.length === 0) return null;
  const user = res.rows[0];

  // Fetch organization membership
  const memberRes = await db.query(`
    SELECT m.id as membership_id, m.role, m.status, m.note, m.rejection_reason,
           m.permission_revision, m.requested_at, m.approved_at,
           o.id as org_id, o.name as org_name, o.handle as org_handle,
           o.state as org_state, o.created_at as org_created_at
    FROM clarity_app.organization_memberships m
    JOIN clarity_app.organizations o ON m.organization_id = o.id
    WHERE m.user_id = $1
    LIMIT 1
  `, [user.id]);

  if (memberRes.rows.length === 0) {
    user.organization = null;
    user.membership = null;
    user.permissions = [];
    return user;
  }

  const mRow = memberRes.rows[0];
  user.organization = {
    id: mRow.org_id,
    name: mRow.org_name,
    handle: mRow.org_handle,
    state: mRow.org_state,
    createdAt: mRow.org_created_at,
  };

  user.membership = {
    id: mRow.membership_id,
    userId: user.id,
    organizationId: mRow.org_id,
    role: mRow.role,
    status: mRow.status,
    note: mRow.note,
    rejectionReason: mRow.rejection_reason,
    permissionRevision: mRow.permission_revision,
    requestedAt: mRow.requested_at,
    approvedAt: mRow.approved_at,
  };

  // If ORG_ADMIN, they have full permissions across all datasets in this organization
  if (user.membership.role === 'ORG_ADMIN') {
    const dbsRes = await db.query<{ id: string; display_name: string }>(`
      SELECT id, display_name FROM clarity_app.datasets
      WHERE organization_id = $1 AND is_active = true AND lifecycle_state != 'deleted'
    `, [user.organization.id]);

    user.permissions = dbsRes.rows.map(d => ({
      databaseId: d.id,
      databaseName: d.display_name,
      canRead: true,
      canInsert: true,
      canUpdate: true,
      canDeleteRecords: true,
      canImportCsv: true,
      canExport: true,
      version: 1,
    }));
  } else {
    // Regular MEMBER: fetch explicit database permissions
    const permRes = await db.query(`
      SELECT p.*, d.display_name as database_name
      FROM clarity_app.database_permissions p
      JOIN clarity_app.datasets d ON p.database_id = d.id
      WHERE p.membership_id = $1 AND d.is_active = true AND d.lifecycle_state != 'deleted'
    `, [user.membership.id]);

    user.permissions = permRes.rows.map((p: any) => ({
      databaseId: p.database_id,
      databaseName: p.database_name,
      canRead: Boolean(p.can_read),
      canInsert: Boolean(p.can_insert),
      canUpdate: Boolean(p.can_update),
      canDeleteRecords: Boolean(p.can_delete_records),
      canImportCsv: Boolean(p.can_import_csv),
      canExport: Boolean(p.can_export),
      version: p.version || 1,
    }));
  }

  return user;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.[config.sessionCookieName] ||
    (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);

  if (!token) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Your session ended. Sign in to continue.',
        retryable: false,
      }
    });
  }

  try {
    const user = await getUserBySessionToken(token);
    if (!user) {
      res.clearCookie(config.sessionCookieName);
      return res.status(401).json({
        error: {
          code: 'SESSION_EXPIRED',
          message: 'Your session ended. Sign in to continue.',
          retryable: false,
        }
      });
    }

    req.user = user;
    next();
  } catch (err: any) {
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Authentication check failed.',
        retryable: true,
      }
    });
  }
}
