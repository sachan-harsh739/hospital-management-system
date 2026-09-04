const recordsApi = "http://localhost:4000/api";
const verificationForm = document.getElementById("verificationForm");
const verificationMessage = document.getElementById("verificationMessage");
const recordsView = document.getElementById("recordsView");
let verificationToken = null;
const statusLabels = { requested: "Requested", sample_collected: "Sample Collected", processing: "Processing", completed: "Completed", cancelled: "Cancelled" };

function showVerificationMessage(message, error = true) {
    verificationMessage.textContent = message;
    verificationMessage.className = `message ${error ? "error" : "success"}`;
}

function escapeHtml(value) {
    return String(value ?? "-").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

function renderRecords(data) {
    const patient = data.patient;
    document.getElementById("patientTitle").textContent = `${escapeHtml(patient.patient_id)} - ${escapeHtml(patient.full_name)}`;
    document.getElementById("patientProfile").innerHTML = `<div><strong>Patient ID</strong><span>${escapeHtml(patient.patient_id)}</span></div><div><strong>Name</strong><span>${escapeHtml(patient.full_name)}</span></div><div><strong>Date of Birth</strong><span>${escapeHtml(patient.date_of_birth)}</span></div><div><strong>Gender</strong><span>${escapeHtml(patient.gender)}</span></div><div><strong>Blood Group</strong><span>${escapeHtml(patient.blood_group || "Not recorded")}</span></div>`;
    document.getElementById("medicalHistoryRows").innerHTML = (data.medicalHistory || []).map((record) => `<article class="record"><div class="record-heading"><strong>${escapeHtml(record.record_type)}</strong><time>${escapeHtml(record.record_date)}</time></div><p><b>Doctor:</b> ${escapeHtml(record.doctor || "Not recorded")}<br><b>Department:</b> ${escapeHtml(record.department || "Not recorded")}<br><b>Diagnosis:</b> ${escapeHtml(record.diagnosis || "Not recorded")}<br><b>Doctor notes:</b> ${escapeHtml(record.doctor_notes || "Not recorded")}</p><p><b>Prescription:</b> ${escapeHtml(record.prescription || "Not recorded")}<br><b>Medicines:</b> ${escapeHtml(record.medicines || "Not recorded")}<br><b>Dosage:</b> ${escapeHtml(record.dosage || "Not recorded")}<br><b>Frequency:</b> ${escapeHtml(record.frequency || "Not recorded")}<br><b>Duration:</b> ${escapeHtml(record.duration || "Not recorded")}<br><b>Instructions:</b> ${escapeHtml(record.instructions || "Not recorded")}</p><p><b>Lab test:</b> ${escapeHtml(record.lab_test || "Not recorded")}<br><b>Lab report:</b> ${escapeHtml(record.lab_report || "Not available")}<br><b>Medical report:</b> ${escapeHtml(record.medical_report || "Not available")}</p></article>`).join("") || '<p class="empty">No medical records are available.</p>';
    document.getElementById("appointmentRows").innerHTML = (data.appointments || []).map((appointment) => `<tr><td>${escapeHtml(appointment.appointment_date)}</td><td>${escapeHtml(appointment.doctor)}</td><td>${escapeHtml(appointment.department)}</td><td>${escapeHtml(appointment.reason)}</td><td>${escapeHtml(appointment.status)}</td></tr>`).join("") || '<tr><td colspan="5">No appointment history is available.</td></tr>';
    renderLabTests(data.labTests || []);
    renderLabReports(data.labTests || []);
    recordsView.classList.remove("hidden");
function renderLabTests(tests) {
    document.getElementById("labTestsRows").innerHTML = tests.map((test) => `<tr><td>${escapeHtml(test.test_name)}<br><small>${escapeHtml(test.test_category)}</small></td><td>${escapeHtml(test.test_date)}</td><td>${escapeHtml(test.doctor_name || "Not recorded")}</td><td>${escapeHtml(statusLabels[test.status] || test.status)}</td><td>${escapeHtml(test.priority || "normal")}</td></tr>`).join("") || '<tr><td colspan="5" class="empty">No lab tests are available.</td></tr>';
}

function renderLabReports(tests) {
    const reports = tests.filter((test) => test.report_id);
    document.getElementById("labReportsRows").innerHTML = reports.map((test) => `<tr><td>${escapeHtml(test.test_name)}<br><small>${escapeHtml(test.test_category)}</small></td><td>${escapeHtml(test.test_date)}</td><td>${escapeHtml(test.doctor_name || "Not recorded")}</td><td>${escapeHtml(statusLabels[test.status] || test.status)}</td><td><button type="button" class="report-action" data-report="${escapeHtml(test.report_id)}" data-mode="preview">View Report</button><button type="button" class="report-action" data-report="${escapeHtml(test.report_id)}" data-mode="download">Download</button></td></tr>`).join("") || '<tr><td colspan="5" class="empty">No lab reports are available yet.</td></tr>';
}

recordsView.addEventListener("click", async (event) => {
    const reportId = event.target.dataset.report;
    if (!reportId || !verificationToken) return;
    const response = await fetch(`${recordsApi}/lab-reports/${encodeURIComponent(reportId)}?${event.target.dataset.mode}=true`, { headers: { Authorization: `Bearer ${verificationToken}` } });
    if (!response.ok) return showVerificationMessage("This report is not available.");
    const fileUrl = URL.createObjectURL(await response.blob());
    if (event.target.dataset.mode === "download") { const link = document.createElement("a"); link.href = fileUrl; link.download = reportId; link.click(); } else window.open(fileUrl, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(fileUrl), 60000);
});

verificationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = verificationForm.querySelector("button");
    submitButton.disabled = true;
    submitButton.textContent = "Verifying...";
    recordsView.classList.add("hidden");
    const payload = Object.fromEntries(new FormData(verificationForm));
    if (!payload.patientId || !payload.dateOfBirth || !/^[0-9]{10}$/.test(payload.mobile)) { showVerificationMessage("Please enter your Patient ID, Date of Birth and registered mobile number."); submitButton.disabled = false; submitButton.textContent = "View Medical Records"; return; }
    try {
        const response = await fetch(`${recordsApi}/patients/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const result = await response.json();
        if (!result.success) throw new Error(result.message);
        verificationToken = result.data.verificationToken;
        const labResponse = await fetch(`${recordsApi}/patients/verified-lab-tests`, { headers: { Authorization: `Bearer ${verificationToken}` } });
        const labResult = await labResponse.json();
        result.data.labTests = labResult.success ? labResult.data : [];
        renderRecords(result.data);
        showVerificationMessage("Identity verified successfully.", false);
    } catch (error) {
        verificationToken = null;
        showVerificationMessage(error.message || "Patient verification failed. Please check your details.");
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = "View Medical Records";
    }
});
}