USE amanuel_it_support;
CREATE TABLE IF NOT EXISTS users (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 telegram_id BIGINT NOT NULL UNIQUE,
 full_name VARCHAR(160) NOT NULL,
 phone VARCHAR(40) NULL,
 email VARCHAR(160) NULL,
 department VARCHAR(160) NULL,
 role ENUM('employee','technician','admin','storekeeper','department_head') NOT NULL DEFAULT 'employee',
 specialization VARCHAR(120) NULL,
 is_active TINYINT(1) NOT NULL DEFAULT 1,
 language ENUM('en','am') NOT NULL DEFAULT 'en',
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS requests (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 request_no VARCHAR(40) NOT NULL UNIQUE,
 employee_id BIGINT UNSIGNED NOT NULL,
 equipment_type VARCHAR(80) NOT NULL,
 equipment_name VARCHAR(160) NOT NULL,
 model VARCHAR(160) NULL,
 serial_number VARCHAR(160) NULL,
 asset_tag VARCHAR(100) NULL,
 department VARCHAR(160) NOT NULL,
 room_location VARCHAR(160) NULL,
 problem_description TEXT NOT NULL,
 priority ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
 status ENUM('pending','assigned','accepted','in_progress','waiting_parts','completed','unresolved','cancelled') NOT NULL DEFAULT 'pending',
 assigned_technician_id BIGINT UNSIGNED NULL,
 attachment_file_id VARCHAR(255) NULL,
 diagnosis TEXT NULL,
 repair_actions TEXT NULL,
 parts_used TEXT NULL,
 technician_remarks TEXT NULL,
 employee_confirmation ENUM('pending','working','still_failing') NOT NULL DEFAULT 'pending',
 reported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 assigned_at DATETIME NULL,
 completed_at DATETIME NULL,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 CONSTRAINT fk_req_employee FOREIGN KEY (employee_id) REFERENCES users(id),
 CONSTRAINT fk_req_technician FOREIGN KEY (assigned_technician_id) REFERENCES users(id),
 INDEX idx_status (status), INDEX idx_technician_status (assigned_technician_id,status), INDEX idx_employee (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS maintenance_activities (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 request_id BIGINT UNSIGNED NOT NULL,
 actor_user_id BIGINT UNSIGNED NOT NULL,
 activity_type VARCHAR(60) NOT NULL,
 notes TEXT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (request_id) REFERENCES requests(id),
 FOREIGN KEY (actor_user_id) REFERENCES users(id),
 INDEX idx_activity_request (request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS spare_parts (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 item_name VARCHAR(160) NOT NULL UNIQUE,
 quantity DECIMAL(12,2) NOT NULL DEFAULT 0,
 unit VARCHAR(30) NOT NULL DEFAULT 'pcs',
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS spare_transactions (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 part_id BIGINT UNSIGNED NOT NULL,
 request_id BIGINT UNSIGNED NULL,
 actor_user_id BIGINT UNSIGNED NOT NULL,
 transaction_type ENUM('received','issued','adjustment') NOT NULL,
 quantity DECIMAL(12,2) NOT NULL,
 notes VARCHAR(500) NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (part_id) REFERENCES spare_parts(id),
 FOREIGN KEY (request_id) REFERENCES requests(id),
 FOREIGN KEY (actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS audit_logs (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 actor_user_id BIGINT UNSIGNED NULL,
 action VARCHAR(100) NOT NULL,
 entity_type VARCHAR(60) NULL,
 entity_id BIGINT UNSIGNED NULL,
 details TEXT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (actor_user_id) REFERENCES users(id),
 INDEX idx_audit_entity (entity_type,entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
