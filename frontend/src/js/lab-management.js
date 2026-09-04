const labApi = "http://localhost:4000/api";
const labRows = document.getElementById("labRows");
const labMessage = document.getElementById("labMessage");
let labTests = [];
let activeUploadTestId = null;

const statusLabels = {
    requested: "Requested",
    sample_collected: "Sample Collected",
    processing: "Processing",
    completed: "Completed",
    cancelled: "Cancelled"
};
// Forward-only workflow enforced on the client too; the backend enforces the same rules.
const statusWorkflow = {
    requested: ["sample_collected", "cancelled"],
    sample_collected: ["processing", "cancelled"],
    processing: ["completed", "cancelled"],
    completed: [],
    cancelled: []
};

function escapeHtml(value) {
    return String(value ?? "-").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

function message(text, error = false) {
    labMessage.textContent = text;
    labMessage.className = `message ${error ? "error" : "success"}`;
}

async function loadLabTests() {
    labRows.innerHTML = '<tr><td colspan="10" class="loading-cell">Loading lab tests…</td></tr>';
    try {
        const result = await fetch(`${labApi}/lab-tests`, { headers: { "X-Internal-Access": "true" } }).then((response) => response.json());
        if (!result.success) throw new Error(result.message);
        labTests = result.data;
        updateStats();
        populateCategoryFilter();
        renderLabTests();
    } catch (error) {
        labRows.innerHTML = `<tr><td colspan="10" class="loading-cell">${escapeHtml(error.message)}</td></tr>`;
    }
}

function updateStats() {
    document.getElementById("totalLabTests").textContent = labTests.length;
    const pending = labTests.filter((test) => ["requested", "sample_collected"].includes(test.status)).length;
    document.getElementById("requestedLabTests").textContent = pending;
    document.getElementById("processingLabTests").textContent = labTests.filter((test) => test.status === "processing").length;
    document.getElementById("completedLabTests").textContent = labTests.filter((test) => test.status === "completed").length;
    document.getElementById("cancelledLabTests").textContent = labTests.filter((test) => test.status === "cancelled").length;
    document.getElementById("uploadedReports").textContent = labTests.filter((test) => test.report_status === "available").length;
}

function populateCategoryFilter() {
    const select = document.getElementById("categoryFilter");
    const current = select.value;
    select.innerHTML = `<option value="">All categories</option>${[...new Set(labTests.map((test) => test.test_category).filter(Boolean))].map((category) => `<option>${escapeHtml(category)}</option>`).join("")}`;
    select.value = current;
}

function statusCell(test) {
    const options = statusWorkflow[test.status] || [];
    if (!options.length) {
        return `<span class="badge badge-${test.status}">${statusLabels[test.status] || test.status}</span>`;
    }
    const optionHtml = [`<option value="${test.status}" selected>${statusLabels[test.status] || test.status}</option>`]
        .concat(options.map((value) => `<option value="${value}">${statusLabels[value]}</option>`))
        .join("");
    return `<select class="status-select" data-test="${test.test_id}" data-current="${test.status}" aria-label="Update status">${optionHtml}</select>`;
}

function renderLabTests() {
    const query = document.getElementById("labSearch").value.toLowerCase();
    const status = document.getElementById("statusFilter").value;
    const date = document.getElementById("testDateFilter").value;
    const category = document.getElementById("categoryFilter").value;
    const rows = labTests.filter((test) => {
        const haystack = [test.test_id, test.patient_code, test.patient_name, test.test_name, test.doctor_name]
            .map((value) => String(value || "").toLowerCase())
            .join(" ");
        return (!query || haystack.includes(query)) && (!status || test.status === status) && (!date || test.test_date === date) && (!category || test.test_category === category);
    });
    if (!rows.length) {
        labRows.innerHTML = '<tr><td colspan="10" class="loading-cell">No lab tests match your search or filters.</td></tr>';
        return;
    }
    labRows.innerHTML = rows.map((test) => {
        const reportAvailable = test.report_status === "available";
        const canUpload = test.status === "completed" && !reportAvailable;
        const actions = [
            `<button type="button" class="table-action" data-view="${escapeHtml(test.test_id)}">View</button>`,
            canUpload ? `<button type="button" class="table-action" data-upload="${escapeHtml(test.test_id)}">Upload Report</button>` : "",
            reportAvailable ? `<button type="button" class="table-action" data-report="${escapeHtml(test.report_id)}">View Report</button>` : "",
            reportAvailable ? `<button type="button" class="table-action" data-download="${escapeHtml(test.report_id)}">Download</button>` : ""
        ].filter(Boolean).join("");
        return `<tr>
            <td>${escapeHtml(test.test_id)}</td>
            <td>${escapeHtml(test.patient_code)}</td>
            <td>${escapeHtml(test.patient_name)}</td>
            <td>${escapeHtml(test.doctor_name || "-")}</td>
            <td>${escapeHtml(test.test_name)}</td>
            <td>${escapeHtml(test.test_category)}</td>
            <td>${escapeHtml(test.test_date)}</td>
            <td>${statusCell(test)}</td>
            <td><span class="badge ${reportAvailable ? "badge-available" : "badge-unavailable"}">${reportAvailable ? "Available" : "Not Available"}</span></td>
            <td>${actions}</td>
        </tr>`;
    }).join("");
["labSearch", "statusFilter", "testDateFilter", "categoryFilter"].forEach((id) => document.getElementById(id).addEventListener("input", renderLabTests));

document.getElementById("labTestForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.target));
    if (!payload.patientId || !payload.testName || !payload.testCategory) return message("Patient ID, test name and category are required.", true);
    message("Creating lab request…", false);
    const response = await fetch(`${labApi}/lab-tests`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Internal-Access": "true" },
        body: JSON.stringify(payload)
    });
    const result = await response.json();
    message(result.message, !result.success);
    if (result.success) { event.target.reset(); loadLabTests(); }
});

