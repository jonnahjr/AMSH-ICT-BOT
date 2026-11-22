require('dotenv').config();
const fs = require('fs');
const mysql = require('mysql2/promise');
(async()=>{
  const conn=await mysql.createConnection({
    host:process.env.DB_HOST||'localhost', port:Number(process.env.DB_PORT||3306),
    user:process.env.DB_USER, password:process.env.DB_PASSWORD,
    database:process.env.DB_NAME||'amanuel_it_support'
  });
  try {
    const sql=fs.readFileSync('./sql/tables.sql','utf8').replace(/^USE\s+[^;]+;\s*/i,'');
    for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean)) await conn.query(statement);
    console.log('Database tables created successfully.');
  } finally { await conn.end(); }
})().catch(err=>{console.error('Database initialization failed:',err.message);process.exit(1);});
