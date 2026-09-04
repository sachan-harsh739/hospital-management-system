const recordsApi = "http://localhost:4000/api";

const internalHeaders = {
    "X-Internal-Access": "true",
    "Content-Type": "application/json"
};

const patientIdInput = document.getElementById("patientIdInput");
const recordsMessage = document.getElementById("recordsMessage");

let currentPatient = null;
let currentConsultations = [];
let currentLabTests = [];
let doctors = [];

const statusLabels = {
    requested: "Requested",
    sample_collected: "Sample Collected",
    processing: "Processing",
    completed: "Completed",
    cancelled: "Cancelled"
};


// ======================================================
// UTILITY FUNCTIONS
// ======================================================

function escapeHtml(value) {
    return String(value ?? "-").replace(
        /[&<>'"]/g,
        (character) =>
            ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                "'": "&#39;",
                '"': "&quot;"
            })[character]
    );
}


function message(text, error = false) {
    if (!recordsMessage) return;

    recordsMessage.textContent = text || "";

    recordsMessage.className = `message ${
        error ? "error" : "success"
    }`;
}


async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);

    let result;

    try {
        result = await response.json();
    } catch {
        throw new Error("Server returned an invalid response.");
    }

    if (!response.ok) {
        throw new Error(
            result.message || `Request failed (${response.status}).`
        );
    }

    return result;
}


// ======================================================
// LOAD DOCTORS
// ======================================================

async function loadDoctors() {
    const consultationDoctor =
        document.getElementById("consultationDoctor");

    const labDoctor =
        document.getElementById("labDoctor");

    try {
        const result = await fetchJson(
            `${recordsApi}/doctors`,
            {
                headers: internalHeaders
            }
        );

        doctors = result.success && Array.isArray(result.data)
            ? result.data
            : [];

        const options = doctors
            .map(
                (doctor) => `
                    <option value="${escapeHtml(doctor.doctor_id)}">
                        ${escapeHtml(doctor.name)}
                        ${
                            doctor.department
                                ? `(${escapeHtml(doctor.department)})`
                                : ""
                        }
                    </option>
                `
            )
            .join("");

        if (consultationDoctor) {
            consultationDoctor.innerHTML = `
                <option value="">Select doctor</option>
                ${options}
            `;
        }

        if (labDoctor) {
            labDoctor.innerHTML = `
                <option value="">Select doctor</option>
                ${options}
            `;
        }

    } catch (error) {

        doctors = [];

        if (consultationDoctor) {
            consultationDoctor.innerHTML =
                '<option value="">Doctors unavailable</option>';
        }

        if (labDoctor) {
            labDoctor.innerHTML =
                '<option value="">Doctors unavailable</option>';
        }
    }
}


// ======================================================
// CONSULTATION SELECT
// ======================================================

function populateConsultationSelect(
    selectId,
    selectedValue = null
) {
    const select = document.getElementById(selectId);

    if (!select) return;

    if (!currentConsultations.length) {

        select.innerHTML =
            '<option value="">No consultations yet – create one first</option>';

        return;
    }

    select.innerHTML = `
        <option value="">Select consultation</option>

        ${currentConsultations
            .map(
                (consultation) => `
                    <option value="${escapeHtml(
                        consultation.consultation_id
                    )}">
                        ${escapeHtml(
                            consultation.consultation_id
                        )}
                        -
                        ${escapeHtml(
                            consultation.consultation_date
                        )}
                        -
                        ${escapeHtml(
                            consultation.doctor_name || "Doctor"
                        )}
                    </option>
                `
            )
            .join("")}
    `;

    if (selectedValue) {
        select.value = selectedValue;
    }
}


// ======================================================
// LOAD PATIENT RECORDS
// ======================================================

