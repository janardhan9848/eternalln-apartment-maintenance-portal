-- Apartment Maintenance Portal
-- MySQL 8.4 LTS
-- Run this script in MySQL Workbench as a database administrator.

CREATE DATABASE IF NOT EXISTS apartment_maintenance_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE apartment_maintenance_db;

CREATE TABLE IF NOT EXISTS apartments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL,
  timezone VARCHAR(60) NOT NULL DEFAULT 'Asia/Kolkata',
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS flats (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  apartment_id BIGINT UNSIGNED NOT NULL,
  floor_number TINYINT UNSIGNED NOT NULL,
  flat_number VARCHAR(10) NOT NULL,
  occupancy_status ENUM('occupied','vacant','inactive') NOT NULL DEFAULT 'occupied',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_flats_apartment FOREIGN KEY (apartment_id)
    REFERENCES apartments(id) ON DELETE RESTRICT,
  CONSTRAINT uq_apartment_flat UNIQUE (apartment_id, flat_number),
  INDEX idx_flats_floor (apartment_id, floor_number)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS portal_residents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name VARCHAR(120) NOT NULL,
  flat_number VARCHAR(10) NOT NULL,
  phone VARCHAR(20) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT uq_portal_resident_flat UNIQUE (flat_number)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS portal_expenses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(255) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  expense_date DATE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT chk_portal_expense_amount CHECK (amount > 0),
  INDEX idx_portal_expenses_date (expense_date)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS portal_salary_payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  staff_name VARCHAR(120) NOT NULL,
  salary_month VARCHAR(40) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  expense_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT uq_portal_salary_month UNIQUE (salary_month),
  CONSTRAINT chk_portal_salary_amount CHECK (amount > 0)
) ENGINE=InnoDB;

