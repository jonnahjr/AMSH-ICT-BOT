require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Telegraf, Markup } = require('telegraf');
const { query, one, log, pool, isPg, initTablesIfMissing } = require('./db');
const { t } = require('./i18n');
const { generateRequestPdf } = require('./pdf');

const fallbackToken = Buffer.from('OTI2NzkxMDg5OTpBQUVwTW5WRUJycmo5LURpY0dYOHFtZUZDTXcwUHFHV2dCRQ==', 'base64').toString();
const botToken = (process.env.BOT_TOKEN && !process.env.BOT_TOKEN.includes('PASTE_')) ? process.env.BOT_TOKEN : fallbackToken;
const bot = new Telegraf(botToken);
const sessions = new Map();
const uploadDir = path.resolve(process.env.UPLOAD_DIR || './storage/uploads');
const reportDir = path.resolve(process.env.REPORT_DIR || './storage/reports');
fs.mkdirSync(uploadDir, { recursive: true }); fs.mkdirSync(reportDir, { recursive: true });
const CATEGORIES = ['Desktop computer','Laptop','Printer','Scanner','UPS','CCTV','Network equipment','Other electronics'];
const CATEGORIES_AM = ['🖥️ ዴስክቶፕ ኮምፒውተር','💻 ላፕቶፕ','🖨️ ፕሪንተር','📠 ስካነር','🔋 UPS / ኃይል','📹 CCTV ካሜራ','🌐 የኔትወርክ መሣሪያ','🔌 ሌሎች ኤሌክትሮኒክስ'];
const CATEGORIES_EN = ['🖥️ Desktop computer','💻 Laptop','🖨️ Printer','📠 Scanner','🔋 UPS / Power','📹 CCTV Camera','🌐 Network equipment','🔌 Other electronics'];

const DEVICE_MODELS = {
  0: ['HP ProDesk / EliteDesk','Dell OptiPlex','Lenovo ThinkCentre','Acer Veriton','Custom / Assembled PC','Other Desktop / ሌላ'],
  1: ['HP EliteBook / ProBook','Dell Latitude','Lenovo ThinkPad','Toshiba / Dynabook','Apple MacBook','Other Laptop / ሌላ'],
  2: ['HP LaserJet','Canon imageCLASS / LBP','Epson EcoTank','Brother Printer','Barcode / Label Printer','Other Printer / ሌላ'],
  3: ['HP ScanJet','Canon CanoScan / DR','Epson WorkForce','Fujitsu fi-Series','Other Scanner / ሌላ'],
  4: ['APC Smart-UPS / Back-UPS','Eaton UPS','Mercury UPS','Legrand / Kstar','Other UPS / ሌላ'],
  5: ['Hikvision Camera / NVR','Dahua Camera / DVR','Uniview (UNV)','CCTV Monitor / Power','Other CCTV / ሌላ'],
  6: ['Cisco Switch / Router','TP-Link Wi-Fi / AP','D-Link Switch','Wall Socket / Patch Cable','Other Network / ሌላ'],
  7: ['Projector / ፕሮጀክተር','Photocopier / ፎቶኮፒ','TV Screen / ማሳያ','Sound System / ድምጽ','Other Device / ሌላ']
};

const PROBLEMS_BY_CATEGORY = {
  // 0 — Desktop computer
  0: [
    { en: "🔴 Won't power on / Dead", am: '🔴 አይበራም / ሞቷል' },
    { en: '🖥️ No display / Black screen', am: '🖥️ ምስል አያሳይም / ጥቁር ማያ' },
    { en: '🔵 Windows error / Blue screen', am: '🔵 የዊንዶውስ ስህተት / ሰማያዊ' },
    { en: '🐢 Very slow / Freezing', am: '🐢 በጣም ይዘገያል / ቀዘቀዘ' },
    { en: '🌐 No Internet / Network', am: '🌐 ኔትወርክ / ኢንተርኔት የለም' },
    { en: '🔊 Strange noise / Overheating', am: '🔊 ያልተለመደ ድምፅ / ሙቀት' },
    { en: '💾 Hard disk / Storage error', am: '💾 ሃርድ ዲስክ ስህተት' },
    { en: '🖱️ Mouse / Keyboard not working', am: '🖱️ መዳፊት / ቁልፍ ሰሌዳ አይሰራም' },
    { en: '⚡ Sudden shutdown / Power issue', am: '⚡ ድንገት ይጠፋል / ኃይል' },
    { en: '❓ Other desktop issue', am: '❓ ሌላ ችግር' },
  ],
  // 1 — Laptop
  1: [
    { en: "🔴 Won't power on / Dead", am: '🔴 አይበራም / ሞቷል' },
    { en: '🖥️ No display / Dim screen', am: '🖥️ ምስል አያሳይም / ጨለማ' },
    { en: '🔵 Windows error / Crash', am: '🔵 የዊንዶውስ ስህተት / ወደቀ' },
    { en: '🐢 Very slow / Freezing', am: '🐢 በጣም ይዘገያል / ቀዘቀዘ' },
    { en: '🔋 Battery drains fast / No charge', am: '🔋 ባትሪ ፈጠን ያልቃል / አይሞላም' },
    { en: '🌐 No Wi-Fi / Network', am: '🌐 Wi-Fi / ኔትወርክ የለም' },
    { en: '🔊 Overheating / Strange noise', am: '🔊 ሙቀት / ያልተለመደ ድምፅ' },
    { en: '⌨️ Keyboard / Touchpad broken', am: '⌨️ ቁልፍ ሰሌዳ / ቶቻፓድ አይሰራም' },
    { en: '🔌 Charging port / Adapter issue', am: '🔌 የኃይል ወደብ / አዳፕተር ችግር' },
    { en: '❓ Other laptop issue', am: '❓ ሌላ ችግር' },
  ],
  // 2 — Printer
  2: [
    { en: '📄 Paper jam', am: '📄 ወረቀት ይይዛል' },
    { en: '🖨️ Not printing / Offline', am: '🖨️ አያትምም / ኦፍላይን' },
    { en: '🎨 Faded / Streaky print quality', am: '🎨 ደብዛዛ / ሸሸ ህትመት' },
    { en: '🖥️ Printer not detected by PC', am: '🖥️ ፕሪንተር አልታወቀም' },
    { en: '💧 Ink / Toner empty or low', am: '💧 ቀለም ጨርሷል / ቀነሰ' },
    { en: "🔴 Won't power on", am: '🔴 አይበራም' },
    { en: '🌐 Network / Wi-Fi printing error', am: '🌐 ኔትወርክ ህትመት ስህተት' },
    { en: '🔊 Strange noise while printing', am: '🔊 ሲያትም ያልተለምደ ድምፅ' },
    { en: '❓ Other printer issue', am: '❓ ሌላ ችግር' },
  ],
  // 3 — Scanner
  3: [
    { en: "🔴 Won't power on", am: '🔴 አይበራም' },
    { en: '📷 Not scanning / No response', am: '📷 አይስካንም / ምላሽ የለም' },
    { en: '🖥️ Scanner not detected by PC', am: '🖥️ ስካነር አልታወቀም' },
    { en: '🌫️ Blurry / Poor scan quality', am: '🌫️ ደብዛዛ / ዝቅተኛ ጥራት' },
    { en: '📄 Paper jam / Feed error', am: '📄 ወረቀት ይይዛል / ፊድ ስህተት' },
    { en: '🔌 USB / Cable connection issue', am: '🔌 USB / ኬብል ችግር' },
    { en: '❓ Other scanner issue', am: '❓ ሌላ ችግር' },
  ],
  // 4 — UPS / Power
  4: [
    { en: "🔴 UPS won't turn on", am: '🔴 UPS አይበራም' },
    { en: '🔋 Battery not holding charge', am: '🔋 ባትሪ ኃይል አያስቀምጥም' },
    { en: '⚡ No power output / No backup', am: '⚡ ኃይል አይሰጥም / ምትክ የለም' },
    { en: '🔊 Beeping continuously', am: '🔊 ደጋግሞ ድምፅ ያሰማል' },
    { en: '💡 Overload alarm / Fault light', am: '💡 ከመጠን ማሳሰቢያ / ቀይ ብርሃን' },
    { en: '🌡️ Overheating', am: '🌡️ ሙቀት' },
    { en: '❓ Other UPS issue', am: '❓ ሌላ ችግር' },
  ],
  // 5 — CCTV
  5: [
    { en: "🔴 Camera won't power on", am: '🔴 ካሜራ አይበራም' },
    { en: '📷 No video / Black screen on monitor', am: '📷 ምስል የለም / ጥቁር ማያ' },
    { en: '🌫️ Blurry / Poor image quality', am: '🌫️ ደብዛዛ / ዝቅተኛ ጥራት' },
    { en: '🌐 Camera offline / Not connecting', am: '🌐 ካሜራ ኦፍላይን / አይገናኝም' },
    { en: '💾 DVR/NVR not recording', am: '💾 DVR/NVR አይቀዳም' },
    { en: '🔊 Alarm / Alert not working', am: '🔊 ማሳሰቢያ አይሰራም' },
    { en: '📡 Loose cable / No signal', am: '📡 ኬብል ቀላ / ምልክት የለም' },
    { en: '❓ Other CCTV issue', am: '❓ ሌላ ችግር' },
  ],
  // 6 — Network equipment
  6: [
    { en: '🌐 No internet / All users affected', am: '🌐 ኢንተርኔት የለም / ሁሉም' },
    { en: '📶 Slow internet / Wi-Fi weak', am: '📶 ቀስ ኢንተርኔት / Wi-Fi ደካማ' },
    { en: '🔌 Switch / Router not responding', am: '🔌 ስዊች / ራውተር አይሰራም' },
    { en: '💡 Link light off / Port dead', am: '💡 ፖርት ምልክት የለም / ሞቷል' },
    { en: "🔴 Router / Switch won't power on", am: '🔴 ራውተር / ስዊች አይበራም' },
    { en: '🔊 Overheating device', am: '🔊 መሣሪያ ሙቀት' },
    { en: '📡 Cable disconnected / Damaged', am: '📡 ኬብል ተቋርጧል / ተበሳ' },
    { en: '❓ Other network issue', am: '❓ ሌላ ችግር' },
  ],
  // 7 — Other electronics (projector, photocopier, TV, sound)
  7: [
    { en: "🔴 Won't power on", am: '🔴 አይበራም' },
    { en: '🖥️ No display / No output', am: '🖥️ ምስል / ውጤት የለም' },
    { en: '🔊 No sound / Distorted audio', am: '🔊 ድምፅ የለም / ተበሳ' },
    { en: '🌐 Connection / Signal issue', am: '🌐 ግንኙነት / ምልክት ችግር' },
    { en: '🔥 Overheating', am: '🔥 ሙቀት' },
    { en: '📄 Paper jam (photocopier)', am: '📄 ወረቀት ይይዛል (ፎቶኮፒ)' },
    { en: '❓ Other device issue', am: '❓ ሌላ ችግር' },
  ],
};

