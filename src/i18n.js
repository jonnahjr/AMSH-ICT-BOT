const messages = {
  en: {
    welcome: 'Welcome to Amanuel Mental Specialized Hospital IT Support. Choose an option:',
    registerName: 'Please enter your full name:', registerPhone: 'Please share your phone number or type it:', registerEmail: 'Please enter your email address (or type - to skip):',
    registerDept: 'Enter your department / unit:', registered: 'Registration completed. You can now submit IT support requests.',
    menuReport: '📝 Report equipment failure', menuMine: '📋 My requests', menuTrack: '🔎 Track request', menuLanguage: '🌐 Change language',
    askCategory: 'Select equipment category:', askName: 'Enter equipment name:', askModel: 'Enter model (or type -):', askSerial: 'Enter serial number / asset tag (or type -):',
    askRoom: 'Enter building / room / location:', askProblem: 'Describe the problem clearly:', askPriority: 'Select priority:', askPhoto: 'Send a photo of the equipment/problem, or type SKIP:',
    confirm: 'Please review your report:', submitted: 'Your report has been submitted. Request number:', cancelled: 'Cancelled.',
    noRequests: 'You have no maintenance requests yet.', invalid: 'Please use the buttons or enter the requested information.',
    adminOnly: 'This function is for authorized administrators only.', techOnly: 'This function is for authorized technicians only.', storeOnly: 'This function is for the storekeeper only.',
    noJobs: 'You have no open assignments.', myJobs: 'Your assigned maintenance requests:',
    diagnosis: 'Enter diagnosis / cause of failure:', repair: 'Describe the repair or troubleshooting performed:', parts: 'Enter parts used (or type NONE):',
    updated: 'Maintenance record updated.', done: 'Request marked completed and PDF report generated.',
    employeeConfirm: 'Has the equipment started working?', thanks: 'Thank you. Your feedback has been recorded.',
    noTech: 'No available technician with the required specialization. The request remains pending for administrator attention.',
    assigned: 'New maintenance assignment:',
    adminMenu: 'Administrator menu:', adminPending: 'Pending requests', adminAll: 'Recent requests', adminTechs: 'Technician workload',
    storeMenu: 'Storekeeper menu:', storeAdd: 'Add / update stock', storeIssue: 'Issue spare part', storeView: 'View stock',
    askPart: 'Enter spare part name:', askQty: 'Enter quantity:', askUnit: 'Enter unit (pcs, box, meter, etc.):', stockUpdated: 'Stock updated.',
    askReq: 'Enter request number for this issue (or - if not linked):', issued: 'Spare part issued and stock updated.',
    help: 'Use /start to open the menu. Contact IT administration if you need access.'
  },
  am: {
    welcome: 'ወደ አማኑኤል ልዩ የአእምሮ ሆስፒታል የአይቲ ድጋፍ በደህና መጡ። አማራጭ ይምረጡ፦',
    registerName: 'ሙሉ ስምዎን ያስገቡ፦', registerPhone: 'ስልክ ቁጥርዎን ያስገቡ ወይም ያጋሩ፦', registerEmail: 'የኢሜይል አድራሻዎን ያስገቡ (ከሌለ - ይጻፉ)፦',
    registerDept: 'የሚሰሩበትን የሥራ ክፍል ያስገቡ፦', registered: 'ምዝገባዎ ተጠናቋል። የአይቲ ድጋፍ ጥያቄ ማቅረብ ይችላሉ።',
    menuReport: '📝 የመሣሪያ ብልሽት ሪፖርት', menuMine: '📋 የእኔ ጥያቄዎች', menuTrack: '🔎 ጥያቄ መከታተያ', menuLanguage: '🌐 ቋንቋ ቀይር',
    askCategory: 'የመሣሪያውን ዓይነት ይምረጡ፦', askName: 'የመሣሪያውን ስም ያስገቡ፦', askModel: 'ሞዴሉን ያስገቡ (ከሌለ - ይጻፉ)፦', askSerial: 'ሲሪያል ቁጥር / የንብረት መለያ (ከሌለ -)፦',
    askRoom: 'ሕንፃ / ክፍል / ቦታ ያስገቡ፦', askProblem: 'ችግሩን በግልጽ ሁኔታ ይግለጹ፦', askPriority: 'የቅድሚያ ደረጃ ይምረጡ፦', askPhoto: 'የመሣሪያውን ወይም የችግሩን ፎቶ ይላኩ፤ ወይም SKIP ይጻፉ፦',
    confirm: 'ሪፖርትዎን ያረጋግጡ፦', submitted: 'ሪፖርትዎ ተልኳል። የጥያቄ ቁጥር፦', cancelled: 'ተሰርዟል።',
    noRequests: 'እስካሁን የጥገና ጥያቄ የለዎትም።', invalid: 'እባክዎ አማራጮቹን ይጠቀሙ ወይም የተጠየቀውን መረጃ ያስገቡ።',
    adminOnly: 'ይህ ተግባር ለተፈቀደላቸው አስተዳዳሪዎች ብቻ ነው።', techOnly: 'ይህ ተግባር ለአይቲ ቴክኒሻኖች ብቻ ነው።', storeOnly: 'ይህ ተግባር ለንብረት ጠባቂው ብቻ ነው።',
    noJobs: 'ክፍት የተመደበ ሥራ የለዎትም።', myJobs: 'የተመደቡልዎት የጥገና ጥያቄዎች፦',
    diagnosis: 'የብልሽቱን መንስኤ / ምርመራ ያስገቡ፦', repair: 'የተከናወነውን ጥገና ይግለጹ፦', parts: 'የተጠቀሙትን መለዋወጫ ያስገቡ (ከሌለ NONE)፦',
    updated: 'የጥገና መዝገቡ ተዘምኗል።', done: 'ጥያቄው ተጠናቋል፤ የጥገና ሪፖርት PDF ተዘጋጅቷል።',
    employeeConfirm: 'መሣሪያው አሁን እየሰራ ነው?', thanks: 'እናመሰግናለን። ምላሽዎ ተመዝግቧል።',
    noTech: 'ተስማሚ የሙያ ዘርፍ ያለው ንቁ ቴክኒሻን አልተገኘም። ጥያቄው ለአስተዳዳሪ እርምጃ በጥበቃ ላይ ይቆያል።',
    assigned: 'አዲስ የጥገና ሥራ ተመድቦልዎታል፦', adminMenu: 'የአስተዳዳሪ ምናሌ፦', adminPending: 'በመጠባበቅ ላይ ያሉ ጥያቄዎች', adminAll: 'የቅርብ ጥያቄዎች', adminTechs: 'የቴክኒሻኖች የሥራ ጫና',
    storeMenu: 'የንብረት ጠባቂ ምናሌ፦', storeAdd: 'መለዋወጫ ክምችት ጨምር / አዘምን', storeIssue: 'መለዋወጫ አውጣ', storeView: 'ክምችት አሳይ',
    askPart: 'የመለዋወጫውን ስም ያስገቡ፦', askQty: 'መጠኑን ያስገቡ፦', askUnit: 'መለኪያውን ያስገቡ (ቁጥር፣ ሳጥን፣ ሜትር...)፦', stockUpdated: 'ክምችቱ ተዘምኗል።', askReq: 'የጥያቄ ቁጥር ያስገቡ (ካልተያያዘ -)፦', issued: 'መለዋወጫው ተሰጥቷል፤ ክምችቱ ተዘምኗል።', help: '/start በመጠቀም ምናሌውን ይክፈቱ። መዳረሻ ካስፈለገዎት የአይቲ አስተዳደርን ያነጋግሩ።'
  }
};
function t(lang, key) { return (messages[lang] || messages.en)[key] || messages.en[key] || key; }
module.exports = { t };
