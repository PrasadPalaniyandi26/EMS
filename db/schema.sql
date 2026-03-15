-- ============================================
-- Expense Management System — Oracle DDL
-- Run as the expense_app user (or auto-run via dbInit.js)
-- ============================================

-- ========== SEQUENCES ==========

CREATE SEQUENCE users_seq START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE transactions_seq START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE categories_seq START WITH 100 INCREMENT BY 1;
CREATE SEQUENCE refresh_tokens_seq START WITH 1 INCREMENT BY 1;

-- ========== TABLES ==========

CREATE TABLE users (
  id            NUMBER PRIMARY KEY,
  username      VARCHAR2(50) NOT NULL UNIQUE,
  email         VARCHAR2(100) NOT NULL UNIQUE,
  password_hash VARCHAR2(255) NOT NULL,
  role          VARCHAR2(10) DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  is_active     NUMBER(1) DEFAULT 1,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE categories (
  id    NUMBER PRIMARY KEY,
  name  VARCHAR2(50) NOT NULL,
  type  VARCHAR2(10) NOT NULL CHECK (type IN ('income', 'expense')),
  icon  VARCHAR2(50)
);

CREATE TABLE transactions (
  id              NUMBER PRIMARY KEY,
  user_id         NUMBER NOT NULL REFERENCES users(id),
  type            VARCHAR2(10) NOT NULL CHECK (type IN ('income', 'expense')),
  amount          NUMBER(12,2) NOT NULL,
  date_recorded   DATE NOT NULL,
  category_id     NUMBER REFERENCES categories(id),
  description     VARCHAR2(500),
  payment_method  VARCHAR2(20) DEFAULT 'cash' CHECK (payment_method IN ('cash','credit_card','debit_card','bank_transfer','other')),
  receipt_path    VARCHAR2(255),
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE refresh_tokens (
  id          NUMBER PRIMARY KEY,
  user_id     NUMBER NOT NULL REFERENCES users(id),
  token_hash  VARCHAR2(255) NOT NULL,
  expires_at  TIMESTAMP NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========== TRIGGERS (auto-increment) ==========

CREATE OR REPLACE TRIGGER users_bi
BEFORE INSERT ON users FOR EACH ROW
BEGIN
  IF :NEW.id IS NULL THEN
    :NEW.id := users_seq.NEXTVAL;
  END IF;
END;
/

CREATE OR REPLACE TRIGGER transactions_bi
BEFORE INSERT ON transactions FOR EACH ROW
BEGIN
  IF :NEW.id IS NULL THEN
    :NEW.id := transactions_seq.NEXTVAL;
  END IF;
END;
/

CREATE OR REPLACE TRIGGER categories_bi
BEFORE INSERT ON categories FOR EACH ROW
BEGIN
  IF :NEW.id IS NULL THEN
    :NEW.id := categories_seq.NEXTVAL;
  END IF;
END;
/

CREATE OR REPLACE TRIGGER refresh_tokens_bi
BEFORE INSERT ON refresh_tokens FOR EACH ROW
BEGIN
  IF :NEW.id IS NULL THEN
    :NEW.id := refresh_tokens_seq.NEXTVAL;
  END IF;
END;
/

CREATE OR REPLACE TRIGGER transactions_bu
BEFORE UPDATE ON transactions FOR EACH ROW
BEGIN
  :NEW.updated_at := CURRENT_TIMESTAMP;
END;
/

-- ========== INDEXES ==========

CREATE INDEX idx_transactions_user ON transactions(user_id);
CREATE INDEX idx_transactions_date ON transactions(date_recorded);
CREATE INDEX idx_transactions_category ON transactions(category_id);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);

-- ========== SEED DATA: Categories ==========

INSERT INTO categories (id, name, type, icon) VALUES (1, 'Salary', 'income', 'briefcase');
INSERT INTO categories (id, name, type, icon) VALUES (2, 'Freelance', 'income', 'laptop');
INSERT INTO categories (id, name, type, icon) VALUES (3, 'Investment', 'income', 'trending-up');
INSERT INTO categories (id, name, type, icon) VALUES (4, 'Other Income', 'income', 'plus-circle');
INSERT INTO categories (id, name, type, icon) VALUES (10, 'Food & Dining', 'expense', 'utensils');
INSERT INTO categories (id, name, type, icon) VALUES (11, 'Transport', 'expense', 'car');
INSERT INTO categories (id, name, type, icon) VALUES (12, 'Utilities', 'expense', 'zap');
INSERT INTO categories (id, name, type, icon) VALUES (13, 'Entertainment', 'expense', 'film');
INSERT INTO categories (id, name, type, icon) VALUES (14, 'Shopping', 'expense', 'shopping-bag');
INSERT INTO categories (id, name, type, icon) VALUES (15, 'Healthcare', 'expense', 'heart');
INSERT INTO categories (id, name, type, icon) VALUES (16, 'Education', 'expense', 'book');
INSERT INTO categories (id, name, type, icon) VALUES (17, 'Rent', 'expense', 'home');
INSERT INTO categories (id, name, type, icon) VALUES (18, 'Insurance', 'expense', 'shield');
INSERT INTO categories (id, name, type, icon) VALUES (19, 'Other Expense', 'expense', 'more-horizontal');

COMMIT;

-- NOTE: Admin user (admin/admin123) is seeded programmatically by dbInit.js
-- because the password must be bcrypt-hashed at runtime.

-- ===== EMS V4 ADDITIONS =====
CREATE SEQUENCE monthly_budget_settings_seq START WITH 1 INCREMENT BY 1;

CREATE TABLE monthly_budget_settings (
  id NUMBER PRIMARY KEY,
  user_id NUMBER NOT NULL REFERENCES users(id),
  period_month NUMBER NOT NULL,
  period_year NUMBER NOT NULL,
  initial_budget NUMBER(12,2) DEFAULT 0,
  last_month_income NUMBER(12,2) DEFAULT 0,
  transaction_budget_limit NUMBER(12,2) DEFAULT 0,
  rollover_enabled NUMBER(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, period_month, period_year)
);

CREATE OR REPLACE TRIGGER monthly_budget_settings_bi
BEFORE INSERT ON monthly_budget_settings FOR EACH ROW
BEGIN
  IF :NEW.id IS NULL THEN
    :NEW.id := monthly_budget_settings_seq.NEXTVAL;
  END IF;
END;
/

CREATE OR REPLACE TRIGGER monthly_budget_settings_bu
BEFORE UPDATE ON monthly_budget_settings FOR EACH ROW
BEGIN
  :NEW.updated_at := CURRENT_TIMESTAMP;
END;
/