// One flat list: every ward, OPD room and office is selectable directly (no grouping).
const HOSPITAL_LOCATIONS = [
  ...Array.from({ length: 11 }, (_, i) => ({ en: `🛏️ Ward ${i + 1}`, am: `🛏️ ዋርድ ${i + 1}` })),
  { en: '🔒 Forensic Ward', am: '🔒 ፎረንሲክ ዋርድ' },
  ...Array.from({ length: 11 }, (_, i) => ({ en: `🏥 OPD ${30 + i}`, am: `🏥 ኦፒዲ ${30 + i}` })),
  { en: '🔒 Forensic OPD', am: '🔒 ፎረንሲክ ኦፒዲ' },
  { en: '💼 Medical Director Office', am: '💼 የሕክምና ዳይሬክተር ቢሮ' },
  { en: '💼 Administration Office', am: '💼 አስተዳደር ቢሮ' },
  { en: '💼 HR Office', am: '💼 የሰው ኃይል ቢሮ' },
  { en: '💼 Finance Office', am: '💼 ፋይናንስ ቢሮ' },
  { en: '💼 IT Office', am: '💼 አይቲ ቢሮ' },
  { en: '💼 Nursing Office', am: '💼 የነርሲንግ ቢሮ' },
  { en: '📁 Card Office / Archive', am: '📁 ካርድ ክፍል' },
  { en: '📝 Reception / Registration', am: '📝 መቀበያ / ምዝገባ' },
  { en: '💊 Pharmacy', am: '💊 ፋርማሲ' },
  { en: '🔬 Laboratory', am: '🔬 ላብራሪ' },
  { en: '🩻 Radiology / Imaging', am: '🩻 ራዲዮሎጂ' },
  { en: '🚨 Emergency', am: '🚨 ድንገተኛ ክፍል' },
  { en: '📍 Other — type it', am: '📍 ሌላ — ይጻፉ' },
];
// Stable callback keys so older messages keep resolving to the right place.
const locKey = label => label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
HOSPITAL_LOCATIONS.forEach(l => { l.key = locKey(l.en); });

function categoryKeyboard(isAm) {
  const labels = isAm ? CATEGORIES_AM : CATEGORIES_EN;
  const rows = [];
  for (let i = 0; i < labels.length; i += 2) {
    const row = [Markup.button.callback(labels[i], `cat:${i}`)];
    if (labels[i + 1]) row.push(Markup.button.callback(labels[i + 1], `cat:${i + 1}`));
    rows.push(row);
  }
  return Markup.inlineKeyboard(rows);
}

function modelKeyboard(catIdx, isAm) {
  const models = DEVICE_MODELS[catIdx] || DEVICE_MODELS[7];
  const rows = [];
  for (let i = 0; i < models.length; i += 2) {
    const row = [Markup.button.callback(models[i], `repmodel:${catIdx}:${i}`)];
    if (models[i + 1]) row.push(Markup.button.callback(models[i + 1], `repmodel:${catIdx}:${i + 1}`));
    rows.push(row);
  }
  return Markup.inlineKeyboard(rows);
}

function problemKeyboard(isAm, catIdx) {
  const list = PROBLEMS_BY_CATEGORY[catIdx] || PROBLEMS_BY_CATEGORY[7];
  const rows = [];
  for (let i = 0; i < list.length; i += 2) {
    const p1 = list[i];
    const row = [Markup.button.callback(isAm ? p1.am : p1.en, `repprob:${catIdx}:${i}`)];
    if (list[i + 1]) {
      const p2 = list[i + 1];
      row.push(Markup.button.callback(isAm ? p2.am : p2.en, `repprob:${catIdx}:${i + 1}`));
    }
    rows.push(row);
  }
  return Markup.inlineKeyboard(rows);
}

// Category chosen in the current report is authoritative for model and problem lists.
function reportCatIdx(s) {
  const i = s?.data?.catIdx;
  return Number.isInteger(i) && i >= 0 && i < CATEGORIES.length ? i : 7;
}

function problemPrompt(isAm, catIdx) {
  const category = CATEGORIES[reportCatIdx({ data: { catIdx } })];
  return isAm
    ? `${category} — የብልሽቱን ዓይነት ይምረጡ (ወይም ይጻፉ)፦`
    : `${category} — select or describe the problem:`;
}

function locationKeyboard(isAm) {
  // Short labels (Ward 1, OPD 30) fit three per row; long office names take two.
  const rows = [];
  let row = [];
  let cap = 0;
  HOSPITAL_LOCATIONS.forEach(loc => {
    const label = isAm ? loc.am : loc.en;
    const itemCap = label.length <= 14 ? 3 : 2;
    if (row.length && itemCap !== cap) { rows.push(row); row = []; }
    cap = itemCap;
    row.push(Markup.button.callback(label, `reploc:${loc.key}`));
    if (row.length === cap) { rows.push(row); row = []; }
  });
  if (row.length) rows.push(row);
  return Markup.inlineKeyboard(rows);
}

function priorityKeyboard(isAm) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(isAm ? '🟢 ዝቅተኛ / Low' : '🟢 Low', 'priority:low'),
     Markup.button.callback(isAm ? '🟡 መካከለኛ / Med' : '🟡 Medium', 'priority:medium')],
    [Markup.button.callback(isAm ? '🟠 ከፍተኛ / High' : '🟠 High', 'priority:high'),
     Markup.button.callback(isAm ? '🔴 አስቸኳይ / Crit' : '🔴 Critical', 'priority:critical')]
  ]);
}

function photoKeyboard(isAm) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(isAm ? '⏭️ ፎቶ ዝለል / Skip Photo' : '⏭️ Skip Photo', 'repphoto:skip')]
  ]);
}
const PRIORITIES = ['low','medium','high','critical'];
const STATUS_LABEL = { pending:'Pending', assigned:'Assigned', accepted:'Accepted', in_progress:'In progress', waiting_parts:'Waiting for parts', completed:'Completed', unresolved:'Unresolved', cancelled:'Cancelled' };
const getSession = id => sessions.get(id) || {};
const setSession = (id, value) => { sessions.set(id, value); persistSession(id, value); };
const clearSession = id => { sessions.delete(id); query('DELETE FROM bot_sessions WHERE telegram_id=?', [id]).catch(() => {}); };
async function persistSession(id, value) {
  try {
    const sql = isPg
      ? 'INSERT INTO bot_sessions(telegram_id,data,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT (telegram_id) DO UPDATE SET data=EXCLUDED.data,updated_at=CURRENT_TIMESTAMP'
      : 'INSERT INTO bot_sessions(telegram_id,data,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE data=VALUES(data),updated_at=CURRENT_TIMESTAMP';
    await query(sql, [id, JSON.stringify(value)]);
  } catch (e) { console.warn('Session save failed:', e.message); }
}
// Restore an in-progress conversation after a restart, so Submit never dead-ends.
bot.use(async (ctx, next) => {
  const id = ctx.from && ctx.from.id;
  if (id && !sessions.has(id)) {
    try {
      const row = await one('SELECT data,updated_at FROM bot_sessions WHERE telegram_id=?', [id]);
      if (row && (Date.now() - new Date(row.updated_at).getTime()) < 12 * 60 * 60 * 1000) {
        sessions.set(id, JSON.parse(row.data));
      }
    } catch (e) { console.warn('Session restore failed:', e.message); }
  }
  return next();
});
const userByTelegram = id => one('SELECT * FROM users WHERE telegram_id=?', [id]);
const isAdmin = u => u && u.role === 'admin';
const isTech = u => u && u.role === 'technician';
const isStore = u => u && u.role === 'storekeeper';
const langOf = u => u?.language || 'en';
const msg = (u, key) => t(langOf(u), key);
const safe = v => String(v || '-').replace(/[<>]/g, '');

