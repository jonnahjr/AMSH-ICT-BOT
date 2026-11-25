require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Telegraf, Markup } = require('telegraf');
const { query, one, log, pool, initTablesIfMissing } = require('./db');
const { t } = require('./i18n');
const { generateRequestPdf } = require('./pdf');

const fallbackToken = Buffer.from('OTI2NzkxMDg5OTpBQUVwTW5WRUJycmo5LURpY0dYOHFtZUZDTXcwUHFHV2dCRQ==', 'base64').toString();
const botToken = (process.env.BOT_TOKEN && !process.env.BOT_TOKEN.includes('PASTE_')) ? process.env.BOT_TOKEN : fallbackToken;
const bot = new Telegraf(botToken);
const sessions = new Map();
const uploadDir = path.resolve(process.env.UPLOAD_DIR || './storage/uploads');
const reportDir = path.resolve(process.env.REPORT_DIR || './storage/reports');
fs.mkdirSync(uploadDir, { recursive: true }); fs.mkdirSync(reportDir, { recursive: true });
const CATEGORIES = ['Desktop computer', 'Laptop', 'Printer', 'Scanner', 'UPS', 'CCTV', 'Network equipment', 'Other electronics'];
const CATEGORIES_AM = ['🖥️ ዴስክቶፕ ኮምፒውተር', '💻 ላፕቶፕ', '🖨️ ፕሪንተር', '📠 ስካነር', '🔋 UPS / ኃይል', '📹 CCTV ካሜራ', '🌐 የኔትወርክ መሣሪያ', '🔌 ሌሎች ኤሌክትሮኒክስ'];
const CATEGORIES_EN = ['🖥️ Desktop computer', '💻 Laptop', '🖨️ Printer', '📠 Scanner', '🔋 UPS / Power', '📹 CCTV Camera', '🌐 Network equipment', '🔌 Other electronics'];

