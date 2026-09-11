import crypto from 'crypto';
import { DatabaseAdapter, getDb } from './db.ts';
import { extractSchemaMetadata } from './schema.ts';

export async function seedSampleCollegeDataset(ownerId: string, organizationId?: string): Promise<{ datasetId: string; schemaName: string }> {
  const db = await getDb();
  const datasetId = crypto.randomUUID();
  const schemaName = `data_${crypto.randomBytes(6).toString('hex')}`;

  // 1. Create dataset record in clarity_app.datasets
  await db.query(
    `INSERT INTO clarity_app.datasets (
      id, organization_id, owner_id, created_by, updated_by, display_name, internal_schema, engine, is_active, lifecycle_state
    ) VALUES ($1, $2, $3, $3, $3, 'University Academics & Attendance', $4, 'PostgreSQL', true, 'active')`,
    [datasetId, organizationId || null, ownerId, schemaName]
  );

  // If organization provided, grant permissions to all memberships in this org
  if (organizationId) {
    const mems = await db.query('SELECT id, role FROM clarity_app.organization_memberships WHERE organization_id = $1', [organizationId]);
    for (const m of mems.rows) {
      const isEditor = m.role === 'ORG_ADMIN' || true;
      await db.query(`
        INSERT INTO clarity_app.database_permissions (
          id, membership_id, database_id, can_read, can_insert, can_update, can_delete_records, can_import_csv, can_export, granted_by
        ) VALUES ($1, $2, $3, true, $4, $4, $4, $4, true, $5)
        ON CONFLICT (membership_id, database_id) DO NOTHING
      `, [crypto.randomUUID(), m.id, datasetId, m.role === 'ORG_ADMIN', ownerId]);
    }
  }

  // 2. Create target schema
  await db.exec(`CREATE SCHEMA IF NOT EXISTS "${schemaName}";`);

  // 3. Create tables with actual primary keys and foreign keys
  await db.exec(`
    CREATE TABLE "${schemaName}"."departments" (
      "id" TEXT PRIMARY KEY,
      "name" TEXT NOT NULL
    );

    CREATE TABLE "${schemaName}"."students" (
      "student_id" TEXT PRIMARY KEY,
      "name" TEXT NOT NULL,
      "department_id" TEXT NOT NULL REFERENCES "${schemaName}"."departments"("id") ON DELETE CASCADE,
      "marks" NUMERIC NOT NULL
    );

    CREATE TABLE "${schemaName}"."courses" (
      "course_id" TEXT PRIMARY KEY,
      "title" TEXT NOT NULL,
      "department_id" TEXT NOT NULL REFERENCES "${schemaName}"."departments"("id") ON DELETE CASCADE
    );

    CREATE TABLE "${schemaName}"."attendance" (
      "attendance_id" TEXT PRIMARY KEY,
      "student_id" TEXT NOT NULL REFERENCES "${schemaName}"."students"("student_id") ON DELETE CASCADE,
      "course_id" TEXT NOT NULL REFERENCES "${schemaName}"."courses"("course_id") ON DELETE CASCADE,
      "date" DATE NOT NULL,
      "status" TEXT NOT NULL
    );
  `);

  // 4. Insert real rows
  await db.exec(`
    INSERT INTO "${schemaName}"."departments" ("id", "name") VALUES
      ('DEPT_AIML', 'Artificial Intelligence & Machine Learning'),
      ('DEPT_CSE', 'Computer Science & Engineering'),
      ('DEPT_ECE', 'Electronics & Communication'),
      ('DEPT_MECH', 'Mechanical Engineering');

    INSERT INTO "${schemaName}"."students" ("student_id", "name", "department_id", "marks") VALUES
      ('STU_001', 'Aarav Sharma', 'DEPT_AIML', 92.5),
      ('STU_002', 'Diya Patel', 'DEPT_AIML', 88.0),
      ('STU_003', 'Rohan Mehta', 'DEPT_AIML', 95.0),
      ('STU_004', 'Ananya Gupta', 'DEPT_CSE', 84.0),
      ('STU_005', 'Vikram Singh', 'DEPT_CSE', 79.5),
      ('STU_006', 'Sneha Rao', 'DEPT_CSE', 91.0),
      ('STU_007', 'Kabir Verma', 'DEPT_ECE', 76.0),
      ('STU_008', 'Pooja Nair', 'DEPT_ECE', 82.5),
      ('STU_009', 'Aditya Joshi', 'DEPT_MECH', 71.0),
      ('STU_010', 'Ishita Sen', 'DEPT_MECH', 85.0);

    INSERT INTO "${schemaName}"."courses" ("course_id", "title", "department_id") VALUES
      ('CRS_101', 'Deep Neural Networks', 'DEPT_AIML'),
      ('CRS_102', 'Computer Vision Foundations', 'DEPT_AIML'),
      ('CRS_201', 'Data Structures & Algorithms', 'DEPT_CSE'),
      ('CRS_202', 'Distributed Operating Systems', 'DEPT_CSE'),
      ('CRS_301', 'Digital Signal Processing', 'DEPT_ECE'),
      ('CRS_401', 'Thermodynamics & Heat Transfer', 'DEPT_MECH');

    INSERT INTO "${schemaName}"."attendance" ("attendance_id", "student_id", "course_id", "date", "status") VALUES
      ('ATT_001', 'STU_001', 'CRS_101', '2026-09-01', 'Present'),
      ('ATT_002', 'STU_002', 'CRS_101', '2026-09-01', 'Present'),
      ('ATT_003', 'STU_003', 'CRS_101', '2026-09-01', 'Absent'),
      ('ATT_004', 'STU_004', 'CRS_201', '2026-09-01', 'Present'),
      ('ATT_005', 'STU_005', 'CRS_201', '2026-09-01', 'Present'),
      ('ATT_006', 'STU_006', 'CRS_201', '2026-09-01', 'Present'),
      ('ATT_007', 'STU_007', 'CRS_301', '2026-09-01', 'Present'),
      ('ATT_008', 'STU_008', 'CRS_301', '2026-09-01', 'Absent'),
      ('ATT_009', 'STU_009', 'CRS_401', '2026-09-01', 'Present'),
      ('ATT_010', 'STU_010', 'CRS_401', '2026-09-01', 'Present'),
      ('ATT_011', 'STU_001', 'CRS_102', '2026-09-02', 'Present'),
      ('ATT_012', 'STU_002', 'CRS_102', '2026-09-02', 'Present'),
      ('ATT_013', 'STU_003', 'CRS_102', '2026-09-02', 'Present'),
      ('ATT_014', 'STU_004', 'CRS_202', '2026-09-02', 'Absent'),
      ('ATT_015', 'STU_005', 'CRS_202', '2026-09-02', 'Present');
  `);

  // 5. Populate app_dataset_tables
  await db.query(`
    INSERT INTO clarity_app.dataset_tables (id, dataset_id, table_name, row_count, row_count_type) VALUES
      ('${crypto.randomUUID()}', '${datasetId}', 'departments', 4, 'exact'),
      ('${crypto.randomUUID()}', '${datasetId}', 'students', 10, 'exact'),
      ('${crypto.randomUUID()}', '${datasetId}', 'courses', 6, 'exact'),
      ('${crypto.randomUUID()}', '${datasetId}', 'attendance', 15, 'exact');
  `);

  // 6. Extract schema metadata snapshot
  await extractSchemaMetadata(db, datasetId, schemaName);

  // 7. Add notification
  await db.query(
    `INSERT INTO clarity_app.notifications (id, owner_id, title, message, event_type, related_entity_type, related_entity_id)
     VALUES ($1, $2, 'Your database is ready.', 'University Academics & Attendance sample dataset loaded.', 'dataset_ready', 'dataset', $3)`,
    [crypto.randomUUID(), ownerId, datasetId]
  );

  return { datasetId, schemaName };
}

export const KNOWN_TEST_CSVS = {
  marks: `department,marks
AIML,80
AIML,100
CSE,70
CSE,90`,
  revenue: `date,region,revenue
2026-09-01,North,100
2026-09-01,South,200
2026-09-02,North,300
2026-09-02,South,50`,
};
