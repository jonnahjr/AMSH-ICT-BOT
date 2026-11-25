const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

function generateRequestPdf(req, employee, outPath, technician = null) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const stream = fs.createWriteStream(outPath);
    doc.pipe(stream);
    const fontPath = process.env.PDF_FONT_PATH;
    if (fontPath && fs.existsSync(fontPath)) doc.font(fontPath); else doc.font('Helvetica');

    const W = doc.page.width - 80;
    const X = 40;

    // Header Banner
    doc.rect(X, 36, W, 62).fill('#0f4c81');
    doc.fillColor('#ffffff').fontSize(14).font('Helvetica-Bold')
      .text('AMANUEL MENTAL SPECIALIZED HOSPITAL', X + 14, 48, { width: W - 28, align: 'center' });
    doc.fontSize(9.5).font('Helvetica')
      .text('INFORMATION TECHNOLOGY & ELECTRONICS MAINTENANCE DEPARTMENT', X + 14, 67, { width: W - 28, align: 'center' });
    doc.fontSize(10.5).font('Helvetica-Bold')
      .text('IT EQUIPMENT FAILURE & MAINTENANCE REPORT', X + 14, 81, { width: W - 28, align: 'center' });

    // Meta bar (Request No, Status, Priority, Date)
    let y = 108;
    doc.rect(X, y, W, 38).fillAndStroke('#f1f5f9', '#cbd5e1');
    doc.fillColor('#0f172a').fontSize(9.5).font('Helvetica-Bold').text('Request No:', X + 10, y + 7, { continued: true });
    doc.font('Helvetica').text(` ${req.request_no || '-'}`);
    doc.font('Helvetica-Bold').text('Reported:', X + 280, y + 7, { continued: true });
    doc.font('Helvetica').text(` ${req.reported_at ? String(req.reported_at).slice(0, 24) : '-'}`);
    doc.font('Helvetica-Bold').text('Status:', X + 10, y + 22, { continued: true });
    doc.font('Helvetica').text(` ${String(req.status || '-').toUpperCase()}`);
    doc.font('Helvetica-Bold').text('Priority:', X + 280, y + 22, { continued: true });
    doc.font('Helvetica').text(` ${String(req.priority || '-').toUpperCase()}`);

    y += 50;
    const sectionHeader = (title) => {
      doc.rect(X, y, W, 20).fill('#e2e8f0');
      doc.fillColor('#0f4c81').fontSize(10.5).font('Helvetica-Bold').text(title, X + 8, y + 5);
      y += 24;
      doc.fillColor('#1e293b');
    };
    const kv = (label, val, col2Label = null, col2Val = null) => {
      doc.fontSize(9.5).font('Helvetica-Bold').text(label, X + 8, y, { continued: true });
      doc.font('Helvetica').text(` ${val || '-'}`, { width: col2Label ? 245 : W - 16 });
      if (col2Label) {
        doc.font('Helvetica-Bold').text(col2Label, X + 270, y, { continued: true });
        doc.font('Helvetica').text(` ${col2Val || '-'}`, { width: 225 });
      }
      y += 16;
    };

    sectionHeader('A. APPLICANT / EMPLOYEE INFORMATION');
    kv('Full Name:', employee?.full_name || req.employee_name, 'Phone:', employee?.phone || req.employee_phone);
    kv('Email:', employee?.email || req.employee_email || 'Not provided', 'Telegram ID:', employee?.telegram_id || req.employee_tg);
    kv('Username:', employee?.telegram_username || req.employee_username || 'Not set', 'Department:', req.department);
    kv('Location / Room:', req.room_location);

    y += 6;
    sectionHeader('B. EQUIPMENT INFORMATION');
    kv('Category:', req.equipment_type, 'Equipment:', req.equipment_name);
    kv('Model:', req.model, 'Serial / Asset:', req.serial_number || req.asset_tag);

    y += 6;
    sectionHeader('C. REPORTED PROBLEM');
    doc.fontSize(9.5).font('Helvetica').text(req.problem_description || '-', X + 8, y, { width: W - 16 });
    y = doc.y + 12;

    sectionHeader('D. TECHNICAL DIAGNOSIS & REPAIR ACTION');
    kv('Assigned Technician:', technician?.full_name || req.technician_name || 'Unassigned', 'Tech Phone:', technician?.phone || req.technician_phone || '-');
    kv('Diagnosis:', req.diagnosis);
    kv('Repair Action:', req.repair_actions);
    kv('Parts Used:', req.parts_used);
    kv('Remarks:', req.technician_remarks);
    kv('Employee Confirmation:', req.employee_confirmation);

    y += 18;
    doc.moveTo(X, y).lineTo(X + W, y).strokeColor('#cbd5e1').stroke();
    y += 14;
    doc.fillColor('#0f172a').fontSize(9.5).font('Helvetica');
    doc.text('Technician Name & Signature: ___________________________     Date: ______________', X, y);
    y += 24;
    doc.text('Applicant / Employee Signature: ________________________     Date: ______________', X, y);
    y += 24;
    doc.text('Verified by IT Supervisor: _____________________________     Date: ______________', X, y);

    doc.fontSize(8).fillColor('#64748b')
      .text('System-generated official IT maintenance record — Amanuel Mental Specialized Hospital.', X, doc.page.height - 48, { width: W, align: 'center' });

    doc.end();
    stream.on('finish', () => resolve(outPath));
    stream.on('error', reject);
  });
}

module.exports = { generateRequestPdf };