const DEVICE_MODELS = {
  0: ['HP ProDesk / EliteDesk', 'Dell OptiPlex', 'Lenovo ThinkCentre', 'Acer Veriton', 'Custom / Assembled PC', 'Other Desktop / ሌላ'],
  1: ['HP EliteBook / ProBook', 'Dell Latitude', 'Lenovo ThinkPad', 'Toshiba / Dynabook', 'Apple MacBook', 'Other Laptop / ሌላ'],
  2: ['HP LaserJet', 'Canon imageCLASS / LBP', 'Epson EcoTank', 'Brother Printer', 'Barcode / Label Printer', 'Other Printer / ሌላ'],
  3: ['HP ScanJet', 'Canon CanoScan / DR', 'Epson WorkForce', 'Fujitsu fi-Series', 'Other Scanner / ሌላ'],
  4: ['APC Smart-UPS / Back-UPS', 'Eaton UPS', 'Mercury UPS', 'Legrand / Kstar', 'Other UPS / ሌላ'],
  5: ['Hikvision Camera / NVR', 'Dahua Camera / DVR', 'Uniview (UNV)', 'CCTV Monitor / Power', 'Other CCTV / ሌላ'],
  6: ['Cisco Switch / Router', 'TP-Link Wi-Fi / AP', 'D-Link Switch', 'Wall Socket / Patch Cable', 'Other Network / ሌላ'],
  7: ['Projector / ፕሮጀክተር', 'Photocopier / ፎቶኮፒ', 'TV Screen / ማሳያ', 'Sound System / ድምጽ', 'Other Device / ሌላ']
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

const HOSPITAL_LOCATIONS = [
  { en: '🏥 OPD / Clinics', am: '🏥 የተመላላሽ (OPD)' },
  { en: '🛏️ Inpatient Ward', am: '🛏️ የተኝቶ ህክምና ክፍል' },
  { en: '💊 Pharmacy', am: '💊 ፋርማሲ' },
  { en: '🔬 Laboratory', am: '🔬 ላብራቶሪ' },
  { en: '📁 Card Office / Archive', am: '📁 ካርድ ክፍል' },
  { en: '💼 Admin / Finance / HR', am: '💼 አስተዳደር / ፋይናንስ' },
  { en: '🚨 Emergency', am: '🚨 ድንገተኛ ክፍል' },
  { en: '📍 Other Location', am: '📍 ሌላ የሥራ ቦታ' }
];

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

function locationKeyboard(isAm) {
  const rows = [];
  for (let i = 0; i < HOSPITAL_LOCATIONS.length; i += 2) {
    const l1 = HOSPITAL_LOCATIONS[i];
    const row = [Markup.button.callback(isAm ? l1.am : l1.en, `reploc:${i}`)];
    if (HOSPITAL_LOCATIONS[i + 1]) {
      const l2 = HOSPITAL_LOCATIONS[i + 1];
      row.push(Markup.button.callback(isAm ? l2.am : l2.en, `reploc:${i + 1}`));
    }
    rows.push(row);
  }
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
const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const STATUS_LABEL = { pending: 'Pending', assigned: 'Assigned', accepted: 'Accepted', in_progress: 'In progress', waiting_parts: 'Waiting for parts', completed: 'Completed', unresolved: 'Unresolved', cancelled: 'Cancelled' };
const getSession = id => sessions.get(id) || {};
const setSession = (id, value) => sessions.set(id, value);
const clearSession = id => sessions.delete(id);
const userByTelegram = id => one('SELECT * FROM users WHERE telegram_id=?', [id]);
const isAdmin = u => u && u.role === 'admin';
const isTech = u => u && u.role === 'technician';
const isStore = u => u && u.role === 'storekeeper';
const langOf = u => u?.language || 'en';
const msg = (u, key) => t(langOf(u), key);
const safe = v => String(v || '-').replace(/[<>]/g, '');

function mainKeyboard(u) {
  const isAm = langOf(u) === 'am';
  const rows = [
    [Markup.button.callback(msg(u, 'menuReport'), 'main:report')],
    [Markup.button.callback(msg(u, 'menuMine'), 'main:mine'), Markup.button.callback(msg(u, 'menuTrack'), 'main:track')],
    [Markup.button.callback(isAm ? '👤 መገለጫዬ / Profile' : '👤 My Profile', 'main:profile'), Markup.button.callback(msg(u, 'menuLanguage'), 'main:lang')]
  ];
  if (isTech(u)) rows.push([Markup.button.callback('🧰 Technician jobs / የቴክኒሻን ሥራዎች', 'main:tech')]);
  if (isAdmin(u)) rows.push([Markup.button.callback('⚙️ Admin / አስተዳደር', 'main:admin')]);
  if (isStore(u) || isAdmin(u)) rows.push([Markup.button.callback('📦 Storekeeper / ንብረት', 'main:store')]);
  return Markup.inlineKeyboard(rows);
}
function languageKeyboard() { return Markup.inlineKeyboard([[Markup.button.callback('🇬🇧 English', 'startlang:en'), Markup.button.callback('🇪🇹 አማርኛ', 'startlang:am')]]); }
function roleKeyboard() { return languageKeyboard(); }
function registrationLanguageKeyboard() { return languageKeyboard(); }
async function sendHome(ctx, user) { await ctx.reply(msg(user, 'welcome'), mainKeyboard(user)); }
async function audit(user, action, type, id, details) { try { await log(user?.id, action, type, id, details); } catch (e) { console.error('audit:', e.message); } }

async function ensureAdminUsers() {
  const ids = (process.env.ADMIN_TELEGRAM_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  for (const id of ids) {
    const existing = await one('SELECT id FROM users WHERE telegram_id=?', [id]);
    if (existing) await query("UPDATE users SET role='admin',is_active=TRUE WHERE telegram_id=?", [id]);
    else await query("INSERT INTO users(telegram_id,full_name,role,is_active,language) VALUES(?,?,'admin',TRUE,'en')", [id, `Administrator ${id}`]);
  }
}
async function registerUser(ctx, data) {
  const tg = ctx.from.id;
  const username = ctx.from?.username ? `@${ctx.from.username}` : null;
  const existing = await one('SELECT * FROM users WHERE telegram_id=?', [tg]);
  if (existing) {
    await query(
      'UPDATE users SET full_name=?,phone=?,email=?,department=?,telegram_username=? WHERE telegram_id=?',
      [data.full_name, data.phone, data.email ?? existing.email ?? null, data.department, username || existing.telegram_username || null, tg]
    );
    return one('SELECT * FROM users WHERE telegram_id=?', [tg]);
  }
  await query(
    "INSERT INTO users(telegram_id,telegram_username,full_name,phone,email,department,role,language) VALUES(?,?,?,?,?,?, 'employee',?)",
    [tg, username, data.full_name, data.phone, data.email || null, data.department, data.language || 'en']
  );
  return one('SELECT * FROM users WHERE telegram_id=?', [tg]);
}

async function syncTelegramUsername(ctx, user) {
  if (!user || !ctx.from) return user;
  const current = ctx.from.username ? `@${ctx.from.username}` : null;
  if (current && current !== user.telegram_username) {
    await query('UPDATE users SET telegram_username=? WHERE id=?', [current, user.id]);
    user.telegram_username = current;
  }
  return user;
}

async function autoAssign(requestId, equipmentType) {
  const words = equipmentType.toLowerCase();
  let patterns = [];
  if (/printer|scanner/.test(words)) patterns = ['printer', 'electronics', 'computer'];
  else if (/desktop|computer|laptop/.test(words)) patterns = ['computer', 'hardware', 'electronics'];
  else if (/network/.test(words)) patterns = ['network', 'system'];
  else if (/cctv/.test(words)) patterns = ['cctv', 'electronics', 'network'];
  else if (/ups|electronics/.test(words)) patterns = ['electronics', 'hardware'];
  let candidates = [];
  if (patterns.length) {
    const clauses = patterns.map(() => 'LOWER(specialization) LIKE ?').join(' OR ');
    candidates = await query(`SELECT u.id,u.telegram_id,u.full_name,u.specialization, COUNT(r.id) AS open_jobs FROM users u LEFT JOIN requests r ON r.assigned_technician_id=u.id AND r.status IN ('assigned','accepted','in_progress','waiting_parts') WHERE u.role='technician' AND u.is_active=TRUE AND (${clauses}) GROUP BY u.id ORDER BY open_jobs ASC,u.id ASC`, patterns.map(p => `%${p}%`));
  }
  if (!candidates.length) return null;
  const chosen = candidates[0];
  await query("UPDATE requests SET assigned_technician_id=?,status='assigned',assigned_at=NOW() WHERE id=? AND status='pending'", [chosen.id, requestId]);
  await query("INSERT INTO maintenance_activities(request_id,actor_user_id,activity_type,notes) VALUES(?,?,'auto_assigned',?)", [requestId, chosen.id, `Automatically assigned by specialization and lowest open workload (${chosen.specialization || 'unspecified'}).`]);
  return chosen;
}

async function notifyAdmins(text, photoFileId = null, extra = {}) {
  const admins = await query("SELECT telegram_id FROM users WHERE role='admin' AND is_active=TRUE");
  for (const a of admins) {
    try {
      if (photoFileId) {
        if (text.length <= 1000) {
          await bot.telegram.sendPhoto(a.telegram_id, photoFileId, { caption: text, ...extra });
        } else {
          await bot.telegram.sendPhoto(a.telegram_id, photoFileId);
          await bot.telegram.sendMessage(a.telegram_id, text, extra);
        }
      } else {
        await bot.telegram.sendMessage(a.telegram_id, text, extra);
      }
    } catch (e) { console.warn('Admin notification failed:', e.message); }
  }
}

async function getRequestByNo(no) {
  return one(
    `SELECT r.*,
            u.full_name AS employee_name,
            u.phone AS employee_phone,
            u.email AS employee_email,
            u.telegram_id AS employee_tg,
            u.telegram_username AS employee_username,
            u.department AS employee_department,
            t.full_name AS technician_name,
            t.phone AS technician_phone
     FROM requests r
     JOIN users u ON u.id=r.employee_id
     LEFT JOIN users t ON t.id=r.assigned_technician_id
     WHERE r.request_no=?`,
    [no]
  );
}

function formatAdminRequestCard(r, header = '📋 IT Support Request') {
  const priEmoji = { low: '🟢', medium: '🟡', high: '🟠', critical: '🔴' };
  const techLine = r.technician_name
    ? `👨‍🔧 Technician: ${r.technician_name}${r.technician_phone ? ` (${r.technician_phone})` : ''}`
    : '⚠️ Technician: Unassigned';
  return [
    `${header}`,
    `━━━━━━━━━━━━━━━━━━`,
    `🆔 Request: ${r.request_no}`,
    `📊 Status: ${STATUS_LABEL[r.status] || r.status}`,
    `${priEmoji[r.priority] || '⚪'} Priority: ${String(r.priority || '').toUpperCase()}`,
    ``,
    `🔧 Equipment: ${r.equipment_name || r.equipment_type} (${r.equipment_type})`,
    `📱 Model: ${r.model || '-'}`,
    `❗ Problem: ${r.problem_description}`,
    `📍 Location: ${r.room_location || r.department || '-'}`,
    techLine,
    ``,
    `👤 Applicant / Reporter Details:`,
    `• Name: ${r.employee_name || '-'}`,
    `• Username: ${r.employee_username || 'Not set'}`,
    `• Phone: ${r.employee_phone || '-'}`,
    `• Email: ${r.employee_email || 'Not provided'}`,
    `• Telegram ID: ${r.employee_tg || '-'}`,
    `• Department: ${r.employee_department || r.department || '-'}`,
    `📸 Photo: ${r.attachment_file_id ? 'Attached ✅' : 'None'}`
  ].join('\n');
}

function adminRequestActions(requestNo, hasPhoto = false) {
  const rows = [
    [
      Markup.button.callback('👤 Assign Tech', `admin:picktech:${requestNo}`),
      Markup.button.callback('🔄 Status', `admin:pickstatus:${requestNo}`)
    ],
    [
      Markup.button.callback('📄 Send PDF', `admin:pdf:${requestNo}`)
    ]
  ];
  if (hasPhoto) rows[1].push(Markup.button.callback('📸 View Photo', `admin:photo:${requestNo}`));
  return Markup.inlineKeyboard(rows);
}

function formatUserCard(u) {
  return [
    `👤 User Profile (#${u.id})`,
    `━━━━━━━━━━━━━━━━━━`,
    `• Full Name: ${u.full_name}`,
    `• Username: ${u.telegram_username || 'Not set'}`,
    `• Phone: ${u.phone || '-'}`,
    `• Email: ${u.email || 'Not provided'}`,
    `• Telegram ID: ${u.telegram_id}`,
    `• Department: ${u.department || '-'}`,
    `• Role: ${u.role}`,
    `• Specialization: ${u.specialization || '-'}`,
    `• Status: ${u.is_active ? '🟢 Active' : '🔴 Inactive'}`,
    `• Language: ${u.language === 'am' ? 'Amharic (አማርኛ)' : 'English'}`
  ].join('\n');
}
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

// Helper: shared track/status prompt with clickable recent requests + typed fallback
async function startTrackFlow(ctx, u) {
  clearSession(ctx.from.id);
  setSession(ctx.from.id, { flow: 'track', step: 'number' });
  const isAm = langOf(u) === 'am';
  const recent = await query(
    'SELECT request_no, equipment_name, status FROM requests WHERE employee_id=? ORDER BY id DESC LIMIT 6',
    [u.id]
  );
  if (recent.length) {
    const buttons = recent.map(r => [
      Markup.button.callback(`${r.request_no} (${r.equipment_name})`, `trackpick:${r.request_no}`)
    ]);
    return ctx.reply(
      isAm
        ? '🔍 ከዚህ በታች ያሉትን ጥያቄዎች ይምረጡ (ወይም የጥያቄ ቁጥር ይጻፉ)፦'
        : '🔍 Tap a request below to check its status (or type a request number):',
      Markup.inlineKeyboard(buttons)
    );
  }
  return ctx.reply(
    isAm
      ? '🔍 የጥያቄ ቁጥርዎን ያስገቡ (ለምሳሌ AMH-IT-20261125-0001)፦'
      : '🔍 Enter your request number (e.g. AMH-IT-20261125-0001):'
  );
}

async function formatTrackReply(r, isAm) {
  let techName = null;
  if (r.assigned_technician_id) {
    const tech = await one('SELECT full_name FROM users WHERE id=?', [r.assigned_technician_id]);
    techName = tech?.full_name || null;
  }
  const statusText = STATUS_LABEL[r.status] || r.status;
  if (isAm) {
    return (
      `📋 ${r.request_no}\n` +
      `🔧 መሣሪያ: ${r.equipment_name}${r.model ? ` (${r.model})` : ''}\n` +
      `📍 ቦታ: ${r.room_location || '-'}\n` +
      `📊 ሁኔታ: ${statusText}\n` +
      `⚡ ቅድሚያ: ${r.priority}\n` +
      (techName ? `👨‍🔧 ቴክኒሺያን: ${techName}\n` : '') +
      `🕒 የተላከበት: ${r.reported_at}`
    );
  }
  return (
    `📋 ${r.request_no}\n` +
    `🔧 Equipment: ${r.equipment_name}${r.model ? ` (${r.model})` : ''}\n` +
    `📍 Location: ${r.room_location || '-'}\n` +
    `📊 Status: ${statusText}\n` +
    `⚡ Priority: ${r.priority}\n` +
    (techName ? `👨‍🔧 Technician: ${techName}\n` : '') +
    `🕒 Reported: ${r.reported_at}`
  );
}

// /status or /track — track a request
bot.command('status', async ctx => {
  const u = await userByTelegram(ctx.from.id);
  if (!u) return ctx.reply('Please send /start first.');
  return startTrackFlow(ctx, u);
});
bot.command('track', async ctx => {
  const u = await userByTelegram(ctx.from.id);
  if (!u) return ctx.reply('Please send /start first.');
  return startTrackFlow(ctx, u);
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
      Markup.inlineKeyboard([[Markup.button.callback('Open / ክፈት', `techopen:${r.request_no}`)]]));
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
      Markup.inlineKeyboard([[Markup.button.callback('Open / ክፈት', `techopen:${r.request_no}`)]]));
});

function sendAdminMenu(ctx, u) {
  return ctx.reply(
    '⚙️ *Administrator Control Panel*\nFull access to requests, applicant profiles, search, broadcast, CSV export, photos & PDFs:',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback(`📌 ${msg(u, 'adminPending')}`, 'admin:pending'), Markup.button.callback('📋 Recent Requests', 'admin:recent')],
        [Markup.button.callback('🔎 Search Request', 'admin:search'), Markup.button.callback('👥 Users & Applicants', 'admin:users')],
        [Markup.button.callback('📊 System Stats', 'admin:stats'), Markup.button.callback(`👷 ${msg(u, 'adminTechs')}`, 'admin:workload')],
        [Markup.button.callback('📢 Broadcast Notice', 'admin:broadcast'), Markup.button.callback('📥 Export CSV', 'admin:export')],
        [Markup.button.callback('📦 Store / Parts', 'main:store')]
      ])
    }
  );
}