// Status workflow update (client only offers valid forward transitions).
labRows.addEventListener("change", async (event) => {
    const select = event.target.closest(".status-select");
    if (!select) return;
    const testId = select.dataset.test;
    const nextStatus = select.value;
    const current = select.dataset.current;
    if (nextStatus === current) return;
    const allowed = statusWorkflow[current] || [];
    if (!allowed.includes(nextStatus)) { message(`Cannot change ${statusLabels[current]} to ${statusLabels[nextStatus]}.`, true); loadLabTests(); return; }
    const response = await fetch(`${labApi}/lab-tests/${encodeURIComponent(testId)}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Internal-Access": "true" },
        body: JSON.stringify({ status: nextStatus })
    });
    const result = await response.json();
    message(result.message, !result.success);
    loadLabTests();
});

// Action buttons.
labRows.addEventListener("click", (event) => {
    const button = event.target.closest(".table-action");
    if (!button) return;
    if (button.dataset.view) openDetailModal(button.dataset.view);
    else if (button.dataset.upload) openUploadModal(button.dataset.upload);
    else if (button.dataset.report) openReportModal(button.dataset.report);
    else if (button.dataset.download) downloadReport(button.dataset.download);
});

function openDetailModal(testId) {
    const test = labTests.find((item) => item.test_id === testId);
    if (!test) return message("Lab test not found.", true);
    document.getElementById("detailBody").innerHTML = `
        <div class="detail-grid">
            <div><strong>Test ID</strong><span>${escapeHtml(test.test_id)}</span></div>
            <div><strong>Patient</strong><span>${escapeHtml(test.patient_code)} - ${escapeHtml(test.patient_name)}</span></div>
            <div><strong>Doctor</strong><span>${escapeHtml(test.doctor_name || "-")}</span></div>
            <div><strong>Test Name</strong><span>${escapeHtml(test.test_name)}</span></div>
            <div><strong>Category</strong><span>${escapeHtml(test.test_category)}</span></div>
            <div><strong>Priority</strong><span>${escapeHtml(test.priority)}</span></div>
            <div><strong>Test Date</strong><span>${escapeHtml(test.test_date)}</span></div>
            <div><strong>Status</strong><span>${escapeHtml(statusLabels[test.status] || test.status)}</span></div>
            <div class="full"><strong>Instructions</strong><span>${escapeHtml(test.instructions || "None")}</span></div>
            <div class="full"><strong>Requested At</strong><span>${escapeHtml(test.created_at || "-")}</span></div>
        </div>`;
    document.getElementById("detailModal").classList.remove("hidden");
}

function openUploadModal(testId) {
    activeUploadTestId = testId;
    const test = labTests.find((item) => item.test_id === testId);
    document.getElementById("uploadModalTitle").textContent = `Upload Report - ${test ? test.test_name : testId}`;
    document.getElementById("uploadTestId").value = testId;
    document.getElementById("uploadFileName").textContent = "No file selected";
    document.getElementById("uploadFile").value = "";
    document.getElementById("uploadMessage").textContent = "";
    document.getElementById("uploadModal").classList.remove("hidden");
}

document.getElementById("uploadFile").addEventListener("change", (event) => {
    const file = event.target.files[0];
    document.getElementById("uploadFileName").textContent = file ? file.name : "No file selected";
});
document.getElementById("uploadForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const fileInput = document.getElementById("uploadFile");
    const file = fileInput.files[0];
    const uploadMessageEl = document.getElementById("uploadMessage");
    uploadMessageEl.textContent = "";
    if (!file) { uploadMessageEl.textContent = "Please choose a PDF, JPG or PNG file."; uploadMessageEl.className = "message error"; return; }
    const extension = file.name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || "";
    if (![".pdf", ".jpg", ".jpeg", ".png"].includes(extension)) { uploadMessageEl.textContent = "Only PDF, JPG, JPEG and PNG files are allowed."; uploadMessageEl.className = "message error"; return; }
    const maxBytes = 10 * 1024 * 1024;
    if (file.size > maxBytes) { uploadMessageEl.textContent = "Report file is too large. Maximum size is 10 MB."; uploadMessageEl.className = "message error"; return; }
    uploadMessageEl.textContent = "Uploading report…";
    uploadMessageEl.className = "message";
    const body = new FormData();
    body.append("testId", activeUploadTestId);
    body.append("uploadedBy", "Lab staff");
    body.append("report", file);
    try {
        const response = await fetch(`${labApi}/lab-reports`, { method: "POST", headers: { "X-Internal-Access": "true" }, body });
        const result = await response.json();
        uploadMessageEl.textContent = result.message;
        uploadMessageEl.className = `message ${result.success ? "success" : "error"}`;
        if (result.success) { closeModal("uploadModal"); message(result.message, false); loadLabTests(); }
    } catch (error) {
        uploadMessageEl.textContent = "Unable to upload report right now.";
        uploadMessageEl.className = "message error";
    }
});

async function openReportModal(reportId) {
    const modal = document.getElementById("reportModal");
    const title = document.getElementById("reportModalTitle");
    const body = document.getElementById("reportModalBody");
    modal.classList.remove("hidden");
    title.textContent = `Report ${reportId}`;
    body.innerHTML = '<div class="loading-cell">Loading report…</div>';
    try {
        const response = await fetch(`${labApi}/lab-reports/${encodeURIComponent(reportId)}?preview=true`, { headers: { "X-Internal-Access": "true" } });
        if (!response.ok) { body.innerHTML = '<div class="loading-cell">This report is not available.</div>'; return; }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const type = blob.type || "";
        if (type.startsWith("image/")) body.innerHTML = `<img class="report-preview" src="${url}" alt="Lab report">`;
        else body.innerHTML = `<iframe class="report-preview report-iframe" src="${url}" title="Lab report"></iframe>`;
        document.getElementById("reportDownload").dataset.report = reportId;
        modal.dataset.reportUrl = url;
    } catch (error) {
        body.innerHTML = '<div class="loading-cell">Unable to load this report.</div>';
    }
}

document.getElementById("reportDownload").addEventListener("click", () => {
    const reportId = document.getElementById("reportDownload").dataset.report;
    if (reportId) downloadReport(reportId);
});

async function downloadReport(reportId) {
    try {
        const response = await fetch(`${labApi}/lab-reports/${encodeURIComponent(reportId)}?download=true`, { headers: { "X-Internal-Access": "true" } });
        if (!response.ok) return message("Report is unavailable.", true);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = reportId;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
        message("Unable to download report.", true);
    }
}

function closeModal(name) {
    const modal = document.getElementById(name);
    modal.classList.add("hidden");
    if (name === "reportModal" && modal.dataset.reportUrl) {
        URL.revokeObjectURL(modal.dataset.reportUrl);
        delete modal.dataset.reportUrl;
        document.getElementById("reportModalBody").innerHTML = "";
    }
}
document.querySelectorAll(".modal-close").forEach((button) => button.addEventListener("click", (event) => closeModal(event.target.closest(".modal").id)));
document.querySelectorAll(".modal").forEach((modal) => modal.addEventListener("click", (event) => { if (event.target === modal) closeModal(modal.id); }));

loadLabTests();
}