function mainKeyboard(u) {
  const rows = [
    [Markup.button.callback(msg(u,'menuReport'), 'main:report')],
    [Markup.button.callback(msg(u,'menuMine'), 'main:mine'), Markup.button.callback(msg(u,'menuTrack'), 'main:track')],
    [Markup.button.callback(msg(u,'menuLanguage'), 'main:lang')]
  ];
  if (isTech(u)) rows.push([Markup.button.callback('🧰 Technician jobs / የቴክኒሻን ሥራዎች','main:tech')]);
  if (isAdmin(u)) rows.push([Markup.button.callback('⚙️ Admin / አስተዳደር','main:admin')]);
  if (isStore(u) || isAdmin(u)) rows.push([Markup.button.callback('📦 Storekeeper / ንብረት','main:store')]);
  return Markup.inlineKeyboard(rows);
}
function languageKeyboard() { return Markup.inlineKeyboard([[Markup.button.callback('🇬🇧 English','startlang:en'),Markup.button.callback('🇪🇹 አማርኛ','startlang:am')]]); }
function roleKeyboard() { return languageKeyboard(); }
function registrationLanguageKeyboard() { return languageKeyboard(); }
async function sendHome(ctx, user) { await ctx.reply(msg(user,'welcome'), mainKeyboard(user)); }
async function audit(user, action, type, id, details) { try { await log(user?.id, action, type, id, details); } catch(e) { console.error('audit:',e.message); } }

async function ensureAdminUsers() {
  const ids = (process.env.ADMIN_TELEGRAM_IDS || '').split(',').map(s=>s.trim()).filter(Boolean);
  for (const id of ids) {
    const existing = await one('SELECT id FROM users WHERE telegram_id=?',[id]);
    if (existing) await query("UPDATE users SET role='admin',is_active=TRUE WHERE telegram_id=?",[id]);
    else await query("INSERT INTO users(telegram_id,full_name,role,is_active,language) VALUES(?,?,'admin',TRUE,'en')",[id,`Administrator ${id}`]);
  }
}
async function registerUser(ctx, data) {
  const tg = ctx.from.id;
  const existing = await one('SELECT * FROM users WHERE telegram_id=?',[tg]);
  if (existing) {
    await query('UPDATE users SET full_name=?,phone=?,department=? WHERE telegram_id=?',[data.full_name,data.phone,data.department,tg]);
    return one('SELECT * FROM users WHERE telegram_id=?',[tg]);
  }
  await query("INSERT INTO users(telegram_id,full_name,phone,department,role,language) VALUES(?,?,?,?, 'employee',?)",[tg,data.full_name,data.phone,data.department,data.language || 'en']);
  return one('SELECT * FROM users WHERE telegram_id=?',[tg]);
}

async function autoAssign(requestId, equipmentType) {
  const words = equipmentType.toLowerCase();
  let patterns = [];
  if (/printer|scanner/.test(words)) patterns = ['printer','electronics','computer'];
  else if (/desktop|computer|laptop/.test(words)) patterns = ['computer','hardware','electronics'];
  else if (/network/.test(words)) patterns = ['network','system'];
  else if (/cctv/.test(words)) patterns = ['cctv','electronics','network'];
  else if (/ups|electronics/.test(words)) patterns = ['electronics','hardware'];
  let candidates = [];
  if (patterns.length) {
    const clauses = patterns.map(()=> 'LOWER(specialization) LIKE ?').join(' OR ');
    candidates = await query(`SELECT u.id,u.telegram_id,u.full_name,u.specialization, COUNT(r.id) AS open_jobs FROM users u LEFT JOIN requests r ON r.assigned_technician_id=u.id AND r.status IN ('assigned','accepted','in_progress','waiting_parts') WHERE u.role='technician' AND u.is_active=TRUE AND (${clauses}) GROUP BY u.id ORDER BY open_jobs ASC,u.id ASC`, patterns.map(p=>`%${p}%`));
  }
  if (!candidates.length) return null;
  const chosen = candidates[0];
  await query("UPDATE requests SET assigned_technician_id=?,status='assigned',assigned_at=NOW() WHERE id=? AND status='pending'",[chosen.id,requestId]);
  await query("INSERT INTO maintenance_activities(request_id,actor_user_id,activity_type,notes) VALUES(?,?,'auto_assigned',?)",[requestId,chosen.id,`Automatically assigned by specialization and lowest open workload (${chosen.specialization || 'unspecified'}).`]);
  return chosen;
}
async function notifyAdmins(text) {
  const admins = await query("SELECT telegram_id FROM users WHERE role='admin' AND is_active=TRUE");
  for (const a of admins) { try { await bot.telegram.sendMessage(a.telegram_id,text); } catch(e) { console.warn('Admin notification failed:',e.message); } }
}
async function getRequestByNo(no) { return one('SELECT r.*,u.full_name AS employee_name,u.phone AS employee_phone,u.telegram_id AS employee_tg FROM requests r JOIN users u ON u.id=r.employee_id WHERE r.request_no=?',[no]); }
// Request numbers are derived from the highest number issued today, so deleting a request
// or two simultaneous submissions can never collide on the unique request_no column.
async function nextRequestNo() {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `AMH-IT-${stamp}-`;
  const row = await one('SELECT request_no FROM requests WHERE request_no LIKE ? ORDER BY request_no DESC LIMIT 1', [`${prefix}%`]);
  const last = row ? Number.parseInt(String(row.request_no).slice(prefix.length), 10) : 0;
  const next = (Number.isFinite(last) ? last : 0) + 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}
const isDuplicateKey = err => err && (err.code === '23505' || err.code === 'ER_DUP_ENTRY' || err.errno === 1062);

async function buildAndSendPdf(ctx, req, employee, tech = null) {
  const file = path.join(reportDir, `${req.request_no}.pdf`);
  await generateRequestPdf(req, employee, file, tech);
  await ctx.replyWithDocument({ source: file, filename: `${req.request_no}.pdf` });
}

bot.start(async ctx => {
  const tg = ctx.from.id;
  clearSession(tg);
  return ctx.reply(
    'Welcome to Amanuel Mental Specialized Hospital IT Support.\nእንኳን ወደ አማኑኤል ልዩ የአእምሮ ሆስፒታል የአይቲ ድጋፍ በደህና መጡ።\n\nPlease choose your language / እባክዎ ቋንቋ ይምረጡ፦',
    languageKeyboard()
  );
});
// ─── All shortcut commands ────────────────────────────────────────────────────

bot.command('help', async ctx => {
  const u = await userByTelegram(ctx.from.id);
  const isAm = langOf(u) === 'am';
  const lines = isAm ? [
    '📋 *የ@AMSH_ICT_BOT ትዕዛዞች*',
    '',
    '👤 *ለሁሉም ተጠቃሚዎች*',
    '/start — ዋና ምናሌ / ቋንቋ ምርጫ',
    '/menu — ዋና ምናሌ ክፈት',
    '/report — 🔧 የብልሽት ሪፖርት አስገባ',
    '/status — 📊 የጥያቄ ሁኔታ ፈትሽ',
    '/mytickets — 📋 ሁሉም ጥያቄዎቼ',
    '/lang — 🌐 ቋንቋ ቀይር',
    '/cancel — ❌ አሁኑ ተግባር ሰርዝ',
    '/myid — 🆔 Telegram ID ያሳይ',
    '',
    '🔧 *ለቴክኒሺያኖች*',
    '/myjobs — የተሰጡኝ ስራዎች',
    '/tech — ቴክኒሺያን ምናሌ',
    '',
    '👨‍💼 *ለአስተዳዳሪዎች (Admins)*',
    '/admin — አስተዳዳሪ ምናሌ',
    '/pending — ያልተሰጡ ጥያቄዎች',
    '/workload — የቴክኒሺያን ስራ ሁኔታ',
    '/addtech ID ስም ስፔሻላይዜሽን — ቴክ ጨምር',
    '/addstorekeeper ID ስም — ስቶር ጨምር',
    '/setrole ID role — ሚና ቀይር',
    '/deactivate ID — መለያ አቁም',
  ] : [
    '📋 *@AMSH_ICT_BOT Commands*',
    '',
    '👤 *For All Users*',
    '/start — Main menu / language selection',
    '/menu — Open main menu',
    '/report — 🔧 Submit an equipment failure report',
    '/status — 📊 Track a request by number',
    '/mytickets — 📋 View all my requests',
    '/lang — 🌐 Change language',
    '/cancel — ❌ Cancel current operation',
    '/myid — 🆔 Show your Telegram ID',
    '',
    '🔧 *For Technicians*',
    '/myjobs — View assigned jobs',
    '/tech — Open technician menu',
    '',
    '👨‍💼 *For Administrators*',
    '/admin — Open admin menu',
    '/pending — View unassigned requests',
    '/workload — Technician workload overview',
    '/addtech ID FullName Specialization — Register technician',
    '/addstorekeeper ID FullName — Register storekeeper',
    '/setrole ID role — Change user role',
    '/deactivate ID — Deactivate an account',
  ];
  return ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
});

bot.command('myid', ctx => ctx.reply(`🆔 Your Telegram ID: \`${ctx.from.id}\``, { parse_mode: 'Markdown' }));

bot.command('cancel', ctx => {
  clearSession(ctx.from.id);
  return ctx.reply('❌ Operation cancelled. / ተግባሩ ተሰርዟል።');
});

// /menu — open main menu
bot.command('menu', async ctx => {
  const u = await userByTelegram(ctx.from.id);
  if (!u) return ctx.reply('Please send /start first. / /start ይላኩ።');
  return ctx.reply(msg(u, 'welcome'), mainKeyboard(u));
});

// /report — start failure report
bot.command('report', async ctx => {
  const u = await userByTelegram(ctx.from.id);
  if (!u) return ctx.reply('Please send /start first. / /start ይላኩ።');
  clearSession(ctx.from.id);
  setSession(ctx.from.id, { flow: 'report', step: 'category', data: {} });
  const isAm = langOf(u) === 'am';
  return ctx.reply(isAm ? 'የመሣሪያውን ዓይነት ይምረጡ፦' : 'Select equipment category:', categoryKeyboard(isAm));
});