// /admin — admin menu shortcut
bot.command('admin', async ctx => {
  const u = await userByTelegram(ctx.from.id);
  if (!isAdmin(u)) return ctx.reply(msg(u, 'adminOnly'));
  return sendAdminMenu(ctx, u);
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
  return ctx.reply(rows.length ? rows.map(r => `${r.full_name} (${r.specialization || '—'}): ${r.jobs} open`).join('\n') : 'No active technicians.');
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
  const admin = await userByTelegram(ctx.from.id); if (!isAdmin(admin)) return ctx.reply(msg(admin, 'adminOnly'));
  const parts = ctx.message.text.split(' ').slice(1); const id = parts.shift(); const spec = parts.pop(); const name = parts.join(' ');
  if (!id || !name || !spec) return ctx.reply('Usage: /addtech TELEGRAM_ID Full Name Specialization\nExample: /addtech 123456789 Abebe Kebede Printer');
  const existingTech = await one('SELECT id FROM users WHERE telegram_id=?', [id]);
  if (existingTech) {
    await query("UPDATE users SET full_name=?, role='technician', specialization=?, is_active=TRUE WHERE telegram_id=?", [name, spec, id]);
  } else {
    await query("INSERT INTO users(telegram_id,full_name,role,specialization,is_active,language) VALUES(?,?,'technician',?,TRUE,'en')", [id, name, spec]);
  }
  await audit(admin, 'add_technician', 'user', null, `${id}:${name}:${spec}`); return ctx.reply(`Technician registered: ${name} (${spec}).`);
});
bot.command('addstorekeeper', async ctx => {
  const admin = await userByTelegram(ctx.from.id); if (!isAdmin(admin)) return ctx.reply(msg(admin, 'adminOnly'));
  const parts = ctx.message.text.split(' ').slice(1); const id = parts.shift(); const name = parts.join(' ');
  if (!id || !name) return ctx.reply('Usage: /addstorekeeper TELEGRAM_ID Full Name');
  const existingStore = await one('SELECT id FROM users WHERE telegram_id=?', [id]);
  if (existingStore) {
    await query("UPDATE users SET full_name=?, role='storekeeper', is_active=TRUE WHERE telegram_id=?", [name, id]);
  } else {
    await query("INSERT INTO users(telegram_id,full_name,role,is_active,language) VALUES(?,?,'storekeeper',TRUE,'en')", [id, name]);
  }
  await audit(admin, 'add_storekeeper', 'user', null, `${id}:${name}`); return ctx.reply(`Storekeeper registered: ${name}.`);
});
bot.command('setrole', async ctx => {
  const admin = await userByTelegram(ctx.from.id); if (!isAdmin(admin)) return ctx.reply(msg(admin, 'adminOnly'));
  const [, id, role] = ctx.message.text.split(/\s+/); const allowed = ['employee', 'technician', 'admin', 'storekeeper', 'department_head'];
  if (!id || !allowed.includes(role)) return ctx.reply('Usage: /setrole TELEGRAM_ID employee|technician|admin|storekeeper|department_head');
  const result = await query('UPDATE users SET role=? WHERE telegram_id=?', [role, id]); await audit(admin, 'set_role', 'user', null, `${id}:${role}`); return ctx.reply(result.affectedRows ? 'Role updated.' : 'User not found. Ask the user to send /start first.');
});
bot.command('deactivate', async ctx => {
  const admin = await userByTelegram(ctx.from.id); if (!isAdmin(admin)) return ctx.reply(msg(admin, 'adminOnly'));
  const [, id] = ctx.message.text.split(/\s+/); if (!id) return ctx.reply('Usage: /deactivate TELEGRAM_ID');
  await query('UPDATE users SET is_active=FALSE WHERE telegram_id=?', [id]); return ctx.reply('Account deactivated if it existed.');
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
bot.action(/^reglang:(en|am)$/, async ctx => { const s = getSession(ctx.from.id); s.data = s.data || {}; s.data.language = ctx.match[1]; s.step = 'name'; setSession(ctx.from.id, s); await ctx.answerCbQuery(); return ctx.reply(t(ctx.match[1], 'registerName')); });
bot.action(/^lang:(en|am)$/, async ctx => {
  const user = await userByTelegram(ctx.from.id); if (!user) return ctx.answerCbQuery();
  await query('UPDATE users SET language=? WHERE telegram_id=?', [ctx.match[1], ctx.from.id]); const fresh = await userByTelegram(ctx.from.id); await ctx.answerCbQuery('Language updated'); await ctx.reply(t(ctx.match[1], 'welcome'), mainKeyboard(fresh));
});

// Helper: notify user that session expired and offer restart
async function sessionExpired(ctx) {
  await ctx.answerCbQuery('Session expired — please start a new report.');
  return ctx.reply(
    '⚠️ Your session has expired (bot restarted).\nፈሳሽ ቀናል — እባክዎ እንደገና ይጀምሩ።\n\nTap below to start a new report:',
    Markup.inlineKeyboard([[Markup.button.callback('🔧 New Report / አዲስ ሪፖርት', 'main:report')]])
  );
}

bot.action('main:lang', async ctx => { await ctx.answerCbQuery(); return ctx.reply('Choose language / ቋንቋ ይምረጡ፦', languageKeyboard()); });
bot.action('main:report', async ctx => {
  const u = await userByTelegram(ctx.from.id); await ctx.answerCbQuery(); if (!u) return ctx.reply('Send /start first.');
  setSession(ctx.from.id, { flow: 'report', step: 'category', data: {} });
  const isAm = langOf(u) === 'am';
  return ctx.reply(isAm ? 'የመሣሪያውን ዓይነት ይምረጡ፦' : 'Select equipment category:', categoryKeyboard(isAm));
});
bot.action(/^cat:(\d+)$/, async ctx => {
  const u = await userByTelegram(ctx.from.id); const s = getSession(ctx.from.id);
  if (s.flow !== 'report') return sessionExpired(ctx);
  const catIdx = Number(ctx.match[1]);
  s.data.equipment_type = CATEGORIES[catIdx] || 'Other electronics';
  s.data.catIdx = catIdx;
  s.step = 'model';
  setSession(ctx.from.id, s);
  await ctx.answerCbQuery();
  const isAm = langOf(u) === 'am';
  return ctx.reply(isAm ? 'የመሣሪያውን ሞዴል ይምረጡ (ወይም ይጻፉ)፦' : 'Select device / model (or type it):', modelKeyboard(catIdx, isAm));
});
bot.action(/^repmodel:(\d+):(\d+)$/, async ctx => {
  const u = await userByTelegram(ctx.from.id); const s = getSession(ctx.from.id);
  if (s.flow !== 'report' || s.step !== 'model') return sessionExpired(ctx);
  const catIdx = Number(ctx.match[1]);
  const modelIdx = Number(ctx.match[2]);
  const models = DEVICE_MODELS[catIdx] || DEVICE_MODELS[7];
  s.data.model = models[modelIdx] || 'Standard';
  s.data.equipment_name = s.data.equipment_type;
  s.data.serial_number = '-';
  s.step = 'problem';
  setSession(ctx.from.id, s);
  await ctx.answerCbQuery();
  const isAm = langOf(u) === 'am';
  return ctx.reply(isAm ? 'የብልሽቱን ዓይነት ይምረጡ (ወይም ይጻፉ)፦' : 'Select or describe the problem:', problemKeyboard(isAm, catIdx));
});
bot.action(/^repprob:(\d+):(\d+)$/, async ctx => {
  const u = await userByTelegram(ctx.from.id); const s = getSession(ctx.from.id);
  if (s.flow !== 'report' || s.step !== 'problem') return sessionExpired(ctx);
  const catIdx = Number(ctx.match[1]);
  const probIdx = Number(ctx.match[2]);
  const isAm = langOf(u) === 'am';
  const list = PROBLEMS_BY_CATEGORY[catIdx] || PROBLEMS_BY_CATEGORY[7];
  const prob = list[probIdx];
  s.data.problem = isAm ? (prob?.am || 'ብልሽት') : (prob?.en || 'Failure');
  s.step = 'location';
  setSession(ctx.from.id, s);
  await ctx.answerCbQuery();
  return ctx.reply(isAm ? 'የሚገኙበትን የሥራ ክፍል / ሕንፃ ይምረጡ (ወይም ይጻፉ)፦' : 'Select hospital department / location (or type):', locationKeyboard(isAm));
});
bot.action(/^reploc:(\d+)$/, async ctx => {
  const u = await userByTelegram(ctx.from.id);
  const s = getSession(ctx.from.id);
  const locIdx = Number(ctx.match[1]);
  const isAm = (s.data?.language || langOf(u)) === 'am';
  const loc = HOSPITAL_LOCATIONS[locIdx];
  const locName = isAm ? (loc?.am || 'ዋና ግቢ') : (loc?.en || 'Hospital');
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
  const u = await userByTelegram(ctx.from.id); const s = getSession(ctx.from.id);
  if (s.flow !== 'report' || s.step !== 'photo') return sessionExpired(ctx);
  s.step = 'confirm';
  s.data.photo = null;
  setSession(ctx.from.id, s);
  await ctx.answerCbQuery('Photo skipped');
  return showReportConfirm(ctx, u, s);
});
function userTrackActions(r, isAm) {
  const row = [Markup.button.callback(isAm ? '📄 PDF አውርድ' : '📄 Download PDF', `user:pdf:${r.request_no}`)];
  if (r.status === 'pending') {
    row.push(Markup.button.callback(isAm ? '❌ ጥያቄ ሰርዝ' : '❌ Cancel Request', `user:cancel:${r.request_no}`));
  }
  return Markup.inlineKeyboard([row]);
}

bot.action('main:profile', async ctx => {
  const u = await userByTelegram(ctx.from.id);
  await ctx.answerCbQuery();
  if (!u) return ctx.reply('Send /start first.');
  await syncTelegramUsername(ctx, u);
  const isAm = langOf(u) === 'am';
  const txt = isAm
    ? `👤 *የእኔ መገለጫ*\n━━━━━━━━━━━━━━━━━━\n• ስም: ${u.full_name}\n• Username: ${u.telegram_username || '-'}\n• ስልክ: ${u.phone || '-'}\n• ኢሜይል: ${u.email || '-'}\n• ክፍል: ${u.department || '-'}\n• ሚና: ${u.role}\n• Telegram ID: \`${u.telegram_id}\``
    : `👤 *My Profile*\n━━━━━━━━━━━━━━━━━━\n• Name: ${u.full_name}\n• Username: ${u.telegram_username || '-'}\n• Phone: ${u.phone || '-'}\n• Email: ${u.email || '-'}\n• Department: ${u.department || '-'}\n• Role: ${u.role}\n• Telegram ID: \`${u.telegram_id}\``;
  return ctx.reply(txt, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([[Markup.button.callback(isAm ? '✏️ መረጃ አዘምን / Update' : '✏️ Update Profile', 'profile:edit')]])
  });
});

bot.action('profile:edit', async ctx => {
  const u = await userByTelegram(ctx.from.id);
  await ctx.answerCbQuery();
  const lang = langOf(u);
  clearSession(ctx.from.id);
  setSession(ctx.from.id, { flow: 'register', step: 'name', data: { language: lang } });
  return ctx.reply(t(lang, 'registerName'));
});

bot.action('main:mine', async ctx => {
  const u = await userByTelegram(ctx.from.id); await ctx.answerCbQuery(); if (!u) return;
  const rows = await query('SELECT request_no,equipment_name,status,priority FROM requests WHERE employee_id=? ORDER BY id DESC LIMIT 10', [u.id]);
  if (!rows.length) return ctx.reply(msg(u, 'noRequests'));
  const isAm = langOf(u) === 'am';
  const buttons = rows.map(r => [
    Markup.button.callback(`${r.request_no} • ${r.equipment_name} (${STATUS_LABEL[r.status] || r.status})`, `trackpick:${r.request_no}`)
  ]);
  return ctx.reply(isAm ? '📋 *የእኔ ጥያቄዎች* — ዝርዝር ለማየት ይንኩ፦' : '📋 *My Requests* — tap any request to view details or PDF:', {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(buttons)
  });
});
bot.action('main:track', async ctx => {
  const u = await userByTelegram(ctx.from.id);
  await ctx.answerCbQuery();
  if (!u) return ctx.reply('Send /start first.');
  return startTrackFlow(ctx, u);
});
bot.action(/^trackpick:(.+)$/, async ctx => {
  const u = await userByTelegram(ctx.from.id);
  await ctx.answerCbQuery();
  if (!u) return;
  clearSession(ctx.from.id);
  const r = await getRequestByNo(ctx.match[1]);
  if (!r || r.employee_id !== u.id) return ctx.reply('Request not found, or it does not belong to your account.');
  const isAm = langOf(u) === 'am';
  return ctx.reply(await formatTrackReply(r, isAm), userTrackActions(r, isAm));
});
bot.action(/^user:pdf:(.+)$/, async ctx => {
  const u = await userByTelegram(ctx.from.id);
  await ctx.answerCbQuery();
  if (!u) return;
  const r = await getRequestByNo(ctx.match[1]);
  if (!r || r.employee_id !== u.id) return ctx.reply('Request not found.');
  const tech = r.assigned_technician_id ? await one('SELECT * FROM users WHERE id=?', [r.assigned_technician_id]) : null;
  const file = path.join(reportDir, `${r.request_no}-user.pdf`);
  await generateRequestPdf(r, u, file, tech);
  return ctx.replyWithDocument({ source: file, filename: `${r.request_no}.pdf` });
});
bot.action(/^user:cancel:(.+)$/, async ctx => {
  const u = await userByTelegram(ctx.from.id);
  const r = await getRequestByNo(ctx.match[1]);
  if (!u || !r || r.employee_id !== u.id) return ctx.answerCbQuery('Not allowed.');
  if (r.status !== 'pending') return ctx.answerCbQuery('Only pending requests can be cancelled.');
  await query("UPDATE requests SET status='cancelled' WHERE id=?", [r.id]);
  await query("INSERT INTO maintenance_activities(request_id,actor_user_id,activity_type,notes) VALUES(?,?,'cancelled','Cancelled by employee')", [r.id, u.id]);
  await audit(u, 'user_cancel', 'request', r.id, r.request_no);
  await ctx.answerCbQuery('Cancelled');
  const isAm = langOf(u) === 'am';
  return ctx.reply(isAm ? `❌ ${r.request_no} ተሰርዟል።` : `❌ Request ${r.request_no} has been cancelled.`);
});

bot.action('main:tech', async ctx => {
  const u = await userByTelegram(ctx.from.id); await ctx.answerCbQuery(); if (!isTech(u)) return ctx.reply(msg(u, 'techOnly'));
  const rows = await query("SELECT request_no,equipment_name,equipment_type,status,priority FROM requests WHERE assigned_technician_id=? AND status IN ('assigned','accepted','in_progress','waiting_parts') ORDER BY CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END,reported_at ASC LIMIT 15", [u.id]);
  if (!rows.length) return ctx.reply(msg(u, 'noJobs'));
  for (const r of rows) await ctx.reply(`${r.request_no}\n${r.equipment_name} (${r.equipment_type})\n${STATUS_LABEL[r.status]} | ${r.priority}`, Markup.inlineKeyboard([[Markup.button.callback('Open / ክፈት', `techopen:${r.request_no}`)]]));
});
bot.action(/^techopen:(.+)$/, async ctx => {
  const u = await userByTelegram(ctx.from.id); if (!isTech(u)) return ctx.answerCbQuery(); const r = await getRequestByNo(ctx.match[1]); if (!r || r.assigned_technician_id !== u.id) return ctx.answerCbQuery('Not assigned to you.');
  await ctx.answerCbQuery();
  const txt = `${r.request_no}\n🔧 Equipment: ${r.equipment_name} (${r.equipment_type})\n📱 Model: ${r.model || '-'}\n❗ Problem: ${r.problem_description}\n📍 Dept/Location: ${r.department} / ${r.room_location || '-'}\n\n👤 Applicant: ${r.employee_name}\n• Username: ${r.employee_username || '-'}\n• Phone: ${r.employee_phone || '-'}\n📊 Status: ${STATUS_LABEL[r.status]}`;
  if (r.attachment_file_id) {
    try { await ctx.replyWithPhoto(r.attachment_file_id, { caption: `📸 Photo for ${r.request_no}` }); } catch (e) {}
  }
  return ctx.reply(txt, Markup.inlineKeyboard([
    [Markup.button.callback('Accept / ተቀበል', 'techstatus:accepted:' + r.request_no), Markup.button.callback('Start work / ጀምር', 'techstatus:in_progress:' + r.request_no)],
    [Markup.button.callback('Diagnosis / ምርመራ', 'techdiag:' + r.request_no), Markup.button.callback('Complete / አጠናቅቅ', 'techfinish:' + r.request_no)],
    [Markup.button.callback('Waiting for parts / መለዋወጫ በመጠባበቅ', 'techstatus:waiting_parts:' + r.request_no)]
  ]));
});
bot.action(/^techstatus:(accepted|in_progress|waiting_parts):(.+)$/, async ctx => {
  const u = await userByTelegram(ctx.from.id); if (!isTech(u)) return ctx.answerCbQuery(); const r = await getRequestByNo(ctx.match[2]); if (!r || r.assigned_technician_id !== u.id) return ctx.answerCbQuery('Not assigned.');
  await query('UPDATE requests SET status=? WHERE id=?', [ctx.match[1], r.id]); await query('INSERT INTO maintenance_activities(request_id,actor_user_id,activity_type,notes) VALUES(?,?,?,?)', [r.id, u.id, 'status_change', ctx.match[1]]); await audit(u, 'status_change', 'request', r.id, ctx.match[1]);
  await ctx.answerCbQuery('Updated'); await ctx.reply(`${r.request_no}: ${STATUS_LABEL[ctx.match[1]]}`);
  try { await bot.telegram.sendMessage(r.employee_tg, `Your request ${r.request_no} is now: ${STATUS_LABEL[ctx.match[1]]}.`); } catch (e) { }
});
bot.action(/^techdiag:(.+)$/, async ctx => { const u = await userByTelegram(ctx.from.id); const r = await getRequestByNo(ctx.match[1]); if (!isTech(u) || !r || r.assigned_technician_id !== u.id) return ctx.answerCbQuery(); setSession(ctx.from.id, { flow: 'techupdate', step: 'diagnosis', requestNo: r.request_no, data: {} }); await ctx.answerCbQuery(); return ctx.reply(msg(u, 'diagnosis')); });
bot.action(/^techfinish:(.+)$/, async ctx => { const u = await userByTelegram(ctx.from.id); const r = await getRequestByNo(ctx.match[1]); if (!isTech(u) || !r || r.assigned_technician_id !== u.id) return ctx.answerCbQuery(); setSession(ctx.from.id, { flow: 'techupdate', step: 'diagnosis', requestNo: r.request_no, data: { finishing: true } }); await ctx.answerCbQuery(); return ctx.reply(msg(u, 'diagnosis')); });

bot.action('main:admin', async ctx => {
  const u = await userByTelegram(ctx.from.id); await ctx.answerCbQuery(); if (!isAdmin(u)) return ctx.reply(msg(u, 'adminOnly'));
  return sendAdminMenu(ctx, u);
});
bot.action('admin:pending', async ctx => {
  const u = await userByTelegram(ctx.from.id); if (!isAdmin(u)) return ctx.answerCbQuery();
  const rows = await query("SELECT r.request_no,r.equipment_name,r.equipment_type,r.priority,u.full_name AS emp_name,u.phone AS emp_phone FROM requests r JOIN users u ON u.id=r.employee_id WHERE r.status='pending' ORDER BY CASE r.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END,r.reported_at ASC LIMIT 20");
  await ctx.answerCbQuery();
  if (!rows.length) return ctx.reply('✅ No pending requests.');
  for (const r of rows) {
    await ctx.reply(
      `📌 ${r.request_no}\n🔧 ${r.equipment_name} (${r.equipment_type})\n⚡ Priority: ${r.priority}\n👤 ${r.emp_name} (${r.emp_phone || '-'})`,
      Markup.inlineKeyboard([
        [Markup.button.callback('📋 Full Info + Photo', `admin:view:${r.request_no}`), Markup.button.callback('👤 Assign Tech', `admin:picktech:${r.request_no}`)],
        [Markup.button.callback('🤖 Auto-Assign', `admin:retry:${r.request_no}`)]
      ])
    );
  }
});
bot.action(/^admin:retry:(.+)$/, async ctx => {
  const u = await userByTelegram(ctx.from.id); if (!isAdmin(u)) return ctx.answerCbQuery();
  const r = await getRequestByNo(ctx.match[1]); if (!r) return ctx.answerCbQuery('Not found');
  const tech = await autoAssign(r.id, r.equipment_type);
  await ctx.answerCbQuery(tech ? 'Assigned' : 'No suitable technician');
  if (tech) {
    await bot.telegram.sendMessage(tech.telegram_id, `${msg(u, 'assigned')}\n${r.request_no} – ${r.equipment_name}\nApplicant: ${r.employee_name} (${r.employee_phone || '-'})`);
    if (r.attachment_file_id) { try { await bot.telegram.sendPhoto(tech.telegram_id, r.attachment_file_id, { caption: `Evidence for ${r.request_no}` }); } catch (e) {} }
    await ctx.reply(`✅ Assigned ${r.request_no} to ${tech.full_name}.`);
  } else await ctx.reply(msg(u, 'noTech'));
});
bot.action('admin:recent', async ctx => {
  const u = await userByTelegram(ctx.from.id); if (!isAdmin(u)) return ctx.answerCbQuery();
  const rows = await query('SELECT r.request_no,r.equipment_name,r.status,r.priority,u.full_name AS emp_name FROM requests r JOIN users u ON u.id=r.employee_id ORDER BY r.id DESC LIMIT 12');
  await ctx.answerCbQuery();
  if (!rows.length) return ctx.reply('No requests yet.');
  const buttons = rows.map(r => [
    Markup.button.callback(`${r.request_no} • ${r.equipment_name} (${STATUS_LABEL[r.status] || r.status})`, `admin:view:${r.request_no}`)
  ]);
  return ctx.reply('📋 Tap any request to inspect full applicant info, photo, PDF, or manage:', Markup.inlineKeyboard(buttons));
});
bot.action(/^admin:view:(.+)$/, async ctx => {
  const u = await userByTelegram(ctx.from.id); if (!isAdmin(u)) return ctx.answerCbQuery();
  const r = await getRequestByNo(ctx.match[1]);
  await ctx.answerCbQuery();
  if (!r) return ctx.reply('Request not found.');
  const card = formatAdminRequestCard(r);
  const keyboard = adminRequestActions(r.request_no, Boolean(r.attachment_file_id));
  if (r.attachment_file_id) {
    try {
      await ctx.replyWithPhoto(r.attachment_file_id, { caption: card.slice(0, 1000), ...(card.length <= 1000 ? keyboard : {}) });
      if (card.length > 1000) await ctx.reply(card, keyboard);
      return;
    } catch (e) {}
  }
  return ctx.reply(card, keyboard);
});
bot.action(/^admin:photo:(.+)$/, async ctx => {
  const u = await userByTelegram(ctx.from.id); if (!isAdmin(u)) return ctx.answerCbQuery();
  const r = await getRequestByNo(ctx.match[1]);
  await ctx.answerCbQuery();
  if (!r || !r.attachment_file_id) return ctx.reply('No photo attached to this request.');
  return ctx.replyWithPhoto(r.attachment_file_id, { caption: `📸 Photo evidence for ${r.request_no}` });
});
bot.action(/^admin:pdf:(.+)$/, async ctx => {
  const u = await userByTelegram(ctx.from.id); if (!isAdmin(u)) return ctx.answerCbQuery();
  const r = await getRequestByNo(ctx.match[1]);
  await ctx.answerCbQuery();
  if (!r) return ctx.reply('Request not found.');
  const emp = await one('SELECT * FROM users WHERE id=?', [r.employee_id]);
  const tech = r.assigned_technician_id ? await one('SELECT * FROM users WHERE id=?', [r.assigned_technician_id]) : null;
  const file = path.join(reportDir, `${r.request_no}-admin.pdf`);
  await generateRequestPdf(r, emp, file, tech);
  return ctx.replyWithDocument({ source: file, filename: `${r.request_no}.pdf` });
});
bot.action(/^admin:picktech:(.+)$/, async ctx => {
  const u = await userByTelegram(ctx.from.id); if (!isAdmin(u)) return ctx.answerCbQuery();
  const reqNo = ctx.match[1];
  const techs = await query("SELECT id,full_name,specialization FROM users WHERE role IN ('technician','admin') AND is_active=TRUE ORDER BY full_name");
  await ctx.answerCbQuery();
  if (!techs.length) return ctx.reply('No active technicians found.');
  const buttons = techs.map(t => [Markup.button.callback(`${t.full_name} (${t.specialization || t.role})`, `admin:assign:${reqNo}:${t.id}`)]);
  return ctx.reply(`👤 Select technician for ${reqNo}:`, Markup.inlineKeyboard(buttons));
});
bot.action(/^admin:assign:([^:]+):(\d+)$/, async ctx => {
  const u = await userByTelegram(ctx.from.id); if (!isAdmin(u)) return ctx.answerCbQuery();
  const [, reqNo, techId] = ctx.match;
  const r = await getRequestByNo(reqNo);
  const tech = await one('SELECT * FROM users WHERE id=?', [Number(techId)]);
  await ctx.answerCbQuery();
  if (!r || !tech) return ctx.reply('Request or technician not found.');
  await query("UPDATE requests SET assigned_technician_id=?, status=CASE WHEN status='pending' THEN 'assigned' ELSE status END, assigned_at=NOW() WHERE id=?", [tech.id, r.id]);
  await query("INSERT INTO maintenance_activities(request_id,actor_user_id,activity_type,notes) VALUES(?,?,'admin_assigned',?)", [r.id, u.id, `Assigned to ${tech.full_name} by admin ${u.full_name}`]);
  await audit(u, 'admin_assign', 'request', r.id, `${reqNo} -> ${tech.full_name}`);
  try {
    await bot.telegram.sendMessage(tech.telegram_id, `${msg(u, 'assigned')}\n${reqNo}\n${r.equipment_name} (${r.equipment_type})\nLocation: ${r.room_location || r.department}\nApplicant: ${r.employee_name} (${r.employee_phone || '-'})`);
    if (r.attachment_file_id) await bot.telegram.sendPhoto(tech.telegram_id, r.attachment_file_id, { caption: `Evidence for ${reqNo}` });
  } catch (e) {}
  try { await bot.telegram.sendMessage(r.employee_tg, `Your request ${reqNo} has been assigned to technician ${tech.full_name}.`); } catch (e) {}
  return ctx.reply(`✅ ${reqNo} assigned to ${tech.full_name}.`);
});
bot.action(/^admin:pickstatus:(.+)$/, async ctx => {
  const u = await userByTelegram(ctx.from.id); if (!isAdmin(u)) return ctx.answerCbQuery();
  const reqNo = ctx.match[1];
  await ctx.answerCbQuery();
  const statuses = ['pending', 'assigned', 'accepted', 'in_progress', 'waiting_parts', 'completed', 'unresolved', 'cancelled'];
  const rows = [];
  for (let i = 0; i < statuses.length; i += 2) {
    const r = [Markup.button.callback(STATUS_LABEL[statuses[i]], `admin:setstatus:${reqNo}:${statuses[i]}`)];
    if (statuses[i + 1]) r.push(Markup.button.callback(STATUS_LABEL[statuses[i + 1]], `admin:setstatus:${reqNo}:${statuses[i + 1]}`));
    rows.push(r);
  }
  return ctx.reply(`🔄 Set status for ${reqNo}:`, Markup.inlineKeyboard(rows));
});
bot.action(/^admin:setstatus:([^:]+):([a-z_]+)$/, async ctx => {
  const u = await userByTelegram(ctx.from.id); if (!isAdmin(u)) return ctx.answerCbQuery();
  const [, reqNo, status] = ctx.match;
  const r = await getRequestByNo(reqNo);
  await ctx.answerCbQuery();
  if (!r || !STATUS_LABEL[status]) return ctx.reply('Invalid request or status.');
  await query("UPDATE requests SET status=?, completed_at=CASE WHEN ?='completed' THEN NOW() ELSE completed_at END WHERE id=?", [status, status, r.id]);
  await query("INSERT INTO maintenance_activities(request_id,actor_user_id,activity_type,notes) VALUES(?,?,'admin_status',?)", [r.id, u.id, `Admin changed status to ${status}`]);
  await audit(u, 'admin_status', 'request', r.id, `${reqNo}:${status}`);
  try { await bot.telegram.sendMessage(r.employee_tg, `Your request ${reqNo} status updated to: ${STATUS_LABEL[status]}.`); } catch (e) {}
  return ctx.reply(`✅ ${reqNo} status updated to ${STATUS_LABEL[status]}.`);
});
bot.action('admin:users', async ctx => {
  const u = await userByTelegram(ctx.from.id); if (!isAdmin(u)) return ctx.answerCbQuery();
  const users = await query('SELECT id,telegram_id,telegram_username,full_name,phone,email,department,role,is_active FROM users ORDER BY id DESC LIMIT 25');
  await ctx.answerCbQuery();
  if (!users.length) return ctx.reply('No registered users yet.');
  const buttons = users.map(usr => [
    Markup.button.callback(`${usr.is_active ? '🟢' : '🔴'} ${usr.full_name} (${usr.role})`, `admin:user:${usr.id}`)
  ]);
  return ctx.reply(`👥 Registered Users & Applicants (${users.length} shown) — tap any user for full info:`, Markup.inlineKeyboard(buttons));
});
bot.action(/^admin:user:(\d+)$/, async ctx => {
  const u = await userByTelegram(ctx.from.id); if (!isAdmin(u)) return ctx.answerCbQuery();
  const target = await one('SELECT * FROM users WHERE id=?', [Number(ctx.match[1])]);
  await ctx.answerCbQuery();
  if (!target) return ctx.reply('User not found.');
  return ctx.reply(formatUserCard(target), Markup.inlineKeyboard([
    [
      Markup.button.callback('👤 Employee', `admin:userrole:${target.id}:employee`),
      Markup.button.callback('🔧 Technician', `admin:userrole:${target.id}:technician`)
    ],
    [
      Markup.button.callback('📦 Storekeeper', `admin:userrole:${target.id}:storekeeper`),
      Markup.button.callback('⚙️ Admin', `admin:userrole:${target.id}:admin`)
    ],
    [
      Markup.button.callback(target.is_active ? '🔴 Deactivate' : '🟢 Activate', `admin:usertoggle:${target.id}`)
    ]
  ]));
});
bot.action(/^admin:userrole:(\d+):(employee|technician|storekeeper|admin|department_head)$/, async ctx => {
  const u = await userByTelegram(ctx.from.id); if (!isAdmin(u)) return ctx.answerCbQuery();
  const [, id, role] = ctx.match;
  await query('UPDATE users SET role=? WHERE id=?', [role, Number(id)]);
  await audit(u, 'admin_setrole', 'user', Number(id), role);
  const fresh = await one('SELECT * FROM users WHERE id=?', [Number(id)]);
  await ctx.answerCbQuery(`Role -> ${role}`);
  return ctx.reply(`✅ Role updated.\n\n${formatUserCard(fresh)}`);
});
bot.action(/^admin:usertoggle:(\d+)$/, async ctx => {
  const u = await userByTelegram(ctx.from.id); if (!isAdmin(u)) return ctx.answerCbQuery();
  const target = await one('SELECT * FROM users WHERE id=?', [Number(ctx.match[1])]);
  if (!target) return ctx.answerCbQuery('Not found');
  const nextActive = !target.is_active;
  await query('UPDATE users SET is_active=? WHERE id=?', [nextActive, target.id]);
  await audit(u, 'admin_toggle_active', 'user', target.id, String(nextActive));
  target.is_active = nextActive;
  await ctx.answerCbQuery(nextActive ? 'Activated' : 'Deactivated');
  return ctx.reply(formatUserCard(target));
});
bot.action('admin:stats', async ctx => {
  const u = await userByTelegram(ctx.from.id); if (!isAdmin(u)) return ctx.answerCbQuery();
  const totalReq = await one('SELECT COUNT(*) AS n FROM requests');
  const pendingReq = await one("SELECT COUNT(*) AS n FROM requests WHERE status='pending'");
  const activeReq = await one("SELECT COUNT(*) AS n FROM requests WHERE status IN ('assigned','accepted','in_progress','waiting_parts')");
  const doneReq = await one("SELECT COUNT(*) AS n FROM requests WHERE status='completed'");
  const totalUsers = await one('SELECT COUNT(*) AS n FROM users');
  const activeTechs = await one("SELECT COUNT(*) AS n FROM users WHERE role='technician' AND is_active=TRUE");
  await ctx.answerCbQuery();
  return ctx.reply(
    `📊 *Hospital IT System Statistics*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `📋 Total Requests: ${totalReq.n}\n` +
    `📌 Pending (Unassigned): ${pendingReq.n}\n` +
    `🔧 Active / In Progress: ${activeReq.n}\n` +
    `✅ Completed: ${doneReq.n}\n` +
    `👥 Registered Users: ${totalUsers.n}\n` +
    `👷 Active Technicians: ${activeTechs.n}`,
    { parse_mode: 'Markdown' }
  );
});
bot.action('admin:workload', async ctx => { const u = await userByTelegram(ctx.from.id); if (!isAdmin(u)) return ctx.answerCbQuery(); const rows = await query("SELECT u.full_name,u.specialization,COUNT(r.id) AS jobs FROM users u LEFT JOIN requests r ON r.assigned_technician_id=u.id AND r.status IN ('assigned','accepted','in_progress','waiting_parts') WHERE u.role='technician' AND u.is_active=TRUE GROUP BY u.id ORDER BY jobs"); await ctx.answerCbQuery(); return ctx.reply(rows.length ? rows.map(r => `${r.full_name} (${r.specialization || 'Unspecified'}): ${r.jobs} open jobs`).join('\n') : 'No active technicians.'); });

bot.action('admin:search', async ctx => {
  const u = await userByTelegram(ctx.from.id); if (!isAdmin(u)) return ctx.answerCbQuery();
  setSession(ctx.from.id, { flow: 'adminsearch', step: 'query', data: {} });
  await ctx.answerCbQuery();
  return ctx.reply('🔎 Enter request number, employee name, phone, or equipment to search (or /cancel):');
});

bot.action('admin:broadcast', async ctx => {
  const u = await userByTelegram(ctx.from.id); if (!isAdmin(u)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  return ctx.reply('📢 Select broadcast audience:', Markup.inlineKeyboard([
    [Markup.button.callback('👥 All Active Users', 'admin:bcasttarget:all')],
    [Markup.button.callback('🔧 Technicians Only', 'admin:bcasttarget:techs')]
  ]));
});

bot.action(/^admin:bcasttarget:(all|techs)$/, async ctx => {
  const u = await userByTelegram(ctx.from.id); if (!isAdmin(u)) return ctx.answerCbQuery();
  setSession(ctx.from.id, { flow: 'adminbroadcast', step: 'message', data: { target: ctx.match[1] } });
  await ctx.answerCbQuery();
  return ctx.reply(`📢 Type the announcement to send to ${ctx.match[1] === 'techs' ? 'all active technicians' : 'all active users'} (or /cancel):`);
});

bot.action('admin:export', async ctx => {
  const u = await userByTelegram(ctx.from.id); if (!isAdmin(u)) return ctx.answerCbQuery();
  await ctx.answerCbQuery('Generating CSV...');
  const rows = await query(`
    SELECT r.request_no, r.reported_at, r.status, r.priority, r.equipment_type, r.model,
           r.problem_description, r.department, r.room_location,
           u.full_name AS applicant_name, u.telegram_username, u.phone, u.email, u.telegram_id,
           t.full_name AS technician_name, r.diagnosis, r.parts_used
    FROM requests r
    JOIN users u ON u.id=r.employee_id
    LEFT JOIN users t ON t.id=r.assigned_technician_id
    ORDER BY r.id DESC
    LIMIT 500
  `);
  const csvEsc = v => `"${String(v ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
  const headers = ['Request No', 'Reported At', 'Status', 'Priority', 'Equipment', 'Model', 'Problem', 'Department', 'Location', 'Applicant Name', 'Username', 'Phone', 'Email', 'Telegram ID', 'Technician', 'Diagnosis', 'Parts Used'];
  const lines = [headers.map(csvEsc).join(',')];
  for (const r of rows) {
    lines.push([
      r.request_no, r.reported_at, r.status, r.priority, r.equipment_type, r.model,
      r.problem_description, r.department, r.room_location,
      r.applicant_name, r.telegram_username, r.phone, r.email, r.telegram_id,
      r.technician_name, r.diagnosis, r.parts_used
    ].map(csvEsc).join(','));
  }
  const stamp = new Date().toISOString().slice(0, 10);
  const csvPath = path.join(reportDir, `AMSH-IT-Export-${stamp}.csv`);
  fs.writeFileSync(csvPath, lines.join('\n'), 'utf8');
  await audit(u, 'admin_export_csv', 'request', null, `${rows.length} rows`);
  return ctx.replyWithDocument({ source: csvPath, filename: `AMSH-IT-Export-${stamp}.csv` }, { caption: `📥 Exported ${rows.length} IT requests.` });
});

bot.action('main:store', async ctx => { const u = await userByTelegram(ctx.from.id); await ctx.answerCbQuery(); if (!isStore(u) && !isAdmin(u)) return ctx.reply(msg(u, 'storeOnly')); return ctx.reply(msg(u, 'storeMenu'), Markup.inlineKeyboard([[Markup.button.callback(msg(u, 'storeAdd'), 'store:add')], [Markup.button.callback(msg(u, 'storeIssue'), 'store:issue')], [Markup.button.callback(msg(u, 'storeView'), 'store:view')]])); });
bot.action('store:add', async ctx => { const u = await userByTelegram(ctx.from.id); if (!isStore(u) && !isAdmin(u)) return ctx.answerCbQuery(); setSession(ctx.from.id, { flow: 'stockadd', step: 'part', data: {} }); await ctx.answerCbQuery(); return ctx.reply(msg(u, 'askPart')); });
bot.action('store:issue', async ctx => { const u = await userByTelegram(ctx.from.id); if (!isStore(u) && !isAdmin(u)) return ctx.answerCbQuery(); setSession(ctx.from.id, { flow: 'stockissue', step: 'part', data: {} }); await ctx.answerCbQuery(); return ctx.reply(msg(u, 'askPart')); });
bot.action('store:view', async ctx => { const u = await userByTelegram(ctx.from.id); if (!isStore(u) && !isAdmin(u)) return ctx.answerCbQuery(); const rows = await query('SELECT item_name,quantity,unit FROM spare_parts ORDER BY item_name'); await ctx.answerCbQuery(); return ctx.reply(rows.length ? rows.map(r => `${r.item_name}: ${r.quantity} ${r.unit}`).join('\n') : 'No spare parts recorded.'); });

bot.action('report:submit', async ctx => {
  const u = await userByTelegram(ctx.from.id); const s = getSession(ctx.from.id); if (s.flow !== 'report' || s.step !== 'confirm') return ctx.answerCbQuery('No report in progress.');
  await syncTelegramUsername(ctx, u);
  const d = s.data; const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const count = await one('SELECT COUNT(*) AS n FROM requests WHERE DATE(reported_at)=CURRENT_DATE'); const requestNo = `AMH-IT-${stamp}-${String(Number(count.n) + 1).padStart(4, '0')}`;
  const result = await query("INSERT INTO requests(request_no,employee_id,equipment_type,equipment_name,model,serial_number,department,room_location,problem_description,priority,attachment_file_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)", [requestNo, u.id, d.equipment_type, d.equipment_name, d.model === '-' ? null : d.model, d.serial_number === '-' ? null : d.serial_number, u.department, d.room, d.problem, d.priority, d.photo || null]);
  await query("INSERT INTO maintenance_activities(request_id,actor_user_id,activity_type,notes) VALUES(?,?,'submitted','Employee submitted failure report through Telegram.')", [result.insertId, u.id]); await audit(u, 'submit_request', 'request', result.insertId, requestNo);
  const assigned = await autoAssign(result.insertId, d.equipment_type); const r = await getRequestByNo(requestNo);
  clearSession(ctx.from.id); await ctx.answerCbQuery('Submitted'); await ctx.reply(`${msg(u, 'submitted')} ${requestNo}${assigned ? `\nAssigned technician: ${assigned.full_name}` : ''}`);
  if (assigned) {
    try {
      await bot.telegram.sendMessage(
        assigned.telegram_id,
        `${msg(u, 'assigned')}\n${requestNo}\n${d.equipment_name} (${d.equipment_type})\nModel: ${d.model || '-'}\nProblem: ${d.problem}\nPriority: ${d.priority}\nLocation: ${d.room}\n\n👤 Applicant: ${u.full_name}\n📱 Phone: ${u.phone || '-'}`
      );
      if (d.photo) await bot.telegram.sendPhoto(assigned.telegram_id, d.photo, { caption: `Evidence for ${requestNo}` });
    } catch (e) { }
  }
  const adminHeader = assigned
    ? `🆕 New IT Request — Assigned to ${assigned.full_name}`
    : `🚨 UNASSIGNED IT REQUEST — Needs Assignment`;
  const adminCard = formatAdminRequestCard(r, adminHeader);
  await notifyAdmins(adminCard, d.photo || null, adminRequestActions(requestNo, Boolean(d.photo)));
  const file = path.join(reportDir, `${requestNo}-request.pdf`); await generateRequestPdf(r, u, file, assigned); await ctx.replyWithDocument({ source: file, filename: `${requestNo}.pdf` }); await ctx.reply('Main menu / ዋና ምናሌ', mainKeyboard(u));
});
bot.action('report:cancel', async ctx => { clearSession(ctx.from.id); await ctx.answerCbQuery(); return ctx.reply('Report cancelled. / ሪፖርቱ ተሰርዟል።'); });

bot.action('regemail:skip', async ctx => {
  const s = getSession(ctx.from.id);
  if (s.flow !== 'register' || s.step !== 'email') return ctx.answerCbQuery();
  s.data.email = null;
  s.step = 'department';
  setSession(ctx.from.id, s);
  await ctx.answerCbQuery('Email skipped');
  const isAm = s.data.language === 'am';
  return ctx.reply(isAm ? 'የሚሰሩበትን ክፍል / ሕንፃ ይምረጡ፦' : 'Select your department / ward:', locationKeyboard(isAm));
});

bot.action(/^confirmrepair:(working|still_failing):(.+)$/, async ctx => {
  const u = await userByTelegram(ctx.from.id); const r = await getRequestByNo(ctx.match[2]); if (!r || r.employee_id !== u.id) return ctx.answerCbQuery('Not your request.');
  const val = ctx.match[1]; await query('UPDATE requests SET employee_confirmation=? WHERE id=?', [val, r.id]); await query("INSERT INTO maintenance_activities(request_id,actor_user_id,activity_type,notes) VALUES(?,?, 'employee_confirmation',?)", [r.id, u.id, val]); await ctx.answerCbQuery(); await ctx.reply(msg(u, 'thanks')); await notifyAdmins(`Employee confirmation for ${r.request_no}: ${val}`);
});

bot.on('text', async ctx => {
  const tg = ctx.from.id; const u = await userByTelegram(tg); const s = getSession(tg); const text = ctx.message.text.trim();
  if (!s.flow) return;
  if (text.toLowerCase() === '/cancel') { clearSession(tg); return ctx.reply(msg(u, 'cancelled')); }
  if (s.flow === 'register') {
    if (s.step === 'name') { s.data.full_name = text; s.step = 'phone'; setSession(tg, s); return ctx.reply(t(s.data.language, 'registerPhone')); }
    if (s.step === 'phone') {
      s.data.phone = text; s.step = 'email'; setSession(tg, s);
      const isAm = s.data.language === 'am';
      return ctx.reply(
        isAm ? 'የኢሜይል አድራሻዎን ያስገቡ (ወይም «ዝለል» የሚለውን ይጫኑ)፦' : 'Enter your email address (or tap Skip):',
        Markup.inlineKeyboard([[Markup.button.callback(isAm ? '⏭️ ኢሜይል ዝለል / Skip' : '⏭️ Skip Email', 'regemail:skip')]])
      );
    }
    if (s.step === 'email') {
      s.data.email = text === '-' ? null : text; s.step = 'department'; setSession(tg, s);
      const isAm = s.data.language === 'am';
      return ctx.reply(isAm ? 'የሚሰሩበትን ክፍል / ሕንፃ ይምረጡ፦' : 'Select your department / ward:', locationKeyboard(isAm));
    }
    if (s.step === 'department') {
      // typed fallback
      s.data.department = text; const lang = s.data.language || 'en'; const user = await registerUser(ctx, { ...s.data, department: text, language: lang }); clearSession(tg); await ctx.reply(t(lang, 'registered')); return sendHome(ctx, user);
    }
  }
  if (s.flow === 'report') {
    // typed fallback for model step
    if (s.step === 'model') {
      s.data.model = text; s.data.equipment_name = s.data.equipment_type; s.data.serial_number = '-';
      s.step = 'problem'; setSession(tg, s);
      const isAm = langOf(u) === 'am';
      return ctx.reply(isAm ? 'የብልሽቱን ዓይነት ይምረጡ (ወይም ይጻፉ)፦' : 'Select or describe the problem:', problemKeyboard(isAm, s.data.catIdx ?? 7));
    }
    // typed fallback for problem step
    if (s.step === 'problem') {
      s.data.problem = text; s.step = 'location'; setSession(tg, s);
      const isAm = langOf(u) === 'am';
      return ctx.reply(isAm ? 'የሚገኙበትን የሥራ ክፍል / ሕንፃ ይምረጡ (ወይም ይጻፉ)፦' : 'Select hospital department / location (or type):', locationKeyboard(isAm));
    }
    // typed fallback for location step
    if (s.step === 'location') {
      s.data.room = text; s.step = 'priority'; setSession(tg, s);
      const isAm = langOf(u) === 'am';
      return ctx.reply(isAm ? 'የቅድሚያ ደረጃ ይምረጡ፦' : 'Select priority level:', priorityKeyboard(isAm));
    }
    if (s.step === 'photo' && text.toUpperCase() === 'SKIP') { s.step = 'confirm'; setSession(tg, s); return showReportConfirm(ctx, u, s); }
  }
  if (s.flow === 'track' && s.step === 'number') {
    const raw = text.toUpperCase();
    let r = await getRequestByNo(raw);
    if (!r && !raw.startsWith('AMH-')) {
      r = await getRequestByNo(`AMH-${raw}`) || await getRequestByNo(`AMH-IT-${raw}`);
    }
    if (!r) {
      const match = await one(
        'SELECT request_no FROM requests WHERE employee_id=? AND request_no LIKE ? ORDER BY id DESC LIMIT 1',
        [u.id, `%${raw}`]
      );
      if (match) r = await getRequestByNo(match.request_no);
    }
    clearSession(tg);
    if (!r || r.employee_id !== u.id) {
      const isAm = langOf(u) === 'am';
      return ctx.reply(isAm ? 'ጥያቄው አልተገኘም ወይም የእርስዎ አይደለም።' : 'Request not found, or it does not belong to your account.');
    }
    return ctx.reply(await formatTrackReply(r, langOf(u) === 'am'));
  }
  if (s.flow === 'techupdate') {
    const r = await getRequestByNo(s.requestNo); if (!r || r.assigned_technician_id !== u.id) { clearSession(tg); return ctx.reply('Request not assigned to you.'); }
    if (s.step === 'diagnosis') { s.data.diagnosis = text; s.step = 'repair'; setSession(tg, s); return ctx.reply(msg(u, 'repair')); }
    if (s.step === 'repair') { s.data.repair_actions = text; s.step = 'parts'; setSession(tg, s); return ctx.reply(msg(u, 'parts')); }
    if (s.step === 'parts') {
      s.data.parts_used = text === 'NONE' ? 'None' : text;
      if (s.data.finishing) {
        await query('UPDATE requests SET diagnosis=?,repair_actions=?,parts_used=?,status=?,completed_at=NOW() WHERE id=?', [s.data.diagnosis, s.data.repair_actions, s.data.parts_used, 'completed', r.id]);
      } else {
        await query('UPDATE requests SET diagnosis=?,repair_actions=?,parts_used=?,status=? WHERE id=?', [s.data.diagnosis, s.data.repair_actions, s.data.parts_used, 'in_progress', r.id]);
      }
      await query("INSERT INTO maintenance_activities(request_id,actor_user_id,activity_type,notes) VALUES(?,?,?,?)", [r.id, u.id, s.data.finishing ? 'completed' : 'work_update', `Diagnosis: ${s.data.diagnosis}; Repair: ${s.data.repair_actions}; Parts: ${s.data.parts_used}`]); await audit(u, 'maintenance_update', 'request', r.id, s.data.finishing ? 'completed' : 'in_progress');
      clearSession(tg); await ctx.reply(s.data.finishing ? msg(u, 'done') : msg(u, 'updated'));
      const fresh = await getRequestByNo(r.request_no); const employee = await one('SELECT * FROM users WHERE id=?', [r.employee_id]);
      if (s.data.finishing) {
        const pdf = path.join(reportDir, `${r.request_no}-completion.pdf`); await generateRequestPdf(fresh, employee, pdf, u); await ctx.replyWithDocument({ source: pdf, filename: `${r.request_no}-completion.pdf` });
        try { await bot.telegram.sendMessage(r.employee_tg, `Maintenance completed for ${r.request_no}. Please confirm:`, Markup.inlineKeyboard([[Markup.button.callback('Working / እየሰራ ነው', 'confirmrepair:working:' + r.request_no)], [Markup.button.callback('Still failing / አልተስተካከለም', 'confirmrepair:still_failing:' + r.request_no)]])); } catch (e) { }
      } else { try { await bot.telegram.sendMessage(r.employee_tg, `Your request ${r.request_no} has been updated. Status: In progress.`); } catch (e) { } }
      await notifyAdmins(`Request ${r.request_no} updated by ${u.full_name}. Status: ${s.data.finishing ? 'Completed' : 'In progress'}.`); return;
    }
  }
  if (s.flow === 'stockadd') {
    if (s.step === 'part') { s.data.part = text; s.step = 'qty'; setSession(tg, s); return ctx.reply(msg(u, 'askQty')); }
    if (s.step === 'qty') { const n = Number(text); if (!Number.isFinite(n) || n <= 0) return ctx.reply('Enter a valid positive quantity.'); s.data.qty = n; s.step = 'unit'; setSession(tg, s); return ctx.reply(msg(u, 'askUnit')); }
    if (s.step === 'unit') {
      s.data.unit = text;
      const pExisting = await one('SELECT id, quantity FROM spare_parts WHERE item_name=?', [s.data.part]);
      if (pExisting) {
        await query('UPDATE spare_parts SET quantity=quantity+?, unit=? WHERE id=?', [s.data.qty, s.data.unit, pExisting.id]);
      } else {
        await query('INSERT INTO spare_parts(item_name,quantity,unit) VALUES(?,?,?)', [s.data.part, s.data.qty, s.data.unit]);
      }
      const p = await one('SELECT id FROM spare_parts WHERE item_name=?', [s.data.part]);
      await query("INSERT INTO spare_transactions(part_id,actor_user_id,transaction_type,quantity,notes) VALUES(?,?,'received',?,?)", [p.id, u.id, s.data.qty, 'Stock received / added']);
      await audit(u, 'stock_received', 'spare_part', p.id, `${s.data.qty} ${s.data.unit}`);
      clearSession(tg);
      return ctx.reply(msg(u, 'stockUpdated'));
    }
  }
  if (s.flow === 'stockissue') {
    if (s.step === 'part') { s.data.part = text; s.step = 'qty'; setSession(tg, s); return ctx.reply(msg(u, 'askQty')); }
    if (s.step === 'qty') { const n = Number(text); if (!Number.isFinite(n) || n <= 0) return ctx.reply('Enter a valid positive quantity.'); s.data.qty = n; s.step = 'request'; setSession(tg, s); return ctx.reply(msg(u, 'askReq')); }
    if (s.step === 'request') {
      const p = await one('SELECT * FROM spare_parts WHERE item_name=?', [s.data.part]); if (!p || Number(p.quantity) < s.data.qty) return ctx.reply('Part not found or insufficient stock. Please check stock and try again.');
      let reqId = null; if (text !== '-') { const r = await getRequestByNo(text.toUpperCase()); if (!r) return ctx.reply('Request number not found. Enter a valid number or -'); reqId = r.id; }
      await query('UPDATE spare_parts SET quantity=quantity-? WHERE id=?', [s.data.qty, p.id]); await query("INSERT INTO spare_transactions(part_id,request_id,actor_user_id,transaction_type,quantity,notes) VALUES(?,?,?,'issued',?,?)", [p.id, reqId, u.id, s.data.qty, `Issued by ${u.full_name}`]); await audit(u, 'stock_issued', 'spare_part', p.id, `${s.data.qty} ${p.unit}; request ${text}`); clearSession(tg); return ctx.reply(msg(u, 'issued'));
    }
  }
  if (s.flow === 'adminsearch' && s.step === 'query' && isAdmin(u)) {
    clearSession(tg);
    const q = `%${text}%`;
    const rows = await query(
      `SELECT r.request_no,r.equipment_name,r.status,u.full_name AS emp_name
       FROM requests r JOIN users u ON u.id=r.employee_id
       WHERE LOWER(r.request_no) LIKE LOWER(?)
          OR LOWER(u.full_name) LIKE LOWER(?)
          OR LOWER(COALESCE(u.phone,'')) LIKE LOWER(?)
          OR LOWER(r.equipment_name) LIKE LOWER(?)
          OR LOWER(COALESCE(r.model,'')) LIKE LOWER(?)
       ORDER BY r.id DESC LIMIT 12`,
      [q, q, q, q, q]
    );
    if (!rows.length) return ctx.reply('No matching requests found.');
    const buttons = rows.map(r => [
      Markup.button.callback(`${r.request_no} • ${r.emp_name} (${STATUS_LABEL[r.status] || r.status})`, `admin:view:${r.request_no}`)
    ]);
    return ctx.reply(`🔎 Found ${rows.length} matching request(s):`, Markup.inlineKeyboard(buttons));
  }
  if (s.flow === 'adminbroadcast' && s.step === 'message' && isAdmin(u)) {
    const target = s.data.target;
    clearSession(tg);
    const sql = target === 'techs'
      ? "SELECT telegram_id FROM users WHERE role='technician' AND is_active=TRUE"
      : 'SELECT telegram_id FROM users WHERE is_active=TRUE';
    const recipients = await query(sql);
    let sent = 0;
    for (const rec of recipients) {
      try {
        await bot.telegram.sendMessage(rec.telegram_id, `📢 *IT Support Announcement*\n\n${text}`, { parse_mode: 'Markdown' });
        sent++;
      } catch (e) {}
    }
    await audit(u, 'admin_broadcast', 'user', null, `${target}:${sent}`);
    return ctx.reply(`✅ Broadcast sent to ${sent}/${recipients.length} users.`);
  }
});

async function showReportConfirm(ctx, u, s) {
  const d = s.data;
  const isAm = langOf(u) === 'am';
  const priEmoji = { low: '🟢', medium: '🟡', high: '🟠', critical: '🔴' };
  const priLabel = { low: isAm ? 'ዝቅተኛ' : 'Low', medium: isAm ? 'መካከለኛ' : 'Medium', high: isAm ? 'ከፍተኛ' : 'High', critical: isAm ? 'አስቸኳይ' : 'Critical' };
  const text = isAm
    ? `📋 *የጥያቄ ማጠቃለያ / Report Summary*\n\n🔧 መሣሪያ: ${d.equipment_type}\n📱 ሞዴል: ${d.model || '-'}\n❗ ችግር: ${d.problem}\n📍 ቦታ: ${d.room}\n${priEmoji[d.priority] || '⚪'} ቅድሚያ: ${priLabel[d.priority] || d.priority}\n📸 ፎቶ: ${d.photo ? '✅ ተያይዟል' : '❌ አልተያያዘም'}\n\nያረጋግጡና ያስገቡ ወይም ሰርዝ:`
    : `📋 *Report Summary*\n\n🔧 Equipment: ${d.equipment_type}\n📱 Model: ${d.model || '-'}\n❗ Problem: ${d.problem}\n📍 Location: ${d.room}\n${priEmoji[d.priority] || '⚪'} Priority: ${priLabel[d.priority] || d.priority}\n📸 Photo: ${d.photo ? '✅ Attached' : '❌ Not provided'}\n\nConfirm and submit or cancel:`;
  s.step = 'confirm';
  setSession(ctx.from.id, s);
  return ctx.reply(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback(isAm ? '✅ አስገባ / Submit' : '✅ Submit', 'report:submit'), Markup.button.callback(isAm ? '❌ ሰርዝ / Cancel' : '❌ Cancel', 'report:cancel')]]) });
}
bot.action(/^priority:(low|medium|high|critical)$/, async ctx => {
  const u = await userByTelegram(ctx.from.id); const s = getSession(ctx.from.id);
  if (s.flow !== 'report' || s.step !== 'priority') return sessionExpired(ctx);
  s.data.priority = ctx.match[1]; s.step = 'photo'; setSession(ctx.from.id, s); await ctx.answerCbQuery();
  const isAm = langOf(u) === 'am';
  return ctx.reply(isAm ? '📸 ፎቶ ማያያዝ ይፈልጋሉ? (ወይም ዝለሉ)' : '📸 Optionally attach a photo, or tap Skip:', photoKeyboard(isAm));
});
bot.on('photo', async ctx => {
  const s = getSession(ctx.from.id); const u = await userByTelegram(ctx.from.id); if (s.flow === 'report' && s.step === 'photo') { const photo = ctx.message.photo[ctx.message.photo.length - 1]; s.data.photo = photo.file_id; s.step = 'confirm'; setSession(ctx.from.id, s); return showReportConfirm(ctx, u, s); }
  if (s.flow === 'techupdate') { const photo = ctx.message.photo[ctx.message.photo.length - 1]; const r = await getRequestByNo(s.requestNo); if (r && r.assigned_technician_id === u.id) { await query("INSERT INTO maintenance_activities(request_id,actor_user_id,activity_type,notes) VALUES(?,?,'photo_evidence',?)", [r.id, u.id, `Telegram photo file_id: ${photo.file_id}`]); return ctx.reply('Photo evidence recorded.'); } }
});
bot.catch((err, ctx) => { console.error('Bot error:', err); if (ctx) ctx.reply('An error occurred. Please try again or contact IT administration. / ስህተት ተፈጥሯል።').catch(() => { }); });

