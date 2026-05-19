import { useEffect, useState } from "react";
import { addDoc, collection, getDocs, serverTimestamp } from "firebase/firestore";
import AppLayout from "../components/AppLayout";
import PageHeader from "../components/PageHeader";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { sectionCanEdit } from "../utils/permissions";
import { todayDate } from "../utils/date";

const initialForm = {
  batchId: "",
  date: todayDate(),
  inspected: "",
  passed: "",
  rejected: "",
  defectType: "",
  action: ""
};

function QualityControl() {
  const { profile } = useAuth();
  const canEdit = sectionCanEdit(profile, "qc");
  const [logs, setLogs] = useState([]);
  const [batches, setBatches] = useState([]);
  const [form, setForm] = useState(initialForm);

  async function loadData() {
    const [qcSnap, productionSnap] = await Promise.all([
      getDocs(collection(db, "qc_logs")),
      getDocs(collection(db, "production"))
    ]);

    const qcRows = qcSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
    qcRows.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    const productionRows = productionSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
    productionRows.sort((a, b) => (b.batchId || "").localeCompare(a.batchId || ""));

    setLogs(qcRows);
    setBatches(productionRows);

    if (!form.batchId && productionRows[0]?.batchId) {
      setForm((current) => ({ ...current, batchId: productionRows[0].batchId }));
    }
  }

  useEffect(() => {
    loadData().catch(console.error);
  }, []);

  async function addQcLog(event) {
    event.preventDefault();
    if (!canEdit) return;

    const nextId = `QC${String(logs.length + 1).padStart(3, "0")}`;

    await addDoc(collection(db, "qc_logs"), {
      qcId: nextId,
      ...form,
      inspected: Number(form.inspected || 0),
      passed: Number(form.passed || 0),
      rejected: Number(form.rejected || 0),
      checkedBy: profile?.name || "Unknown",
      createdAt: serverTimestamp()
    });

    setForm(initialForm);
    await loadData();
  }

  return (
    <AppLayout>
      <PageHeader
        title="Quality Control"
        description="Capture inspection outcomes and defect trends by production batch."
      />

      {!canEdit ? <p className="banner-warning">UK admin view-only mode enabled.</p> : null}

      <section className="panel">
        <h3>Add QC Log</h3>
        <form className="grid-form" onSubmit={addQcLog}>
          <label>
            Batch
            <select
              value={form.batchId}
              disabled={!canEdit}
              onChange={(event) => setForm((current) => ({ ...current, batchId: event.target.value }))}
              required
            >
              <option value="">Select batch</option>
              {batches.map((batch) => (
                <option key={batch.id} value={batch.batchId}>
                  {batch.batchId}
                </option>
              ))}
            </select>
          </label>

          <label>
            Date
            <input
              type="date"
              value={form.date}
              disabled={!canEdit}
              onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
              required
            />
          </label>

          <label>
            Inspected
            <input
              type="number"
              value={form.inspected}
              disabled={!canEdit}
              onChange={(event) => setForm((current) => ({ ...current, inspected: event.target.value }))}
            />
          </label>

          <label>
            Passed
            <input
              type="number"
              value={form.passed}
              disabled={!canEdit}
              onChange={(event) => setForm((current) => ({ ...current, passed: event.target.value }))}
            />
          </label>

          <label>
            Rejected
            <input
              type="number"
              value={form.rejected}
              disabled={!canEdit}
              onChange={(event) => setForm((current) => ({ ...current, rejected: event.target.value }))}
            />
          </label>

          <label>
            Defect Type
            <input
              type="text"
              value={form.defectType}
              disabled={!canEdit}
              onChange={(event) => setForm((current) => ({ ...current, defectType: event.target.value }))}
            />
          </label>

          <label className="full-width">
            Action
            <input
              type="text"
              value={form.action}
              disabled={!canEdit}
              onChange={(event) => setForm((current) => ({ ...current, action: event.target.value }))}
            />
          </label>

          <button className="primary-button" type="submit" disabled={!canEdit}>
            Add QC Log
          </button>
        </form>
      </section>

      <section className="panel">
        <h3>QC Logs</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>QC ID</th>
                <th>Batch</th>
                <th>Date</th>
                <th>Inspected</th>
                <th>Passed</th>
                <th>Rejected</th>
                <th>Rejection Rate</th>
                <th>Defect</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const rate = log.inspected
                  ? ((Number(log.rejected || 0) / Number(log.inspected || 1)) * 100).toFixed(1)
                  : "0.0";

                return (
                  <tr key={log.id}>
                    <td>{log.qcId}</td>
                    <td>{log.batchId}</td>
                    <td>{log.date}</td>
                    <td>{log.inspected}</td>
                    <td>{log.passed}</td>
                    <td>{log.rejected}</td>
                    <td>{rate}%</td>
                    <td>{log.defectType}</td>
                    <td>{log.action}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </AppLayout>
  );
}

export default QualityControl;