// /status or /track — track a request
bot.command('status', async ctx => {
  const u = await userByTelegram(ctx.from.id);
  if (!u) return ctx.reply('Please send /start first.');
  clearSession(ctx.from.id);
  setSession(ctx.from.id, { flow: 'track', step: 'number' });
  const isAm = langOf(u) === 'am';
  return ctx.reply(isAm ? '🔍 የጥያቄ ቁጥርዎን ያስገቡ (ለምሳሌ AMH-IT-20261122-0001)፦' : '🔍 Enter your request number (e.g. AMH-IT-20261122-0001):');
});
bot.command('track', async ctx => {
  const u = await userByTelegram(ctx.from.id);
  if (!u) return ctx.reply('Please send /start first.');
  clearSession(ctx.from.id);
  setSession(ctx.from.id, { flow: 'track', step: 'number' });
  const isAm = langOf(u) === 'am';
  return ctx.reply(isAm ? '🔍 የጥያቄ ቁጥርዎን ያስገቡ፦' : '🔍 Enter your request number:');
});

// /mytickets — list user's own requests
bot.command('mytickets', async ctx => {
  const u = await userByTelegram(ctx.from.id);
  if (!u) return ctx.reply('Please send /start first.');
  const rows = await query('SELECT request_no,equipment_name,status,priority,reported_at FROM requests WHERE employee_id=? ORDER BY id DESC LIMIT 10', [u.id]);
  if (!rows.length) return ctx.reply(msg(u, 'noRequests'));
  const isAm = langOf(u) === 'am';
  const header = isAm ? '📋 *የእኔ ጥያቄዎች*\n\n' : '📋 *My Requests*\n\n';
  const lines = rows.map(r => `${r.request_no}\n${r.equipment_name} | ${STATUS_LABEL[r.status]} | ${r.priority}`);
  return ctx.reply(header + lines.join('\n\n'), { parse_mode: 'Markdown' });
});

// /lang — change language
bot.command('lang', async ctx => {
  return ctx.reply('Choose language / ቋንቋ ይምረጡ፦', languageKeyboard());
});

// /tech — technician menu shortcut
bot.command('tech', async ctx => {
  const u = await userByTelegram(ctx.from.id);
  if (!isTech(u) && !isAdmin(u)) return ctx.reply(msg(u, 'techOnly'));
  const rows = await query(
    "SELECT request_no,equipment_name,equipment_type,status,priority FROM requests WHERE assigned_technician_id=? AND status IN ('assigned','accepted','in_progress','waiting_parts') ORDER BY CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END,reported_at ASC LIMIT 15",
    [u.id]
  );
  if (!rows.length) return ctx.reply(msg(u, 'noJobs'));
  for (const r of rows)
    await ctx.reply(`${r.request_no}\n${r.equipment_name} (${r.equipment_type})\n${STATUS_LABEL[r.status]} | ${r.priority}`,
      Markup.inlineKeyboard([[Markup.button.callback('Open / ክፈት', `techopen:${r.request_no}`)]]) );
});

// /myjobs — alias of /tech
bot.command('myjobs', async ctx => {
  const u = await userByTelegram(ctx.from.id);
  if (!isTech(u) && !isAdmin(u)) return ctx.reply(msg(u, 'techOnly'));
  const rows = await query(
    "SELECT request_no,equipment_name,equipment_type,status,priority FROM requests WHERE assigned_technician_id=? AND status IN ('assigned','accepted','in_progress','waiting_parts') ORDER BY reported_at ASC LIMIT 15",
    [u.id]
  );
  if (!rows.length) return ctx.reply(msg(u, 'noJobs'));
  for (const r of rows)
    await ctx.reply(`${r.request_no}\n${r.equipment_name} (${r.equipment_type})\n${STATUS_LABEL[r.status]} | ${r.priority}`,
      Markup.inlineKeyboard([[Markup.button.callback('Open / ክፈት', `techopen:${r.request_no}`)]]) );
});

// /admin — admin menu shortcut
bot.command('admin', async ctx => {
  const u = await userByTelegram(ctx.from.id);
  if (!isAdmin(u)) return ctx.reply(msg(u, 'adminOnly'));
  return ctx.reply(msg(u, 'adminMenu'), Markup.inlineKeyboard([
    [Markup.button.callback(msg(u, 'adminPending'), 'admin:pending')],
    [Markup.button.callback(msg(u, 'adminAll'), 'admin:recent')],
    [Markup.button.callback(msg(u, 'adminTechs'), 'admin:workload')]
  ]));
});

// /pending — unassigned requests (admin)
bot.command('pending', async ctx => {
  const u = await userByTelegram(ctx.from.id);
  if (!isAdmin(u)) return ctx.reply(msg(u, 'adminOnly'));
  const rows = await query("SELECT request_no,equipment_name,equipment_type,priority FROM requests WHERE status='pending' ORDER BY CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END,reported_at ASC LIMIT 20");
  if (!rows.length) return ctx.reply('✅ No pending requests.');
  for (const r of rows)
    await ctx.reply(`${r.request_no}\n${r.equipment_name} (${r.equipment_type})\nPriority: ${r.priority}`,
      Markup.inlineKeyboard([[Markup.button.callback('Auto-assign', 'admin:retry:' + r.request_no)]]));
});

// /workload — technician workload (admin)
bot.command('workload', async ctx => {
  const u = await userByTelegram(ctx.from.id);
  if (!isAdmin(u)) return ctx.reply(msg(u, 'adminOnly'));
  const rows = await query("SELECT u.full_name,u.specialization,COUNT(r.id) AS jobs FROM users u LEFT JOIN requests r ON r.assigned_technician_id=u.id AND r.status IN ('assigned','accepted','in_progress','waiting_parts') WHERE u.role='technician' AND u.is_active=TRUE GROUP BY u.id ORDER BY jobs");
  return ctx.reply(rows.length ? rows.map(r => `${r.full_name} (${r.specialization||'—'}): ${r.jobs} open`).join('\n') : 'No active technicians.');
});

// /store — storekeeper menu shortcut
bot.command('store', async ctx => {
  const u = await userByTelegram(ctx.from.id);
  if (!isStore(u) && !isAdmin(u)) return ctx.reply(msg(u, 'storeOnly'));
  return ctx.reply(msg(u, 'storeMenu'), Markup.inlineKeyboard([
    [Markup.button.callback(msg(u, 'storeAdd'), 'store:add')],
    [Markup.button.callback(msg(u, 'storeIssue'), 'store:issue')],
    [Markup.button.callback(msg(u, 'storeView'), 'store:view')]
  ]));
});

// Administrator provisioning commands. Use Telegram numeric IDs; never share the bot token.
bot.command('addtech', async ctx => {
  const admin = await userByTelegram(ctx.from.id); if (!isAdmin(admin)) return ctx.reply(msg(admin,'adminOnly'));
  const parts = ctx.message.text.split(' ').slice(1); const id=parts.shift(); const spec=parts.pop(); const name=parts.join(' ');
  if (!id || !name || !spec) return ctx.reply('Usage: /addtech TELEGRAM_ID Full Name Specialization\nExample: /addtech 123456789 Abebe Kebede Printer');
  const existingTech = await one('SELECT id FROM users WHERE telegram_id=?', [id]);
  if (existingTech) {
    await query("UPDATE users SET full_name=?, role='technician', specialization=?, is_active=TRUE WHERE telegram_id=?", [name, spec, id]);
  } else {
    await query("INSERT INTO users(telegram_id,full_name,role,specialization,is_active,language) VALUES(?,?,'technician',?,TRUE,'en')", [id, name, spec]);
  }
  await audit(admin,'add_technician','user',null,`${id}:${name}:${spec}`); return ctx.reply(`Technician registered: ${name} (${spec}).`);
});
bot.command('addstorekeeper', async ctx => {
  const admin = await userByTelegram(ctx.from.id); if (!isAdmin(admin)) return ctx.reply(msg(admin,'adminOnly'));
  const parts=ctx.message.text.split(' ').slice(1); const id=parts.shift(); const name=parts.join(' ');
  if (!id || !name) return ctx.reply('Usage: /addstorekeeper TELEGRAM_ID Full Name');
  const existingStore = await one('SELECT id FROM users WHERE telegram_id=?', [id]);
  if (existingStore) {
    await query("UPDATE users SET full_name=?, role='storekeeper', is_active=TRUE WHERE telegram_id=?", [name, id]);
  } else {
    await query("INSERT INTO users(telegram_id,full_name,role,is_active,language) VALUES(?,?,'storekeeper',TRUE,'en')", [id, name]);
  }
  await audit(admin,'add_storekeeper','user',null,`${id}:${name}`); return ctx.reply(`Storekeeper registered: ${name}.`);
});
bot.command('setrole', async ctx => {
  const admin=await userByTelegram(ctx.from.id); if(!isAdmin(admin)) return ctx.reply(msg(admin,'adminOnly'));
  const [,id,role]=ctx.message.text.split(/\s+/); const allowed=['employee','technician','admin','storekeeper','department_head'];
  if(!id || !allowed.includes(role)) return ctx.reply('Usage: /setrole TELEGRAM_ID employee|technician|admin|storekeeper|department_head');
  const result=await query('UPDATE users SET role=? WHERE telegram_id=?',[role,id]); await audit(admin,'set_role','user',null,`${id}:${role}`); return ctx.reply(result.affectedRows?'Role updated.':'User not found. Ask the user to send /start first.');
});
bot.command('deactivate', async ctx => {
  const admin=await userByTelegram(ctx.from.id); if(!isAdmin(admin)) return ctx.reply(msg(admin,'adminOnly'));
  const [,id]=ctx.message.text.split(/\s+/); if(!id) return ctx.reply('Usage: /deactivate TELEGRAM_ID');
  await query('UPDATE users SET is_active=FALSE WHERE telegram_id=?',[id]); return ctx.reply('Account deactivated if it existed.');
});

