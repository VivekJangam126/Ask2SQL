import crypto from 'crypto';
import { Router, Response } from 'express';
import { getDb } from './db.ts';
import { AuthRequest, requireAuth, hashPassword, createSession, getSessionCookieOptions } from './auth.ts';
import { authorizeOperation, logAuditEvent } from './authorization.ts';
import { seedSampleCollegeDataset } from './seed.ts';
import { config } from './config.ts';

export const adminRouter = Router();

function sendError(res: Response, status: number, code: string, message: string, retryable = false) {
  return res.status(status).json({
    error: { code, message, retryable }
  });
}

// ----------------------------------------------------
// Organization Registration (Self-Service Org Admin)
// ----------------------------------------------------
adminRouter.post('/auth/register-org', async (req, res) => {
  const { orgName, orgHandle, adminName, email, password } = req.body;

  if (!orgName || !orgName.trim()) {
    return sendError(res, 400, 'INVALID_INPUT', 'Organization name is required.');
  }
  if (!orgHandle || !orgHandle.trim()) {
    return sendError(res, 400, 'INVALID_INPUT', 'Organization handle is required.');
  }
  if (!adminName || !adminName.trim()) {
    return sendError(res, 400, 'INVALID_INPUT', 'Administrator name is required.');
  }
  if (!email || !email.includes('@')) {
    return sendError(res, 400, 'INVALID_INPUT', 'A valid email address is required.');
  }
  if (!password || password.length < 8) {
    return sendError(res, 400, 'INVALID_INPUT', 'Password must be at least 8 characters.');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const normalizedHandle = orgHandle.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

  if (normalizedHandle.length < 3) {
    return sendError(res, 400, 'INVALID_HANDLE', 'Organization handle must be at least 3 alphanumeric characters.');
  }

  const db = await getDb();

  try {
    // Check if email already exists
    const existingUser = await db.query('SELECT id FROM clarity_app.users WHERE email = $1', [normalizedEmail]);
    if (existingUser.rows.length > 0) {
      return sendError(res, 409, 'EMAIL_EXISTS', 'An account with this email already exists.');
    }

    // Check if handle is taken
    const existingOrg = await db.query('SELECT id FROM clarity_app.organizations WHERE handle = $1', [normalizedHandle]);
    if (existingOrg.rows.length > 0) {
      return sendError(res, 409, 'HANDLE_TAKEN', 'This organization handle is already taken. Please choose another.');
    }

    const orgId = crypto.randomUUID();
    const adminId = crypto.randomUUID();
    const membershipId = crypto.randomUUID();
    const pwdHash = hashPassword(password);

    // 1. Create Organization
    await db.query(`
      INSERT INTO clarity_app.organizations (id, name, handle, state)
      VALUES ($1, $2, $3, 'active')
    `, [orgId, orgName.trim(), normalizedHandle]);

    // 2. Create Admin User
    await db.query(`
      INSERT INTO clarity_app.users (id, name, email, password_hash, account_state)
      VALUES ($1, $2, $3, $4, 'active')
    `, [adminId, adminName.trim(), normalizedEmail, pwdHash]);

    // 3. Create Approved ORG_ADMIN Membership
    await db.query(`
      INSERT INTO clarity_app.organization_memberships (
        id, user_id, organization_id, role, status, permission_revision, approved_at, approved_by
      ) VALUES ($1, $2, $3, 'ORG_ADMIN', 'APPROVED', 1, CURRENT_TIMESTAMP, $2)
    `, [membershipId, adminId, orgId]);

    // 4. Seed sample dataset for this new organization
    try {
      const seedRes = await seedSampleCollegeDataset(adminId);
      await db.query(`
        UPDATE clarity_app.datasets
        SET organization_id = $1, created_by = $2, updated_by = $2
        WHERE id = $3
      `, [orgId, adminId, seedRes.datasetId]);
    } catch (e) {
      console.warn('Dataset auto-seed warning on org registration:', e);
    }

    // 5. Log audit event
    await logAuditEvent(db, {
      organizationId: orgId,
      actorId: adminId,
      actorName: adminName.trim(),
      actorEmail: normalizedEmail,
      action: 'ORGANIZATION_REGISTERED',
      targetType: 'organization',
      targetId: orgId,
      targetName: orgName.trim(),
      summary: `Organization "${orgName.trim()}" registered by ${adminName.trim()}.`,
    });

    // 6. Create session
    const token = await createSession(adminId);
    res.cookie(config.sessionCookieName, token, getSessionCookieOptions(req));

    return res.status(201).json({
      success: true,
      message: 'Organization created successfully.',
      token,
      organization: {
        id: orgId,
        name: orgName.trim(),
        handle: normalizedHandle,
      },
      user: {
        id: adminId,
        name: adminName.trim(),
        email: normalizedEmail,
        role: 'ORG_ADMIN',
        status: 'APPROVED',
      },
    });
  } catch (err: any) {
    return sendError(res, 500, 'ORG_REGISTRATION_FAILED', err.message);
  }
});

// ----------------------------------------------------
// Member Registration (Request Access to an Organization)
// ----------------------------------------------------
adminRouter.post('/auth/register-member', async (req, res) => {
  const { organizationId, name, email, password, note } = req.body;

  if (!organizationId) {
    return sendError(res, 400, 'INVALID_INPUT', 'Please select an organization to join.');
  }
  if (!name || !name.trim()) {
    return sendError(res, 400, 'INVALID_INPUT', 'Full name is required.');
  }
  if (!email || !email.includes('@')) {
    return sendError(res, 400, 'INVALID_INPUT', 'A valid email address is required.');
  }
  if (!password || password.length < 8) {
    return sendError(res, 400, 'INVALID_INPUT', 'Password must be at least 8 characters.');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const db = await getDb();

  try {
    // Check organization exists and is active
    const orgRes = await db.query('SELECT * FROM clarity_app.organizations WHERE id = $1 AND state = $2', [organizationId, 'active']);
    if (orgRes.rows.length === 0) {
      return sendError(res, 404, 'ORGANIZATION_NOT_FOUND', 'Selected organization is not found or is inactive.');
    }
    const org = orgRes.rows[0];

    // Check email uniqueness
    const existingUser = await db.query('SELECT id FROM clarity_app.users WHERE email = $1', [normalizedEmail]);
    if (existingUser.rows.length > 0) {
      return sendError(res, 409, 'EMAIL_EXISTS', 'An account with this email already exists.');
    }

    const userId = crypto.randomUUID();
    const membershipId = crypto.randomUUID();
    const pwdHash = hashPassword(password);

    // 1. Create User
    await db.query(`
      INSERT INTO clarity_app.users (id, name, email, password_hash, account_state)
      VALUES ($1, $2, $3, $4, 'active')
    `, [userId, name.trim(), normalizedEmail, pwdHash]);

    // 2. Create Membership with PENDING status
    await db.query(`
      INSERT INTO clarity_app.organization_memberships (
        id, user_id, organization_id, role, status, note, permission_revision
      ) VALUES ($1, $2, $3, 'MEMBER', 'PENDING', $4, 1)
    `, [membershipId, userId, organizationId, note ? note.trim() : null]);

    // 3. Notify Org Admins
    const adminsRes = await db.query<{ user_id: string }>(`
      SELECT user_id FROM clarity_app.organization_memberships
      WHERE organization_id = $1 AND role = 'ORG_ADMIN' AND status = 'APPROVED'
    `, [organizationId]);

    for (const adm of adminsRes.rows) {
      await db.query(`
        INSERT INTO clarity_app.notifications (id, owner_id, title, message, event_type, related_entity_type, related_entity_id)
        VALUES ($1, $2, 'New access request.', $3, 'access_request', 'membership', $4)
      `, [
        crypto.randomUUID(),
        adm.user_id,
        `${name.trim()} (${normalizedEmail}) requested access to ${org.name}.`,
        membershipId,
      ]);
    }

    // 4. Log audit event
    await logAuditEvent(db, {
      organizationId,
      actorId: userId,
      actorName: name.trim(),
      actorEmail: normalizedEmail,
      action: 'ACCESS_REQUESTED',
      targetType: 'membership',
      targetId: membershipId,
      targetName: name.trim(),
      summary: `${name.trim()} requested access to ${org.name}.`,
      details: { note: note || null },
    });

    // 5. Create session so user can view the pending approval screen
    const token = await createSession(userId);
    res.cookie(config.sessionCookieName, token, getSessionCookieOptions(req));

    return res.status(201).json({
      success: true,
      message: 'Access request submitted. Awaiting administrator approval.',
      token,
      organization: {
        id: org.id,
        name: org.name,
        handle: org.handle,
      },
      user: {
        id: userId,
        name: name.trim(),
        email: normalizedEmail,
        role: 'MEMBER',
        status: 'PENDING',
        note: note ? note.trim() : null,
      },
    });
  } catch (err: any) {
    return sendError(res, 500, 'REGISTRATION_FAILED', err.message);
  }
});

// ----------------------------------------------------
// Public Organization Search & Handle Check
// ----------------------------------------------------
adminRouter.get('/organizations/search', async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const db = await getDb();

  try {
    let sql = `
      SELECT id, name, handle
      FROM clarity_app.organizations
      WHERE state = 'active'
    `;
    const params: any[] = [];

    if (q) {
      params.push(`%${q}%`);
      sql += ` AND (LOWER(name) LIKE $1 OR LOWER(handle) LIKE $1)`;
    }

    sql += ` ORDER BY name ASC LIMIT 20`;

    const result = await db.query(sql, params);
    res.json({ organizations: result.rows });
  } catch (err: any) {
    return sendError(res, 500, 'SEARCH_FAILED', err.message);
  }
});

adminRouter.get('/organizations/check-handle', async (req, res) => {
  const handle = String(req.query.handle || '').trim().toLowerCase();
  if (!handle) {
    return res.json({ available: false, reason: 'Handle is required.' });
  }

  const db = await getDb();
  try {
    const existing = await db.query('SELECT id FROM clarity_app.organizations WHERE handle = $1', [handle]);
    res.json({ available: existing.rows.length === 0 });
  } catch (err: any) {
    return sendError(res, 500, 'CHECK_FAILED', err.message);
  }
});

// ----------------------------------------------------
// Membership Status Refresh (for polling / reactive UI)
// ----------------------------------------------------
adminRouter.get('/auth/membership-status', requireAuth, async (req: AuthRequest, res) => {
  res.json({
    user: req.user,
    organization: req.user?.organization,
    membership: req.user?.membership,
    permissions: req.user?.permissions,
  });
});

// ----------------------------------------------------
// Admin: List Approval Requests
// ----------------------------------------------------
adminRouter.get('/admin/approvals', requireAuth, async (req: AuthRequest, res) => {
  const authCheck = authorizeOperation(req.user, {}, 'admin_manage_users');
  if (!authCheck.authorized) {
    return sendError(res, authCheck.status, authCheck.code!, authCheck.reason!);
  }

  const db = await getDb();
  try {
    const result = await db.query(`
      SELECT m.id, m.user_id, m.role, m.status, m.note, m.requested_at,
             u.name, u.email
      FROM clarity_app.organization_memberships m
      JOIN clarity_app.users u ON m.user_id = u.id
      WHERE m.organization_id = $1 AND m.status = 'PENDING'
      ORDER BY m.requested_at ASC
    `, [req.user!.organization!.id]);

    res.json({ approvals: result.rows });
  } catch (err: any) {
    return sendError(res, 500, 'FETCH_FAILED', err.message);
  }
});

// ----------------------------------------------------
// Admin: Approve Request with Database Grants
// ----------------------------------------------------
adminRouter.post('/admin/approvals/:id/approve', requireAuth, async (req: AuthRequest, res) => {
  const authCheck = authorizeOperation(req.user, {}, 'admin_manage_users');
  if (!authCheck.authorized) {
    return sendError(res, authCheck.status, authCheck.code!, authCheck.reason!);
  }

  const membershipId = req.params.id;
  const { permissions = [] } = req.body;
  const db = await getDb();

  try {
    // Verify membership belongs to this org and is pending
    const memberRes = await db.query(`
      SELECT m.*, u.name, u.email
      FROM clarity_app.organization_memberships m
      JOIN clarity_app.users u ON m.user_id = u.id
      WHERE m.id = $1 AND m.organization_id = $2
    `, [membershipId, req.user!.organization!.id]);

    if (memberRes.rows.length === 0) {
      return sendError(res, 404, 'MEMBERSHIP_NOT_FOUND', 'Approval request not found.');
    }

    const membership = memberRes.rows[0];

    // Update membership status
    await db.query(`
      UPDATE clarity_app.organization_memberships
      SET status = 'APPROVED',
          approved_at = CURRENT_TIMESTAMP,
          approved_by = $1,
          permission_revision = permission_revision + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [req.user!.id, membershipId]);

    // Insert database permissions
    for (const p of permissions) {
      if (!p.databaseId) continue;
      await db.query(`
        INSERT INTO clarity_app.database_permissions (
          id, membership_id, database_id,
          can_read, can_insert, can_update, can_delete_records, can_import_csv, can_export,
          version, granted_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, $10)
        ON CONFLICT (membership_id, database_id) DO UPDATE SET
          can_read = EXCLUDED.can_read,
          can_insert = EXCLUDED.can_insert,
          can_update = EXCLUDED.can_update,
          can_delete_records = EXCLUDED.can_delete_records,
          can_import_csv = EXCLUDED.can_import_csv,
          can_export = EXCLUDED.can_export,
          version = clarity_app.database_permissions.version + 1,
          updated_at = CURRENT_TIMESTAMP
      `, [
        crypto.randomUUID(),
        membershipId,
        p.databaseId,
        Boolean(p.canRead ?? true),
        Boolean(p.canInsert ?? false),
        Boolean(p.canUpdate ?? false),
        Boolean(p.canDeleteRecords ?? false),
        Boolean(p.canImportCsv ?? false),
        Boolean(p.canExport ?? false),
        req.user!.id,
      ]);
    }

    // Notify user
    await db.query(`
      INSERT INTO clarity_app.notifications (id, owner_id, title, message, event_type)
      VALUES ($1, $2, 'Access request approved.', 'An administrator has approved your account and assigned your permissions.', 'approval')
    `, [crypto.randomUUID(), membership.user_id]);

    // Log audit event
    await logAuditEvent(db, {
      organizationId: req.user!.organization!.id,
      actorId: req.user!.id,
      actorName: req.user!.name,
      actorEmail: req.user!.email,
      action: 'MEMBER_APPROVED',
      targetType: 'membership',
      targetId: membershipId,
      targetName: membership.name,
      summary: `Approved access for ${membership.name} (${membership.email}) with ${permissions.length} database grant(s).`,
      details: { permissions },
    });

    res.json({ success: true, message: 'Member approved successfully.' });
  } catch (err: any) {
    return sendError(res, 500, 'APPROVE_FAILED', err.message);
  }
});

// ----------------------------------------------------
// Admin: Reject Request
// ----------------------------------------------------
adminRouter.post('/admin/approvals/:id/reject', requireAuth, async (req: AuthRequest, res) => {
  const authCheck = authorizeOperation(req.user, {}, 'admin_manage_users');
  if (!authCheck.authorized) {
    return sendError(res, authCheck.status, authCheck.code!, authCheck.reason!);
  }

  const membershipId = req.params.id;
  const { reason } = req.body;
  const db = await getDb();

  try {
    const memberRes = await db.query(`
      SELECT m.*, u.name, u.email
      FROM clarity_app.organization_memberships m
      JOIN clarity_app.users u ON m.user_id = u.id
      WHERE m.id = $1 AND m.organization_id = $2
    `, [membershipId, req.user!.organization!.id]);

    if (memberRes.rows.length === 0) {
      return sendError(res, 404, 'MEMBERSHIP_NOT_FOUND', 'Approval request not found.');
    }

    const membership = memberRes.rows[0];

    await db.query(`
      UPDATE clarity_app.organization_memberships
      SET status = 'REJECTED',
          rejection_reason = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [reason || 'Your access request was rejected by an administrator.', membershipId]);

    // Log audit event
    await logAuditEvent(db, {
      organizationId: req.user!.organization!.id,
      actorId: req.user!.id,
      actorName: req.user!.name,
      actorEmail: req.user!.email,
      action: 'MEMBER_REJECTED',
      targetType: 'membership',
      targetId: membershipId,
      targetName: membership.name,
      summary: `Rejected access request for ${membership.name} (${membership.email}).`,
      details: { reason },
    });

    res.json({ success: true, message: 'Access request rejected.' });
  } catch (err: any) {
    return sendError(res, 500, 'REJECT_FAILED', err.message);
  }
});

// ----------------------------------------------------
// Admin: List All Users in Organization
// ----------------------------------------------------
adminRouter.get('/admin/users', requireAuth, async (req: AuthRequest, res) => {
  const authCheck = authorizeOperation(req.user, {}, 'admin_manage_users');
  if (!authCheck.authorized) {
    return sendError(res, authCheck.status, authCheck.code!, authCheck.reason!);
  }

  const db = await getDb();
  try {
    const usersRes = await db.query(`
      SELECT u.id as user_id, u.name, u.email, u.account_state,
             m.id as membership_id, m.role, m.status, m.note, m.rejection_reason,
             m.requested_at, m.approved_at, m.permission_revision,
             COUNT(p.id) as assigned_databases_count
      FROM clarity_app.organization_memberships m
      JOIN clarity_app.users u ON m.user_id = u.id
      LEFT JOIN clarity_app.database_permissions p ON m.id = p.membership_id
      WHERE m.organization_id = $1
      GROUP BY u.id, u.name, u.email, u.account_state, m.id, m.role, m.status, m.note, m.rejection_reason, m.requested_at, m.approved_at, m.permission_revision
      ORDER BY m.role ASC, u.name ASC
    `, [req.user!.organization!.id]);

    // Also load full permissions list for detailed view
    const permsRes = await db.query(`
      SELECT p.*, d.display_name as database_name
      FROM clarity_app.database_permissions p
      JOIN clarity_app.organization_memberships m ON p.membership_id = m.id
      JOIN clarity_app.datasets d ON p.database_id = d.id
      WHERE m.organization_id = $1
    `, [req.user!.organization!.id]);

    const permsByMembership: Record<string, any[]> = {};
    for (const p of permsRes.rows) {
      if (!permsByMembership[p.membership_id]) {
        permsByMembership[p.membership_id] = [];
      }
      permsByMembership[p.membership_id].push({
        databaseId: p.database_id,
        databaseName: p.database_name,
        canRead: Boolean(p.can_read),
        canInsert: Boolean(p.can_insert),
        canUpdate: Boolean(p.can_update),
        canDeleteRecords: Boolean(p.can_delete_records),
        canImportCsv: Boolean(p.can_import_csv),
        canExport: Boolean(p.can_export),
        version: p.version,
      });
    }

    const users = usersRes.rows.map(u => ({
      ...u,
      permissions: permsByMembership[u.membership_id] || [],
    }));

    res.json({ users });
  } catch (err: any) {
    return sendError(res, 500, 'FETCH_FAILED', err.message);
  }
});

// ----------------------------------------------------
// Admin: Invite User
// ----------------------------------------------------
adminRouter.post('/admin/users/invite', requireAuth, async (req: AuthRequest, res) => {
  const authCheck = authorizeOperation(req.user, {}, 'admin_manage_users');
  if (!authCheck.authorized) {
    return sendError(res, authCheck.status, authCheck.code!, authCheck.reason!);
  }

  const { name, email, permissions = [] } = req.body;
  if (!name || !name.trim()) return sendError(res, 400, 'INVALID_INPUT', 'Name is required.');
  if (!email || !email.includes('@')) return sendError(res, 400, 'INVALID_INPUT', 'Valid email is required.');

  const normalizedEmail = email.trim().toLowerCase();
  const db = await getDb();

  try {
    // Check if already member of this org
    const existing = await db.query(`
      SELECT m.id FROM clarity_app.organization_memberships m
      JOIN clarity_app.users u ON m.user_id = u.id
      WHERE m.organization_id = $1 AND u.email = $2
    `, [req.user!.organization!.id, normalizedEmail]);

    if (existing.rows.length > 0) {
      return sendError(res, 409, 'USER_EXISTS', 'This user is already part of your organization.');
    }

    // Find or create user
    let userRes = await db.query('SELECT id FROM clarity_app.users WHERE email = $1', [normalizedEmail]);
    let userId: string;
    if (userRes.rows.length === 0) {
      userId = crypto.randomUUID();
      const dummyHash = hashPassword(crypto.randomBytes(16).toString('hex'));
      await db.query(`
        INSERT INTO clarity_app.users (id, name, email, password_hash, account_state)
        VALUES ($1, $2, $3, $4, 'invited')
      `, [userId, name.trim(), normalizedEmail, dummyHash]);
    } else {
      userId = userRes.rows[0].id;
    }

    const membershipId = crypto.randomUUID();
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

    // Create invitation
    await db.query(`
      INSERT INTO clarity_app.invitations (
        id, organization_id, name, email, token_hash, permissions_json, invited_by, status, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)
    `, [
      crypto.randomUUID(),
      req.user!.organization!.id,
      name.trim(),
      normalizedEmail,
      tokenHash,
      JSON.stringify(permissions),
      req.user!.id,
      expiresAt,
    ]);

    // Create membership with INVITED status
    await db.query(`
      INSERT INTO clarity_app.organization_memberships (
        id, user_id, organization_id, role, status, permission_revision
      ) VALUES ($1, $2, $3, 'MEMBER', 'INVITED', 1)
      ON CONFLICT (user_id) DO UPDATE SET
        organization_id = EXCLUDED.organization_id,
        role = 'MEMBER',
        status = 'INVITED',
        updated_at = CURRENT_TIMESTAMP
    `, [membershipId, userId, req.user!.organization!.id]);

    // Assign initial permissions
    for (const p of permissions) {
      if (!p.databaseId) continue;
      await db.query(`
        INSERT INTO clarity_app.database_permissions (
          id, membership_id, database_id,
          can_read, can_insert, can_update, can_delete_records, can_import_csv, can_export,
          version, granted_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, $10)
        ON CONFLICT (membership_id, database_id) DO UPDATE SET
          can_read = EXCLUDED.can_read,
          can_insert = EXCLUDED.can_insert,
          can_update = EXCLUDED.can_update,
          can_delete_records = EXCLUDED.can_delete_records,
          can_import_csv = EXCLUDED.can_import_csv,
          can_export = EXCLUDED.can_export
      `, [
        crypto.randomUUID(),
        membershipId,
        p.databaseId,
        Boolean(p.canRead ?? true),
        Boolean(p.canInsert ?? false),
        Boolean(p.canUpdate ?? false),
        Boolean(p.canDeleteRecords ?? false),
        Boolean(p.canImportCsv ?? false),
        Boolean(p.canExport ?? false),
        req.user!.id,
      ]);
    }

    // Log audit event
    await logAuditEvent(db, {
      organizationId: req.user!.organization!.id,
      actorId: req.user!.id,
      actorName: req.user!.name,
      actorEmail: req.user!.email,
      action: 'USER_INVITED',
      targetType: 'user',
      targetId: userId,
      targetName: name.trim(),
      summary: `Sent organization invitation to ${name.trim()} (${normalizedEmail}).`,
      details: { permissions },
    });

    const setupUrl = `${req.protocol}://${req.get('host')}/setup/${token}`;

    res.status(201).json({
      success: true,
      message: 'Invitation generated successfully.',
      token,
      setupUrl,
    });
  } catch (err: any) {
    return sendError(res, 500, 'INVITE_FAILED', err.message);
  }
});

// ----------------------------------------------------
// Public: Verify Invitation & Accept/Set Password
// ----------------------------------------------------
adminRouter.get('/invitations/:token', async (req, res) => {
  const token = req.params.token;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const db = await getDb();

  try {
    const invRes = await db.query(`
      SELECT i.*, o.name as org_name
      FROM clarity_app.invitations i
      JOIN clarity_app.organizations o ON i.organization_id = o.id
      WHERE i.token_hash = $1 AND i.status = 'pending' AND i.expires_at > CURRENT_TIMESTAMP
    `, [tokenHash]);

    if (invRes.rows.length === 0) {
      return sendError(res, 404, 'INVITATION_INVALID', 'Invitation is invalid, expired, or has already been used.');
    }

    const inv = invRes.rows[0];
    res.json({
      valid: true,
      name: inv.name,
      email: inv.email,
      organizationName: inv.org_name,
    });
  } catch (err: any) {
    return sendError(res, 500, 'VERIFY_FAILED', err.message);
  }
});

adminRouter.post('/invitations/:token/accept', async (req, res) => {
  const token = req.params.token;
  const { password } = req.body;
  if (!password || password.length < 8) {
    return sendError(res, 400, 'INVALID_INPUT', 'Password must be at least 8 characters.');
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const db = await getDb();

  try {
    const invRes = await db.query(`
      SELECT i.*, o.name as org_name
      FROM clarity_app.invitations i
      JOIN clarity_app.organizations o ON i.organization_id = o.id
      WHERE i.token_hash = $1 AND i.status = 'pending' AND i.expires_at > CURRENT_TIMESTAMP
    `, [tokenHash]);

    if (invRes.rows.length === 0) {
      return sendError(res, 404, 'INVITATION_INVALID', 'Invitation is invalid or expired.');
    }

    const inv = invRes.rows[0];
    const pwdHash = hashPassword(password);

    // Update user password and activate
    await db.query(`
      UPDATE clarity_app.users
      SET password_hash = $1, account_state = 'active', updated_at = CURRENT_TIMESTAMP
      WHERE email = $2
    `, [pwdHash, inv.email]);

    const userRes = await db.query('SELECT id FROM clarity_app.users WHERE email = $1', [inv.email]);
    const userId = userRes.rows[0].id;

    // Update membership to APPROVED
    await db.query(`
      UPDATE clarity_app.organization_memberships
      SET status = 'APPROVED', approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND organization_id = $2
    `, [userId, inv.organization_id]);

    // Mark invitation accepted
    await db.query(`
      UPDATE clarity_app.invitations SET status = 'accepted' WHERE id = $1
    `, [inv.id]);

    // Log audit event
    await logAuditEvent(db, {
      organizationId: inv.organization_id,
      actorId: userId,
      actorName: inv.name,
      actorEmail: inv.email,
      action: 'INVITATION_ACCEPTED',
      targetType: 'membership',
      targetName: inv.name,
      summary: `${inv.name} accepted organization invitation and activated account.`,
    });

    const sessionToken = await createSession(userId);
    res.cookie(config.sessionCookieName, sessionToken, getSessionCookieOptions(req));

    res.json({
      success: true,
      message: 'Account activated successfully.',
      token: sessionToken,
    });
  } catch (err: any) {
    return sendError(res, 500, 'ACCEPT_FAILED', err.message);
  }
});

// ----------------------------------------------------
// Admin: Update User Permissions
// ----------------------------------------------------
adminRouter.put('/admin/users/:id/permissions', requireAuth, async (req: AuthRequest, res) => {
  const authCheck = authorizeOperation(req.user, {}, 'admin_manage_users');
  if (!authCheck.authorized) {
    return sendError(res, authCheck.status, authCheck.code!, authCheck.reason!);
  }

  const membershipId = req.params.id;
  const { permissions = [] } = req.body;
  const db = await getDb();

  try {
    const memberRes = await db.query(`
      SELECT m.*, u.name, u.email
      FROM clarity_app.organization_memberships m
      JOIN clarity_app.users u ON m.user_id = u.id
      WHERE m.id = $1 AND m.organization_id = $2
    `, [membershipId, req.user!.organization!.id]);

    if (memberRes.rows.length === 0) {
      return sendError(res, 404, 'MEMBER_NOT_FOUND', 'Organization member not found.');
    }

    const membership = memberRes.rows[0];

    // Clear and re-insert grants
    await db.query('DELETE FROM clarity_app.database_permissions WHERE membership_id = $1', [membershipId]);

    for (const p of permissions) {
      if (!p.databaseId) continue;
      await db.query(`
        INSERT INTO clarity_app.database_permissions (
          id, membership_id, database_id,
          can_read, can_insert, can_update, can_delete_records, can_import_csv, can_export,
          version, granted_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, $10)
      `, [
        crypto.randomUUID(),
        membershipId,
        p.databaseId,
        Boolean(p.canRead ?? true),
        Boolean(p.canInsert ?? false),
        Boolean(p.canUpdate ?? false),
        Boolean(p.canDeleteRecords ?? false),
        Boolean(p.canImportCsv ?? false),
        Boolean(p.canExport ?? false),
        req.user!.id,
      ]);
    }

    // Increment permission revision
    await db.query(`
      UPDATE clarity_app.organization_memberships
      SET permission_revision = permission_revision + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [membershipId]);

    // Log audit event
    await logAuditEvent(db, {
      organizationId: req.user!.organization!.id,
      actorId: req.user!.id,
      actorName: req.user!.name,
      actorEmail: req.user!.email,
      action: 'PERMISSIONS_UPDATED',
      targetType: 'membership',
      targetId: membershipId,
      targetName: membership.name,
      summary: `Updated permissions for ${membership.name}: ${permissions.length} database(s) assigned.`,
      details: { permissions },
    });

    res.json({ success: true, message: 'Permissions updated successfully.' });
  } catch (err: any) {
    return sendError(res, 500, 'UPDATE_FAILED', err.message);
  }
});

// ----------------------------------------------------
// Admin: Suspend User Access
// ----------------------------------------------------
adminRouter.post('/admin/users/:id/suspend', requireAuth, async (req: AuthRequest, res) => {
  const authCheck = authorizeOperation(req.user, {}, 'admin_manage_users');
  if (!authCheck.authorized) {
    return sendError(res, authCheck.status, authCheck.code!, authCheck.reason!);
  }

  const membershipId = req.params.id;
  const { reason } = req.body;
  const db = await getDb();

  try {
    const memberRes = await db.query(`
      SELECT m.*, u.name, u.email
      FROM clarity_app.organization_memberships m
      JOIN clarity_app.users u ON m.user_id = u.id
      WHERE m.id = $1 AND m.organization_id = $2
    `, [membershipId, req.user!.organization!.id]);

    if (memberRes.rows.length === 0) {
      return sendError(res, 404, 'MEMBER_NOT_FOUND', 'Member not found.');
    }

    const m = memberRes.rows[0];
    if (m.user_id === req.user!.id) {
      return sendError(res, 400, 'CANNOT_SUSPEND_SELF', 'Administrators cannot suspend their own account.');
    }

    await db.query(`
      UPDATE clarity_app.organization_memberships
      SET status = 'SUSPENDED', rejection_reason = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [reason || 'Access suspended by organization administrator.', membershipId]);

    // Revoke their active sessions
    await db.query('DELETE FROM clarity_app.sessions WHERE user_id = $1', [m.user_id]);

    // Log audit event
    await logAuditEvent(db, {
      organizationId: req.user!.organization!.id,
      actorId: req.user!.id,
      actorName: req.user!.name,
      actorEmail: req.user!.email,
      action: 'USER_SUSPENDED',
      targetType: 'user',
      targetId: m.user_id,
      targetName: m.name,
      summary: `Suspended access for ${m.name} (${m.email}).`,
      details: { reason },
    });

    res.json({ success: true, message: 'User access suspended.' });
  } catch (err: any) {
    return sendError(res, 500, 'SUSPEND_FAILED', err.message);
  }
});

// ----------------------------------------------------
// Admin: Reactivate User Access
// ----------------------------------------------------
adminRouter.post('/admin/users/:id/reactivate', requireAuth, async (req: AuthRequest, res) => {
  const authCheck = authorizeOperation(req.user, {}, 'admin_manage_users');
  if (!authCheck.authorized) {
    return sendError(res, authCheck.status, authCheck.code!, authCheck.reason!);
  }

  const membershipId = req.params.id;
  const db = await getDb();

  try {
    const memberRes = await db.query(`
      SELECT m.*, u.name, u.email
      FROM clarity_app.organization_memberships m
      JOIN clarity_app.users u ON m.user_id = u.id
      WHERE m.id = $1 AND m.organization_id = $2
    `, [membershipId, req.user!.organization!.id]);

    if (memberRes.rows.length === 0) {
      return sendError(res, 404, 'MEMBER_NOT_FOUND', 'Member not found.');
    }

    const m = memberRes.rows[0];

    await db.query(`
      UPDATE clarity_app.organization_memberships
      SET status = 'APPROVED', rejection_reason = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [membershipId]);

    // Log audit event
    await logAuditEvent(db, {
      organizationId: req.user!.organization!.id,
      actorId: req.user!.id,
      actorName: req.user!.name,
      actorEmail: req.user!.email,
      action: 'USER_REACTIVATED',
      targetType: 'user',
      targetId: m.user_id,
      targetName: m.name,
      summary: `Reactivated access for ${m.name} (${m.email}).`,
    });

    res.json({ success: true, message: 'User access restored.' });
  } catch (err: any) {
    return sendError(res, 500, 'REACTIVATE_FAILED', err.message);
  }
});

// ----------------------------------------------------
// Admin: Delete User from Organization
// ----------------------------------------------------
adminRouter.delete('/admin/users/:id', requireAuth, async (req: AuthRequest, res) => {
  const authCheck = authorizeOperation(req.user, {}, 'admin_manage_users');
  if (!authCheck.authorized) {
    return sendError(res, authCheck.status, authCheck.code!, authCheck.reason!);
  }

  const membershipId = req.params.id;
  const db = await getDb();

  try {
    const memberRes = await db.query(`
      SELECT m.*, u.name, u.email
      FROM clarity_app.organization_memberships m
      JOIN clarity_app.users u ON m.user_id = u.id
      WHERE m.id = $1 AND m.organization_id = $2
    `, [membershipId, req.user!.organization!.id]);

    if (memberRes.rows.length === 0) {
      return sendError(res, 404, 'MEMBER_NOT_FOUND', 'Member not found.');
    }

    const m = memberRes.rows[0];

    // Ensure we don't delete the last active admin
    if (m.role === 'ORG_ADMIN') {
      const adminCountRes = await db.query<{ count: string }>(`
        SELECT COUNT(*) as count FROM clarity_app.organization_memberships
        WHERE organization_id = $1 AND role = 'ORG_ADMIN' AND status = 'APPROVED'
      `, [req.user!.organization!.id]);

      if (parseInt(adminCountRes.rows[0].count, 10) <= 1) {
        return sendError(res, 400, 'LAST_ADMIN', 'Cannot remove the last active administrator of an organization.');
      }
    }

    // Delete membership and database permissions
    await db.query('DELETE FROM clarity_app.organization_memberships WHERE id = $1', [membershipId]);
    await db.query('DELETE FROM clarity_app.sessions WHERE user_id = $1', [m.user_id]);

    // Log audit event (organization datasets remain untouched)
    await logAuditEvent(db, {
      organizationId: req.user!.organization!.id,
      actorId: req.user!.id,
      actorName: req.user!.name,
      actorEmail: req.user!.email,
      action: 'USER_REMOVED',
      targetType: 'user',
      targetId: m.user_id,
      targetName: m.name,
      summary: `Removed user ${m.name} (${m.email}) from organization.`,
    });

    res.json({ success: true, message: 'User removed from organization.' });
  } catch (err: any) {
    return sendError(res, 500, 'DELETE_FAILED', err.message);
  }
});

// ----------------------------------------------------
// Admin: Activity Log (Audit Trail)
// ----------------------------------------------------
adminRouter.get('/admin/activity', requireAuth, async (req: AuthRequest, res) => {
  const authCheck = authorizeOperation(req.user, {}, 'admin_view_activity');
  if (!authCheck.authorized) {
    return sendError(res, authCheck.status, authCheck.code!, authCheck.reason!);
  }

  const { search, action, limit = '50', offset = '0' } = req.query;
  const db = await getDb();

  try {
    let sql = `
      SELECT id, actor_id, actor_name, actor_email, action,
             target_type, target_id, target_name, summary, details_json,
             outcome, affected_rows, created_at
      FROM clarity_app.audit_events
      WHERE organization_id = $1
    `;
    const params: any[] = [req.user!.organization!.id];

    if (search && typeof search === 'string') {
      params.push(`%${search.trim().toLowerCase()}%`);
      sql += ` AND (LOWER(summary) LIKE $${params.length} OR LOWER(target_name) LIKE $${params.length} OR LOWER(actor_name) LIKE $${params.length})`;
    }

    if (action && typeof action === 'string' && action !== 'all') {
      params.push(action);
      sql += ` AND action = $${params.length}`;
    }

    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit as string, 10), parseInt(offset as string, 10));

    const eventsRes = await db.query(sql, params);
    const events = eventsRes.rows.map((e: any) => ({
      ...e,
      details: JSON.parse(e.details_json || '{}'),
    }));

    res.json({ events });
  } catch (err: any) {
    return sendError(res, 500, 'FETCH_FAILED', err.message);
  }
});

// ----------------------------------------------------
// Admin: Organization Details & Stats
// ----------------------------------------------------
adminRouter.get('/admin/organizations/:id', requireAuth, async (req: AuthRequest, res) => {
  const orgId = req.params.id;
  if (req.user?.organization?.id !== orgId) {
    return sendError(res, 403, 'FORBIDDEN', 'Access denied to organization.');
  }

  const db = await getDb();
  try {
    const orgRes = await db.query(
      'SELECT id, name, handle, state, created_at FROM clarity_app.organizations WHERE id = $1',
      [orgId]
    );
    if (orgRes.rows.length === 0) {
      return sendError(res, 404, 'NOT_FOUND', 'Organization not found.');
    }

    const membersRes = await db.query(`
      SELECT m.id, m.user_id, m.role, m.status, m.requested_at, m.approved_at,
             u.name, u.email, u.account_state
      FROM clarity_app.organization_memberships m
      JOIN clarity_app.users u ON m.user_id = u.id
      WHERE m.organization_id = $1
      ORDER BY m.requested_at DESC
    `, [orgId]);

    const permsRes = await db.query(`
      SELECT p.*, d.display_name as database_name
      FROM clarity_app.database_permissions p
      JOIN clarity_app.organization_memberships m ON p.membership_id = m.id
      JOIN clarity_app.datasets d ON p.database_id = d.id
      WHERE m.organization_id = $1
    `, [orgId]);

    const permsByMembership: Record<string, any[]> = {};
    for (const p of permsRes.rows) {
      if (!permsByMembership[p.membership_id]) permsByMembership[p.membership_id] = [];
      permsByMembership[p.membership_id].push({
        id: p.id,
        databaseId: p.database_id,
        databaseName: p.database_name,
        canRead: Boolean(p.can_read),
        canInsert: Boolean(p.can_insert),
        canUpdate: Boolean(p.can_update),
        canDeleteRecords: Boolean(p.can_delete_records),
        canImportCsv: Boolean(p.can_import_csv),
        canExport: Boolean(p.can_export),
      });
    }

    const members = membersRes.rows.map(m => ({
      ...m,
      permissions: permsByMembership[m.id] || [],
    }));

    const pendingRequests = members.filter(m => m.status === 'PENDING');
    const datasetsRes = await db.query(
      'SELECT id, display_name, internal_schema FROM clarity_app.datasets WHERE organization_id = $1',
      [orgId]
    );

    res.json({
      organization: {
        ...orgRes.rows[0],
        members,
        pendingRequests,
        datasets: datasetsRes.rows,
      }
    });
  } catch (err: any) {
    return sendError(res, 500, 'FETCH_FAILED', err.message);
  }
});

// Update Organization Name
adminRouter.patch('/admin/organizations/:id', requireAuth, async (req: AuthRequest, res) => {
  const orgId = req.params.id;
  if (req.user?.organization?.id !== orgId || req.user?.membership?.role !== 'ORG_ADMIN') {
    return sendError(res, 403, 'FORBIDDEN', 'Admin privileges required.');
  }

  const { name } = req.body;
  if (!name || !name.trim()) {
    return sendError(res, 400, 'INVALID_INPUT', 'Organization name is required.');
  }

  const db = await getDb();
  try {
    await db.query(
      'UPDATE clarity_app.organizations SET name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [name.trim(), orgId]
    );

    await logAuditEvent(db, {
      organizationId: orgId,
      actorId: req.user!.id,
      actorName: req.user!.name,
      actorEmail: req.user!.email,
      action: 'ORGANIZATION_UPDATED',
      targetType: 'organization',
      targetId: orgId,
      targetName: name.trim(),
      summary: `Organization name updated to "${name.trim()}".`,
    });

    res.json({ success: true, message: 'Organization updated.' });
  } catch (err: any) {
    return sendError(res, 500, 'UPDATE_FAILED', err.message);
  }
});

// Organization Audit Logs Endpoint
adminRouter.get('/admin/organizations/:id/audit-logs', requireAuth, async (req: AuthRequest, res) => {
  const orgId = req.params.id;
  if (req.user?.organization?.id !== orgId) {
    return sendError(res, 403, 'FORBIDDEN', 'Access denied.');
  }

  const { search, action, limit = '50', offset = '0' } = req.query;
  const db = await getDb();

  try {
    let sql = `
      SELECT id, actor_id, actor_name, actor_email, action,
             target_type, target_id, target_name, summary, details_json,
             outcome, affected_rows, created_at
      FROM clarity_app.audit_events
      WHERE organization_id = $1
    `;
    const params: any[] = [orgId];

    if (search && typeof search === 'string') {
      params.push(`%${search.trim().toLowerCase()}%`);
      sql += ` AND (LOWER(summary) LIKE $${params.length} OR LOWER(target_name) LIKE $${params.length} OR LOWER(actor_name) LIKE $${params.length})`;
    }

    if (action && typeof action === 'string' && action !== 'all') {
      params.push(action);
      sql += ` AND action = $${params.length}`;
    }

    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit as string, 10), parseInt(offset as string, 10));

    const eventsRes = await db.query(sql, params);
    const logs = eventsRes.rows.map((e: any) => ({
      ...e,
      timestamp: e.created_at,
      details: JSON.parse(e.details_json || '{}'),
    }));

    res.json({ logs });
  } catch (err: any) {
    return sendError(res, 500, 'FETCH_FAILED', err.message);
  }
});

// Update Member Status (Approve, Reject, Suspend, Reactivate)
adminRouter.post('/admin/memberships/:id/status', requireAuth, async (req: AuthRequest, res) => {
  const authCheck = authorizeOperation(req.user, {}, 'admin_manage_users');
  if (!authCheck.authorized) {
    return sendError(res, authCheck.status, authCheck.code!, authCheck.reason!);
  }

  const membershipId = req.params.id;
  const { status, rejectionReason } = req.body;
  const db = await getDb();

  try {
    const memberRes = await db.query(`
      SELECT m.*, u.name, u.email, u.id as user_id
      FROM clarity_app.organization_memberships m
      JOIN clarity_app.users u ON m.user_id = u.id
      WHERE m.id = $1 AND m.organization_id = $2
    `, [membershipId, req.user!.organization!.id]);

    if (memberRes.rows.length === 0) {
      return sendError(res, 404, 'MEMBER_NOT_FOUND', 'Membership not found.');
    }

    const member = memberRes.rows[0];

    if (status === 'APPROVED') {
      await db.query(`
        UPDATE clarity_app.organization_memberships
        SET status = 'APPROVED', approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [membershipId]);
      await db.query(`UPDATE clarity_app.users SET account_state = 'active' WHERE id = $1`, [member.user_id]);

      // Ensure default read grant on active datasets if none exist
      const dsRes = await db.query('SELECT id FROM clarity_app.datasets WHERE organization_id = $1', [req.user!.organization!.id]);
      for (const ds of dsRes.rows) {
        await db.query(`
          INSERT INTO clarity_app.database_permissions (
            id, membership_id, database_id, can_read, can_insert, can_update, can_delete_records, can_import_csv, can_export, version, granted_by
          ) VALUES ($1, $2, $3, true, false, false, false, false, false, 1, $4)
          ON CONFLICT (membership_id, database_id) DO NOTHING
        `, [crypto.randomUUID(), membershipId, ds.id, req.user!.id]);
      }
    } else if (status === 'REJECTED') {
      await db.query(`
        UPDATE clarity_app.organization_memberships
        SET status = 'REJECTED', rejection_reason = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [rejectionReason || 'Access request rejected.', membershipId]);
    } else if (status === 'SUSPENDED') {
      await db.query(`
        UPDATE clarity_app.organization_memberships
        SET status = 'SUSPENDED', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [membershipId]);
      await db.query(`UPDATE clarity_app.users SET account_state = 'suspended' WHERE id = $1`, [member.user_id]);
    } else if (status === 'ACTIVE' || status === 'APPROVED') {
      await db.query(`
        UPDATE clarity_app.organization_memberships
        SET status = 'APPROVED', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [membershipId]);
      await db.query(`UPDATE clarity_app.users SET account_state = 'active' WHERE id = $1`, [member.user_id]);
    }

    await logAuditEvent(db, {
      organizationId: req.user!.organization!.id,
      actorId: req.user!.id,
      actorName: req.user!.name,
      actorEmail: req.user!.email,
      action: `MEMBER_STATUS_${status}`,
      targetType: 'membership',
      targetId: membershipId,
      targetName: member.name,
      summary: `Updated membership status of ${member.name} (${member.email}) to ${status}.`,
    });

    res.json({ success: true, message: `Membership status updated to ${status}.` });
  } catch (err: any) {
    return sendError(res, 500, 'STATUS_UPDATE_FAILED', err.message);
  }
});

// Update Member Permissions for a Specific Database
adminRouter.put('/admin/memberships/:membershipId/permissions/:databaseId', requireAuth, async (req: AuthRequest, res) => {
  const authCheck = authorizeOperation(req.user, {}, 'admin_manage_users');
  if (!authCheck.authorized) {
    return sendError(res, authCheck.status, authCheck.code!, authCheck.reason!);
  }

  const { membershipId, databaseId } = req.params;
  const { canRead, canInsert, canUpdate, canDeleteRecords, canImportCsv, canExport } = req.body;
  const db = await getDb();

  try {
    const memberRes = await db.query(`
      SELECT m.*, u.name, u.email
      FROM clarity_app.organization_memberships m
      JOIN clarity_app.users u ON m.user_id = u.id
      WHERE m.id = $1 AND m.organization_id = $2
    `, [membershipId, req.user!.organization!.id]);

    if (memberRes.rows.length === 0) {
      return sendError(res, 404, 'MEMBER_NOT_FOUND', 'Membership not found.');
    }

    const member = memberRes.rows[0];

    await db.query(`
      INSERT INTO clarity_app.database_permissions (
        id, membership_id, database_id,
        can_read, can_insert, can_update, can_delete_records, can_import_csv, can_export,
        version, granted_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, $10)
      ON CONFLICT (membership_id, database_id) DO UPDATE SET
        can_read = EXCLUDED.can_read,
        can_insert = EXCLUDED.can_insert,
        can_update = EXCLUDED.can_update,
        can_delete_records = EXCLUDED.can_delete_records,
        can_import_csv = EXCLUDED.can_import_csv,
        can_export = EXCLUDED.can_export,
        version = clarity_app.database_permissions.version + 1,
        granted_by = EXCLUDED.granted_by,
        updated_at = CURRENT_TIMESTAMP
    `, [
      crypto.randomUUID(),
      membershipId,
      databaseId,
      Boolean(canRead ?? true),
      Boolean(canInsert ?? false),
      Boolean(canUpdate ?? false),
      Boolean(canDeleteRecords ?? false),
      Boolean(canImportCsv ?? false),
      Boolean(canExport ?? false),
      req.user!.id,
    ]);

    await db.query(`
      UPDATE clarity_app.organization_memberships
      SET permission_revision = permission_revision + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [membershipId]);

    await logAuditEvent(db, {
      organizationId: req.user!.organization!.id,
      actorId: req.user!.id,
      actorName: req.user!.name,
      actorEmail: req.user!.email,
      action: 'PERMISSIONS_UPDATED',
      targetType: 'membership',
      targetId: membershipId,
      targetName: member.name,
      summary: `Updated database privileges for ${member.name} on database ${databaseId}.`,
      details: req.body,
    });

    res.json({ success: true, message: 'Permissions updated successfully.' });
  } catch (err: any) {
    return sendError(res, 500, 'PERMISSIONS_UPDATE_FAILED', err.message);
  }
});

