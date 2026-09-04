// =====================================================
// MOBILE MENU
// =====================================================

const mobileMenuButton = document.getElementById("mobileMenuButton");
const mobileMenu = document.getElementById("mobileMenu");

const API_BASE_URL = "https://hospital-management-system-production-a31b.up.railway.app/api";

async function submitToApi(endpoint, payload) {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok) {
        throw new Error(result.message || "Request could not be completed.");
    }

    return result;
}

if (mobileMenuButton && mobileMenu) {
    mobileMenuButton.addEventListener("click", () => {
        mobileMenu.classList.toggle("hidden");
    });
}


// =====================================================
// COMMON HELPERS
// =====================================================

function showError(input, message) {

    if (!input) return;

    removeError(input);

    input.classList.add(
        "border-red-500",
        "focus:border-red-500",
        "focus:ring-red-50"
    );

    const error = document.createElement("p");

    error.className = "mt-2 text-sm font-medium text-red-600";
    error.textContent = message;
    error.dataset.error = "true";

    input.parentElement.appendChild(error);
}


function removeError(input) {

    if (!input) return;

    input.classList.remove(
        "border-red-500",
        "focus:border-red-500",
        "focus:ring-red-50"
    );

    const error =
        input.parentElement.querySelector(
            '[data-error="true"]'
        );

    if (error) {
        error.remove();
    }
}


function markValid(input) {

    if (!input) return;

    removeError(input);

    input.classList.add("border-green-500");
}


// =====================================================
// PATIENT REGISTRATION
// =====================================================

const patientForm =
    document.getElementById("patientRegistrationForm");