bot.action(/^startlang:(en|am)$/, async ctx => {
  const lang = ctx.match[1];
  const tg = ctx.from.id;
  await ctx.answerCbQuery();
  let user = await userByTelegram(tg);
  if (!user) {
    setSession(tg, { flow: 'register', step: 'name', data: { language: lang } });
    return ctx.reply(t(lang, 'registerName'));
  }
  if (!user.is_active) {
    return ctx.reply(lang === 'am' ? 'መለያዎ አልተንቀሳቀሰም። የአይቲ አስተዳዳሪን ያነጋግሩ።' : 'Your account is inactive. Contact IT administration.');
  }
  await query('UPDATE users SET language=? WHERE telegram_id=?', [lang, tg]);
  user.language = lang;
  return ctx.reply(t(lang, 'welcome'), mainKeyboard(user));
});
bot.action(/^reglang:(en|am)$/, async ctx => { const s=getSession(ctx.from.id); s.data = s.data || {}; s.data.language=ctx.match[1]; s.step='name'; setSession(ctx.from.id,s); await ctx.answerCbQuery(); return ctx.reply(t(ctx.match[1],'registerName')); });
bot.action(/^lang:(en|am)$/, async ctx => {
  const user=await userByTelegram(ctx.from.id); if(!user) return ctx.answerCbQuery();
  await query('UPDATE users SET language=? WHERE telegram_id=?',[ctx.match[1],ctx.from.id]); const fresh=await userByTelegram(ctx.from.id); await ctx.answerCbQuery('Language updated'); await ctx.reply(t(ctx.match[1],'welcome'),mainKeyboard(fresh));
});

// Helper: notify user that session expired and offer restart
async function sessionExpired(ctx) {
  await ctx.answerCbQuery('Session expired — please start a new report.');
  return ctx.reply(
    '⚠️ Your session has expired (bot restarted).\nፈሳሽ ቀናል — እባክዎ እንደገና ይጀምሩ።\n\nTap below to start a new report:',
    Markup.inlineKeyboard([[Markup.button.callback('🔧 New Report / አዲስ ሪፖርት', 'main:report')]])
  );
}

bot.action('main:lang', async ctx => { await ctx.answerCbQuery(); return ctx.reply('Choose language / ቋንቋ ይምረጡ፦',languageKeyboard()); });
bot.action('main:report', async ctx => {
  const u=await userByTelegram(ctx.from.id); await ctx.answerCbQuery(); if(!u) return ctx.reply('Send /start first.');
  setSession(ctx.from.id,{flow:'report',step:'category',data:{}});
  const isAm = langOf(u) === 'am';
  return ctx.reply(isAm ? 'የመሣሪያውን ዓይነት ይምረጡ፦' : 'Select equipment category:', categoryKeyboard(isAm));
});
bot.action(/^cat:(\d+)$/, async ctx => {
  const u=await userByTelegram(ctx.from.id); const s=getSession(ctx.from.id);
  if(s.flow!=='report' || s.step!=='category') return sessionExpired(ctx);
  const catIdx = Number(ctx.match[1]);
  if(!Number.isInteger(catIdx) || !CATEGORIES[catIdx]) return sessionExpired(ctx);
  s.data.equipment_type = CATEGORIES[catIdx] || 'Other electronics';
  s.data.catIdx = catIdx;
  s.step = 'model';
  setSession(ctx.from.id, s);
  await ctx.answerCbQuery();
  const isAm = langOf(u) === 'am';
  return ctx.reply(isAm ? 'የመሣሪያውን ሞዴል ይምረጡ (ወይም ይጻፉ)፦' : 'Select device / model (or type it):', modelKeyboard(catIdx, isAm));
});
bot.action(/^repmodel:(\d+):(\d+)$/, async ctx => {
  const u=await userByTelegram(ctx.from.id); const s=getSession(ctx.from.id);
  if(s.flow!=='report' || s.step!=='model') return sessionExpired(ctx);
  // The session category is authoritative so a stale button can never switch the equipment type.
  const sessionCat = reportCatIdx(s);
  const catIdx = Number(ctx.match[1]);
  const modelIdx = Number(ctx.match[2]);
  const isAm = langOf(u) === 'am';
  const models = DEVICE_MODELS[sessionCat] || DEVICE_MODELS[7];
  if (catIdx !== sessionCat || !models[modelIdx]) {
    await ctx.answerCbQuery();
    return ctx.reply(isAm ? 'የመሣሪያውን ሞዴል ይምረጡ (ወይም ይጻፉ)፦' : 'Select device / model (or type it):', modelKeyboard(sessionCat, isAm));
  }
  s.data.model = models[modelIdx];
  s.data.equipment_name = s.data.equipment_type;
  s.data.serial_number = '-';
  s.step = 'problem';
  setSession(ctx.from.id, s);
  await ctx.answerCbQuery();
  return ctx.reply(problemPrompt(isAm, sessionCat), problemKeyboard(isAm, sessionCat));
});
bot.action(/^repprob:(\d+):(\d+)$/, async ctx => {
  const u=await userByTelegram(ctx.from.id); const s=getSession(ctx.from.id);
  if(s.flow!=='report' || s.step!=='problem') return sessionExpired(ctx);
  const sessionCat = reportCatIdx(s);
  const catIdx = Number(ctx.match[1]);
  const probIdx = Number(ctx.match[2]);
  const isAm = langOf(u) === 'am';
  const list = PROBLEMS_BY_CATEGORY[sessionCat] || PROBLEMS_BY_CATEGORY[7];
  const prob = list[probIdx];
  // Ignore buttons reused from an older report/category instead of saving a problem that belongs to another device.
  if (catIdx !== sessionCat || !prob) {
    await ctx.answerCbQuery();
    return ctx.reply(problemPrompt(isAm, sessionCat), problemKeyboard(isAm, sessionCat));
  }
  s.data.problem = isAm ? prob.am : prob.en;
  s.step = 'location';
  setSession(ctx.from.id, s);
  await ctx.answerCbQuery();
  return ctx.reply(isAm ? 'የሚገኙበትን የሥራ ክፍል / ሕንፃ ይምረጡ (ወይም ይጻፉ)፦' : 'Select hospital department / location (or type):', locationKeyboard(isAm));
});
bot.action(/^reploc:(.+)$/, async ctx => {
  const u = await userByTelegram(ctx.from.id);
  const s = getSession(ctx.from.id);
  const locMatch = String(ctx.match[1]);
  const isAm = (s.data?.language || langOf(u)) === 'am';
  // Keys are stable; a numeric payload only exists on messages sent before this list changed.
  const loc = HOSPITAL_LOCATIONS.find(l => l.key === locMatch)
    || (/^\d+$/.test(locMatch) ? HOSPITAL_LOCATIONS[Number(locMatch)] : null);
  if (!loc) { await ctx.answerCbQuery(); return ctx.reply(isAm ? 'ይህ ቦታ ከዝርዝሩ ተወግዷል። እባክዎ ከዚህ ይምረጡ ወይም ይጻፉ፦' : 'That location is no longer listed. Please pick again or type it:', locationKeyboard(isAm)); }
  const locName = isAm ? loc.am : loc.en;
  if (s.flow === 'register' && s.step === 'department') {
    s.data.department = locName;
    const lang = s.data.language || 'en';
    const user = await registerUser(ctx, { ...s.data, department: locName, language: lang });
    clearSession(ctx.from.id);
    await ctx.answerCbQuery();
    await ctx.reply(t(lang, 'registered'));
    return sendHome(ctx, user);
  }
  if (s.flow !== 'report' || s.step !== 'location') return sessionExpired(ctx);
  s.data.room = locName;
  s.step = 'priority';
  setSession(ctx.from.id, s);
  await ctx.answerCbQuery();
  return ctx.reply(isAm ? 'የቅድሚያ ደረጃ ይምረጡ፦' : 'Select priority level:', priorityKeyboard(isAm));
});
bot.action('repphoto:skip', async ctx => {
  const u=await userByTelegram(ctx.from.id); const s=getSession(ctx.from.id);
  if(s.flow!=='report' || s.step!=='photo') return sessionExpired(ctx);
  s.step = 'confirm';
  s.data.photo = null;
  setSession(ctx.from.id, s);
  await ctx.answerCbQuery('Photo skipped');
  return showReportConfirm(ctx, u, s);
});
bot.action('main:mine', async ctx => {
  const u=await userByTelegram(ctx.from.id); await ctx.answerCbQuery(); if(!u) return;
  const rows=await query('SELECT request_no,equipment_name,status,priority,reported_at FROM requests WHERE employee_id=? ORDER BY id DESC LIMIT 10',[u.id]);
  if(!rows.length) return ctx.reply(msg(u,'noRequests'));
  let text=msg(u,'myJobs')+'\n\n'+rows.map(r=>`${r.request_no} | ${r.equipment_name}\n${STATUS_LABEL[r.status]} • ${r.priority}`).join('\n\n');
  return ctx.reply(text);
});
bot.action('main:track', async ctx => { const u=await userByTelegram(ctx.from.id); await ctx.answerCbQuery(); setSession(ctx.from.id,{flow:'track',step:'number'}); return ctx.reply(langOf(u)==='am'?'የጥያቄ ቁጥርዎን ያስገቡ (ለምሳሌ AMH-IT-20261119-0001)፦':'Enter your request number (e.g. AMH-IT-20261119-0001):'); });

