require("dotenv").config();
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { pool, initDatabase } = require("./db");
const app = express();
const port = Number(process.env.PORT) || 4000;
const clean = (value) => typeof value === "string" ? value.trim() : "";
const send = (res, status, message, data = {}) => res.status(status).json({ success: status < 400, message, data });
const missing = (body, keys) => keys.filter((key) => !clean(body[key]));
const isMobile = (value) => /^[6-9][0-9]{9}$/.test(clean(value));
const isEmail = (value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(value));
const verificationTokens = new Map();
const verificationLifetimeMs = 10 * 60 * 1000;
const dbError = (res, error, message) => error.code === "ER_DUP_ENTRY" ? send(res, 409, "A duplicate record already exists.") : (console.error(error), send(res, 500, message));
const labStorageDirectory = path.join(__dirname, "private-lab-reports");
fs.mkdirSync(labStorageDirectory, { recursive: true });
const maxLabFileSize = (Number(process.env.MAX_FILE_SIZE_MB) || 10) * 1024 * 1024;
const allowedReportTypes = new Map([["application/pdf", ".pdf"], ["image/jpeg", ".jpg"], ["image/png", ".png"]]);
const labUpload = multer({ storage: multer.diskStorage({ destination: labStorageDirectory, filename: (_req, file, callback) => callback(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`) }), limits: { fileSize: maxLabFileSize }, fileFilter: (_req, file, callback) => { const extension = path.extname(file.originalname).toLowerCase(); if (allowedReportTypes.get(file.mimetype) === extension) return callback(null, true); callback(new Error("Only PDF, JPG and PNG report files are accepted.")); } });

function issueVerificationToken(patientId) {
    const token = crypto.randomBytes(32).toString("hex");
    verificationTokens.set(token, { patientId, expiresAt: Date.now() + verificationLifetimeMs });
    return token;
}

function verifiedPatientId(req) {
    const header = req.get("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const session = verificationTokens.get(token);
    if (!session || session.expiresAt < Date.now()) {
        if (token) verificationTokens.delete(token);
        return null;
    }
    return session.patientId;
}

function internalOrVerifiedPatient(req, patientId) {
    if (req.get("x-internal-access") === "true") return true;
    return verifiedPatientId(req) === Number(patientId);
}

function safeReportError(error) {
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") return "Report file is too large.";
    return "Only PDF, JPG and PNG report files are accepted.";
}
const allowedFrontendOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:5500";
app.use(cors({ origin: (origin, callback) => { if (!origin || origin === allowedFrontendOrigin || origin === "null") return callback(null, true); return callback(new Error("Origin not allowed.")); } }));
app.use(express.json({ limit: "100kb" }));

function patientError(body) {
    const fields = missing(body, ["fullName", "dob", "gender", "mobile", "address", "city", "state", "pincode"]);
    if (fields.length) return `Missing fields: ${fields.join(", ")}`;
    if (!/^[A-Za-z ]{3,}$/.test(clean(body.fullName)) || !isMobile(body.mobile) || !isEmail(body.email) || !/^[0-9]{6}$/.test(clean(body.pincode))) return "Patient details are invalid.";
    return null;
}
function appointmentError(body) {
    const fields = missing(body, ["patientName", "mobile", "department", "doctor", "appointmentDate", "appointmentTime", "reason"]);
    if (fields.length) return `Missing fields: ${fields.join(", ")}`;
    if (!/^[A-Za-z ]{3,}$/.test(clean(body.patientName)) || !isMobile(body.mobile) || !isEmail(body.email) || clean(body.reason).length < 5) return "Appointment details are invalid.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(clean(body.appointmentDate)) || clean(body.appointmentDate) < new Date().toISOString().slice(0, 10)) return "Past appointment dates are not allowed.";
    if (!["09:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "02:00 PM", "03:00 PM", "04:00 PM", "05:00 PM"].includes(clean(body.appointmentTime))) return "Appointment time is invalid.";
    return null;
}

app.get("/api/health", async (_req, res) => { try { await pool.query("SELECT 1"); return send(res, 200, "CityCare API is healthy.", { service: "citycare-api", database: "mysql" }); } catch (_error) { return send(res, 503, "Database is unavailable."); } });

app.post("/api/patients/verify", async (req, res) => { const patientId = clean(req.body.patientId); const dateOfBirth = clean(req.body.dateOfBirth); const mobile = clean(req.body.mobile); if (!patientId || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || !/^\d{10}$/.test(mobile)) return send(res, 401, "Patient verification failed. Please check your details."); try { const [patients] = await pool.execute("SELECT id,patient_id,full_name,date_of_birth,gender,blood_group FROM patients WHERE patient_id=? AND date_of_birth=? AND mobile=? LIMIT 1", [patientId, dateOfBirth, mobile]); if (!patients.length) return send(res, 401, "Patient verification failed. Please check your details."); const patient = patients[0]; const [records] = await pool.execute("SELECT record_type,record_date,doctor,department,diagnosis,doctor_notes,prescription,medicines,dosage,frequency,duration,instructions,lab_test,lab_report,medical_report FROM medical_records WHERE patient_id=? ORDER BY record_date DESC, id DESC", [patient.id]); const [appointments] = await pool.execute("SELECT appointment_date,appointment_time,doctor,department,reason,status,created_at FROM appointments WHERE patient_id=? OR (patient_id IS NULL AND mobile=?) ORDER BY appointment_date DESC,appointment_time DESC", [patient.id, mobile]); return send(res, 200, "Patient verified successfully.", { verificationToken: issueVerificationToken(patient.id), patient, medicalHistory: records, appointments }); } catch (e) { return dbError(res, e, "Unable to verify patient right now."); } });

app.get("/api/patients/verified-records", async (req, res) => { const patientId = verifiedPatientId(req); if (!patientId) return send(res, 401, "Patient verification is required."); try { const [[patient]] = await pool.execute("SELECT id,patient_id,full_name,date_of_birth,gender,blood_group FROM patients WHERE id=?", [patientId]); const [records] = await pool.execute("SELECT record_type,record_date,doctor,department,diagnosis,doctor_notes,prescription,medicines,dosage,frequency,duration,instructions,lab_test,lab_report,medical_report FROM medical_records WHERE patient_id=? ORDER BY record_date DESC,id DESC", [patientId]); const [appointments] = await pool.execute("SELECT appointment_date,appointment_time,doctor,department,reason,status,created_at FROM appointments WHERE patient_id=? ORDER BY appointment_date DESC,appointment_time DESC", [patientId]); const [labTests] = await pool.execute("SELECT t.test_id,t.test_name,t.test_category,t.test_date,t.status,t.priority,d.name AS doctor_name,r.report_id,CASE WHEN r.id IS NULL THEN 'not_available' ELSE 'available' END AS report_status FROM lab_tests t LEFT JOIN doctors d ON d.id=t.doctor_id LEFT JOIN lab_reports r ON r.test_id=t.id WHERE t.patient_id=? ORDER BY t.test_date DESC,t.id DESC", [patientId]); return patient ? send(res, 200, "Medical records fetched successfully.", { patient, medicalHistory: records, appointments, labTests }) : send(res, 404, "Patient not found."); } catch (e) { return dbError(res, e, "Unable to fetch medical records."); } });
app.get("/api/patients/verified-lab-tests", async (req, res) => { const patientId = verifiedPatientId(req); if (!patientId) return send(res, 401, "Patient verification is required."); try { const [rows] = await pool.execute("SELECT t.test_id,t.test_name,t.test_category,t.test_date,t.status,t.priority,d.name AS doctor_name,r.report_id,CASE WHEN r.id IS NULL THEN 'not_available' ELSE 'available' END AS report_status FROM lab_tests t LEFT JOIN doctors d ON d.id=t.doctor_id LEFT JOIN lab_reports r ON r.test_id=t.id WHERE t.patient_id=? ORDER BY t.test_date DESC,t.id DESC", [patientId]); return send(res, 200, "Patient lab tests fetched successfully.", rows); } catch (e) { return dbError(res, e, "Unable to fetch patient lab tests."); } });

app.post("/api/patients", async (req, res) => { const body = req.body || {}; const error = patientError(body); if (error) return send(res, 400, error); try { const [r] = await pool.execute("INSERT INTO patients (full_name,date_of_birth,gender,mobile,email,blood_group,address,city,state,pincode,emergency_name,emergency_mobile,emergency_relationship,allergies,preferred_department,preferred_doctor) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [clean(body.fullName), clean(body.dob), clean(body.gender), clean(body.mobile), clean(body.email) || null, clean(body.bloodGroup) || null, clean(body.address), clean(body.city), clean(body.state), clean(body.pincode), clean(body.emergencyName) || null, clean(body.emergencyMobile) || null, clean(body.emergencyRelationship) || null, clean(body.allergies) || null, clean(body.preferredDepartment) || null, clean(body.preferredDoctor) || null]); const patientId = `CC-${String(r.insertId).padStart(6, "0")}`; await pool.execute("UPDATE patients SET patient_id=? WHERE id=?", [patientId, r.insertId]); return send(res, 201, "Patient registered successfully.", { id: r.insertId, patientId }); } catch (e) { return dbError(res, e, "Unable to register patient."); } });
app.get("/api/patients", async (req, res) => { const q = `%${clean(req.query.search)}%`; try { const [rows] = await pool.execute("SELECT id,patient_id,full_name,date_of_birth,gender,mobile,email,blood_group,address,city,state,pincode,emergency_name,emergency_mobile,emergency_relationship,allergies,preferred_department,preferred_doctor,created_at FROM patients WHERE patient_id LIKE ? OR full_name LIKE ? OR mobile LIKE ? OR email LIKE ? ORDER BY created_at DESC", [q, q, q, q]); return send(res, 200, "Patients fetched successfully.", rows); } catch (e) { return dbError(res, e, "Unable to fetch patients."); } });
app.get("/api/patients/:id/appointments", async (req, res) => { try { const [rows] = await pool.execute("SELECT a.* FROM appointments a LEFT JOIN patients p ON p.id=a.patient_id WHERE CAST(p.id AS CHAR)=? OR p.patient_id=? OR a.mobile=(SELECT mobile FROM patients WHERE CAST(id AS CHAR)=? OR patient_id=? LIMIT 1) ORDER BY a.appointment_date DESC,a.appointment_time DESC", [req.params.id, req.params.id, req.params.id, req.params.id]); return send(res, 200, "Patient appointments fetched successfully.", rows); } catch (e) { return dbError(res, e, "Unable to fetch patient appointments."); } });
app.get("/api/patients/:id", async (req, res) => { try { const [rows] = await pool.execute("SELECT id,patient_id,full_name,date_of_birth,gender,mobile,email,blood_group,address,city,state,pincode,emergency_name,emergency_mobile,emergency_relationship,allergies,preferred_department,preferred_doctor,created_at FROM patients WHERE CAST(id AS CHAR)=? OR patient_id=?", [req.params.id, req.params.id]); return rows[0] ? send(res, 200, "Patient fetched successfully.", rows[0]) : send(res, 404, "Patient not found."); } catch (e) { return dbError(res, e, "Unable to fetch patient."); } });
app.put("/api/patients/:id", async (req, res) => { const error = patientError(req.body || {}); if (error) return send(res, 400, error); try { const [r] = await pool.execute("UPDATE patients SET full_name=?,date_of_birth=?,gender=?,mobile=?,email=?,blood_group=?,address=?,city=?,state=?,pincode=?,emergency_name=?,emergency_mobile=?,emergency_relationship=?,allergies=?,preferred_department=?,preferred_doctor=? WHERE CAST(id AS CHAR)=? OR patient_id=?", [clean(req.body.fullName), clean(req.body.dob), clean(req.body.gender), clean(req.body.mobile), clean(req.body.email) || null, clean(req.body.bloodGroup) || null, clean(req.body.address), clean(req.body.city), clean(req.body.state), clean(req.body.pincode), clean(req.body.emergencyName) || null, clean(req.body.emergencyMobile) || null, clean(req.body.emergencyRelationship) || null, clean(req.body.allergies) || null, clean(req.body.preferredDepartment) || null, clean(req.body.preferredDoctor) || null, req.params.id, req.params.id]); return r.affectedRows ? send(res, 200, "Patient updated successfully.") : send(res, 404, "Patient not found."); } catch (e) { return dbError(res, e, "Unable to update patient."); } });
app.delete("/api/patients/:id", async (req, res) => { try { const [r] = await pool.execute("DELETE FROM patients WHERE CAST(id AS CHAR)=? OR patient_id=?", [req.params.id, req.params.id]); return r.affectedRows ? send(res, 200, "Patient deleted successfully.") : send(res, 404, "Patient not found."); } catch (e) { return dbError(res, e, "Unable to delete patient."); } });

app.get("/api/doctors/available", async (req, res) => { try { const [rows] = await pool.execute("SELECT * FROM doctors WHERE status='available' AND (?='' OR department=?) ORDER BY name", [clean(req.query.department), clean(req.query.department)]); return send(res, 200, "Available doctors fetched successfully.", rows); } catch (e) { return dbError(res, e, "Unable to fetch available doctors."); } });
app.get("/api/doctors", async (req, res) => { try { const [rows] = await pool.execute("SELECT * FROM doctors WHERE (?='' OR department=?) ORDER BY name", [clean(req.query.department), clean(req.query.department)]); return send(res, 200, "Doctors fetched successfully.", rows); } catch (e) { return dbError(res, e, "Unable to fetch doctors."); } });
app.get("/api/doctors/:id", async (req, res) => { try { const [rows] = await pool.execute("SELECT * FROM doctors WHERE CAST(id AS CHAR)=? OR doctor_id=?", [req.params.id, req.params.id]); return rows[0] ? send(res, 200, "Doctor fetched successfully.", rows[0]) : send(res, 404, "Doctor not found."); } catch (e) { return dbError(res, e, "Unable to fetch doctor."); } });
app.post("/api/doctors", async (req, res) => { const b = req.body || {}; const fields = missing(b, ["name", "department", "specialization", "phone", "email"]); if (fields.length) return send(res, 400, `Missing fields: ${fields.join(", ")}`); if (!isMobile(b.phone) || !isEmail(b.email) || (b.experience !== undefined && (Number.isNaN(Number(b.experience)) || Number(b.experience) < 0))) return send(res, 400, "Doctor details are invalid."); try { const [r] = await pool.execute("INSERT INTO doctors (name,department,specialization,qualification,experience,phone,email,status) VALUES (?,?,?,?,?,?,?,?)", [clean(b.name), clean(b.department), clean(b.specialization), clean(b.qualification) || null, b.experience === "" ? null : Number(b.experience), clean(b.phone), clean(b.email), clean(b.status) || "available"]); const doctorId = `DOC-${String(r.insertId).padStart(4, "0")}`; await pool.execute("UPDATE doctors SET doctor_id=? WHERE id=?", [doctorId, r.insertId]); return send(res, 201, "Doctor created successfully.", { id: r.insertId, doctorId }); } catch (e) { return dbError(res, e, "Unable to create doctor."); } });
app.put("/api/doctors/:id", async (req, res) => { try { const [r] = await pool.execute("UPDATE doctors SET name=?,department=?,specialization=?,qualification=?,experience=?,phone=?,email=?,status=? WHERE CAST(id AS CHAR)=? OR doctor_id=?", [clean(req.body.name), clean(req.body.department), clean(req.body.specialization), clean(req.body.qualification) || null, req.body.experience === "" ? null : Number(req.body.experience), clean(req.body.phone), clean(req.body.email), clean(req.body.status) || "available", req.params.id, req.params.id]); return r.affectedRows ? send(res, 200, "Doctor updated successfully.") : send(res, 404, "Doctor not found."); } catch (e) { return dbError(res, e, "Unable to update doctor."); } });
app.delete("/api/doctors/:id", async (req, res) => { try { const [r] = await pool.execute("DELETE FROM doctors WHERE CAST(id AS CHAR)=? OR doctor_id=?", [req.params.id, req.params.id]); return r.affectedRows ? send(res, 200, "Doctor deleted successfully.") : send(res, 404, "Doctor not found."); } catch (e) { return dbError(res, e, "Unable to delete doctor."); } });

app.get("/api/departments", async (_req, res) => { try { const [rows] = await pool.query("SELECT d.*,COUNT(doc.id) AS doctor_count FROM departments d LEFT JOIN doctors doc ON doc.department=d.name GROUP BY d.id ORDER BY d.name"); return send(res, 200, "Departments fetched successfully.", rows); } catch (e) { return dbError(res, e, "Unable to fetch departments."); } });
app.post("/api/departments", async (req, res) => { if (!clean(req.body.name) || !clean(req.body.description) || !clean(req.body.status)) return send(res, 400, "Department name, description and status are required."); try { const [r] = await pool.execute("INSERT INTO departments (name,description,head_doctor,contact_number,location,status) VALUES (?,?,?,?,?,?)", [clean(req.body.name), clean(req.body.description), clean(req.body.headDoctor) || null, clean(req.body.contactNumber) || null, clean(req.body.location) || null, clean(req.body.status)]); return send(res, 201, "Department created successfully.", { id: r.insertId }); } catch (e) { return dbError(res, e, "Unable to create department."); } });
app.put("/api/departments/:id", async (req, res) => { try { const [r] = await pool.execute("UPDATE departments SET name=?,description=?,head_doctor=?,contact_number=?,location=?,status=? WHERE id=?", [clean(req.body.name), clean(req.body.description), clean(req.body.headDoctor) || null, clean(req.body.contactNumber) || null, clean(req.body.location) || null, clean(req.body.status) || "active", req.params.id]); return r.affectedRows ? send(res, 200, "Department updated successfully.") : send(res, 404, "Department not found."); } catch (e) { return dbError(res, e, "Unable to update department."); } });
app.delete("/api/departments/:id", async (req, res) => { try { const [r] = await pool.execute("DELETE FROM departments WHERE id=?", [req.params.id]); return r.affectedRows ? send(res, 200, "Department deleted successfully.") : send(res, 404, "Department not found."); } catch (e) { return dbError(res, e, "Unable to delete department."); } });

app.post("/api/appointments", async (req, res) => { const b = req.body || {}; const error = appointmentError(b); if (error) return send(res, 400, error); try { const [doctor] = await pool.execute("SELECT id FROM doctors WHERE name=? AND department=? AND status='available'", [clean(b.doctor), clean(b.department)]); if (!doctor.length) return send(res, 400, "Selected doctor is unavailable."); const [dup] = await pool.execute("SELECT id FROM appointments WHERE doctor=? AND appointment_date=? AND appointment_time=? AND status IN ('pending','confirmed')", [clean(b.doctor), clean(b.appointmentDate), clean(b.appointmentTime)]); if (dup.length) return send(res, 409, "Selected appointment slot is already booked. Please choose another time."); const [r] = await pool.execute("INSERT INTO appointments (patient_id,patient_name,mobile,email,department,doctor,appointment_date,appointment_time,reason,status) VALUES (?,?,?,?,?,?,?,?,?,?)", [b.patientId || null, clean(b.patientName), clean(b.mobile), clean(b.email) || null, clean(b.department), clean(b.doctor), clean(b.appointmentDate), clean(b.appointmentTime), clean(b.reason), "pending"]); return send(res, 201, "Appointment request submitted successfully.", { id: r.insertId }); } catch (e) { return dbError(res, e, "Unable to book appointment."); } });
app.get("/api/appointments", async (req, res) => { const q = `%${clean(req.query.search)}%`; try { const [rows] = await pool.execute("SELECT a.*,p.patient_id AS patient_code FROM appointments a LEFT JOIN patients p ON p.id=a.patient_id WHERE a.patient_name LIKE ? OR p.patient_id LIKE ? OR a.mobile LIKE ? OR a.doctor LIKE ? OR a.department LIKE ? OR CAST(a.id AS CHAR) LIKE ? ORDER BY a.appointment_date,a.appointment_time", [q, q, q, q, q, q]); return send(res, 200, "Appointments fetched successfully.", rows); } catch (e) { return dbError(res, e, "Unable to fetch appointments."); } });
app.get("/api/appointments/availability", async (req, res) => { if (!clean(req.query.doctor) || !/^\d{4}-\d{2}-\d{2}$/.test(clean(req.query.date))) return send(res, 400, "Doctor and valid date are required."); try { const [rows] = await pool.execute("SELECT appointment_time FROM appointments WHERE doctor=? AND appointment_date=? AND status IN ('pending','confirmed')", [clean(req.query.doctor), clean(req.query.date)]); return send(res, 200, "Booked slots fetched successfully.", rows.map((row) => row.appointment_time)); } catch (e) { return dbError(res, e, "Unable to fetch appointment availability."); } });
app.get("/api/appointments/:id", async (req, res) => { try { const [rows] = await pool.execute("SELECT * FROM appointments WHERE id=?", [req.params.id]); return rows[0] ? send(res, 200, "Appointment fetched successfully.", rows[0]) : send(res, 404, "Appointment not found."); } catch (e) { return dbError(res, e, "Unable to fetch appointment."); } });
app.put("/api/appointments/:id/status", async (req, res) => { if (!["pending", "confirmed", "completed", "cancelled"].includes(req.body.status)) return send(res, 400, "Appointment status is invalid."); try { const [r] = await pool.execute("UPDATE appointments SET status=? WHERE id=?", [req.body.status, req.params.id]); return r.affectedRows ? send(res, 200, "Appointment status updated successfully.") : send(res, 404, "Appointment not found."); } catch (e) { return dbError(res, e, "Unable to update appointment status."); } });
app.put("/api/appointments/:id", async (req, res) => { if (req.body.status && !["pending", "confirmed", "completed", "cancelled"].includes(req.body.status)) return send(res, 400, "Appointment status is invalid."); try { const [r] = await pool.execute("UPDATE appointments SET patient_name=?,mobile=?,email=?,department=?,doctor=?,appointment_date=?,appointment_time=?,reason=?,status=? WHERE id=?", [clean(req.body.patientName), clean(req.body.mobile), clean(req.body.email) || null, clean(req.body.department), clean(req.body.doctor), clean(req.body.appointmentDate), clean(req.body.appointmentTime), clean(req.body.reason), clean(req.body.status) || "pending", req.params.id]); return r.affectedRows ? send(res, 200, "Appointment updated successfully.") : send(res, 404, "Appointment not found."); } catch (e) { return dbError(res, e, "Unable to update appointment."); } });
app.delete("/api/appointments/:id", async (req, res) => { try { const [r] = await pool.execute("DELETE FROM appointments WHERE id=?", [req.params.id]); return r.affectedRows ? send(res, 200, "Appointment deleted successfully.") : send(res, 404, "Appointment not found."); } catch (e) { return dbError(res, e, "Unable to delete appointment."); } });

app.post("/api/consultations", async (req, res) => {
    const body = req.body || {};
    const fields = missing(body, ["patientId", "doctorId", "consultationDate"]);
    if (fields.length) return send(res, 400, `Missing fields: ${fields.join(", ")}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(clean(body.consultationDate))) return send(res, 400, "Consultation date is invalid.");
    try {
        const [patients] = await pool.execute("SELECT id FROM patients WHERE patient_id=?", [clean(body.patientId)]);
        if (!patients.length) return send(res, 400, "Patient not found.");
        const [doctors] = await pool.execute("SELECT id,name,department FROM doctors WHERE doctor_id=?", [clean(body.doctorId)]);
        if (!doctors.length) return send(res, 400, "Doctor not found.");
        const [insert] = await pool.execute("INSERT INTO consultations (patient_id,doctor_id,consultation_date,notes) VALUES (?,?,?,?)", [patients[0].id, doctors[0].id, clean(body.consultationDate), clean(body.notes) || null]);
        const consultationId = `CONS-${String(insert.insertId).padStart(6, "0")}`;
        await pool.execute("UPDATE consultations SET consultation_id=? WHERE id=?", [consultationId, insert.insertId]);
        await pool.execute("INSERT INTO medical_records (patient_id,record_type,record_date,doctor,department,diagnosis,doctor_notes) VALUES (?,?,?,?,?,?,?)", [patients[0].id, "consultation", clean(body.consultationDate), doctors[0].name, doctors[0].department, clean(body.diagnosis) || null, clean(body.notes) || null]);
        return send(res, 201, "Consultation created successfully.", { id: insert.insertId, consultationId });
    } catch (e) { return dbError(res, e, "Unable to create consultation."); }
});

app.get("/api/consultations/patient/:patientId", async (req, res) => {
    try {
        const [patients] = await pool.execute("SELECT id FROM patients WHERE patient_id=?", [req.params.patientId]);
        if (!patients.length || !internalOrVerifiedPatient(req, patients[0].id)) return send(res, 403, "Patient verification is required.");
        const [rows] = await pool.execute("SELECT c.id,c.consultation_id,c.patient_id,c.doctor_id,c.consultation_date,c.notes,c.created_at,d.name AS doctor_name,d.department FROM consultations c LEFT JOIN doctors d ON d.id=c.doctor_id WHERE c.patient_id=? ORDER BY c.consultation_date DESC,c.id DESC", [patients[0].id]);
        return send(res, 200, "Patient consultations fetched successfully.", rows);
    } catch (e) { return dbError(res, e, "Unable to fetch consultations."); }
});

app.get("/api/consultations/:id", async (req, res) => {
    try {
        const [rows] = await pool.execute("SELECT c.*,d.name AS doctor_name,d.department FROM consultations c LEFT JOIN doctors d ON d.id=c.doctor_id WHERE c.id=? OR c.consultation_id=?", [req.params.id, req.params.id]);
        if (!rows.length) return send(res, 404, "Consultation not found.");
        if (!internalOrVerifiedPatient(req, rows[0].patient_id)) return send(res, 403, "Consultation access is not authorized.");
        return send(res, 200, "Consultation fetched successfully.", rows[0]);
    } catch (e) { return dbError(res, e, "Unable to fetch consultation."); }
});

app.get("/api/patients/:id/medical-records", async (req, res) => {
    if (req.get("x-internal-access") !== "true") return send(res, 403, "Internal staff access is required.");
    try {
        const [patients] = await pool.execute("SELECT id FROM patients WHERE CAST(id AS CHAR)=? OR patient_id=?", [req.params.id, req.params.id]);
        if (!patients.length) return send(res, 404, "Patient not found.");
        const [rows] = await pool.execute("SELECT record_type,record_date,doctor,department,diagnosis,doctor_notes,prescription,medicines,dosage,frequency,duration,instructions,lab_test,lab_report,medical_report FROM medical_records WHERE patient_id=? ORDER BY record_date DESC,id DESC", [patients[0].id]);
        return send(res, 200, "Patient medical records fetched successfully.", rows);
    } catch (e) { return dbError(res, e, "Unable to fetch medical records."); }
});
const labTransitions = { requested: ["sample_collected", "cancelled"], sample_collected: ["processing", "cancelled"], processing: ["completed", "cancelled"], completed: [], cancelled: [] };

const internalAccess = (req) => req.get("x-internal-access") === "true";

app.post("/api/lab-tests", async (req, res) => {
    if (!internalAccess(req)) return send(res, 403, "Internal staff access is required.");
    const body = req.body || {};
    const required = ["patientId", "testName", "testCategory"];
    const missingFields = missing(body, required);
    if (missingFields.length) return send(res, 400, `Missing fields: ${missingFields.join(", ")}`);
    try {
        const [patients] = await pool.execute("SELECT id FROM patients WHERE CAST(id AS CHAR)=? OR patient_id=?", [clean(body.patientId), clean(body.patientId)]);
        if (!patients.length) return send(res, 400, "Patient not found.");
        let doctorId = null;
        if (body.doctorId) { const [doctors] = await pool.execute("SELECT id FROM doctors WHERE CAST(id AS CHAR)=? OR doctor_id=?", [clean(body.doctorId), clean(body.doctorId)]); if (!doctors.length) return send(res, 400, "Doctor not found."); doctorId = doctors[0].id; }
        let consultationId = null;
        if (body.consultationId) { const [consultations] = await pool.execute("SELECT id,patient_id FROM consultations WHERE CAST(id AS CHAR)=? OR consultation_id=?", [clean(body.consultationId), clean(body.consultationId)]); if (!consultations.length) return send(res, 400, "Consultation not found."); if (consultations[0].patient_id !== patients[0].id) return send(res, 400, "Consultation does not belong to this patient."); consultationId = consultations[0].id; }
        const [insert] = await pool.execute("INSERT INTO lab_tests (patient_id,consultation_id,doctor_id,test_name,test_category,instructions,priority,test_date,status) VALUES (?,?,?,?,?,?,?,?,?)", [patients[0].id, consultationId, doctorId, clean(body.testName), clean(body.testCategory), clean(body.instructions) || null, ["normal", "urgent"].includes(clean(body.priority)) ? clean(body.priority) : "normal", clean(body.testDate) || new Date().toISOString().slice(0, 10), "requested"]);
        const testId = `LAB-${String(insert.insertId).padStart(6, "0")}`;
        await pool.execute("UPDATE lab_tests SET test_id=? WHERE id=?", [testId, insert.insertId]);
        return send(res, 201, "Lab test requested successfully.", { id: insert.insertId, testId });
    } catch (e) { return dbError(res, e, "Unable to create lab test."); }
});

app.get("/api/lab-tests", async (req, res) => {
    const q = `%${clean(req.query.search)}%`; const values = [q, q, q, q, q];
    let sql = "SELECT t.*,p.patient_id AS patient_code,p.full_name AS patient_name,d.name AS doctor_name,COALESCE(r.report_id, NULL) AS report_id,CASE WHEN r.id IS NULL THEN 'not_available' ELSE 'available' END AS report_status FROM lab_tests t JOIN patients p ON p.id=t.patient_id LEFT JOIN doctors d ON d.id=t.doctor_id LEFT JOIN lab_reports r ON r.test_id=t.id WHERE (t.test_id LIKE ? OR p.patient_id LIKE ? OR p.full_name LIKE ? OR t.test_name LIKE ? OR CAST(t.id AS CHAR) LIKE ?)";
    if (req.query.status) { sql += " AND t.status=?"; values.push(clean(req.query.status)); } if (req.query.testDate) { sql += " AND t.test_date=?"; values.push(clean(req.query.testDate)); } if (req.query.category) { sql += " AND t.test_category=?"; values.push(clean(req.query.category)); } sql += " ORDER BY t.test_date DESC,t.id DESC";
    try { const [rows] = await pool.execute(sql, values); return send(res, 200, "Lab tests fetched successfully.", rows); } catch (e) { return dbError(res, e, "Unable to fetch lab tests."); }
});

app.get("/api/lab-tests/patient/:patientId", async (req, res) => { try { const [patients] = await pool.execute("SELECT id FROM patients WHERE patient_id=?", [req.params.patientId]); if (!patients.length || !internalOrVerifiedPatient(req, patients[0].id)) return send(res, 403, "Patient verification is required."); const [rows] = await pool.execute("SELECT t.*,p.patient_id AS patient_code,p.full_name AS patient_name,d.name AS doctor_name,r.report_id,CASE WHEN r.id IS NULL THEN 'not_available' ELSE 'available' END AS report_status FROM lab_tests t JOIN patients p ON p.id=t.patient_id LEFT JOIN doctors d ON d.id=t.doctor_id LEFT JOIN lab_reports r ON r.test_id=t.id WHERE t.patient_id=? ORDER BY t.test_date DESC,t.id DESC", [patients[0].id]); return send(res, 200, "Patient lab tests fetched successfully.", rows); } catch (e) { return dbError(res, e, "Unable to fetch patient lab tests."); } });
app.get("/api/lab-tests/:id", async (req, res) => { try { const [rows] = await pool.execute("SELECT t.*,p.patient_id AS patient_code,p.full_name AS patient_name,d.name AS doctor_name,r.report_id,CASE WHEN r.id IS NULL THEN 'not_available' ELSE 'available' END AS report_status FROM lab_tests t JOIN patients p ON p.id=t.patient_id LEFT JOIN doctors d ON d.id=t.doctor_id LEFT JOIN lab_reports r ON r.test_id=t.id WHERE t.id=? OR t.test_id=?", [req.params.id, req.params.id]); return rows[0] ? send(res, 200, "Lab test fetched successfully.", rows[0]) : send(res, 404, "Lab test not found."); } catch (e) { return dbError(res, e, "Unable to fetch lab test."); } });
app.put("/api/lab-tests/:id/status", async (req, res) => { if (!internalAccess(req)) return send(res, 403, "Internal staff access is required."); const nextStatus = clean(req.body.status); if (!Object.prototype.hasOwnProperty.call(labTransitions, nextStatus)) return send(res, 400, "Lab test status is invalid."); try { const [tests] = await pool.execute("SELECT id,status FROM lab_tests WHERE id=? OR test_id=?", [req.params.id, req.params.id]); if (!tests.length) return send(res, 404, "Lab test not found."); if (!labTransitions[tests[0].status].includes(nextStatus)) return send(res, 400, "Invalid lab test status transition."); await pool.execute("UPDATE lab_tests SET status=? WHERE id=?", [nextStatus, tests[0].id]); return send(res, 200, "Lab test status updated successfully."); } catch (e) { return dbError(res, e, "Unable to update lab test status."); } });

app.post("/api/lab-reports", (req, res) => { labUpload.single("report")(req, res, async (uploadError) => { if (!internalAccess(req)) { if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); return send(res, 403, "Internal staff access is required."); } if (uploadError) return send(res, 400, safeReportError(uploadError)); if (!req.file) return send(res, 400, "A report file is required."); try { const [tests] = await pool.execute("SELECT id,patient_id,status FROM lab_tests WHERE id=? OR test_id=?", [clean(req.body.testId), clean(req.body.testId)]); if (!tests.length) { fs.unlinkSync(req.file.path); return send(res, 400, "Lab test not found."); } if (tests[0].status !== "completed") { fs.unlinkSync(req.file.path); return send(res, 400, "Reports can only be uploaded for completed tests."); } const [existing] = await pool.execute("SELECT id FROM lab_reports WHERE test_id=?", [tests[0].id]); if (existing.length) { fs.unlinkSync(req.file.path); return send(res, 409, "A report already exists for this lab test."); } const [insert] = await pool.execute("INSERT INTO lab_reports (test_id,patient_id,file_name,file_type,file_size,storage_name,uploaded_by) VALUES (?,?,?,?,?,?,?)", [tests[0].id, tests[0].patient_id, req.file.originalname, req.file.mimetype, req.file.size, req.file.filename, clean(req.body.uploadedBy) || "Lab staff"]); const reportId = `RPT-${String(insert.insertId).padStart(6, "0")}`; await pool.execute("UPDATE lab_reports SET report_id=? WHERE id=?", [reportId, insert.insertId]); return send(res, 201, "Lab report uploaded successfully.", { id: insert.insertId, reportId }); } catch (e) { if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); return dbError(res, e, "Unable to upload lab report."); } }); });