if (patientForm) {

    const successMessage =
        document.getElementById("registrationSuccess");

    const existsMessage =
        document.getElementById("patientExistsMessage");


    function validatePatientName() {

        const input =
            document.getElementById("fullName");

        const value = input.value.trim();

        if (value === "") {

            showError(
                input,
                "Please enter patient's full name."
            );

            return false;
        }

        if (value.length < 3) {

            showError(
                input,
                "Name must contain at least 3 characters."
            );

            return false;
        }

        if (!/^[A-Za-z ]+$/.test(value)) {

            showError(
                input,
                "Name should contain only letters."
            );

            return false;
        }

        markValid(input);

        return true;
    }


    function validateDOB() {

        const input =
            document.getElementById("dob");

        if (input.value === "") {

            showError(
                input,
                "Please select date of birth."
            );

            return false;
        }

        const selectedDate =
            new Date(input.value);

        const today =
            new Date();

        if (selectedDate > today) {

            showError(
                input,
                "Date of birth cannot be in the future."
            );

            return false;
        }

        markValid(input);

        return true;
    }


    function validateGender() {

        const input =
            document.getElementById("gender");

        if (input.value === "") {

            showError(
                input,
                "Please select gender."
            );

            return false;
        }

        markValid(input);

        return true;
    }


    function validatePatientMobile() {

        const input =
            document.getElementById("mobile");

        const value =
            input.value.trim();

        if (value === "") {

            showError(
                input,
                "Please enter mobile number."
            );

            return false;
        }

        if (!/^[6-9][0-9]{9}$/.test(value)) {

            showError(
                input,
                "Please enter a valid 10-digit mobile number."
            );

            return false;
        }

        markValid(input);

        return true;
    }


    function validatePatientEmail() {

        const input =
            document.getElementById("email");

        const value =
            input.value.trim();

        if (value === "") {

            removeError(input);

            input.classList.remove(
                "border-green-500"
            );

            return true;
        }

        const emailPattern =
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailPattern.test(value)) {

            showError(
                input,
                "Please enter a valid email address."
            );

            return false;
        }

        markValid(input);

        return true;
    }


    function validateAddress() {

        const input =
            document.getElementById("address");

        const value =
            input.value.trim();

        if (value.length < 10) {

            showError(
                input,
                "Please enter a complete address."
            );

            return false;
        }

        markValid(input);

        return true;
    }


    function validateSimpleField(id, message) {

        const input =
            document.getElementById(id);

        if (input.value.trim() === "") {

            showError(
                input,
                message
            );

            return false;
        }

        markValid(input);

        return true;
    }


    function validatePincode() {

        const input =
            document.getElementById("pincode");

        const value =
            input.value.trim();

        if (!/^[0-9]{6}$/.test(value)) {

            showError(
                input,
                "Pincode must contain exactly 6 digits."
            );

            return false;
        }

        markValid(input);

        return true;
    }


    function validateEmergencyMobile() {

        const input =
            document.getElementById("emergencyMobile");

        const patientMobile =
            document.getElementById("mobile");

        const value =
            input.value.trim();

        if (!/^[6-9][0-9]{9}$/.test(value)) {

            showError(
                input,
                "Please enter a valid emergency mobile number."
            );

            return false;
        }

        if (
            value ===
            patientMobile.value.trim()
        ) {

            showError(
                input,
                "Emergency number should be different."
            );

            return false;
        }

        markValid(input);

        return true;
    }


    function validateRelationship() {

        const input =
            document.getElementById("relationship");

        if (input.value === "") {

            showError(
                input,
                "Please select relationship."
            );

            return false;
        }

        markValid(input);

        return true;
    }


    patientForm.addEventListener(
        "submit",
        async function (event) {

            event.preventDefault();

            if (successMessage) {
                successMessage.classList.add("hidden");
            }

            if (existsMessage) {
                existsMessage.classList.add("hidden");
            }


            const valid =
                validatePatientName() &&
                validateDOB() &&
                validateGender() &&
                validatePatientMobile() &&
                validatePatientEmail() &&
                validateAddress() &&
                validateSimpleField(
                    "city",
                    "Please enter city."
                ) &&
                validateSimpleField(
                    "state",
                    "Please enter state."
                ) &&
                validatePincode();


            const consent =
                document.getElementById("consent");

            if (!consent.checked) {

                showError(
                    consent,
                    "Please confirm the information."
                );

                return;
            }


            if (!valid) {

                const firstError =
                    patientForm.querySelector(
                        ".border-red-500"
                    );

                if (firstError) {

                    firstError.scrollIntoView({
                        behavior: "smooth",
                        block: "center"
                    });

                    firstError.focus();
                }

                return;
            }

            try {
                await submitToApi("/patients", Object.fromEntries(new FormData(patientForm)));
            } catch (error) {
                if (successMessage) {
                    successMessage.className = "mt-6 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700";
                    successMessage.textContent = error.message;
                    successMessage.classList.remove("hidden");
                }
                return;
            }


            if (successMessage) {

                successMessage.classList.remove(
                    "hidden"
                );

                successMessage.scrollIntoView({
                    behavior: "smooth",
                    block: "center"
                });

            }

        }
    );


    patientForm.addEventListener(
        "reset",
        function () {

            setTimeout(() => {

                patientForm
                    .querySelectorAll(
                        "input, select, textarea"
                    )
                    .forEach((input) => {

                        input.classList.remove(
                            "border-red-500",
                            "border-green-500"
                        );

                        const error =
                            input.parentElement.querySelector(
                                '[data-error="true"]'
                            );

                        if (error) {
                            error.remove();
                        }

                    });

                if (successMessage) {
                    successMessage.classList.add(
                        "hidden"
                    );
                }

                if (existsMessage) {
                    existsMessage.classList.add(
                        "hidden"
                    );
                }

            }, 0);

        }
    );
}


// =====================================================
// APPOINTMENT BOOKING
// =====================================================

const appointmentForm =
    document.getElementById("appointmentForm");