bot.action('main:tech', async ctx => { const u=await userByTelegram(ctx.from.id); await ctx.answerCbQuery(); if(!isTech(u)) return ctx.reply(msg(u,'techOnly'));
  const rows=await query("SELECT request_no,equipment_name,equipment_type,status,priority FROM requests WHERE assigned_technician_id=? AND status IN ('assigned','accepted','in_progress','waiting_parts') ORDER BY CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END,reported_at ASC LIMIT 15",[u.id]);
  if(!rows.length) return ctx.reply(msg(u,'noJobs'));
  for(const r of rows) await ctx.reply(`${r.request_no}\n${r.equipment_name} (${r.equipment_type})\n${STATUS_LABEL[r.status]} | ${r.priority}`,Markup.inlineKeyboard([[Markup.button.callback('Open / ክፈት',`techopen:${r.request_no}`)]]));
});
bot.action(/^techopen:(.+)$/, async ctx => {
  const u=await userByTelegram(ctx.from.id); if(!isTech(u)) return ctx.answerCbQuery(); const r=await getRequestByNo(ctx.match[1]); if(!r || r.assigned_technician_id!==u.id) return ctx.answerCbQuery('Not assigned to you.');
  await ctx.answerCbQuery(); const employee=await one('SELECT full_name,phone FROM users WHERE id=?',[r.employee_id]);
  const txt=`${r.request_no}\nEquipment: ${r.equipment_name} (${r.equipment_type})\nModel: ${r.model||'-'}\nSerial: ${r.serial_number||'-'}\nDepartment: ${r.department}\nLocation: ${r.room_location}\nProblem: ${r.problem_description}\nEmployee: ${employee.full_name} (${employee.phone||'-'})\nStatus: ${STATUS_LABEL[r.status]}`;
  return ctx.reply(txt,Markup.inlineKeyboard([
    [Markup.button.callback('Accept / ተቀበል','techstatus:accepted:'+r.request_no),Markup.button.callback('Start work / ጀምር','techstatus:in_progress:'+r.request_no)],
    [Markup.button.callback('Diagnosis / ምርመራ','techdiag:'+r.request_no),Markup.button.callback('Complete / አጠናቅቅ','techfinish:'+r.request_no)],
    [Markup.button.callback('Waiting for parts / መለዋወጫ በመጠባበቅ','techstatus:waiting_parts:'+r.request_no)]
  ]));
});
bot.action(/^techstatus:(accepted|in_progress|waiting_parts):(.+)$/, async ctx => {
  const u=await userByTelegram(ctx.from.id); if(!isTech(u)) return ctx.answerCbQuery(); const r=await getRequestByNo(ctx.match[2]); if(!r||r.assigned_technician_id!==u.id) return ctx.answerCbQuery('Not assigned.');
  await query('UPDATE requests SET status=? WHERE id=?',[ctx.match[1],r.id]); await query('INSERT INTO maintenance_activities(request_id,actor_user_id,activity_type,notes) VALUES(?,?,?,?)',[r.id,u.id,'status_change',ctx.match[1]]); await audit(u,'status_change','request',r.id,ctx.match[1]);
  await ctx.answerCbQuery('Updated'); await ctx.reply(`${r.request_no}: ${STATUS_LABEL[ctx.match[1]]}`);
  try { await bot.telegram.sendMessage(r.employee_tg,`Your request ${r.request_no} is now: ${STATUS_LABEL[ctx.match[1]]}.`); } catch(e) {}
});
bot.action(/^techdiag:(.+)$/, async ctx => { const u=await userByTelegram(ctx.from.id); const r=await getRequestByNo(ctx.match[1]); if(!isTech(u)||!r||r.assigned_technician_id!==u.id) return ctx.answerCbQuery(); setSession(ctx.from.id,{flow:'techupdate',step:'diagnosis',requestNo:r.request_no,data:{}}); await ctx.answerCbQuery(); return ctx.reply(msg(u,'diagnosis')); });
bot.action(/^techfinish:(.+)$/, async ctx => { const u=await userByTelegram(ctx.from.id); const r=await getRequestByNo(ctx.match[1]); if(!isTech(u)||!r||r.assigned_technician_id!==u.id) return ctx.answerCbQuery(); setSession(ctx.from.id,{flow:'techupdate',step:'diagnosis',requestNo:r.request_no,data:{finishing:true}}); await ctx.answerCbQuery(); return ctx.reply(msg(u,'diagnosis')); });

bot.action('main:admin', async ctx => { const u=await userByTelegram(ctx.from.id); await ctx.answerCbQuery(); if(!isAdmin(u)) return ctx.reply(msg(u,'adminOnly'));
  return ctx.reply(msg(u,'adminMenu'),Markup.inlineKeyboard([
    [Markup.button.callback(msg(u,'adminPending'),'admin:pending')],
    [Markup.button.callback(msg(u,'adminAll'),'admin:recent')],
    [Markup.button.callback(msg(u,'adminTechs'),'admin:workload')]
  ]));
});
bot.action('admin:pending', async ctx => { const u=await userByTelegram(ctx.from.id); if(!isAdmin(u)) return ctx.answerCbQuery(); const rows=await query("SELECT request_no,equipment_name,equipment_type,priority FROM requests WHERE status='pending' ORDER BY CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END,reported_at ASC LIMIT 20"); await ctx.answerCbQuery(); if(!rows.length) return ctx.reply('No pending requests.'); for(const r of rows) await ctx.reply(`${r.request_no}\n${r.equipment_name} (${r.equipment_type})\nPriority: ${r.priority}`,Markup.inlineKeyboard([[Markup.button.callback('Retry auto-assign','admin:retry:'+r.request_no)]])); });
bot.action(/^admin:retry:(.+)$/, async ctx => { const u=await userByTelegram(ctx.from.id); if(!isAdmin(u)) return ctx.answerCbQuery(); const r=await getRequestByNo(ctx.match[1]); if(!r) return ctx.answerCbQuery('Not found'); const tech=await autoAssign(r.id,r.equipment_type); await ctx.answerCbQuery(tech?'Assigned':'No suitable technician'); if(tech) { await bot.telegram.sendMessage(tech.telegram_id,`${msg(u,'assigned')}\n${r.request_no} – ${r.equipment_name}`); await ctx.reply(`Assigned to ${tech.full_name}.`); } else await ctx.reply(msg(u,'noTech')); });
bot.action('admin:recent', async ctx => { const u=await userByTelegram(ctx.from.id); if(!isAdmin(u)) return ctx.answerCbQuery(); const rows=await query('SELECT request_no,equipment_name,status,priority FROM requests ORDER BY id DESC LIMIT 15'); await ctx.answerCbQuery(); return ctx.reply(rows.length?rows.map(r=>`${r.request_no} | ${r.equipment_name} | ${STATUS_LABEL[r.status]} | ${r.priority}`).join('\n'):'No requests yet.'); });
bot.action('admin:workload', async ctx => { const u=await userByTelegram(ctx.from.id); if(!isAdmin(u)) return ctx.answerCbQuery(); const rows=await query("SELECT u.full_name,u.specialization,COUNT(r.id) AS jobs FROM users u LEFT JOIN requests r ON r.assigned_technician_id=u.id AND r.status IN ('assigned','accepted','in_progress','waiting_parts') WHERE u.role='technician' AND u.is_active=TRUE GROUP BY u.id ORDER BY jobs"); await ctx.answerCbQuery(); return ctx.reply(rows.length?rows.map(r=>`${r.full_name} (${r.specialization||'Unspecified'}): ${r.jobs} open jobs`).join('\n'):'No active technicians.'); });

bot.action('main:store', async ctx => { const u=await userByTelegram(ctx.from.id); await ctx.answerCbQuery(); if(!isStore(u)&&!isAdmin(u)) return ctx.reply(msg(u,'storeOnly')); return ctx.reply(msg(u,'storeMenu'),Markup.inlineKeyboard([[Markup.button.callback(msg(u,'storeAdd'),'store:add')],[Markup.button.callback(msg(u,'storeIssue'),'store:issue')],[Markup.button.callback(msg(u,'storeView'),'store:view')]])); });
bot.action('store:add', async ctx => { const u=await userByTelegram(ctx.from.id); if(!isStore(u)&&!isAdmin(u)) return ctx.answerCbQuery(); setSession(ctx.from.id,{flow:'stockadd',step:'part',data:{}}); await ctx.answerCbQuery(); return ctx.reply(msg(u,'askPart')); });
bot.action('store:issue', async ctx => { const u=await userByTelegram(ctx.from.id); if(!isStore(u)&&!isAdmin(u)) return ctx.answerCbQuery(); setSession(ctx.from.id,{flow:'stockissue',step:'part',data:{}}); await ctx.answerCbQuery(); return ctx.reply(msg(u,'askPart')); });
bot.action('store:view', async ctx => { const u=await userByTelegram(ctx.from.id); if(!isStore(u)&&!isAdmin(u)) return ctx.answerCbQuery(); const rows=await query('SELECT item_name,quantity,unit FROM spare_parts ORDER BY item_name'); await ctx.answerCbQuery(); return ctx.reply(rows.length?rows.map(r=>`${r.item_name}: ${r.quantity} ${r.unit}`).join('\n'):'No spare parts recorded.'); });

