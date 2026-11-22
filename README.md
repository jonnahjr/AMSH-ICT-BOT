# Amanuel Mental Specialized Hospital – IT Support Telegram Bot

A Telegram-only bilingual (English / Amharic) IT equipment failure and maintenance workflow. There is **no web dashboard**. Employees, technicians, IT administrators and the storekeeper use Telegram.

## Features included

- Employee onboarding and department/phone registration.
- English and Amharic menu and prompt translations; users can change language at any time.
- Equipment failure reports for desktop computers, laptops, printers, scanners, UPS, CCTV, network equipment and other electronics.
- Problem description, room/location, model, serial/asset number, priority and optional photo.
- Unique request number and automatically generated PDF report sent back in Telegram.
- Automatic technician assignment by equipment specialization and lowest number of active jobs. A request stays pending and administrators are notified if no suitable active technician is registered.
- Technician job list, accept/start/waiting-for-parts statuses, diagnosis, repair actions, parts used, photo evidence and completion.
- Completion PDF and employee repair confirmation.
- Administrator menus for pending/recent requests, technician workload and retrying automatic assignment.
- Administrator commands to register technicians/storekeepers, change roles and deactivate accounts.
- Storekeeper stock receiving, stock view and spare-part issuing linked to a maintenance request.
- Audit log for key actions.
- MySQL persistence; Telegram conversation steps are held in process memory (see production notes).

## Requirements

- Node.js 18 or later
- MySQL 8.0+ (or a compatible MySQL/MariaDB version)
- A Telegram bot token from `@BotFather`
- A Telegram numeric user ID for at least one administrator

## 1. Create the Telegram bot

1. Open Telegram and message `@BotFather`.
2. Send `/newbot`, choose a display name and a unique username ending in `bot`.
3. Copy the token. Keep it private; anyone with the token can control the bot.
4. Start the bot once with `ADMIN_TELEGRAM_IDS` empty, message it from the intended administrator account and send `/myid`. Copy the numeric ID, stop the bot, add that ID to `ADMIN_TELEGRAM_IDS` in `.env`, then restart. Alternatively, obtain the ID through a trusted Telegram ID lookup method.

## 2. Install

```bash
npm install
cp .env.example .env
```

Edit `.env`:

```env
BOT_TOKEN=your_real_token
DB_HOST=localhost
DB_PORT=3306
DB_USER=amanuel_it
DB_PASSWORD=use_a_strong_password
DB_NAME=amanuel_it_support
ADMIN_TELEGRAM_IDS=123456789
PDF_FONT_PATH=./fonts/NotoSansEthiopic-Regular.ttf
```

Create the database and user (run as a MySQL administrator; replace the password):

```sql
CREATE DATABASE IF NOT EXISTS amanuel_it_support CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'amanuel_it'@'localhost' IDENTIFIED BY 'CHANGE_THIS_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX ON amanuel_it_support.* TO 'amanuel_it'@'localhost';
FLUSH PRIVILEGES;
```

Initialize tables:

```bash
npm run db:init
```

Start the bot:

```bash
npm start
```

The bot uses Telegram long polling. Keep the Node.js process running continuously (for example, with the Plesk Node.js application manager or a process manager supported by your hosting plan).

## 3. Register IT staff

The Telegram IDs listed in `ADMIN_TELEGRAM_IDS` become administrators on startup. Each admin should send `/start` to the bot once.

An administrator can register technicians using:

```text
/addtech TELEGRAM_ID Full Name Specialization
```

Examples (specialization keywords are important for automatic assignment):

```text
/addtech 111111111 Abebe Kebede Computer
/addtech 222222222 Hana Bekele Printer
/addtech 333333333 Samuel Tadesse Network
/addtech 444444444 Meron Ali Electronics
/addtech 555555555 Dawit Worku CCTV
```

Register a storekeeper:

```text
/addstorekeeper TELEGRAM_ID Full Name
```

Change a registered user's role:

```text
/setrole TELEGRAM_ID employee
/setrole TELEGRAM_ID technician
/setrole TELEGRAM_ID admin
/setrole TELEGRAM_ID storekeeper
/setrole TELEGRAM_ID department_head
```