if (appointmentForm) {

    const successMessage =
        document.getElementById("appointmentSuccess") ||
        document.getElementById("formMessage");

    const existsMessage =
        document.getElementById("appointmentExists");


    // -------------------------------------------------
    // Set minimum appointment date
    // -------------------------------------------------

    const dateInput =
        document.getElementById("appointmentDate");

    if (dateInput) {

        const today =
            new Date();

        const year =
            today.getFullYear();

        const month =
            String(
                today.getMonth() + 1
            ).padStart(2, "0");

        const day =
            String(
                today.getDate()
            ).padStart(2, "0");

        const todayString =
            `${year}-${month}-${day}`;

        dateInput.min = todayString;
    }

    const departmentInput = document.getElementById("department");
    const doctorInput = document.getElementById("doctor");
    const patientInput = document.getElementById("patientName");
    const timeInput = document.getElementById("appointmentTime");
    const phoneInput = document.getElementById("phone");
    const emailInput = document.getElementById("email");
    let bookedTimes = [];

    async function loadAppointmentOptions() {
        try {
            const [patientsResponse, departmentsResponse] = await Promise.all([
                fetch(`${API_BASE_URL}/patients`),
                fetch(`${API_BASE_URL}/departments`)
            ]);
            const patients = await patientsResponse.json();
            const departments = await departmentsResponse.json();
            patientInput.outerHTML = `<select id="patientName" name="patientName" required class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"><option value="">Select registered patient</option>${(patients.data || []).map((patient) => `<option value="${patient.full_name}" data-id="${patient.id}" data-mobile="${patient.mobile}" data-email="${patient.email || ""}">${patient.patient_id} - ${patient.full_name}</option>`).join("")}</select>`;
            departmentInput.innerHTML = `<option value="">Select department</option>${(departments.data || []).filter((department) => department.status === "active").map((department) => `<option>${department.name}</option>`).join("")}`;
            doctorInput.innerHTML = "<option value=\"\">Select a department first</option>";
            document.getElementById("patientName").addEventListener("change", (event) => { const option = event.target.selectedOptions[0]; phoneInput.value = option.dataset.mobile || ""; emailInput.value = option.dataset.email || ""; let patientId = document.getElementById("patientId"); if (!patientId) { patientId = document.createElement("input"); patientId.type = "hidden"; patientId.id = "patientId"; patientId.name = "patientId"; appointmentForm.appendChild(patientId); } patientId.value = option.dataset.id || ""; });
        } catch (error) {
            if (successMessage) { successMessage.textContent = "Unable to load appointment options."; successMessage.classList.remove("hidden"); }
        }
    }

    async function loadAvailableDoctors() {
        doctorInput.innerHTML = "<option value=\"\">Loading doctors...</option>";
        const response = await fetch(`${API_BASE_URL}/doctors/available?department=${encodeURIComponent(departmentInput.value)}`);
        const result = await response.json();
        doctorInput.innerHTML = `<option value="">Select doctor</option>${(result.data || []).map((doctor) => `<option>${doctor.name}</option>`).join("")}`;
        await updateBookedTimes();
    }

    async function updateBookedTimes() {
        if (!doctorInput.value || !dateInput.value) return;
        const response = await fetch(`${API_BASE_URL}/appointments/availability?doctor=${encodeURIComponent(doctorInput.value)}&date=${dateInput.value}`);
        const result = await response.json(); bookedTimes = result.data || [];
        [...timeInput.options].forEach((option) => { option.disabled = bookedTimes.includes(option.value); });
        if (bookedTimes.includes(timeInput.value)) timeInput.value = "";
    }

    departmentInput.addEventListener("change", loadAvailableDoctors);
    doctorInput.addEventListener("change", updateBookedTimes);
    dateInput.addEventListener("change", updateBookedTimes);
    timeInput.addEventListener("change", () => { if (bookedTimes.includes(timeInput.value)) { timeInput.value = ""; if (successMessage) { successMessage.textContent = "Selected appointment slot is already booked. Please choose another time."; successMessage.classList.remove("hidden"); } } });
    loadAppointmentOptions();


    // -------------------------------------------------
    // Patient Name
    // -------------------------------------------------

    function validateAppointmentPatientName() {

        const input =
            document.getElementById("patientName");

        const value =
            input.value.trim();

        if (value === "") {

            showError(
                input,
                "Please enter patient name."
            );

            return false;
        }

        if (value.length < 3) {

            showError(
                input,
                "Patient name must contain at least 3 characters."
            );

            return false;
        }

        markValid(input);

        return true;
    }


    // -------------------------------------------------
    // Patient Mobile
    // -------------------------------------------------

    function validateAppointmentMobile() {

        const input =
            document.getElementById("phone");

        const value =
            input.value.trim();

        if (!/^[6-9][0-9]{9}$/.test(value)) {

            showError(
                input,
                "Please enter a valid 10-digit mobile number."
            );

            return false;
        }

        markValid(input);

        return true;
    }


    // -------------------------------------------------
    // Department
    // -------------------------------------------------

    function validateDepartment() {

        const input =
            document.getElementById("department");

        if (input.value === "") {

            showError(
                input,
                "Please select a department."
            );

            return false;
        }

        markValid(input);

        return true;
    }


    // -------------------------------------------------
    // Doctor
    // -------------------------------------------------

    function validateDoctor() {

        const input =
            document.getElementById("doctor");

        if (input.value === "") {

            showError(
                input,
                "Please select a doctor."
            );

            return false;
        }

        markValid(input);

        return true;
    }


    // -------------------------------------------------
    // Appointment Date
    // -------------------------------------------------

    function validateAppointmentDate() {

        const input =
            document.getElementById(
                "appointmentDate"
            );

        if (input.value === "") {

            showError(
                input,
                "Please select appointment date."
            );

            return false;
        }


        const selectedDate =
            new Date(
                `${input.value}T00:00:00`
            );


        const today =
            new Date();

        today.setHours(
            0,
            0,
            0,
            0
        );


        if (selectedDate < today) {

            showError(
                input,
                "Past dates cannot be selected."
            );

            return false;
        }


        markValid(input);

        return true;
    }


    // -------------------------------------------------
    // Appointment Time
    // -------------------------------------------------

    function validateAppointmentTime() {

        const input =
            document.getElementById(
                "appointmentTime"
            );

        if (input.value === "") {

            showError(
                input,
                "Please select appointment time."
            );

            return false;
        }

        markValid(input);

        return true;
    }


    // -------------------------------------------------
    // Reason
    // -------------------------------------------------

    function validateReason() {

        const input =
            document.getElementById("reason");

        const value =
            input.value.trim();

        if (value === "") {

            showError(
                input,
                "Please enter reason for visit."
            );

            return false;
        }

        if (value.length < 5) {

            showError(
                input,
                "Please provide a little more information."
            );

            return false;
        }

        markValid(input);

        return true;
    }


    // =================================================
    // TIME SLOT BUTTONS
    // =================================================

    const timeSlots =
        document.querySelectorAll(
            ".time-slot"
        );

    const appointmentTime =
        document.getElementById(
            "appointmentTime"
        );


    timeSlots.forEach(
        (button) => {

            button.addEventListener(
                "click",
                () => {

                    const selectedTime =
                        button.dataset.time;


                    // Update select

                    appointmentTime.value =
                        selectedTime;


                    // Remove selected style

                    timeSlots.forEach(
                        (slot) => {

                            slot.classList.remove(
                                "border-blue-600",
                                "bg-blue-50",
                                "text-blue-600"
                            );

                        }
                    );


                    // Add selected style

                    button.classList.add(
                        "border-blue-600",
                        "bg-blue-50",
                        "text-blue-600"
                    );


                    removeError(
                        appointmentTime
                    );

                }
            );

        }
    );


    // =================================================
    // FORM SUBMIT
    // =================================================

    appointmentForm.addEventListener(
        "submit",
        async function (event) {

            event.preventDefault();


            if (successMessage) {
                successMessage.classList.add(
                    "hidden"
                );
            }

            if (existsMessage) {
                existsMessage.classList.add(
                    "hidden"
                );
            }


            const valid =
                validateAppointmentPatientName() &&
                validateAppointmentMobile() &&
                validateDepartment() &&
                validateDoctor() &&
                validateAppointmentDate() &&
                validateAppointmentTime() &&
                validateReason();


            const consent =
                document.getElementById("agreement");


            if (!consent.checked) {

                showError(
                    consent,
                    "Please confirm the appointment information."
                );

                return;
            }


            if (!valid) {

                const firstError =
                    appointmentForm.querySelector(
                        ".border-red-500"
                    );

                if (firstError) {

                    firstError.scrollIntoView({
                        behavior: "smooth",
                        block: "center"
                    });

                    firstError.focus();
                }

                return;
            }


            try {
                const appointmentPayload = Object.fromEntries(new FormData(appointmentForm));
                appointmentPayload.mobile = appointmentPayload.phone;
                await submitToApi("/appointments", appointmentPayload);
            } catch (error) {
                if (successMessage) {
                    successMessage.className = "mt-6 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700";
                    successMessage.textContent = error.message;
                    successMessage.classList.remove("hidden");
                }
                return;
            }

            // Show success only after the database accepts the request.

            if (successMessage) {

                successMessage.className = "mt-6 rounded-xl bg-green-50 p-4 text-sm font-semibold text-green-700";
                successMessage.textContent = "Appointment request submitted successfully.";
                successMessage.classList.remove(
                    "hidden"
                );

                successMessage.scrollIntoView({
                    behavior: "smooth",
                    block: "center"
                });

            }


            console.log(
                "Appointment form is valid."
            );

        }
    );


    // =================================================
    // RESET APPOINTMENT FORM
    // =================================================

    appointmentForm.addEventListener(
        "reset",
        function () {

            setTimeout(() => {

                appointmentForm
                    .querySelectorAll(
                        "input, select, textarea"
                    )
                    .forEach(
                        (input) => {

                            input.classList.remove(
                                "border-red-500",
                                "border-green-500"
                            );

                            const error =
                                input.parentElement.querySelector(
                                    '[data-error="true"]'
                                );

                            if (error) {
                                error.remove();
                            }

                        }
                    );


                timeSlots.forEach(
                    (slot) => {

                        slot.classList.remove(
                            "border-blue-600",
                            "bg-blue-50",
                            "text-blue-600"
                        );

                    }
                );


                if (successMessage) {

                    successMessage.classList.add(
                        "hidden"
                    );

                }


                if (existsMessage) {

                    existsMessage.classList.add(
                        "hidden"
                    );

                }

            }, 0);

        }
    );


    // =================================================
    // NUMBER INPUT RESTRICTION
    // =================================================

    const patientMobile =
        document.getElementById(
            "patientMobile"
        );


    if (patientMobile) {

        patientMobile.addEventListener(
            "input",
            () => {

                patientMobile.value =
                    patientMobile.value
                        .replace(/\D/g, "")
                        .slice(0, 10);

            }
        );

    }


    // =================================================
    // REAL TIME VALIDATION
    // =================================================

    const appointmentFields = [

        [
            "patientName",
            validateAppointmentPatientName
        ],

        [
            "patientMobile",
            validateAppointmentMobile
        ],

        [
            "department",
            validateDepartment
        ],

        [
            "doctor",
            validateDoctor
        ],

        [
            "appointmentDate",
            validateAppointmentDate
        ],

        [
            "appointmentTime",
            validateAppointmentTime
        ],

        [
            "reason",
            validateReason
        ]

    ];


    appointmentFields.forEach(
        ([id, validator]) => {

            const input =
                document.getElementById(id);

            if (!input) return;


            input.addEventListener(
                "blur",
                validator
            );

        }
    );

}
// =====================================================
// DOCTOR DEPARTMENT FILTER
// =====================================================

const doctorFilter =
    document.getElementById("doctorFilter");

const doctorCards =
    document.querySelectorAll(".doctor-card");

const noDoctors =
    document.getElementById("noDoctors");


if (doctorFilter) {

    doctorFilter.addEventListener("change", () => {

        const selectedDepartment =
            doctorFilter.value;

        let visibleDoctors = 0;


        doctorCards.forEach((card) => {

            const department =
                card.dataset.department;


            if (
                selectedDepartment === "all" ||
                department === selectedDepartment
            ) {

                card.classList.remove("hidden");

                visibleDoctors++;

            } else {

                card.classList.add("hidden");

            }

        });


        if (noDoctors) {

            if (visibleDoctors === 0) {

                noDoctors.classList.remove("hidden");

            } else {

                noDoctors.classList.add("hidden");

            }

        }

    });

}