async function loadPatientRecords(patientId) {

    if (!patientId) {
        message("Please enter a Patient ID.", true);
        return;
    }

    recordsMessage.textContent =
        "Loading patient records…";

    recordsMessage.className = "message";

    try {

        const encodedPatientId =
            encodeURIComponent(patientId);

        const [
            patientResult,
            medicalResult,
            consultationResult,
            labResult,
            appointmentResult
        ] = await Promise.all([

            fetchJson(
                `${recordsApi}/patients/${encodedPatientId}`,
                {
                    headers: internalHeaders
                }
            ),

            fetchJson(
                `${recordsApi}/patients/${encodedPatientId}/medical-records`,
                {
                    headers: internalHeaders
                }
            ),

            fetchJson(
                `${recordsApi}/consultations/patient/${encodedPatientId}`,
                {
                    headers: internalHeaders
                }
            ),

            fetchJson(
                `${recordsApi}/lab-tests/patient/${encodedPatientId}`,
                {
                    headers: internalHeaders
                }
            ),

            fetchJson(
                `${recordsApi}/patients/${encodedPatientId}/appointments`,
                {
                    headers: internalHeaders
                }
            )
        ]);


        if (!patientResult.success) {
            throw new Error(
                patientResult.message ||
                "Patient not found."
            );
        }


        currentPatient = patientResult.data;

        currentConsultations =
            consultationResult.success &&
            Array.isArray(consultationResult.data)
                ? consultationResult.data
                : [];


        currentLabTests =
            labResult.success &&
            Array.isArray(labResult.data)
                ? labResult.data
                : [];


        renderProfile(currentPatient);

        renderConsultations(
            currentConsultations
        );

        renderMedicalHistory(
            medicalResult.success &&
            Array.isArray(medicalResult.data)
                ? medicalResult.data
                : []
        );

        renderLabTests(
            currentLabTests
        );

        renderAppointments(
            appointmentResult.success &&
            Array.isArray(appointmentResult.data)
                ? appointmentResult.data
                : []
        );


        populateConsultationSelect(
            "labConsultation"
        );


        message(
            `Records loaded for ${currentPatient.patient_id}.`,
            false
        );


        const recordsView =
            document.getElementById("recordsView");

        if (recordsView) {
            recordsView.classList.remove("hidden");
        }

    } catch (error) {

        currentPatient = null;
        currentConsultations = [];
        currentLabTests = [];

        const recordsView =
            document.getElementById("recordsView");

        if (recordsView) {
            recordsView.classList.add("hidden");
        }

        message(
            error.message ||
            "Unable to load patient records.",
            true
        );
    }
}


// ======================================================
// PATIENT PROFILE
// ======================================================

function renderProfile(patient) {

    const title =
        document.getElementById("patientTitle");

    const profile =
        document.getElementById("patientProfile");

    if (!patient || !profile) return;


    if (title) {
        title.textContent =
            `${patient.patient_id} - ${patient.full_name}`;
    }


    profile.innerHTML = `

        <div>
            <strong>Patient ID</strong>
            <span>
                ${escapeHtml(patient.patient_id)}
            </span>
        </div>

        <div>
            <strong>Name</strong>
            <span>
                ${escapeHtml(patient.full_name)}
            </span>
        </div>

        <div>
            <strong>Date of Birth</strong>
            <span>
                ${escapeHtml(patient.date_of_birth)}
            </span>
        </div>

        <div>
            <strong>Gender</strong>
            <span>
                ${escapeHtml(patient.gender)}
            </span>
        </div>

        <div>
            <strong>Blood Group</strong>
            <span>
                ${escapeHtml(
                    patient.blood_group ||
                    "Not recorded"
                )}
            </span>
        </div>

        <div>
            <strong>Mobile</strong>
            <span>
                ${escapeHtml(patient.mobile)}
            </span>
        </div>

        <div>
            <strong>Email</strong>
            <span>
                ${escapeHtml(
                    patient.email ||
                    "Not recorded"
                )}
            </span>
        </div>

        <div>
            <strong>Allergies</strong>
            <span>
                ${escapeHtml(
                    patient.allergies ||
                    "Not recorded"
                )}
            </span>
        </div>

        <div>
            <strong>Preferred Department</strong>
            <span>
                ${escapeHtml(
                    patient.preferred_department ||
                    "Not recorded"
                )}
            </span>
        </div>

        <div>
            <strong>Preferred Doctor</strong>
            <span>
                ${escapeHtml(
                    patient.preferred_doctor ||
                    "Not recorded"
                )}
            </span>
        </div>
    `;
}


// ======================================================
// CONSULTATIONS
// ======================================================

function renderConsultations(
    consultations
) {

    const rows =
        document.getElementById(
            "consultationRows"
        );

    if (!rows) return;


    rows.innerHTML =
        consultations
            .map(
                (consultation) => `
                    <tr>

                        <td>
                            ${escapeHtml(
                                consultation.consultation_id
                            )}
                        </td>

                        <td>
                            ${escapeHtml(
                                consultation.consultation_date
                            )}
                        </td>

                        <td>
                            ${escapeHtml(
                                consultation.doctor_name ||
                                "-"
                            )}
                        </td>

                        <td>
                            ${escapeHtml(
                                consultation.department ||
                                "-"
                            )}
                        </td>

                        <td class="wrap-cell">
                            ${escapeHtml(
                                consultation.notes ||
                                "-"
                            )}
                        </td>

                    </tr>
                `
            )
            .join("") ||

        `
            <tr>
                <td
                    colspan="5"
                    class="loading-cell"
                >
                    No consultations recorded.
                </td>
            </tr>
        `;
}