Deactivate an account:

```text
/deactivate TELEGRAM_ID
```

Every technician and storekeeper must open the bot and send `/start` after being registered. The technician's Telegram ID must be correct and the technician must not block the bot.

## 4. Automatic assignment logic

- Printer / scanner reports search for active technicians whose specialization contains `printer`, `electronics` or `computer`.
- Desktop / laptop reports search for `computer`, `hardware` or `electronics`.
- Network reports search for `network` or `system`.
- CCTV reports search for `cctv`, `electronics` or `network`.
- UPS / other electronics reports search for `electronics` or `hardware`.
- The matching technician with the fewest open jobs is selected.
- If there is no matching technician, the request stays `pending` and all active admins receive a notification. An admin can use **Pending requests → Retry auto-assign**.

Ensure each technician's specialization is set with one or more of these keywords. Automatic assignment is not a substitute for a supervisor's review of workload and urgency.

## 5. Main Telegram workflows

### Employee
`/start` → register name, phone and department → Report equipment failure → enter equipment, model, serial, location, problem and priority → optionally send a photo → confirm. The bot returns a request number and PDF.

### Technician
`/start` → Technician jobs → open a job → Accept / Start work / Waiting for parts → Diagnosis → repair action → parts used. Use Complete to finish and generate the completion PDF. The employee is asked to confirm the repair.

### Administrator
`/start` → Admin → Pending requests / Recent requests / Technician workload. Use the provisioning commands above to register technicians and storekeepers.

### Storekeeper
`/start` → Storekeeper → Add/update stock, Issue spare part, or View stock. Issuance checks available quantity and can be linked to a request number.

## 6. Amharic PDF font

Bot conversations support Amharic. To ensure Amharic characters also render in generated PDFs, place a licensed Ethiopic-capable TrueType font (for example, Noto Sans Ethiopic Regular) at `fonts/NotoSansEthiopic-Regular.ttf` and set `PDF_FONT_PATH` to that file. If the font is absent, the PDF uses Helvetica, which may not contain Ethiopic glyphs. Obtain fonts from a trusted source and check their license before distribution.

## 7. Plesk deployment (Node.js)

1. Upload and extract the project into your application directory.
2. In Plesk, enable Node.js and select Node.js 18 or later.
3. Set the application root to this project folder and startup file to `app.js`.
4. Add the environment variables from `.env` in Plesk's Node.js environment settings (or use a protected `.env` file if your hosting configuration supports it).
5. Install dependencies using Plesk's **NPM Install** function or `npm install` in the application directory.
6. Create the MySQL database and user in Plesk, update the database environment variables, and run `npm run db:init` from the project directory.
7. Restart the Node.js application and inspect the logs. It should show `Amanuel Hospital IT Support Bot is running.`
8. Keep the app running continuously. This bot uses long polling; do not run two active copies with the same token at the same time.

## 8. Production hardening – important

This is a functional starter implementation and should be tested with a small internal group before hospital-wide use.

- The current multi-step conversation state is held in memory. A restart clears any unfinished form. Submitted requests remain safely in MySQL. For higher availability, move sessions to MySQL or Redis before production rollout.
- Add hospital-approved employee identity verification (for example, staff ID validation against an authorized employee list) before allowing unrestricted employee access.
- Back up MySQL and the `storage/reports` / `storage/uploads` directories regularly. Restrict access to backups.
- The current attachment field records Telegram file IDs; the employee's submitted photo is forwarded to the assigned technician but is not embedded in the PDF. Download and archive evidence locally if hospital policy requires long-term retention.
- Do not send patient names, medical records, diagnoses or other patient information through this bot. Reports should contain equipment and workplace details only.
- Restrict who can access the bot, protect `.env`, rotate exposed tokens immediately, and use strong MySQL passwords with least-privilege permissions.
- Review retention, privacy, approval and electronic-signature requirements with hospital management before official use.
- Review the assignment keywords and priority escalation rules with the IT department.

## Database tables

`users`, `requests`, `maintenance_activities`, `spare_parts`, `spare_transactions`, and `audit_logs`.
