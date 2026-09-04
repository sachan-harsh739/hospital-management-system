const doctorApi = "https://hospital-management-system-production-a31b.up.railway.app/api";
const doctorForm = document.getElementById("doctorForm");
const doctorRows = document.getElementById("doctorRows");
const doctorMessage = document.getElementById("doctorMessage");
let doctors = [];
let editingDoctor = null;

async function loadDepartmentOptions() {
    const control = doctorForm.elements.department;
    try {
        const response = await fetch(`${doctorApi}/departments`);
        const result = await response.json();
        if (!result.success) throw new Error(result.message);
        control.outerHTML = `<select name="department" required>${result.data.map((department) => `<option value="${department.name}">${department.name}</option>`).join("")}</select>`;
    } catch (error) {
        showDoctorMessage("Departments could not be loaded.", true);
    }
}

const showDoctorMessage = (message, error = false) => {
    doctorMessage.textContent = message;
    doctorMessage.className = `message ${error ? "error" : "success"}`;
};
const doctorPayload = () => Object.fromEntries(new FormData(doctorForm));

async function loadDoctors() {
    doctorRows.innerHTML = '<tr><td colspan="9">Loading doctors...</td></tr>';
    try {
        const response = await fetch(`${doctorApi}/doctors`);
        const result = await response.json();
        if (!result.success) throw new Error(result.message);
        doctors = result.data;
        renderDoctors();
        document.getElementById("totalDoctors").textContent = doctors.length;
        document.getElementById("activeDoctors").textContent = doctors.filter((doctor) => doctor.status === "available").length;
        document.getElementById("coveredDepartments").textContent = new Set(doctors.map((doctor) => doctor.department)).size;
    } catch (error) {
        doctorRows.innerHTML = '<tr><td colspan="9">Unable to load doctors.</td></tr>';
        showDoctorMessage(error.message, true);
    }
}

function renderDoctors() {
    const query = document.getElementById("doctorSearch").value.toLowerCase();
    const filtered = doctors.filter((doctor) => [doctor.name, doctor.specialization, doctor.department, doctor.phone, doctor.email].some((value) => String(value || "").toLowerCase().includes(query)));
    doctorRows.innerHTML = filtered.map((doctor) => `<tr><td>${doctor.doctor_id}</td><td>${doctor.name}</td><td>${doctor.specialization}</td><td>${doctor.department}</td><td>${doctor.phone}</td><td>${doctor.email}</td><td>${doctor.experience || "-"}</td><td><span class="status ${doctor.status}">${doctor.status}</span></td><td><button class="table-action" data-edit="${doctor.doctor_id}">Edit</button><button class="table-action danger" data-delete="${doctor.doctor_id}">Delete</button></td></tr>`).join("") || '<tr><td colspan="9">No doctors found.</td></tr>';
}

document.getElementById("doctorSearch").addEventListener("input", renderDoctors);
doctorForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = doctorPayload();
    if (!payload.name || !payload.specialization || !payload.department || !/^[6-9][0-9]{9}$/.test(payload.phone) || !/^\S+@\S+\.\S+$/.test(payload.email) || (payload.experience && Number(payload.experience) < 0)) return showDoctorMessage("Please enter valid doctor details.", true);
    try {
        const url = editingDoctor ? `${doctorApi}/doctors/${editingDoctor}` : `${doctorApi}/doctors`;
        const response = await fetch(url, { method: editingDoctor ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const result = await response.json();
        if (!result.success) throw new Error(result.message);
        showDoctorMessage(editingDoctor ? "Doctor updated successfully." : "Doctor added successfully.");
        editingDoctor = null; doctorForm.reset(); document.getElementById("doctorSubmit").textContent = "Add Doctor"; loadDoctors();
    } catch (error) { showDoctorMessage(error.message, true); }
});

document.getElementById("doctorClear").addEventListener("click", () => { editingDoctor = null; doctorForm.reset(); document.getElementById("doctorSubmit").textContent = "Add Doctor"; });
doctorRows.addEventListener("click", async (event) => {
    const id = event.target.dataset.edit || event.target.dataset.delete;
    if (!id) return;
    const doctor = doctors.find((item) => item.doctor_id === id);
    if (event.target.dataset.edit) { editingDoctor = id; ["name", "specialization", "department", "phone", "email", "qualification", "experience", "status"].forEach((field) => { doctorForm.elements[field].value = doctor[field] || ""; }); document.getElementById("doctorSubmit").textContent = "Update Doctor"; window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    if (!confirm(`Delete ${doctor.name}? Existing appointments will remain unchanged.`)) return;
    const response = await fetch(`${doctorApi}/doctors/${id}`, { method: "DELETE" }); const result = await response.json();
    showDoctorMessage(result.message, !result.success); if (result.success) loadDoctors();
});
loadDepartmentOptions();
loadDoctors();