// ======================================================
// MEDICAL HISTORY
// ======================================================

function renderMedicalHistory(
    records
) {

    const rows =
        document.getElementById(
            "historyRows"
        );

    if (!rows) return;


    rows.innerHTML =
        records
            .map(
                (record) => `
                    <tr>

                        <td>
                            ${escapeHtml(
                                record.record_type
                            )}
                        </td>

                        <td>
                            ${escapeHtml(
                                record.record_date
                            )}
                        </td>

                        <td>
                            ${escapeHtml(
                                record.doctor ||
                                "-"
                            )}
                        </td>

                        <td>
                            ${escapeHtml(
                                record.diagnosis ||
                                "-"
                            )}
                        </td>

                        <td class="wrap-cell">
                            ${escapeHtml(
                                record.doctor_notes ||
                                "-"
                            )}
                        </td>

                    </tr>
                `
            )
            .join("") ||

        `
            <tr>
                <td
                    colspan="5"
                    class="loading-cell"
                >
                    No medical history recorded.
                </td>
            </tr>
        `;
}


// ======================================================
// LAB TESTS
// ======================================================

function renderLabTests(
    tests
) {

    const rows =
        document.getElementById(
            "labRows"
        );

    if (!rows) return;


    rows.innerHTML =
        tests
            .map(
                (test) => {

                    const reportAvailable =
                        test.report_status ===
                        "available";

                    const reportId =
                        test.report_id;


                    return `
                        <tr>

                            <td>
                                ${escapeHtml(
                                    test.test_name
                                )}
                            </td>

                            <td>
                                ${escapeHtml(
                                    test.test_date
                                )}
                            </td>

                            <td>
                                ${escapeHtml(
                                    test.doctor_name ||
                                    "-"
                                )}
                            </td>

                            <td>

                                <span
                                    class="badge badge-${escapeHtml(
                                        test.status
                                    )}"
                                >
                                    ${escapeHtml(
                                        statusLabels[
                                            test.status
                                        ] ||
                                        test.status
                                    )}
                                </span>

                            </td>

                            <td>

                                <span
                                    class="badge ${
                                        reportAvailable
                                            ? "badge-available"
                                            : "badge-unavailable"
                                    }"
                                >
                                    ${
                                        reportAvailable
                                            ? "Available"
                                            : "Not Available"
                                    }
                                </span>

                            </td>

                            <td>

                                ${
                                    reportAvailable &&
                                    reportId
                                        ? `
                                            <button
                                                type="button"
                                                class="table-action"
                                                data-preview="${escapeHtml(
                                                    reportId
                                                )}"
                                            >
                                                View Report
                                            </button>

                                            <button
                                                type="button"
                                                class="table-action"
                                                data-download="${escapeHtml(
                                                    reportId
                                                )}"
                                            >
                                                Download
                                            </button>
                                        `
                                        : `
                                            Report not available yet
                                        `
                                }

                            </td>

                        </tr>
                    `;
                }
            )
            .join("") ||

        `
            <tr>
                <td
                    colspan="6"
                    class="loading-cell"
                >
                    No lab tests recorded for this patient.
                </td>
            </tr>
        `;
}


// ======================================================
// APPOINTMENTS
// ======================================================

function renderAppointments(
    appointments
) {

    const rows =
        document.getElementById(
            "appointmentRows"
        );

    if (!rows) return;


    rows.innerHTML =
        appointments
            .map(
                (appointment) => `
                    <tr>

                        <td>
                            ${escapeHtml(
                                appointment.appointment_date
                            )}
                        </td>

                        <td>
                            ${escapeHtml(
                                appointment.appointment_time
                            )}
                        </td>

                        <td>
                            ${escapeHtml(
                                appointment.doctor
                            )}
                        </td>

                        <td>
                            ${escapeHtml(
                                appointment.department
                            )}
                        </td>

                        <td class="wrap-cell">
                            ${escapeHtml(
                                appointment.reason
                            )}
                        </td>

                        <td>
                            ${escapeHtml(
                                appointment.status
                            )}
                        </td>

                    </tr>
                `
            )
            .join("") ||

        `
            <tr>
                <td
                    colspan="6"
                    class="loading-cell"
                >
                    No appointments found.
                </td>
            </tr>
        `;
}


// ======================================================
// PATIENT LOOKUP
// ======================================================

const patientLookupForm =
    document.getElementById(
        "patientLookupForm"
    );

