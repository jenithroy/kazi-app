import { useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Icons } from "../components/ui";

const SEVERITIES = ["Low", "Medium", "High", "Critical"];
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_FILE_BYTES = 8 * 1024 * 1024;

export default function BugReport() {
  const { profile } = useAuth();
  const fileInputRef = useRef(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("Medium");
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState("");
  const [status, setStatus] = useState("idle"); // idle | submitting | success | error
  const [errorMsg, setErrorMsg] = useState("");

  const reportedBy = profile?.name ? `${profile.name} (${profile.email})` : profile?.email || "Unknown";

  function handleFileChange(e) {
    const f = e.target.files?.[0] || null;
    setFileError("");
    if (!f) { setFile(null); return; }
    if (!ACCEPTED_TYPES.includes(f.type)) {
      setFileError("Only PNG, JPG, or WEBP images are allowed.");
      setFile(null);
      e.target.value = "";
      return;
    }
    if (f.size > MAX_FILE_BYTES) {
      setFileError("Image must be under 8MB.");
      setFile(null);
      e.target.value = "";
      return;
    }
    setFile(f);
  }

  function resetForm() {
    setTitle("");
    setDescription("");
    setSeverity("Medium");
    setFile(null);
    setFileError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    setStatus("submitting");
    setErrorMsg("");

    try {
      const form = new FormData();
      form.append("title", title.trim());
      form.append("description", description.trim());
      form.append("severity", severity);
      form.append("reportedBy", reportedBy);
      form.append("pageUrl", window.location.href);
      if (file) form.append("attachment", file);

      const res = await fetch("/api/bug-report", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || `Request failed (${res.status})`);
      }

      setStatus("success");
      resetForm();
    } catch (err) {
      setStatus("error");
      setErrorMsg(err.message || "Something went wrong. Please try again.");
    }
  }

  const canSubmit = title.trim() && description.trim() && status !== "submitting";

  return (
      <div className="kbug-wrap">
        <div className="kbug-header">
          <div className="kbug-header-icon"><Icons.Bug size={20} sw={1.8} /></div>
          <div>
            <div className="kbug-header-title">Bug Report</div>
            <div className="kbug-header-sub">Found something broken? Let the dev team know — this posts straight to our bug tracker.</div>
          </div>
        </div>

        <form className="kbug-card" onSubmit={handleSubmit}>
          <div className="kbug-field">
            <label htmlFor="bug-title">Title / Brief Summary <span className="kbug-req">*</span></label>
            <input
              id="bug-title"
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Payroll export button does nothing"
              maxLength={150}
              required
              disabled={status === "submitting"}
            />
          </div>

          <div className="kbug-field">
            <label htmlFor="bug-description">Description <span className="kbug-req">*</span></label>
            <textarea
              id="bug-description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What happened? What did you expect instead? Steps to reproduce help a lot."
              rows={6}
              required
              disabled={status === "submitting"}
            />
          </div>

          <div className="kbug-row">
            <div className="kbug-field">
              <label htmlFor="bug-severity">Severity</label>
              <select
                id="bug-severity"
                value={severity}
                onChange={e => setSeverity(e.target.value)}
                disabled={status === "submitting"}
              >
                {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="kbug-field">
              <label>Reported By</label>
              <div className="kbug-readonly">{reportedBy}</div>
            </div>
          </div>

          <div className="kbug-field">
            <label htmlFor="bug-attachment">Attachment (optional)</label>
            <input
              id="bug-attachment"
              ref={fileInputRef}
              type="file"
              accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
              onChange={handleFileChange}
              disabled={status === "submitting"}
            />
            {file && <div className="kbug-file-name">✓ {file.name}</div>}
            {fileError && <div className="kbug-file-error">{fileError}</div>}
          </div>

          {status === "success" && (
            <div className="kbug-banner kbug-banner--ok">✓ Bug report sent. Thanks for flagging it!</div>
          )}
          {status === "error" && (
            <div className="kbug-banner kbug-banner--err">✕ {errorMsg}</div>
          )}

          <button type="submit" className="kbug-submit" disabled={!canSubmit}>
            {status === "submitting" ? "Sending…" : "Submit Bug Report"}
          </button>
        </form>
      </div>
  );
}
