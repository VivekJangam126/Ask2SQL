import crypto from 'crypto';
import { DatabaseAdapter, getDb } from './db.ts';
import { hashPassword } from './auth.ts';
import { seedSampleCollegeDataset } from './seed.ts';
import { extractSchemaMetadata } from './schema.ts';

export async function seedDemoOrganizationsAndUsers() {
  const db = await getDb();
  console.log('[Demo Mode] Seeding synthetic organizations and role personas...');

  try {
    // ----------------------------------------------------
    // Organization 1: Acme Analytics
    // ----------------------------------------------------
    const org1Id = 'org-acme-analytics-001';
    await db.query(`
      INSERT INTO clarity_app.organizations (id, name, handle, state)
      VALUES ($1, 'Acme Analytics', 'acme-analytics', 'active')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, state = 'active'
    `, [org1Id]);

    // ----------------------------------------------------
    // Organization 2: Nexus Tech
    // ----------------------------------------------------
    const org2Id = 'org-nexus-tech-002';
    await db.query(`
      INSERT INTO clarity_app.organizations (id, name, handle, state)
      VALUES ($1, 'Nexus Tech', 'nexus-tech', 'active')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, state = 'active'
    `, [org2Id]);

    // Synthetic Demo Personas for Acme Analytics
    const acmeAdminId = 'usr-acme-admin-001';
    const acmeReadOnlyId = 'usr-acme-readonly-002';
    const acmeEditorId = 'usr-acme-editor-003';
    const acmePendingId = 'usr-acme-pending-004';
    const acmeRejectedId = 'usr-acme-rejected-005';
    const acmeSuspendedId = 'usr-acme-suspended-006';

    const nexusAdminId = 'usr-nexus-admin-001';

    const defaultMemberHash = hashPassword('ClarityUser2026!');
    const acmeAdminHash = hashPassword('ClarityAdmin2026!');
    const nexusAdminHash = hashPassword('ClarityNexus2026!');

    const usersToUpsert = [
      { id: acmeAdminId, name: 'Alex Morgan (Admin)', email: 'admin@claritysql.internal', hash: acmeAdminHash, role: 'ORG_ADMIN', status: 'APPROVED', orgId: org1Id },
      { id: acmeReadOnlyId, name: 'Jordan Lee (Read-Only)', email: 'member.readonly@claritysql.internal', hash: defaultMemberHash, role: 'MEMBER', status: 'APPROVED', orgId: org1Id },
      { id: acmeEditorId, name: 'Taylor Swift (Editor)', email: 'member.editor@claritysql.internal', hash: defaultMemberHash, role: 'MEMBER', status: 'APPROVED', orgId: org1Id },
      { id: acmePendingId, name: 'Casey Smith (Pending)', email: 'member.pending@claritysql.internal', hash: defaultMemberHash, role: 'MEMBER', status: 'PENDING', orgId: org1Id, note: 'Requesting access to college dataset for Q3 academic review.' },
      { id: acmeRejectedId, name: 'Riley Davis (Rejected)', email: 'member.rejected@claritysql.internal', hash: defaultMemberHash, role: 'MEMBER', status: 'REJECTED', orgId: org1Id, rejectionReason: 'External contractor access requires security vendor sponsorship.' },
      { id: acmeSuspendedId, name: 'Morgan Bailey (Suspended)', email: 'member.suspended@claritysql.internal', hash: defaultMemberHash, role: 'MEMBER', status: 'SUSPENDED', orgId: org1Id, rejectionReason: 'Temporary security hold pending internal audit.' },
      { id: nexusAdminId, name: 'Sam Rivera (Nexus Admin)', email: 'admin.nexus@claritysql.internal', hash: nexusAdminHash, role: 'ORG_ADMIN', status: 'APPROVED', orgId: org2Id },
    ];

    for (const u of usersToUpsert) {
      await db.query(`
        INSERT INTO clarity_app.users (id, name, email, password_hash, account_state)
        VALUES ($1, $2, $3, $4, 'active')
        ON CONFLICT (email) DO UPDATE SET password_hash = $4, name = $2
      `, [u.id, u.name, u.email, u.hash]);

      // Ensure membership
      await db.query(`
        INSERT INTO clarity_app.organization_memberships (
          id, user_id, organization_id, role, status, note, rejection_reason, permission_revision
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 1)
        ON CONFLICT (user_id) DO UPDATE SET
          organization_id = EXCLUDED.organization_id,
          role = EXCLUDED.role,
          status = EXCLUDED.status,
          note = EXCLUDED.note,
          rejection_reason = EXCLUDED.rejection_reason
      `, [
        `mem-${u.id}`,
        u.id,
        u.orgId,
        u.role,
        u.status,
        u.note || null,
        u.rejectionReason || null,
      ]);
    }

    // Seed Dataset for Acme Analytics if not present
    let acmeDatasetId = '';
    const existingAcmeDs = await db.query<{ id: string }>(`
      SELECT id FROM clarity_app.datasets WHERE organization_id = $1 LIMIT 1
    `, [org1Id]);

    if (existingAcmeDs.rows.length === 0) {
      const seedResult = await seedSampleCollegeDataset(acmeAdminId);
      acmeDatasetId = seedResult.datasetId;
      await db.query(`
        UPDATE clarity_app.datasets
        SET organization_id = $1, created_by = $2, updated_by = $2
        WHERE id = $3
      `, [org1Id, acmeAdminId, acmeDatasetId]);
    } else {
      acmeDatasetId = existingAcmeDs.rows[0].id;
    }

    // Assign Permissions on Acme Dataset:
    // 1. Read-Only member: read + export
    await db.query(`
      INSERT INTO clarity_app.database_permissions (
        id, membership_id, database_id, can_read, can_insert, can_update, can_delete_records, can_import_csv, can_export, version, granted_by
      ) VALUES ($1, $2, $3, true, false, false, false, false, true, 1, $4)
      ON CONFLICT (membership_id, database_id) DO UPDATE SET
        can_read = true, can_insert = false, can_update = false, can_delete_records = false, can_import_csv = false, can_export = true
    `, [`perm-${acmeReadOnlyId}`, `mem-${acmeReadOnlyId}`, acmeDatasetId, acmeAdminId]);

    // 2. Data Editor member: read + insert + update + import_csv + export
    await db.query(`
      INSERT INTO clarity_app.database_permissions (
        id, membership_id, database_id, can_read, can_insert, can_update, can_delete_records, can_import_csv, can_export, version, granted_by
      ) VALUES ($1, $2, $3, true, true, true, false, true, true, 1, $4)
      ON CONFLICT (membership_id, database_id) DO UPDATE SET
        can_read = true, can_insert = true, can_update = true, can_delete_records = false, can_import_csv = true, can_export = true
    `, [`perm-${acmeEditorId}`, `mem-${acmeEditorId}`, acmeDatasetId, acmeAdminId]);

    // Seed Dataset for Nexus Tech if not present
    const existingNexusDs = await db.query<{ id: string }>(`
      SELECT id FROM clarity_app.datasets WHERE organization_id = $1 LIMIT 1
    `, [org2Id]);

    if (existingNexusDs.rows.length === 0) {
      const nexusDsId = crypto.randomUUID();
      const nexusSchema = `data_nexus_${crypto.randomBytes(4).toString('hex')}`;
      await db.query(`
        INSERT INTO clarity_app.datasets (id, organization_id, owner_id, created_by, updated_by, display_name, internal_schema, engine, is_active)
        VALUES ($1, $2, $3, $3, $3, 'Nexus Global Telemetry', $4, 'PostgreSQL', true)
      `, [nexusDsId, org2Id, nexusAdminId, nexusSchema]);

      await db.exec(`CREATE SCHEMA IF NOT EXISTS "${nexusSchema}";`);
      await db.exec(`
        CREATE TABLE "${nexusSchema}"."devices" (
          "device_id" TEXT PRIMARY KEY,
          "device_name" TEXT NOT NULL,
          "region" TEXT NOT NULL,
          "battery_level" NUMERIC NOT NULL
        );
        INSERT INTO "${nexusSchema}"."devices" ("device_id", "device_name", "region", "battery_level") VALUES
          ('DEV-101', 'Edge Gateway Alpha', 'us-west', 94.2),
          ('DEV-102', 'Telemetry Beacon Beta', 'eu-central', 68.5),
          ('DEV-103', 'Sensor Pod Gamma', 'ap-south', 82.0);
      `);

      await db.query(`
        INSERT INTO clarity_app.dataset_tables (id, dataset_id, table_name, row_count, row_count_type)
        VALUES ($1, $2, 'devices', 3, 'exact')
      `, [crypto.randomUUID(), nexusDsId]);

      await extractSchemaMetadata(db, nexusDsId, nexusSchema);
    }

    // Seed initial audit events
    await db.query(`
      INSERT INTO clarity_app.audit_events (id, organization_id, actor_id, actor_name, actor_email, action, target_type, target_name, summary, outcome)
      VALUES
        ($1, $2, $3, 'System', 'system@claritysql.internal', 'ORGANIZATION_CREATED', 'organization', 'Acme Analytics', 'Organization Acme Analytics initialized in demo mode.', 'success'),
        ($4, $5, $6, 'System', 'system@claritysql.internal', 'ORGANIZATION_CREATED', 'organization', 'Nexus Tech', 'Organization Nexus Tech initialized in demo mode.', 'success')
      ON CONFLICT (id) DO NOTHING
    `, [
      'audit-init-001', org1Id, acmeAdminId,
      'audit-init-002', org2Id, nexusAdminId,
    ]);

    console.log('[Demo Mode] Synthetic organizations and personas ready.');
  } catch (err) {
    console.error('[Demo Mode] Seeding warning:', err);
  }
}