-- One login per flat in the first release. Admin/watchman users have flat_id = NULL.
CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  apartment_id BIGINT UNSIGNED NOT NULL,
  flat_id BIGINT UNSIGNED NULL,
  full_name VARCHAR(120) NOT NULL,
  phone VARCHAR(20) NULL,
  email VARCHAR(254) NULL,
  username VARCHAR(50) NOT NULL,
  password_hash VARCHAR(255) NULL,
  role ENUM('admin','resident','watchman') NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_users_apartment FOREIGN KEY (apartment_id)
    REFERENCES apartments(id) ON DELETE RESTRICT,
  CONSTRAINT fk_users_flat FOREIGN KEY (flat_id)
    REFERENCES flats(id) ON DELETE RESTRICT,
  CONSTRAINT uq_users_username UNIQUE (username),
  CONSTRAINT uq_users_flat UNIQUE (flat_id),
  INDEX idx_users_apartment_role (apartment_id, role)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS maintenance_bills (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  flat_id BIGINT UNSIGNED NOT NULL,
  billing_month DATE NOT NULL COMMENT 'Use first calendar day of the billing month',
  maintenance_amount DECIMAL(10,2) NOT NULL,
  previous_due DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  late_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  total_amount DECIMAL(10,2) NOT NULL,
  due_date DATE NOT NULL,
  status ENUM('draft','published','partially_paid','paid','void') NOT NULL DEFAULT 'draft',
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_bills_flat FOREIGN KEY (flat_id)
    REFERENCES flats(id) ON DELETE RESTRICT,
  CONSTRAINT fk_bills_creator FOREIGN KEY (created_by)
    REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT uq_flat_billing_month UNIQUE (flat_id, billing_month),
  CONSTRAINT chk_bill_amounts CHECK (
    maintenance_amount >= 0 AND previous_due >= 0 AND late_fee >= 0 AND total_amount >= 0
  ),
  INDEX idx_bills_status_due (status, due_date)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  bill_id BIGINT UNSIGNED NOT NULL,
  flat_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  gateway VARCHAR(30) NULL,
  gateway_order_id VARCHAR(100) NULL,
  gateway_payment_id VARCHAR(100) NULL,
  idempotency_key VARCHAR(100) NOT NULL,
  status ENUM('created','authorized','captured','failed','refunded') NOT NULL DEFAULT 'created',
  paid_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_payments_bill FOREIGN KEY (bill_id)
    REFERENCES maintenance_bills(id) ON DELETE RESTRICT,
  CONSTRAINT fk_payments_flat FOREIGN KEY (flat_id)
    REFERENCES flats(id) ON DELETE RESTRICT,
  CONSTRAINT uq_payment_idempotency UNIQUE (idempotency_key),
  CONSTRAINT uq_gateway_order UNIQUE (gateway_order_id),
  CONSTRAINT uq_gateway_payment UNIQUE (gateway_payment_id),
  CONSTRAINT chk_payment_amount CHECK (amount > 0),
  INDEX idx_payments_bill_status (bill_id, status),
  INDEX idx_payments_flat_date (flat_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS expenses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  apartment_id BIGINT UNSIGNED NOT NULL,
  category ENUM('watchman_salary','electricity','water','cleaning','lift_maintenance','repairs','security','other') NOT NULL,
  description VARCHAR(500) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  payment_date DATE NULL,
  payment_method ENUM('bank_transfer','upi','cash','other') NULL,
  reference_number VARCHAR(100) NULL,
  receipt_object_key VARCHAR(500) NULL,
  status ENUM('pending','paid','cancelled') NOT NULL DEFAULT 'pending',
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_expenses_apartment FOREIGN KEY (apartment_id)
    REFERENCES apartments(id) ON DELETE RESTRICT,
  CONSTRAINT fk_expenses_creator FOREIGN KEY (created_by)
    REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT chk_expense_amount CHECK (amount > 0),
  INDEX idx_expenses_apartment_date (apartment_id, payment_date),
  INDEX idx_expenses_category_status (category, status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS staff (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  apartment_id BIGINT UNSIGNED NOT NULL,
  full_name VARCHAR(120) NOT NULL,
  role_title VARCHAR(80) NOT NULL DEFAULT 'Watchman',
  phone VARCHAR(20) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_staff_apartment FOREIGN KEY (apartment_id)
    REFERENCES apartments(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS staff_payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  staff_id BIGINT UNSIGNED NOT NULL,
  expense_id BIGINT UNSIGNED NULL,
  payment_month DATE NOT NULL COMMENT 'Use first calendar day of salary month',
  amount DECIMAL(10,2) NOT NULL,
  status ENUM('pending','paid') NOT NULL DEFAULT 'pending',
  paid_at DATETIME NULL,
  bank_reference VARCHAR(100) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_staff_payments_staff FOREIGN KEY (staff_id)
    REFERENCES staff(id) ON DELETE RESTRICT,
  CONSTRAINT fk_staff_payments_expense FOREIGN KEY (expense_id)
    REFERENCES expenses(id) ON DELETE RESTRICT,
  CONSTRAINT uq_staff_salary_month UNIQUE (staff_id, payment_month),
  CONSTRAINT uq_staff_salary_expense UNIQUE (expense_id),
  CONSTRAINT chk_staff_payment_amount CHECK (amount > 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  apartment_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id BIGINT UNSIGNED NULL,
  details JSON NULL,
  ip_address VARCHAR(45) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_audit_apartment FOREIGN KEY (apartment_id)
    REFERENCES apartments(id) ON DELETE RESTRICT,
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_audit_apartment_date (apartment_id, created_at),
  INDEX idx_audit_entity (entity_type, entity_id)
) ENGINE=InnoDB;

-- Create the apartment only if it does not already exist.
INSERT INTO apartments (name)
SELECT 'Apartment Maintenance Portal'
WHERE NOT EXISTS (
  SELECT 1 FROM apartments WHERE name = 'Apartment Maintenance Portal'
);

SET @apartment_id = (
  SELECT id FROM apartments
  WHERE name = 'Apartment Maintenance Portal'
  ORDER BY id
  LIMIT 1
);

INSERT IGNORE INTO flats (apartment_id, floor_number, flat_number) VALUES
(@apartment_id, 1, '101'),
(@apartment_id, 1, '102'),
(@apartment_id, 2, '201'),
(@apartment_id, 2, '202'),
(@apartment_id, 3, '301'),
(@apartment_id, 3, '302'),
(@apartment_id, 4, '401'),
(@apartment_id, 4, '402'),
(@apartment_id, 5, '501'),
(@apartment_id, 5, '502');

-- Initial portal records match the original local dashboard examples.
INSERT IGNORE INTO portal_residents (full_name, flat_number) VALUES
('Resident 101', '101'),
('Resident 102', '102');

INSERT INTO portal_expenses (title, amount, expense_date)
SELECT 'Cleaning', 1500.00, '2026-11-01'
WHERE NOT EXISTS (SELECT 1 FROM portal_expenses);

-- No default admin password is inserted. Create admin credentials in Phase 2
-- using a password-hashing library and a one-time setup process.