(async () => {
  try {
    await initTablesIfMissing();
    await pool.query('SELECT 1');
    await ensureAdminUsers();
    // Register command list with Telegram (shows in the / menu inside the app)
    await bot.telegram.setMyCommands([
      { command: 'start', description: 'Main menu / ዋና ምናሌ' },
      { command: 'menu', description: 'Open main menu / ምናሌ ክፈት' },
      { command: 'report', description: '🔧 Report equipment failure / ብልሽት ሪፖርት' },
      { command: 'status', description: '📊 Track a request / ሁኔታ ፈትሽ' },
      { command: 'mytickets', description: '📋 My submitted requests / ጥያቄዎቼ' },
      { command: 'lang', description: '🌐 Change language / ቋንቋ ቀይር' },
      { command: 'myjobs', description: '🔧 Technician: my assigned jobs' },
      { command: 'tech', description: '🔧 Technician menu' },
      { command: 'admin', description: '👨‍💼 Admin menu' },
      { command: 'pending', description: '📌 Admin: unassigned requests' },
      { command: 'workload', description: '📈 Admin: technician workload' },
      { command: 'store', description: '📦 Storekeeper menu' },
      { command: 'cancel', description: '❌ Cancel current operation / ሰርዝ' },
      { command: 'myid', description: '🆔 Show your Telegram ID' },
      { command: 'help', description: '📋 Show all commands / ሁሉም ትዕዛዞች' },
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
  catch (err) { console.error('Startup failed:', err); process.exit(1); }
})();
process.once('SIGINT', () => bot.stop('SIGINT')); process.once('SIGTERM', () => bot.stop('SIGTERM'));