if (patientLookupForm) {

    patientLookupForm.addEventListener(
        "submit",
        (event) => {

            event.preventDefault();

            const id =
                patientIdInput?.value.trim();

            if (!id) {
                message(
                    "Please enter a Patient ID.",
                    true
                );
                return;
            }

            loadPatientRecords(id);
        }
    );
}


// ======================================================
// CREATE CONSULTATION
// ======================================================

const consultationForm =
    document.getElementById(
        "consultationForm"
    );

if (consultationForm) {

    consultationForm.addEventListener(
        "submit",
        async (event) => {

            event.preventDefault();

            if (!currentPatient) {
                message(
                    "Load a patient first.",
                    true
                );
                return;
            }


            const payload =
                Object.fromEntries(
                    new FormData(event.target)
                );


            payload.patientId =
                currentPatient.patient_id;


            if (
                !payload.doctorId ||
                !payload.consultationDate
            ) {

                message(
                    "Doctor and date are required.",
                    true
                );

                return;
            }


            try {

                const result =
                    await fetchJson(
                        `${recordsApi}/consultations`,
                        {
                            method: "POST",
                            headers: internalHeaders,
                            body: JSON.stringify(
                                payload
                            )
                        }
                    );


                message(
                    result.message ||
                    "Consultation created.",
                    !result.success
                );


                if (result.success) {

                    event.target.reset();

                    const consultationDate =
                        document.getElementById(
                            "consultationDate"
                        );

                    if (consultationDate) {

                        consultationDate.value =
                            new Date()
                                .toISOString()
                                .slice(0, 10);
                    }


                    await loadPatientRecords(
                        currentPatient.patient_id
                    );


                    if (
                        result.data &&
                        result.data.consultationId
                    ) {

                        populateConsultationSelect(
                            "labConsultation",
                            result.data.consultationId
                        );
                    }
                }

            } catch (error) {

                message(
                    error.message ||
                    "Unable to create consultation.",
                    true
                );
            }
        }
    );
}


// ======================================================
// CREATE LAB TEST
// ======================================================

const labTestForm =
    document.getElementById(
        "labTestForm"
    );

if (labTestForm) {

    labTestForm.addEventListener(
        "submit",
        async (event) => {

            event.preventDefault();

            if (!currentPatient) {

                message(
                    "Load a patient first.",
                    true
                );

                return;
            }


            const payload =
                Object.fromEntries(
                    new FormData(event.target)
                );


            payload.patientId =
                currentPatient.patient_id;


            if (
                !payload.testName ||
                !payload.testCategory
            ) {

                message(
                    "Test name and category are required.",
                    true
                );

                return;
            }


            if (!payload.consultationId) {

                message(
                    "Please select a consultation for this lab request.",
                    true
                );

                return;
            }


            try {

                const result =
                    await fetchJson(
                        `${recordsApi}/lab-tests`,
                        {
                            method: "POST",
                            headers: internalHeaders,
                            body: JSON.stringify(
                                payload
                            )
                        }
                    );


                message(
                    result.message ||
                    "Lab test requested.",
                    !result.success
                );


                if (result.success) {

                    event.target.reset();

                    await loadPatientRecords(
                        currentPatient.patient_id
                    );
                }

            } catch (error) {

                message(
                    error.message ||
                    "Unable to create lab test.",
                    true
                );
            }
        }
    );
}


// ======================================================
// LAB REPORT ACTIONS
// ======================================================

const labRows =
    document.getElementById(
        "labRows"
    );

if (labRows) {

    labRows.addEventListener(
        "click",
        async (event) => {

            const button =
                event.target.closest(
                    ".table-action"
                );

            if (!button) return;


            if (button.dataset.preview) {

                await openReportModal(
                    button.dataset.preview
                );

            } else if (
                button.dataset.download
            ) {

                await downloadReport(
                    button.dataset.download
                );
            }
        }
    );
}


// ======================================================
// OPEN REPORT MODAL
// ======================================================