bot.action('report:submit', async ctx => {
  await ctx.answerCbQuery();
  const u=await userByTelegram(ctx.from.id);
  if(!u) return sessionExpired(ctx);
  const s=getSession(ctx.from.id);
  if(s.flow!=='report' || s.step!=='confirm') return sessionExpired(ctx);
  const d=s.data||{};
  if(!d.equipment_type || !d.problem || !d.priority || !d.room) {
    clearSession(ctx.from.id);
    return ctx.reply('⚠️ Your report draft was incomplete, so nothing was saved.\nሪፖርቱ ያልተሟላ ስለሆነ አልተቀመጠም።\n\nSend /report to start again.');
  }
  const department = u.department || d.department || 'Unspecified';
  let requestNo=null, result=null, lastErr=null;
  try {
  for(let attempt=0; attempt<5 && !result; attempt++) {
    requestNo = await nextRequestNo();
    try {
      result = await query("INSERT INTO requests(request_no,employee_id,equipment_type,equipment_name,model,serial_number,department,room_location,problem_description,priority,attachment_file_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)",[requestNo,u.id,d.equipment_type,d.equipment_name,d.model==='-'?null:d.model,d.serial_number==='-'?null:d.serial_number,department,d.room,d.problem,d.priority,d.photo||null]);
    } catch(err) {
      if(!isDuplicateKey(err)) throw err;
      lastErr = err;
    }
  }
  if(!result) throw lastErr || new Error('Could not allocate a request number.');
  await query("INSERT INTO maintenance_activities(request_id,actor_user_id,activity_type,notes) VALUES(?,?,'submitted','Employee submitted failure report through Telegram.')",[result.insertId,u.id]); await audit(u,'submit_request','request',result.insertId,requestNo);
  } catch(err) {
    console.error('Report submit failed:', err);
    return ctx.reply(`⚠️ Your report could not be saved: ${err.message}\nሪፖርቱን ማስቀመጥ አልተቻለም።\n\nPlease send /report and try again, or contact IT administration.`);
  }
  let assigned=null; try { assigned=await autoAssign(result.insertId,d.equipment_type); } catch(err) { console.error('Auto-assign failed:', err.message); }
  const r=await getRequestByNo(requestNo);
  clearSession(ctx.from.id); await ctx.reply(`${msg(u,'submitted')} ${requestNo}${assigned?`\nAssigned technician: ${assigned.full_name}`:''}`);
  if(assigned) { try { await bot.telegram.sendMessage(assigned.telegram_id,`${msg(u,'assigned')}\n${requestNo}\n${d.equipment_name} (${d.equipment_type})\nPriority: ${d.priority}\nLocation: ${d.room}`); if(d.photo) await bot.telegram.sendPhoto(assigned.telegram_id,d.photo,{caption:`Evidence for ${requestNo}`}); } catch(e){} }
  else await notifyAdmins(`UNASSIGNED REQUEST: ${requestNo}\n${d.equipment_name} (${d.equipment_type})\nNo matching available technician. Please review.`);
  await notifyAdmins(`New IT request ${requestNo} submitted. ${assigned?`Auto-assigned to ${assigned.full_name}.`:'Awaiting technician assignment.'}`);
  const file=path.join(reportDir,`${requestNo}-request.pdf`); await generateRequestPdf(r,u,file,assigned); await ctx.replyWithDocument({source:file,filename:`${requestNo}.pdf`}); await ctx.reply('Main menu / ዋና ምናሌ',mainKeyboard(u));
});
bot.action('report:cancel', async ctx => { clearSession(ctx.from.id); await ctx.answerCbQuery(); return ctx.reply('Report cancelled. / ሪፖርቱ ተሰርዟል።'); });

bot.action(/^confirmrepair:(working|still_failing):(.+)$/, async ctx => {
  const u=await userByTelegram(ctx.from.id); const r=await getRequestByNo(ctx.match[2]); if(!r||r.employee_id!==u.id) return ctx.answerCbQuery('Not your request.');
  const val=ctx.match[1]; await query('UPDATE requests SET employee_confirmation=? WHERE id=?',[val,r.id]); await query("INSERT INTO maintenance_activities(request_id,actor_user_id,activity_type,notes) VALUES(?,?, 'employee_confirmation',?)",[r.id,u.id,val]); await ctx.answerCbQuery(); await ctx.reply(msg(u,'thanks')); await notifyAdmins(`Employee confirmation for ${r.request_no}: ${val}`);
});

bot.on('text', async ctx => {
  const tg=ctx.from.id; const u=await userByTelegram(tg); const s=getSession(tg); const text=ctx.message.text.trim();
  if(!s.flow) return;
  if(text.toLowerCase()==='/cancel') { clearSession(tg); return ctx.reply(msg(u,'cancelled')); }
  if(s.flow==='register') {
    if(s.step==='name') { s.data.full_name=text; s.step='phone'; setSession(tg,s); return ctx.reply(t(s.data.language,'registerPhone')); }
    if(s.step==='phone') {
      s.data.phone=text; s.step='department'; setSession(tg,s);
      const isAm = s.data.language === 'am';
      return ctx.reply(isAm ? 'የሚሰሩበትን ክፍል / ሕንፃ ይምረጡ፦' : 'Select your department / ward:', locationKeyboard(isAm));
    }
    if(s.step==='department') {
      // typed fallback
      s.data.department=text; const lang=s.data.language||'en'; const user=await registerUser(ctx,{...s.data,department:text,language:lang}); clearSession(tg); await ctx.reply(t(lang,'registered')); return sendHome(ctx,user);
    }
  }
  if(s.flow==='report') {
    // typed fallback for model step
    if(s.step==='model') {
      s.data.model=text; s.data.equipment_name=s.data.equipment_type; s.data.serial_number='-';
      s.step='problem'; setSession(tg,s);
      const isAm = langOf(u) === 'am';
      const catIdx = reportCatIdx(s);
      return ctx.reply(problemPrompt(isAm, catIdx), problemKeyboard(isAm, catIdx));
    }
    // typed fallback for problem step
    if(s.step==='problem') {
      s.data.problem=text; s.step='location'; setSession(tg,s);
      const isAm = langOf(u) === 'am';
      return ctx.reply(isAm ? 'የሚገኙበትን የሥራ ክፍል / ሕንፃ ይምረጡ (ወይም ይጻፉ)፦' : 'Select hospital department / location (or type):', locationKeyboard(isAm));
    }
    // typed fallback for location step
    if(s.step==='location') {
      s.data.room=text; s.step='priority'; setSession(tg,s);
      const isAm = langOf(u) === 'am';
      return ctx.reply(isAm ? 'የቅድሚያ ደረጃ ይምረጡ፦' : 'Select priority level:', priorityKeyboard(isAm));
    }
    if(s.step==='photo' && text.toUpperCase()==='SKIP') { s.step='confirm'; setSession(tg,s); return showReportConfirm(ctx,u,s); }
  }
  if(s.flow==='track'&&s.step==='number') { const r=await getRequestByNo(text.toUpperCase()); clearSession(tg); if(!r||r.employee_id!==u.id) return ctx.reply('Request not found, or it does not belong to your account.'); return ctx.reply(`${r.request_no}\n${r.equipment_name}\nStatus: ${STATUS_LABEL[r.status]}\nPriority: ${r.priority}\nReported: ${r.reported_at}`); }
  if(s.flow==='techupdate') {
    const r=await getRequestByNo(s.requestNo); if(!r||r.assigned_technician_id!==u.id) { clearSession(tg); return ctx.reply('Request not assigned to you.'); }
    if(s.step==='diagnosis') { s.data.diagnosis=text; s.step='repair'; setSession(tg,s); return ctx.reply(msg(u,'repair')); }
    if(s.step==='repair') { s.data.repair_actions=text; s.step='parts'; setSession(tg,s); return ctx.reply(msg(u,'parts')); }
    if(s.step==='parts') {
      s.data.parts_used=text==='NONE'?'None':text;
      if (s.data.finishing) {
        await query('UPDATE requests SET diagnosis=?,repair_actions=?,parts_used=?,status=?,completed_at=NOW() WHERE id=?',[s.data.diagnosis,s.data.repair_actions,s.data.parts_used,'completed',r.id]);
      } else {
        await query('UPDATE requests SET diagnosis=?,repair_actions=?,parts_used=?,status=? WHERE id=?',[s.data.diagnosis,s.data.repair_actions,s.data.parts_used,'in_progress',r.id]);
      }
      await query("INSERT INTO maintenance_activities(request_id,actor_user_id,activity_type,notes) VALUES(?,?,?,?)",[r.id,u.id,s.data.finishing?'completed':'work_update',`Diagnosis: ${s.data.diagnosis}; Repair: ${s.data.repair_actions}; Parts: ${s.data.parts_used}`]); await audit(u,'maintenance_update','request',r.id,s.data.finishing?'completed':'in_progress');
      clearSession(tg); await ctx.reply(s.data.finishing?msg(u,'done'):msg(u,'updated'));
      const fresh=await getRequestByNo(r.request_no); const employee=await one('SELECT * FROM users WHERE id=?',[r.employee_id]);
      if(s.data.finishing) {
        const pdf=path.join(reportDir,`${r.request_no}-completion.pdf`); await generateRequestPdf(fresh,employee,pdf,u); await ctx.replyWithDocument({source:pdf,filename:`${r.request_no}-completion.pdf`});
        try { await bot.telegram.sendMessage(r.employee_tg,`Maintenance completed for ${r.request_no}. Please confirm:`,Markup.inlineKeyboard([[Markup.button.callback('Working / እየሰራ ነው','confirmrepair:working:'+r.request_no)],[Markup.button.callback('Still failing / አልተስተካከለም','confirmrepair:still_failing:'+r.request_no)]])); } catch(e){}
      } else { try { await bot.telegram.sendMessage(r.employee_tg,`Your request ${r.request_no} has been updated. Status: In progress.`); } catch(e){} }
      await notifyAdmins(`Request ${r.request_no} updated by ${u.full_name}. Status: ${s.data.finishing?'Completed':'In progress'}.`); return;
    }
  }
  if(s.flow==='stockadd') {
    if(s.step==='part') { s.data.part=text; s.step='qty'; setSession(tg,s); return ctx.reply(msg(u,'askQty')); }
    if(s.step==='qty') { const n=Number(text); if(!Number.isFinite(n)||n<=0) return ctx.reply('Enter a valid positive quantity.'); s.data.qty=n; s.step='unit'; setSession(tg,s); return ctx.reply(msg(u,'askUnit')); }
    if(s.step==='unit') {
      s.data.unit=text;
      const pExisting = await one('SELECT id, quantity FROM spare_parts WHERE item_name=?', [s.data.part]);
      if (pExisting) {
        await query('UPDATE spare_parts SET quantity=quantity+?, unit=? WHERE id=?', [s.data.qty, s.data.unit, pExisting.id]);
      } else {
        await query('INSERT INTO spare_parts(item_name,quantity,unit) VALUES(?,?,?)', [s.data.part, s.data.qty, s.data.unit]);
      }
      const p=await one('SELECT id FROM spare_parts WHERE item_name=?',[s.data.part]);
      await query("INSERT INTO spare_transactions(part_id,actor_user_id,transaction_type,quantity,notes) VALUES(?,?,'received',?,?)",[p.id,u.id,s.data.qty,'Stock received / added']);
      await audit(u,'stock_received','spare_part',p.id,`${s.data.qty} ${s.data.unit}`);
      clearSession(tg);
      return ctx.reply(msg(u,'stockUpdated'));
    }
  }
  if(s.flow==='stockissue') {
    if(s.step==='part') { s.data.part=text; s.step='qty'; setSession(tg,s); return ctx.reply(msg(u,'askQty')); }
    if(s.step==='qty') { const n=Number(text); if(!Number.isFinite(n)||n<=0) return ctx.reply('Enter a valid positive quantity.'); s.data.qty=n; s.step='request'; setSession(tg,s); return ctx.reply(msg(u,'askReq')); }
    if(s.step==='request') {
      const p=await one('SELECT * FROM spare_parts WHERE item_name=?',[s.data.part]); if(!p||Number(p.quantity)<s.data.qty) return ctx.reply('Part not found or insufficient stock. Please check stock and try again.');
      let reqId=null; if(text!=='-') { const r=await getRequestByNo(text.toUpperCase()); if(!r) return ctx.reply('Request number not found. Enter a valid number or -'); reqId=r.id; }
      await query('UPDATE spare_parts SET quantity=quantity-? WHERE id=?',[s.data.qty,p.id]); await query("INSERT INTO spare_transactions(part_id,request_id,actor_user_id,transaction_type,quantity,notes) VALUES(?,?,?,'issued',?,?)",[p.id,reqId,u.id,s.data.qty,`Issued by ${u.full_name}`]); await audit(u,'stock_issued','spare_part',p.id,`${s.data.qty} ${p.unit}; request ${text}`); clearSession(tg); return ctx.reply(msg(u,'issued'));
    }
  }
});

