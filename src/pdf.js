const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

function generateRequestPdf(req, employee, outPath, technician = null) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const stream = fs.createWriteStream(outPath);
    doc.pipe(stream);
    const fontPath = process.env.PDF_FONT_PATH;
    if (fontPath && fs.existsSync(fontPath)) doc.font(fontPath); else doc.font('Helvetica');
    const line = (label, value) => { doc.fontSize(10).font('Helvetica-Bold').text(label, { continued: true }); doc.font('Helvetica').text(` ${value || '-'}`); };
    doc.fontSize(15).font('Helvetica-Bold').text('AMANUEL MENTAL SPECIALIZED HOSPITAL', { align: 'center' });
    doc.fontSize(10).font('Helvetica').text('INFORMATION TECHNOLOGY & ELECTRONICS MAINTENANCE DEPARTMENT', { align: 'center' });
    doc.moveDown(0.7).fontSize(16).font('Helvetica-Bold').text('IT EQUIPMENT FAILURE / MAINTENANCE REPORT', { align: 'center' });
    doc.moveDown().fontSize(11);
    line('Request No.:', req.request_no); line('Reported:', req.reported_at); line('Status:', req.status.toUpperCase()); line('Priority:', req.priority.toUpperCase());
    doc.moveDown(0.5).fontSize(12).font('Helvetica-Bold').text('A. EMPLOYEE INFORMATION'); doc.moveDown(0.3);
    line('Employee:', employee.full_name); line('Phone:', employee.phone); line('Department:', req.department); line('Location:', req.room_location);
    doc.moveDown(0.5).fontSize(12).font('Helvetica-Bold').text('B. EQUIPMENT INFORMATION'); doc.moveDown(0.3);
    line('Category:', req.equipment_type); line('Equipment:', req.equipment_name); line('Model:', req.model); line('Serial / Asset No.:', req.serial_number || req.asset_tag);
    doc.moveDown(0.5).fontSize(12).font('Helvetica-Bold').text('C. REPORTED PROBLEM'); doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').text(req.problem_description || '-', { width: 500 });
    doc.moveDown(0.5).fontSize(12).font('Helvetica-Bold').text('D. TECHNICAL DIAGNOSIS AND ACTION'); doc.moveDown(0.3);
    line('Assigned technician:', technician?.full_name || '-'); line('Diagnosis:', req.diagnosis); line('Repair performed:', req.repair_actions); line('Parts used:', req.parts_used); line('Technician remarks:', req.technician_remarks);
    doc.moveDown(1.2);
    doc.fontSize(10).font('Helvetica').text('Technician name / signature: ______________________________    Date: ______________');
    doc.moveDown(1).text('Employee confirmation / signature: _________________________    Date: ______________');
    doc.moveDown(1).text('Verified by IT supervisor: __________________________________    Date: ______________');
    doc.moveDown(1).fontSize(8).fillColor('gray').text('System-generated record. Attachments and original approvals should be retained according to hospital procedures.', { align: 'center' });
    doc.end();
    stream.on('finish', () => resolve(outPath)); stream.on('error', reject);
  });
}
module.exports = { generateRequestPdf };
