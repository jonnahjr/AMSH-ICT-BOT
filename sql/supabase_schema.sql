-- Amanuel Mental Specialized Hospital IT Support Bot - Supabase Postgres Schema

-- 1. Enum Types
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('employee', 'technician', 'admin', 'storekeeper', 'department_head');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE user_lang AS ENUM ('en', 'am');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE request_priority AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE request_status AS ENUM ('pending', 'assigned', 'accepted', 'in_progress', 'waiting_parts', 'completed', 'unresolved', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE confirmation_status AS ENUM ('pending', 'working', 'still_failing');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE spare_tx_type AS ENUM ('received', 'issued', 'adjustment');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Users Table
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    telegram_id BIGINT NOT NULL UNIQUE,
    full_name VARCHAR(160) NOT NULL,
    phone VARCHAR(40) NULL,
    email VARCHAR(160) NULL,
    department VARCHAR(160) NULL,
    role user_role NOT NULL DEFAULT 'employee',
    specialization VARCHAR(120) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    language user_lang NOT NULL DEFAULT 'en',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. Requests Table
CREATE TABLE IF NOT EXISTS requests (
    id BIGSERIAL PRIMARY KEY,
    request_no VARCHAR(40) NOT NULL UNIQUE,
    employee_id BIGINT NOT NULL REFERENCES users(id),
    equipment_type VARCHAR(80) NOT NULL,
    equipment_name VARCHAR(160) NOT NULL,
    model VARCHAR(160) NULL,
    serial_number VARCHAR(160) NULL,
    asset_tag VARCHAR(100) NULL,
    department VARCHAR(160) NOT NULL,
    room_location VARCHAR(160) NULL,
    problem_description TEXT NOT NULL,
    priority request_priority NOT NULL DEFAULT 'medium',
    status request_status NOT NULL DEFAULT 'pending',
    assigned_technician_id BIGINT NULL REFERENCES users(id),
    attachment_file_id VARCHAR(255) NULL,
    diagnosis TEXT NULL,
    repair_actions TEXT NULL,
    parts_used TEXT NULL,
    technician_remarks TEXT NULL,
    employee_confirmation confirmation_status NOT NULL DEFAULT 'pending',
    reported_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    assigned_at TIMESTAMPTZ NULL,
    completed_at TIMESTAMPTZ NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_tech_status ON requests(assigned_technician_id, status);
CREATE INDEX IF NOT EXISTS idx_requests_employee ON requests(employee_id);

-- 4. Maintenance Activities
CREATE TABLE IF NOT EXISTS maintenance_activities (
    id BIGSERIAL PRIMARY KEY,
    request_id BIGINT NOT NULL REFERENCES requests(id),
    actor_user_id BIGINT NOT NULL REFERENCES users(id),
    activity_type VARCHAR(60) NOT NULL,
    notes TEXT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_activity_request ON maintenance_activities(request_id);

-- 5. Spare Parts
CREATE TABLE IF NOT EXISTS spare_parts (
    id BIGSERIAL PRIMARY KEY,
    item_name VARCHAR(160) NOT NULL UNIQUE,
    quantity NUMERIC(12,2) NOT NULL DEFAULT 0,
    unit VARCHAR(30) NOT NULL DEFAULT 'pcs',
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 6. Spare Transactions
CREATE TABLE IF NOT EXISTS spare_transactions (
    id BIGSERIAL PRIMARY KEY,
    part_id BIGINT NOT NULL REFERENCES spare_parts(id),
    request_id BIGINT NULL REFERENCES requests(id),
    actor_user_id BIGINT NOT NULL REFERENCES users(id),
    transaction_type spare_tx_type NOT NULL,
    quantity NUMERIC(12,2) NOT NULL,
    notes VARCHAR(500) NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 7. Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    actor_user_id BIGINT NULL REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(60) NULL,
    entity_id BIGINT NULL,
    details TEXT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);

-- 8. Auto-update updated_at triggers
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_requests_updated_at ON requests;
CREATE TRIGGER trg_requests_updated_at
BEFORE UPDATE ON requests
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_spare_parts_updated_at ON spare_parts;
CREATE TRIGGER trg_spare_parts_updated_at
BEFORE UPDATE ON spare_parts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