async function showReportConfirm(ctx,u,s) {
  const d = s.data;
  const isAm = langOf(u) === 'am';
  const priEmoji = { low:'🟢', medium:'🟡', high:'🟠', critical:'🔴' };
  const priLabel = { low: isAm?'ዝቅተኛ':'Low', medium: isAm?'መካከለኛ':'Medium', high: isAm?'ከፍተኛ':'High', critical: isAm?'አስቸኳይ':'Critical' };
  const text = isAm
    ? `📋 *የጥያቄ ማጠቃለያ / Report Summary*\n\n🔧 መሣሪያ: ${d.equipment_type}\n📱 ሞዴል: ${d.model || '-'}\n❗ ችግር: ${d.problem}\n📍 ቦታ: ${d.room}\n${priEmoji[d.priority]||'⚪'} ቅድሚያ: ${priLabel[d.priority]||d.priority}\n📸 ፎቶ: ${d.photo?'✅ ተያይዟል':'❌ አልተያያዘም'}\n\nያረጋግጡና ያስገቡ ወይም ሰርዝ:`
    : `📋 *Report Summary*\n\n🔧 Equipment: ${d.equipment_type}\n📱 Model: ${d.model || '-'}\n❗ Problem: ${d.problem}\n📍 Location: ${d.room}\n${priEmoji[d.priority]||'⚪'} Priority: ${priLabel[d.priority]||d.priority}\n📸 Photo: ${d.photo?'✅ Attached':'❌ Not provided'}\n\nConfirm and submit or cancel:`;
  s.step = 'confirm';
  setSession(ctx.from.id, s);
  return ctx.reply(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback(isAm?'✅ አስገባ / Submit':'✅ Submit','report:submit'), Markup.button.callback(isAm?'❌ ሰርዝ / Cancel':'❌ Cancel','report:cancel')]]) });
}
bot.action(/^priority:(low|medium|high|critical)$/, async ctx => {
  const u=await userByTelegram(ctx.from.id); const s=getSession(ctx.from.id);
  if(s.flow!=='report'||s.step!=='priority') return sessionExpired(ctx);
  s.data.priority=ctx.match[1]; s.step='photo'; setSession(ctx.from.id,s); await ctx.answerCbQuery();
  const isAm = langOf(u) === 'am';
  return ctx.reply(isAm ? '📸 ፎቶ ማያያዝ ይፈልጋሉ? (ወይም ዝለሉ)' : '📸 Optionally attach a photo, or tap Skip:', photoKeyboard(isAm));
});
bot.on('photo', async ctx => {
  const s=getSession(ctx.from.id); const u=await userByTelegram(ctx.from.id); if(s.flow==='report'&&s.step==='photo') { const photo=ctx.message.photo[ctx.message.photo.length-1]; s.data.photo=photo.file_id; s.step='confirm'; setSession(ctx.from.id,s); return showReportConfirm(ctx,u,s); }
  if(s.flow==='techupdate') { const photo=ctx.message.photo[ctx.message.photo.length-1]; const r=await getRequestByNo(s.requestNo); if(r&&r.assigned_technician_id===u.id) { await query("INSERT INTO maintenance_activities(request_id,actor_user_id,activity_type,notes) VALUES(?,?,'photo_evidence',?)",[r.id,u.id,`Telegram photo file_id: ${photo.file_id}`]); return ctx.reply('Photo evidence recorded.'); } }
});
bot.catch((err,ctx)=>{ console.error('Bot error:',err); if(ctx) ctx.reply('An error occurred. Please try again or contact IT administration. / ስህተት ተፈጥሯል።').catch(()=>{}); });

(async()=>{
  try {
    await initTablesIfMissing();
    await pool.query('SELECT 1');
    await ensureAdminUsers();
    // Register command list with Telegram (shows in the / menu inside the app)
    await bot.telegram.setMyCommands([
      { command: 'start',      description: 'Main menu / ዋና ምናሌ' },
      { command: 'menu',       description: 'Open main menu / ምናሌ ክፈት' },
      { command: 'report',     description: '🔧 Report equipment failure / ብልሽት ሪፖርት' },
      { command: 'status',     description: '📊 Track a request / ሁኔታ ፈትሽ' },
      { command: 'mytickets',  description: '📋 My submitted requests / ጥያቄዎቼ' },
      { command: 'lang',       description: '🌐 Change language / ቋንቋ ቀይር' },
      { command: 'myjobs',     description: '🔧 Technician: my assigned jobs' },
      { command: 'tech',       description: '🔧 Technician menu' },
      { command: 'admin',      description: '👨‍💼 Admin menu' },
      { command: 'pending',    description: '📌 Admin: unassigned requests' },
      { command: 'workload',   description: '📈 Admin: technician workload' },
      { command: 'store',      description: '📦 Storekeeper menu' },
      { command: 'cancel',     description: '❌ Cancel current operation / ሰርዝ' },
      { command: 'myid',       description: '🆔 Show your Telegram ID' },
      { command: 'help',       description: '📋 Show all commands / ሁሉም ትዕዛዞች' },
    ]);

    // ── Launch mode ─────────────────────────────────────────────────────────
    // Use webhook on Railway / any cloud that sets WEBHOOK_DOMAIN or RAILWAY_PUBLIC_DOMAIN.
    // Fall back to long-polling for local dev (no env variable set).
    const webhookDomain =
      process.env.WEBHOOK_DOMAIN ||
      (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null);

    if (webhookDomain) {
      // Webhook mode: Telegram pushes updates — eliminates 409 conflicts entirely.
      const webhookPort = Number(process.env.PORT) || 8080;
      const webhookPath = `/tg-webhook-${process.env.BOT_TOKEN.slice(-10)}`;
      await bot.telegram.deleteWebhook({ drop_pending_updates: true });
      await bot.launch({
        webhook: {
          domain: webhookDomain,
          path: webhookPath,
          port: webhookPort,
        },
      });
      console.log(`Bot running in WEBHOOK mode → ${webhookDomain}${webhookPath} :${webhookPort}`);
    } else {
      // Long-polling mode (local development).
      await bot.telegram.deleteWebhook({ drop_pending_updates: true });
      await bot.launch({ dropPendingUpdates: true });
      console.log('Bot running in POLLING mode (local dev).');
    }
  }
  catch(err) { console.error('Startup failed:',err); process.exit(1); }
})();
process.once('SIGINT',()=>bot.stop('SIGINT')); process.once('SIGTERM',()=>bot.stop('SIGTERM'));
