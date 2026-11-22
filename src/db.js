require('dotenv').config();

const fallbackDb = Buffer.from('cG9zdGdyZXNxbDovL3Bvc3RncmVzLmxvZ3lydXRsd3J6dnpwaG9ra2dxOkpvbm5haGpuciU0MDA5NDU2MjgwNzVAYXdzLTEtZXUtd2VzdC0xLnBvb2xlci5zdXBhYmFzZS5jb206NTQzMi9wb3N0Z3Jlcw==', 'base64').toString();
let dbUrl = process.env.DATABASE_URL || fallbackDb;

// Automatically route around direct IPv6 host to IPv4 pooler to prevent ENETUNREACH on cloud hosts
if (dbUrl.includes('db.logyrutlwrzvzphokkgq.supabase.co')) {
  dbUrl = fallbackDb;
}
if (dbUrl.includes('Jonnahjnr@0945628075@')) {
  dbUrl = dbUrl.replace('Jonnahjnr@0945628075@', 'Jonnahjnr%400945628075@');
}

const isPg = Boolean(dbUrl);

let pool;
if (isPg) {
  const { Pool } = require('pg');
  pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });
} else {
  const mysql = require('mysql2/promise');
  pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'amanuel_it_support',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4'
  });
}

function toPgSql(sql) {
  let idx = 1;
  return sql
    .replace(/\b([a-zA-Z0-9_]*\.?)is_active\s*=\s*1\b/gi, '$1is_active = TRUE')
    .replace(/\b([a-zA-Z0-9_]*\.?)is_active\s*=\s*0\b/gi, '$1is_active = FALSE')
    .replace(/\?/g, () => `$${idx++}`);
}

async function query(sql, params = []) {
  if (isPg) {
    let pgSql = toPgSql(sql);
    const isInsert = /^\s*INSERT\s+INTO\b/i.test(sql);
    if (isInsert && !/\bRETURNING\b/i.test(pgSql)) {
      pgSql += ' RETURNING id';
    }
    const res = await pool.query(pgSql, params);
    const rows = res.rows || [];
    rows.insertId = rows[0]?.id;
    rows.affectedRows = res.rowCount;
    rows.rowCount = res.rowCount;
    return rows;
  }
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function one(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

async function log(userId, action, entityType = null, entityId = null, details = null) {
  await query(
    'INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,details) VALUES(?,?,?,?,?)',
    [userId || null, action, entityType, entityId, details]
  );
}

// Auto-initialize tables in PostgreSQL if they do not exist
async function initTablesIfMissing() {
  if (!isPg) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      telegram_id BIGINT NOT NULL UNIQUE,
      full_name VARCHAR(160) NOT NULL,
      phone VARCHAR(40) NULL,
      email VARCHAR(160) NULL,
      department VARCHAR(160) NULL,
      role VARCHAR(30) NOT NULL DEFAULT 'employee',
      specialization VARCHAR(120) NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      language VARCHAR(10) NOT NULL DEFAULT 'en',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS requests (
      id BIGSERIAL PRIMARY KEY,
      request_no VARCHAR(40) NOT NULL UNIQUE,
      employee_id BIGINT NOT NULL REFERENCES users(id),
      equipment_type VARCHAR(80) NOT NULL,
      equipment_name VARCHAR(160) NOT NULL,
      model VARCHAR(160) NULL,
      serial_number VARCHAR(160) NULL,
      asset_tag VARCHAR(100) NULL,
      department VARCHAR(160) NOT NULL,
      room_location VARCHAR(160) NULL,
      problem_description TEXT NOT NULL,
      priority VARCHAR(20) NOT NULL DEFAULT 'medium',
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      assigned_technician_id BIGINT NULL REFERENCES users(id),
      attachment_file_id VARCHAR(255) NULL,
      diagnosis TEXT NULL,
      repair_actions TEXT NULL,
      parts_used TEXT NULL,
      technician_remarks TEXT NULL,
      employee_confirmation VARCHAR(30) NOT NULL DEFAULT 'pending',
      reported_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      assigned_at TIMESTAMPTZ NULL,
      completed_at TIMESTAMPTZ NULL,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS maintenance_activities (
      id BIGSERIAL PRIMARY KEY,
      request_id BIGINT NOT NULL REFERENCES requests(id),
      actor_user_id BIGINT NOT NULL REFERENCES users(id),
      activity_type VARCHAR(60) NOT NULL,
      notes TEXT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS spare_parts (
      id BIGSERIAL PRIMARY KEY,
      item_name VARCHAR(160) NOT NULL UNIQUE,
      quantity NUMERIC(12,2) NOT NULL DEFAULT 0,
      unit VARCHAR(30) NOT NULL DEFAULT 'pcs',
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS spare_transactions (
      id BIGSERIAL PRIMARY KEY,
      part_id BIGINT NOT NULL REFERENCES spare_parts(id),
      request_id BIGINT NULL REFERENCES requests(id),
      actor_user_id BIGINT NOT NULL REFERENCES users(id),
      transaction_type VARCHAR(30) NOT NULL,
      quantity NUMERIC(12,2) NOT NULL,
      notes VARCHAR(500) NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGSERIAL PRIMARY KEY,
      actor_user_id BIGINT NULL REFERENCES users(id),
      action VARCHAR(100) NOT NULL,
      entity_type VARCHAR(60) NULL,
      entity_id BIGINT NULL,
      details TEXT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `);
  // Older installs created users.is_active as SMALLINT while the code compares it to TRUE/FALSE,
  // which makes every user write fail. Convert it in place.
  await pool.query(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users'
          AND column_name = 'is_active' AND data_type = 'smallint'
      ) THEN
        ALTER TABLE users ALTER COLUMN is_active DROP DEFAULT;
        ALTER TABLE users ALTER COLUMN is_active TYPE BOOLEAN USING (is_active <> 0);
        ALTER TABLE users ALTER COLUMN is_active SET DEFAULT TRUE;
      END IF;
    END $$;
  `);
  // Email was added after the first release, so older installs need the column added in place.
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(160) NULL');
  // Bot conversation state, so an in-progress report survives a restart/redeploy.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_sessions (
      id BIGSERIAL PRIMARY KEY,
      telegram_id BIGINT NOT NULL UNIQUE,
      data TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

module.exports = { pool, query, one, log, isPg, initTablesIfMissing };
