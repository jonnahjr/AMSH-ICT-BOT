const mysql = require('mysql2/promise');
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME || 'amanuel_it_support',
  waitForConnections: true, connectionLimit: 10, queueLimit: 0, charset: 'utf8mb4'
});
async function query(sql, params = []) { const [rows] = await pool.execute(sql, params); return rows; }
async function one(sql, params = []) { const rows = await query(sql, params); return rows[0] || null; }
async function log(userId, action, entityType = null, entityId = null, details = null) {
  await query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,details) VALUES(?,?,?,?,?)', [userId || null, action, entityType, entityId, details]);
}
module.exports = { pool, query, one, log };
