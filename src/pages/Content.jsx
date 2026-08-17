import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, getDocs, serverTimestamp } from "firebase/firestore";
import PageHeader from "../components/PageHeader";
import ReelPlaybook from "../components/ReelPlaybook";
import { db } from "../firebase";
import useFirestore from "../hooks/useFirestore";
import { useAuth } from "../context/AuthContext";

const initialForm = {
  date: new Date().toISOString().slice(0, 10),
  platform: "Instagram",
  contentType: "Reel",
  topic: "",
  hook: "",
  shotList: "",
  status: "Draft"
};

// Shape TRACER's Plan mode imports. Kept deliberately neutral so the editing
// tool never needs credentials for this app.
function exportBriefs(rows) {
  const payload = {
    source: "kazi-app",
    exported: new Date().toISOString(),
    briefs: rows.map((item) => ({
      topic: item.topic || "",
      hook: item.hook || "",
      shotList: item.shotList || "",
      date: item.date || null,
      status: item.status === "Posted" ? "posted" : "planned"
    }))
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "briefs.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Content() {
  const { profile } = useAuth();
  const { updateDoc } = useFirestore("content");
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(initialForm);

  const isUkAdmin = profile?.role === "uk_admin";

  async function loadData() {
    const snap = await getDocs(collection(db, "content"));
    const records = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
    records.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    setRows(records);
  }

  useEffect(() => {
    loadData().catch(console.error);
  }, []);

  const groupedByDate = useMemo(() => {
    return rows.reduce((acc, item) => {
      const key = item.date || "No Date";
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});
  }, [rows]);

  async function addContent(event) {
    event.preventDefault();

    const allowedStatus = isUkAdmin ? form.status : form.status === "Posted" ? "Pending Approval" : form.status;

    await addDoc(collection(db, "content"), {
      ...form,
      status: allowedStatus,
      createdBy: profile?.name || "Unknown",
      createdAt: serverTimestamp()
    });

    setForm(initialForm);
    await loadData();
  }

  function availableStatuses(currentStatus) {
    if (isUkAdmin) return ["Draft", "Pending Approval", "Posted"];
    if (currentStatus === "Posted") return ["Posted"];
    return ["Draft", "Pending Approval"];
  }

  async function updateStatus(item, status) {
    if (item.status === "Posted" && !isUkAdmin) return;
    if (!isUkAdmin && status === "Posted") return;

    await updateDoc(item.id, { status });
    await loadData();
  }

  return (
    <>
      <PageHeader
        title="Content Calendar"
        description="Publishing workflow for campaign planning and approval."
        action={
          <button className="ghost-button" type="button" onClick={() => exportBriefs(rows)} disabled={!rows.length}>
            Export briefs for TRACER
          </button>
        }
      />

      <ReelPlaybook />

      <section className="panel">
        <h3>Add Content Item</h3>
        <form className="grid-form" onSubmit={addContent}>
          <label>
            Date
            <input
              type="date"
              value={form.date}
              onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
              required
            />
          </label>

          <label>
            Platform
            <input
              type="text"
              value={form.platform}
              onChange={(event) => setForm((current) => ({ ...current, platform: event.target.value }))}
              required
            />
          </label>

          <label>
            Content Type
            <input
              type="text"
              value={form.contentType}
              onChange={(event) => setForm((current) => ({ ...current, contentType: event.target.value }))}
              required
            />
          </label>

          <label>
            Topic
            <input
              type="text"
              value={form.topic}
              onChange={(event) => setForm((current) => ({ ...current, topic: event.target.value }))}
              required
            />
          </label>

          <label>
            Hook
            <input
              type="text"
              value={form.hook}
              placeholder="the line that opens the reel"
              onChange={(event) => setForm((current) => ({ ...current, hook: event.target.value }))}
            />
          </label>

          <label>
            Shot List
            <input
              type="text"
              value={form.shotList}
              placeholder="what to film"
              onChange={(event) => setForm((current) => ({ ...current, shotList: event.target.value }))}
            />
          </label>

          <label>
            Status
            <select
              value={form.status}
              onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
            >
              <option value="Draft">Draft</option>
              <option value="Pending Approval">Pending Approval</option>
              {isUkAdmin ? <option value="Posted">Posted</option> : null}
            </select>
          </label>

          <button className="primary-button" type="submit">
            Add Content
          </button>
        </form>
      </section>

      <section className="calendar-list">
        {Object.keys(groupedByDate).map((dateKey) => (
          <article className="panel" key={dateKey}>
            <h3>{dateKey}</h3>
            <div className="content-list">
              {groupedByDate[dateKey].map((item) => (
                <div key={item.id} className="content-card">
                  <p>
                    <strong>{item.platform}</strong> - {item.contentType}
                  </p>
                  <p>{item.topic}</p>
                  {item.hook ? <p>&ldquo;{item.hook}&rdquo;</p> : null}
                  {item.shotList ? <small>Film: {item.shotList}</small> : null}
                  <small>Created by {item.createdBy}</small>
                  <div className="status-row">
                    <span className="badge-muted">{item.status}</span>
                    <select
                      value={item.status}
                      onChange={(event) => updateStatus(item, event.target.value)}
                      disabled={!isUkAdmin && item.status === "Posted"}
                    >
                      {availableStatuses(item.status).map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>
    </>
  );
}

export default Content;
