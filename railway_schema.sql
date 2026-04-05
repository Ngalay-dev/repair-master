

-- =========================
-- USERS
-- =========================
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role ENUM('admin', 'engineer', 'coworker') NOT NULL DEFAULT 'coworker',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================
-- REPAIRS
-- =========================
CREATE TABLE repairs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    repair_id VARCHAR(30) NOT NULL UNIQUE,
    client_name VARCHAR(100) NOT NULL,
    client_email VARCHAR(255) NOT NULL,
    laptop_brand VARCHAR(100) DEFAULT 'Apple',
    laptop_model VARCHAR(100) NOT NULL,
    serial_number VARCHAR(100),
    issue_description TEXT NOT NULL,
    status ENUM('Waiting for approval', 'In progress', 'Finished') NOT NULL DEFAULT 'Waiting for approval',
    storage_location VARCHAR(100),
    created_by INT NOT NULL,
    updated_by INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (updated_by) REFERENCES users(id)
);

-- =========================
-- REPAIR NOTES
-- =========================
CREATE TABLE repair_notes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    repair_id INT NOT NULL,
    status_at_time ENUM('Waiting for approval', 'In progress', 'Finished') NOT NULL,
    note_text TEXT NOT NULL,
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (repair_id) REFERENCES repairs(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- =========================
-- REPAIR HISTORY
-- =========================
CREATE TABLE repair_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    repair_id INT NOT NULL,
    old_status ENUM('Waiting for approval', 'In progress', 'Finished') DEFAULT NULL,
    new_status ENUM('Waiting for approval', 'In progress', 'Finished') NOT NULL,
    changed_by INT NOT NULL,
    change_note TEXT,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (repair_id) REFERENCES repairs(id) ON DELETE CASCADE,
    FOREIGN KEY (changed_by) REFERENCES users(id)
);

-- =========================
-- NOTIFICATIONS
-- =========================
CREATE TABLE notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    repair_id INT NOT NULL,
    recipient_email VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    sent_status ENUM('Pending', 'Sent', 'Failed') NOT NULL DEFAULT 'Pending',
    sent_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (repair_id) REFERENCES repairs(id) ON DELETE CASCADE
);

-- =========================
-- SAMPLE USERS
-- =========================
INSERT INTO users (full_name, email, password, role)
VALUES
('Admin User', 'admin@uwcsea.edu.sg', 'admin123', 'admin'),
('Onsite Engineer', 'engineer@uwcsea.edu.sg', 'engineer123', 'engineer'),
('Coworker User', 'coworker@uwcsea.edu.sg', 'coworker123', 'coworker');

-- =========================
-- SAMPLE REPAIRS
-- =========================
INSERT INTO repairs (
    repair_id,
    client_name,
    client_email,
    laptop_brand,
    laptop_model,
    serial_number,
    issue_description,
    status,
    storage_location,
    created_by,
    updated_by
)
VALUES
(
    'REP-0001',
    'Student A',
    'studentA@uwcsea.edu.sg',
    'Apple',
    'MacBook Air M1',
    'SN123456',
    'Screen cracked and not displaying.',
    'Waiting for approval',
    'Shelf A1',
    2,
    2
),
(
    'REP-0002',
    'Student B',
    'studentB@uwcsea.edu.sg',
    'Apple',
    'MacBook Pro 13',
    'SN654321',
    'Battery draining quickly.',
    'In progress',
    'Shelf B2',
    2,
    2
);

-- =========================
-- SAMPLE NOTES
-- =========================
INSERT INTO repair_notes (repair_id, status_at_time, note_text, created_by)
VALUES
(1, 'Waiting for approval', 'Diagnosis done, waiting for approval.', 2),
(2, 'In progress', 'Battery replacement started.', 2);

-- =========================
-- SAMPLE HISTORY
-- =========================
INSERT INTO repair_history (repair_id, old_status, new_status, changed_by, change_note)
VALUES
(1, NULL, 'Waiting for approval', 2, 'Repair created'),
(2, NULL, 'Waiting for approval', 2, 'Repair created'),
(2, 'Waiting for approval', 'In progress', 2, 'Approved and started repair');