async function openReportModal(
    reportId
) {

    const modal =
        document.getElementById(
            "reportModal"
        );

    const body =
        document.getElementById(
            "reportModalBody"
        );


    if (!modal || !body) return;


    modal.classList.remove(
        "hidden"
    );


    body.innerHTML =
        '<div class="loading-cell">Loading report…</div>';


    try {

        const response =
            await fetch(
                `${recordsApi}/lab-reports/${encodeURIComponent(
                    reportId
                )}?preview=true`,
                {
                    headers: internalHeaders
                }
            );


        if (!response.ok) {

            body.innerHTML =
                `
                    <div class="loading-cell">
                        This report is not available.
                    </div>
                `;

            return;
        }


        const blob =
            await response.blob();


        const url =
            URL.createObjectURL(
                blob
            );


        if (
            (blob.type || "")
                .startsWith("image/")
        ) {

            body.innerHTML = `
                <img
                    class="report-preview"
                    src="${url}"
                    alt="Lab report"
                >
            `;

        } else {

            body.innerHTML = `
                <iframe
                    class="report-preview report-iframe"
                    src="${url}"
                    title="Lab report"
                ></iframe>
            `;
        }


        const downloadButton =
            document.getElementById(
                "reportDownload"
            );


        if (downloadButton) {

            downloadButton.dataset.report =
                reportId;
        }


        modal.dataset.reportUrl =
            url;

    } catch (error) {

        body.innerHTML =
            `
                <div class="loading-cell">
                    Unable to load this report.
                </div>
            `;
    }
}


// ======================================================
// DOWNLOAD REPORT
// ======================================================

const reportDownload =
    document.getElementById(
        "reportDownload"
    );

if (reportDownload) {

    reportDownload.addEventListener(
        "click",
        () => {

            const reportId =
                reportDownload.dataset.report;

            if (reportId) {

                downloadReport(
                    reportId
                );
            }
        }
    );
}


async function downloadReport(
    reportId
) {

    try {

        const response =
            await fetch(
                `${recordsApi}/lab-reports/${encodeURIComponent(
                    reportId
                )}?download=true`,
                {
                    headers: internalHeaders
                }
            );


        if (!response.ok) {

            message(
                "Report is unavailable.",
                true
            );

            return;
        }


        const blob =
            await response.blob();


        const url =
            URL.createObjectURL(
                blob
            );


        const contentDisposition =
            response.headers.get(
                "Content-Disposition"
            );


        let fileName =
            `${reportId}.pdf`;


        if (contentDisposition) {

            const match =
                contentDisposition.match(
                    /filename="?([^"]+)"?/i
                );

            if (match && match[1]) {

                fileName =
                    match[1];
            }
        }


        const link =
            document.createElement(
                "a"
            );


        link.href = url;

        link.download =
            fileName;

        document.body.appendChild(
            link
        );

        link.click();

        link.remove();


        setTimeout(
            () => {
                URL.revokeObjectURL(
                    url
                );
            },
            60000
        );

    } catch (error) {

        message(
            "Unable to download report.",
            true
        );
    }
}


// ======================================================
// CLOSE REPORT MODAL
// ======================================================

function closeReportModal() {

    const modal =
        document.getElementById(
            "reportModal"
        );


    const body =
        document.getElementById(
            "reportModalBody"
        );


    if (!modal) return;


    modal.classList.add(
        "hidden"
    );


    if (modal.dataset.reportUrl) {

        URL.revokeObjectURL(
            modal.dataset.reportUrl
        );
    }


    delete modal.dataset.reportUrl;


    if (body) {

        body.innerHTML = "";
    }


    const downloadButton =
        document.getElementById(
            "reportDownload"
        );


    if (downloadButton) {

        delete downloadButton.dataset.report;
    }
}


// ======================================================
// MODAL EVENTS
// ======================================================

document
    .querySelectorAll(".modal-close")
    .forEach(
        (button) => {

            button.addEventListener(
                "click",
                closeReportModal
            );
        }
    );


const reportModal =
    document.getElementById(
        "reportModal"
    );


if (reportModal) {

    reportModal.addEventListener(
        "click",
        (event) => {

            if (
                event.target ===
                reportModal
            ) {

                closeReportModal();
            }
        }
    );
}


// ======================================================
// ESC KEY TO CLOSE MODAL
// ======================================================

document.addEventListener(
    "keydown",
    (event) => {

        if (
            event.key === "Escape"
        ) {

            const modal =
                document.getElementById(
                    "reportModal"
                );

            if (
                modal &&
                !modal.classList.contains(
                    "hidden"
                )
            ) {

                closeReportModal();
            }
        }
    }
);


// ======================================================
// INITIALISE PAGE
// ======================================================

async function initialisePage() {

    await loadDoctors();


    const consultationDate =
        document.getElementById(
            "consultationDate"
        );


    if (consultationDate) {

        consultationDate.value =
            new Date()
                .toISOString()
                .slice(0, 10);
    }


    const initialPatientElement =
        document.getElementById(
            "initialPatientId"
        );


    const initialPatientId =
        new URLSearchParams(
            window.location.search
        ).get("id") ||
        initialPatientElement?.value ||
        "";


    if (initialPatientId) {

        if (patientIdInput) {

            patientIdInput.value =
                initialPatientId;
        }


        await loadPatientRecords(
            initialPatientId
        );
    }
}


initialisePage();