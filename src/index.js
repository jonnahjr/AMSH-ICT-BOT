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
const CATEGORIES = ['Desktop computer','Laptop','Printer','Scanner','UPS','CCTV','Network equipment','Other electronics'];
const PRIORITIES = ['low','medium','high','critical'];
const STATUS_LABEL = { pending:'Pending', assigned:'Assigned', accepted:'Accepted', in_progress:'In progress', waiting_parts:'Waiting for parts', completed:'Completed', unresolved:'Unresolved', cancelled:'Cancelled' };
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
bot.command('help', async ctx => ctx.reply('Amanuel Hospital IT Support\n/start - Main menu\n/myid - Show your Telegram ID\n/admin commands: /addtech, /addstorekeeper, /setrole\nFor access, contact the IT administrator.'));
bot.command('myid', ctx => ctx.reply(`Your Telegram ID: ${ctx.from.id}`));
bot.command('cancel', ctx => { clearSession(ctx.from.id); return ctx.reply('Current operation cancelled. / አሁኑ ተግባር ተሰርዟል።'); });

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

bot.action('main:lang', async ctx => { await ctx.answerCbQuery(); return ctx.reply('Choose language / ቋንቋ ይምረጡ፦',languageKeyboard()); });
bot.action('main:report', async ctx => {
  const u=await userByTelegram(ctx.from.id); await ctx.answerCbQuery(); if(!u) return ctx.reply('Send /start first.');
  setSession(ctx.from.id,{flow:'report',step:'category',data:{}});
  const amCategories=['ዴስክቶፕ ኮምፒውተር','ላፕቶፕ','ፕሪንተር','ስካነር','UPS','CCTV','የኔትወርክ መሣሪያ','ሌሎች ኤሌክትሮኒክስ']; const rows=CATEGORIES.map((c,i)=>[Markup.button.callback(langOf(u)==='am'?amCategories[i]:c,`cat:${i}`)]);
  return ctx.reply(msg(u,'askCategory'),Markup.inlineKeyboard(rows));
});
bot.action(/^cat:(\d+)$/, async ctx => {
  const u=await userByTelegram(ctx.from.id); const s=getSession(ctx.from.id); if(s.flow!=='report'||s.step!=='category') return ctx.answerCbQuery('Start a new report first.');
  s.data.equipment_type=CATEGORIES[Number(ctx.match[1])] || 'Other electronics'; s.step='name'; setSession(ctx.from.id,s); await ctx.answerCbQuery(); return ctx.reply(msg(u,'askName'));
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
  const u=await userByTelegram(ctx.from.id); const s=getSession(ctx.from.id); if(s.flow!=='report'||s.step!=='confirm') return ctx.answerCbQuery('No report in progress.');
  const d=s.data; const stamp=new Date().toISOString().slice(0,10).replace(/-/g,'');
  const count=await one('SELECT COUNT(*) AS n FROM requests WHERE DATE(reported_at)=CURRENT_DATE'); const requestNo=`AMH-IT-${stamp}-${String(Number(count.n)+1).padStart(4,'0')}`;
  const result=await query("INSERT INTO requests(request_no,employee_id,equipment_type,equipment_name,model,serial_number,department,room_location,problem_description,priority,attachment_file_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)",[requestNo,u.id,d.equipment_type,d.equipment_name,d.model==='-'?null:d.model,d.serial_number==='-'?null:d.serial_number,u.department,d.room,d.problem,d.priority,d.photo||null]);
  await query("INSERT INTO maintenance_activities(request_id,actor_user_id,activity_type,notes) VALUES(?,?,'submitted','Employee submitted failure report through Telegram.')",[result.insertId,u.id]); await audit(u,'submit_request','request',result.insertId,requestNo);
  const assigned=await autoAssign(result.insertId,d.equipment_type); const r=await getRequestByNo(requestNo);
  clearSession(ctx.from.id); await ctx.answerCbQuery('Submitted'); await ctx.reply(`${msg(u,'submitted')} ${requestNo}${assigned?`\nAssigned technician: ${assigned.full_name}`:''}`);
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
    if(s.step==='phone') { s.data.phone=text; s.step='department'; setSession(tg,s); return ctx.reply(t(s.data.language,'registerDept')); }
    if(s.step==='department') { s.data.department=text; const lang=s.data.language||'en'; const user=await registerUser(ctx,{...s.data,department:text,language:lang}); clearSession(tg); await ctx.reply(t(lang,'registered')); return sendHome(ctx,user); }
  }
  if(s.flow==='report') {
    if(s.step==='name') { s.data.equipment_name=text; s.step='model'; setSession(tg,s); return ctx.reply(msg(u,'askModel')); }
    if(s.step==='model') { s.data.model=text; s.step='serial'; setSession(tg,s); return ctx.reply(msg(u,'askSerial')); }
    if(s.step==='serial') { s.data.serial_number=text; s.step='room'; setSession(tg,s); return ctx.reply(msg(u,'askRoom')); }
    if(s.step==='room') { s.data.room=text; s.step='problem'; setSession(tg,s); return ctx.reply(msg(u,'askProblem')); }
    if(s.step==='problem') { s.data.problem=text; s.step='priority'; setSession(tg,s); return ctx.reply(msg(u,'askPriority'),Markup.inlineKeyboard([[Markup.button.callback(langOf(u)==='am'?'ዝቅተኛ / Low':'Low','priority:low'),Markup.button.callback(langOf(u)==='am'?'መካከለኛ / Medium':'Medium','priority:medium')],[Markup.button.callback(langOf(u)==='am'?'ከፍተኛ / High':'High','priority:high'),Markup.button.callback(langOf(u)==='am'?'አስቸኳይ / Critical':'Critical','priority:critical')]])); }
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
  const d=s.data; const text=`${msg(u,'confirm')}\n\nEquipment: ${d.equipment_name}\nCategory: ${d.equipment_type}\nModel: ${d.model}\nSerial: ${d.serial_number}\nDepartment: ${u.department}\nLocation: ${d.room}\nProblem: ${d.problem}\nPriority: ${d.priority}\nPhoto: ${d.photo?'Attached':'Not provided'}`;
  return ctx.reply(text,Markup.inlineKeyboard([[Markup.button.callback('Submit / አስገባ','report:submit'),Markup.button.callback('Cancel / ሰርዝ','report:cancel')]]));
}
bot.action(/^priority:(low|medium|high|critical)$/, async ctx => { const u=await userByTelegram(ctx.from.id); const s=getSession(ctx.from.id); if(s.flow!=='report'||s.step!=='priority') return ctx.answerCbQuery(); s.data.priority=ctx.match[1]; s.step='photo'; setSession(ctx.from.id,s); await ctx.answerCbQuery(); return ctx.reply(msg(u,'askPhoto')); });
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
    await bot.launch();
    console.log('Amanuel Hospital IT Support Bot is running.');
  }
  catch(err) { console.error('Startup failed:',err); process.exit(1); }
})();
process.once('SIGINT',()=>bot.stop('SIGINT')); process.once('SIGTERM',()=>bot.stop('SIGTERM'));