app.get("/api/lab-reports/patient/:patientId", async (req, res) => { const [patients] = await pool.execute("SELECT id FROM patients WHERE patient_id=?", [req.params.patientId]); if (!patients.length || !internalOrVerifiedPatient(req, patients[0].id)) return send(res, 403, "Patient verification is required."); try { const [rows] = await pool.execute("SELECT r.id,r.report_id,r.test_id,r.patient_id,r.file_name,r.file_type,r.file_size,r.uploaded_at,t.test_id AS test_code,t.test_name,t.test_date,t.status FROM lab_reports r JOIN lab_tests t ON t.id=r.test_id WHERE r.patient_id=? ORDER BY t.test_date DESC,r.id DESC", [patients[0].id]); return send(res, 200, "Patient lab reports fetched successfully.", rows); } catch (e) { return dbError(res, e, "Unable to fetch patient lab reports."); } });
app.get("/api/lab-reports/:id", async (req, res) => { try { const [rows] = await pool.execute("SELECT r.*,t.status AS test_status FROM lab_reports r JOIN lab_tests t ON t.id=r.test_id WHERE r.id=? OR r.report_id=?", [req.params.id, req.params.id]); if (!rows.length) return send(res, 404, "Lab report not found."); const report = rows[0]; if (!internalOrVerifiedPatient(req, report.patient_id)) return send(res, 403, "Report access is not authorized."); if (req.query.download === "true" || req.query.preview === "true") { if (!fs.existsSync(path.join(labStorageDirectory, report.storage_name))) return send(res, 404, "Report file is unavailable."); res.setHeader("Content-Disposition", `${req.query.download === "true" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(report.file_name)}`); return res.sendFile(path.join(labStorageDirectory, report.storage_name)); } return send(res, 200, "Lab report fetched successfully.", { id: report.id, reportId: report.report_id, testId: report.test_id, patientId: report.patient_id, fileName: report.file_name, fileType: report.file_type, fileSize: report.file_size, uploadedAt: report.uploaded_at }); } catch (e) { return dbError(res, e, "Unable to fetch lab report."); } });

