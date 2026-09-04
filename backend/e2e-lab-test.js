// End-to-end test for the Lab Management / Lab Report system.
const base = "http://localhost:4000/api";
const internalHeaders = { "X-Internal-Access": "true", "Content-Type": "application/json" };
const json = (r) => r.json();
const today = new Date().toISOString().slice(0, 10);
async function createPatient(detail) {
    const r = await fetch(`${base}/patients`, { method: "POST", headers: internalHeaders, body: JSON.stringify(detail) }).then(json);
    if (!r.success) throw new Error(r.message);
    return r.data.patientId;
}
async function runCase(name, fn) {
    try { const v = await fn(); console.log("PASS", name, JSON.stringify(v).slice(0, 180)); }
    catch (error) { console.error("FAIL", name, error.message); }
}
(async () => {
    const stamp = Date.now().toString().slice(-4);
    const patientIdA = await createPatient({ fullName: "Alice Test", dob: "1990-01-15", gender: "Female", mobile: `9000${stamp}11`, email: `alice${stamp}@example.com`, address: "12 Test St", city: "Lucknow", state: "Uttar Pradesh", pincode: "226001" });
    const patientIdB = await createPatient({ fullName: "Bob Test", dob: "1985-05-05", gender: "Male", mobile: `9000${stamp}22`, email: `bob${stamp}@example.com`, address: "34 Test St", city: "Lucknow", state: "Uttar Pradesh", pincode: "226001" });
    console.log("created patients", { patientIdA, patientIdB });
const consultation = await fetch(`${base}/consultations`, { method: "POST", headers: internalHeaders, body: JSON.stringify({ patientId: patientIdA, doctorId: "DOC-0001", consultationDate: today, notes: "Chest pain, urgent review" }) }).then(json);
    const consultationId = consultation.data.consultationId;
    await runCase("create consultation", async () => consultation);

    const testResult = await fetch(`${base}/lab-tests`, { method: "POST", headers: internalHeaders, body: JSON.stringify({ patientId: patientIdA, doctorId: "DOC-0001", consultationId, testName: "CBC", testCategory: "Hematology", instructions: "Fasting not required", priority: "urgent", testDate: today }) }).then(json);
    const testId = testResult.data.testId;
    await runCase("doctor requests CBC test", async () => testResult);

    await runCase("test appears in lab management", async () => {
        const list = await fetch(`${base}/lab-tests`, { headers: internalHeaders }).then(json);
        const found = list.data.find((item) => item.test_id === testId);
        if (!found) throw new Error("test not found in list");
        return { found: found.test_id, status: found.status, report_status: found.report_status };
    });

    for (const next of ["sample_collected", "processing", "completed"]) {
        await runCase(`status -> ${next}`, async () => {
            const result = await fetch(`${base}/lab-tests/${testId}/status`, { method: "PUT", headers: internalHeaders, body: JSON.stringify({ status: next }) }).then(json);
            if (!result.success) throw new Error(result.message);
            return result;
        });
    }

    await runCase("reject completed -> requested", async () => {
        const result = await fetch(`${base}/lab-tests/${testId}/status`, { method: "PUT", headers: internalHeaders, body: JSON.stringify({ status: "requested" }) }).then(json);
        if (result.success) throw new Error("invalid transition was allowed");
        return result;
    });

    await runCase("reject requested -> completed jump", async () => {
        const second = await fetch(`${base}/lab-tests`, { method: "POST", headers: internalHeaders, body: JSON.stringify({ patientId: patientIdA, testName: "Blood Sugar", testCategory: "Biochemistry", testDate: today }) }).then(json);
        const result = await fetch(`${base}/lab-tests/${second.data.testId}/status`, { method: "PUT", headers: internalHeaders, body: JSON.stringify({ status: "completed" }) }).then(json);
        if (result.success) throw new Error("invalid jump was allowed");
        return result;
    });

    const pdf = Buffer.from("%PDF-1.4 fake report content for CBC %%%%EOF");
    const formData = new FormData();
    formData.append("testId", testId);
    formData.append("uploadedBy", "Lab staff");
    formData.append("report", new Blob([pdf], { type: "application/pdf" }), "cbc_report.pdf");
    const uploadResult = await fetch(`${base}/lab-reports`, { method: "POST", headers: { "X-Internal-Access": "true" }, body: formData }).then(json);
    await runCase("upload CBC report PDF", async () => uploadResult);

    await runCase("reject duplicate report upload", async () => {
        const formData2 = new FormData();
        formData2.append("testId", testId);
        formData2.append("uploadedBy", "Lab staff");
        formData2.append("report", new Blob([pdf], { type: "application/pdf" }), "cbc_report.pdf");
        const result = await fetch(`${base}/lab-reports`, { method: "POST", headers: { "X-Internal-Access": "true" }, body: formData2 }).then(json);
        if (result.success) throw new Error("duplicate upload allowed");
        return result;
    });

    await runCase("reject .exe upload", async () => {
        const formData3 = new FormData();
        formData3.append("testId", testId);
        formData3.append("report", new Blob([Buffer.from("MZ")], { type: "application/x-msdownload" }), "virus.exe");
        const result = await fetch(`${base}/lab-reports`, { method: "POST", headers: { "X-Internal-Access": "true" }, body: formData3 }).then(json);
        if (result.success) throw new Error("executable upload allowed");
        return result;
    });

    const verifyA = await fetch(`${base}/patients/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patientId: patientIdA, dateOfBirth: "1990-01-15", mobile: `9000${stamp}11` }) }).then(json);
    const tokenA = verifyA.data.verificationToken;
    await runCase("patient A verification", async () => ({ success: verifyA.success }));

    await runCase("patient A verified lab tests", async () => {
        const result = await fetch(`${base}/patients/verified-lab-tests`, { headers: { Authorization: `Bearer ${tokenA}` } }).then(json);
        const cbc = result.data.find((item) => item.test_id === testId);
        if (!cbc) throw new Error("CBC not visible to patient");
        return { test: cbc.test_name, status: cbc.status, report: cbc.report_status };
    });

    const reportData = await fetch(`${base}/patients/verified-lab-tests`, { headers: { Authorization: `Bearer ${tokenA}` } }).then(json);
    const reportId = reportData.data.find((item) => item.test_id === testId).report_id;

    await runCase("patient A report download", async () => {
        const response = await fetch(`${base}/lab-reports/${reportId}?download=true`, { headers: { Authorization: `Bearer ${tokenA}` } });
        if (response.status !== 200) throw new Error(`status ${response.status}`);
        return { status: response.status, type: response.headers.get("content-type") };
    });

    const verifyB = await fetch(`${base}/patients/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patientId: patientIdB, dateOfBirth: "1985-05-05", mobile: `9000${stamp}22` }) }).then(json);
    const tokenB = verifyB.data.verificationToken;
    await runCase("patient B blocked from A's report", async () => {
        const response = await fetch(`${base}/lab-reports/${reportId}?download=true`, { headers: { Authorization: `Bearer ${tokenB}` } });
        if (response.status !== 403) throw new Error(`status ${response.status}`);
        return { status: response.status };
    });

    await runCase("no-auth report blocked", async () => {
        const response = await fetch(`${base}/lab-reports/${reportId}?download=true`);
        if (response.status !== 403) throw new Error(`status ${response.status}`);
        return { status: response.status };
    });

    await runCase("internal staff report download", async () => {
        const response = await fetch(`${base}/lab-reports/${reportId}?download=true`, { headers: { "X-Internal-Access": "true" } });
        if (response.status !== 200) throw new Error(`status ${response.status}`);
        return { status: response.status, type: response.headers.get("content-type") };
    });

    await runCase("patient cannot create lab test", async () => {
        const response = await fetch(`${base}/lab-tests`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` }, body: JSON.stringify({ patientId: patientIdA, testName: "XRay", testCategory: "Imaging" }) });
        if (response.status !== 403) throw new Error(`status ${response.status}`);
        return { status: response.status };
    });

    await runCase("patient cannot change lab status", async () => {
        const response = await fetch(`${base}/lab-tests/${testId}/status`, { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` }, body: JSON.stringify({ status: "cancelled" }) });
        if (response.status !== 403) throw new Error(`status ${response.status}`);
        return { status: response.status };
    });

    await runCase("patient cannot upload report", async () => {
        const formData4 = new FormData();
        formData4.append("testId", testId);
        formData4.append("report", new Blob([pdf], { type: "application/pdf" }), "cbc_report.pdf");
        const response = await fetch(`${base}/lab-reports`, { method: "POST", headers: { Authorization: `Bearer ${tokenA}` }, body: formData4 });
        if (response.status !== 403) throw new Error(`status ${response.status}`);
        return { status: response.status };
    });

    console.log("IDS", { patientIdA, patientIdB, consultationId, testId, reportId });
})().catch((error) => { console.error("SCRIPT ERR", error); process.exit(1); });
