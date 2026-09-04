CREATE TABLE IF NOT EXISTS departments (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    head_doctor VARCHAR(150),
    contact_number VARCHAR(20),
    location VARCHAR(150),
    status ENUM('active','inactive') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS doctors (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    doctor_id VARCHAR(20) UNIQUE,
    name VARCHAR(150) NOT NULL,
    department VARCHAR(100) NOT NULL,
    specialization VARCHAR(150) NOT NULL,
    qualification VARCHAR(180),
    experience DECIMAL(5,1),
    phone VARCHAR(20) NOT NULL UNIQUE,
    email VARCHAR(180) NOT NULL UNIQUE,
    status ENUM('available','unavailable','on_leave') NOT NULL DEFAULT 'available',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_doctors_department (department),
    INDEX idx_doctors_status (status)
);

CREATE TABLE IF NOT EXISTS patients (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    patient_id VARCHAR(20) UNIQUE,
    full_name VARCHAR(150) NOT NULL,
    date_of_birth DATE NOT NULL,
    gender ENUM('Male','Female','Other') NOT NULL,
    mobile VARCHAR(20) NOT NULL UNIQUE,
    email VARCHAR(180) UNIQUE,
    blood_group VARCHAR(5),
    address VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    pincode VARCHAR(10) NOT NULL,
    emergency_name VARCHAR(150),
    emergency_mobile VARCHAR(20),
    emergency_relationship VARCHAR(50),
    allergies VARCHAR(255),
    preferred_department VARCHAR(100),
    preferred_doctor VARCHAR(150),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_patients_name (full_name),
    INDEX idx_patients_email (email),
    INDEX idx_patients_patient_id (patient_id),
    INDEX idx_patients_mobile (mobile)
);

CREATE TABLE IF NOT EXISTS appointments (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    patient_id INT UNSIGNED NULL,
    patient_name VARCHAR(150) NOT NULL,
    mobile VARCHAR(20) NOT NULL,
    email VARCHAR(180),
    department VARCHAR(100) NOT NULL,
    doctor VARCHAR(150) NOT NULL,
    appointment_date DATE NOT NULL,
    appointment_time VARCHAR(30) NOT NULL,
    reason VARCHAR(500) NOT NULL,
    status ENUM('pending','confirmed','completed','cancelled') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_appointment_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL,
    INDEX idx_appointments_date (appointment_date),
    INDEX idx_appointments_status (status),
    INDEX idx_appointments_doctor (doctor),
    UNIQUE KEY uq_doctor_slot (doctor, appointment_date, appointment_time, status)
);

CREATE TABLE IF NOT EXISTS medical_records (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    patient_id INT UNSIGNED NOT NULL,
    record_type ENUM('consultation','prescription','lab','report') NOT NULL DEFAULT 'consultation',
    record_date DATE NOT NULL,
    doctor VARCHAR(150),
    department VARCHAR(100),
    diagnosis VARCHAR(255),
    doctor_notes TEXT,
    prescription VARCHAR(255),
    medicines VARCHAR(255),
    dosage VARCHAR(120),
    frequency VARCHAR(120),
    duration VARCHAR(120),
    instructions TEXT,
    lab_test VARCHAR(180),
    lab_report VARCHAR(255),
    medical_report VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_medical_record_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
    INDEX idx_medical_records_patient_date (patient_id, record_date),
    INDEX idx_medical_records_type (record_type)
);

CREATE TABLE IF NOT EXISTS consultations (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    consultation_id VARCHAR(24) UNIQUE,
    patient_id INT UNSIGNED NOT NULL,
    doctor_id INT UNSIGNED,
    consultation_date DATE NOT NULL,
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_consultation_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE RESTRICT,
    CONSTRAINT fk_consultation_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE SET NULL,
    INDEX idx_consultations_patient (patient_id),
    INDEX idx_consultations_doctor (doctor_id)
);

CREATE TABLE IF NOT EXISTS lab_tests (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    test_id VARCHAR(24) UNIQUE,
    patient_id INT UNSIGNED NOT NULL,
    consultation_id INT UNSIGNED,
    doctor_id INT UNSIGNED,
    test_name VARCHAR(180) NOT NULL,
    test_category VARCHAR(100) NOT NULL,
    instructions TEXT,
    priority ENUM('normal','urgent') NOT NULL DEFAULT 'normal',
    test_date DATE NOT NULL,
    status ENUM('requested','sample_collected','processing','completed','cancelled') NOT NULL DEFAULT 'requested',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_lab_test_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE RESTRICT,
    CONSTRAINT fk_lab_test_consultation FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE SET NULL,
    CONSTRAINT fk_lab_test_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE SET NULL,
    INDEX idx_lab_tests_patient (patient_id),
    INDEX idx_lab_tests_doctor (doctor_id),
    INDEX idx_lab_tests_consultation (consultation_id),
    INDEX idx_lab_tests_date (test_date),
    INDEX idx_lab_tests_status (status)
);

CREATE TABLE IF NOT EXISTS lab_reports (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    report_id VARCHAR(24) UNIQUE,
    test_id INT UNSIGNED NOT NULL,
    patient_id INT UNSIGNED NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(100) NOT NULL,
    file_size BIGINT UNSIGNED NOT NULL,
    storage_name VARCHAR(255) NOT NULL,
    uploaded_by VARCHAR(150),
    uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_lab_report_test FOREIGN KEY (test_id) REFERENCES lab_tests(id) ON DELETE RESTRICT,
    CONSTRAINT fk_lab_report_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE RESTRICT,
    INDEX idx_lab_reports_test (test_id),
    INDEX idx_lab_reports_patient (patient_id)
);

INSERT IGNORE INTO departments (name, description) VALUES
('General Medicine', 'Diagnosis and treatment for common medical conditions.'),
('Cardiology', 'Specialized care for heart and circulatory conditions.'),
('Neurology', 'Care for disorders of the brain and nervous system.'),
('Orthopedics', 'Treatment for bones, joints and movement conditions.'),
('Pediatrics', 'Medical care for infants, children and adolescents.'),
('Dermatology', 'Diagnosis and treatment of skin conditions.'),
('Gynecology', 'Women\'s health and reproductive care.'),
('ENT', 'Care for ear, nose and throat conditions.');

INSERT IGNORE INTO doctors (doctor_id, name, department, specialization, phone, email, status) VALUES
('DOC-0001', 'Dr. Amit Sharma', 'Cardiology', 'Interventional Cardiology', '9876500001', 'amit.sharma@citycarehospital.com', 'available'),
('DOC-0002', 'Dr. Priya Singh', 'Neurology', 'Clinical Neurology', '9876500002', 'priya.singh@citycarehospital.com', 'available'),
('DOC-0003', 'Dr. Rahul Verma', 'Orthopedics', 'Joint Replacement', '9876500003', 'rahul.verma@citycarehospital.com', 'available'),
('DOC-0004', 'Dr. Neha Gupta', 'Pediatrics', 'Child Healthcare', '9876500004', 'neha.gupta@citycarehospital.com', 'available'),
('DOC-0005', 'Dr. Arjun Mehta', 'General Medicine', 'Internal Medicine', '9876500005', 'arjun.mehta@citycarehospital.com', 'available');