app.get("/api/dashboard", async (_req, res) => { try { const [[counts]] = await pool.query("SELECT (SELECT COUNT(*) FROM patients) AS totalPatients,(SELECT COUNT(*) FROM doctors) AS totalDoctors,(SELECT COUNT(*) FROM departments) AS totalDepartments,(SELECT COUNT(*) FROM appointments WHERE appointment_date=CURDATE()) AS todayAppointments"); const [upcoming] = await pool.query("SELECT * FROM appointments WHERE appointment_date>=CURDATE() AND status IN ('pending','confirmed') ORDER BY appointment_date,appointment_time LIMIT 10"); const [recentPatients] = await pool.query("SELECT id,patient_id,full_name,mobile,created_at FROM patients ORDER BY created_at DESC LIMIT 10"); const [statusSummary] = await pool.query("SELECT status,COUNT(*) AS count FROM appointments GROUP BY status"); return send(res, 200, "Dashboard fetched successfully.", { counts, upcoming, recentPatients, statusSummary }); } catch (e) { return dbError(res, e, "Unable to fetch dashboard."); } });

app.use((_req, res) => send(res, 404, "Route not found."));
initDatabase().then(() => app.listen(port, () => console.log(`CityCare API running at http://localhost:${port}`))).catch((e) => { console.error("Database initialization failed:", e.message); process.exit(1); });
