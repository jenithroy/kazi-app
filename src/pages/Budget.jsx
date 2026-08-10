import { useEffect, useMemo, useState } from "react";
import {
  addDoc, collection, doc, getDocs,
  serverTimestamp, updateDoc as fsUpdateDoc
} from "firebase/firestore";
import PageHeader from "../components/PageHeader";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { GBP_RATE } from "../constants";
import { cn, Avatar, Pill } from "../components/ui";
import { roundAmount } from "../utils/format";

/* ── Constants ─────────────────────────────────────────── */
const BUDGET_CATEGORIES = ["Equipment", "Materials", "Services", "Training", "Travel", "Other"];
const REQ_CATEGORIES    = ["Raw Materials", "Tools", "Machinery", "Office Supplies", "Safety Equipment", "Other"];

const emptyBudgetForm = { title: "", category: "Equipment", amountGBP: "", notes: "", urgency: "Medium" };
const emptyReqForm    = { title: "", category: "Raw Materials", quantity: "", amountNPR: "", amount: "", urgency: "Medium", notes: "" };

/* ── Helpers ───────────────────────────────────────────── */
function nprToGbp(npr) {
  const v = parseFloat(npr);
  return (!npr || isNaN(v) || v <= 0) ? "" : (v / GBP_RATE).toFixed(2);
}

function hueFromName(name = "") {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return h % 360;
}

function nextBrId(rows) {
  const nums = rows.map(r => parseInt((r.brId || "BR-000").replace("BR-", ""), 10)).filter(n => !isNaN(n));
  return `BR-${String(nums.length ? Math.max(...nums) + 1 : 79).padStart(3, "0")}`;
}

function formatDate(ts) {
  if (!ts) return "";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtNPR(n) {
  return roundAmount(n).toLocaleString("en-IN");
}

/* ── Urgency pill ──────────────────────────────────────── */
function UrgencyPill({ urgency }) {
  const map = { High: "terra", Medium: "amber", Low: "neutral" };
  const label = { High: "high urgency", Medium: "med urgency", Low: "low urgency" };
  return <Pill tone={map[urgency] || "neutral"}>{label[urgency] || urgency}</Pill>;
}

/* ── Budget request card ───────────────────────────────── */
function BudgetCard({ row, canReview, onApprove, onReject }) {
  const hue      = hueFromName(row.requestedBy || "");
  const gbpAmt   = row.amountGBP ?? (row.amount || 0);
  const nprAmt   = row.amountNPR ?? Math.round(gbpAmt * GBP_RATE);
  const isPending  = row.status === "Pending";
  const isApproved = row.status === "Approved";
  const isRejected = row.status === "Rejected";

  return (
    <div className={cn("kbrf", isApproved && "kbrf--approved", isRejected && "kbrf--rejected")}>
      {/* Header: avatar + name + urgency */}
      <div className="kbrf-h">
        <Avatar name={row.requestedBy || "?"} hue={hue} size={36} />
        <div className="kbrf-h-t">
          <div className="kbrf-h-n">
            {row.requestedBy || "Unknown"}
            {row.requestedByRole ? (
              <span style={{ fontWeight: 400, color: "var(--ink-3)" }}>
                {" · "}{row.requestedByRole}
              </span>
            ) : null}
          </div>
          <div className="kbrf-h-r">
            {row.brId || "BR-???"}
            {row.createdAt ? ` · ${formatDate(row.createdAt)}` : ""}
          </div>
        </div>
        <UrgencyPill urgency={row.urgency || "Low"} />
      </div>

      {/* Title + description */}
      <div>
        <div className="kbrf-what">{row.title}</div>
        {row.notes && <p className="kbrf-reason">{row.notes}</p>}
      </div>

      {/* Amount section */}
      <div className="kbrf-amt">
        <div>
          <div className="kbrf-amt-l">Amount Requested</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "var(--ink)", lineHeight: 1.1, letterSpacing: "-.02em" }}>
            £{Number(gbpAmt).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </div>
          <div className="kbrf-amt-s">
            ₨ {fmtNPR(nprAmt)} · 1 GBP = {GBP_RATE} NPR
          </div>
        </div>

        {/* Action buttons */}
        <div className="kbrf-actions">
          {canReview && isPending ? (
            <>
              <button className="kbrf-btn-reject" onClick={() => onReject(row.id)}>
                <span>✕</span> Reject
              </button>
              <button className="kbrf-btn-approve" onClick={() => onApprove(row.id)}>
                <span>✓</span> Approve
              </button>
            </>
          ) : !isPending ? (
            <span style={{
              fontSize: 12, fontWeight: 700, letterSpacing: ".04em",
              color: isApproved ? "var(--mint-deep)" : "var(--terra)",
              background: isApproved ? "var(--mint-soft)" : "var(--terra-soft)",
              padding: "4px 10px", borderRadius: 20
            }}>
              {row.status}
              {row.reviewedBy ? ` · ${row.reviewedBy}` : ""}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ── New Request modal ─────────────────────────────────── */
function NewRequestModal({ onClose, onSubmit, submitting }) {
  const [form, setForm] = useState(emptyBudgetForm);

  function handleSubmit(e) {
    e.preventDefault();
    onSubmit(form);
  }

  return (
    <div className="kbrf-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="kbrf-modal">
        <div className="kbrf-modal-hd">
          <span>New Budget Request</span>
          <button className="kbrf-modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label className="kbrf-label">
            Title
            <input
              className="kbrf-input" type="text" required
              placeholder="What do you need? e.g. Replacement overlock machine"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            />
          </label>
          <label className="kbrf-label">
            Category
            <select className="kbrf-input" value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
              {BUDGET_CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="kbrf-label">
            Amount (GBP £)
            <input
              className="kbrf-input" type="number" min="0" step="1" required
              placeholder="0"
              value={form.amountGBP}
              onChange={e => setForm(f => ({ ...f, amountGBP: e.target.value }))}
            />
            {form.amountGBP && (
              <span style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 3 }}>
                ≈ NPR {fmtNPR(Math.round(Number(form.amountGBP) * GBP_RATE))}
              </span>
            )}
          </label>
          <label className="kbrf-label">
            Urgency
            <select className="kbrf-input" value={form.urgency}
              onChange={e => setForm(f => ({ ...f, urgency: e.target.value }))}>
              <option>Low</option>
              <option>Medium</option>
              <option>High</option>
            </select>
          </label>
          <label className="kbrf-label">
            Justification
            <textarea
              className="kbrf-input" rows={3} required
              placeholder="Why is this needed? Include any relevant context."
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              style={{ resize: "vertical", fontFamily: "inherit" }}
            />
          </label>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
            <button type="button" className="ghost-button" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary-button" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit Request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────── */
function Budget() {
  const { profile } = useAuth();
  const role = profile?.appRole || profile?.role || "employee";
  const isUkAdmin  = role === "uk_admin";
  const canReview  = ["uk_admin", "nepal_admin", "super_admin"].includes(role);

  const [tab,        setTab]        = useState(0);
  const [budgetRows, setBudgetRows] = useState([]);
  const [reqRows,    setReqRows]    = useState([]);
  const [showNew,    setShowNew]    = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reqForm,    setReqForm]    = useState(emptyReqForm);
  const [filterUrgency, setFilterUrgency] = useState("All");
  const [filterStatus,  setFilterStatus]  = useState("Pending");
  const [showFilter, setShowFilter] = useState(false);

  async function load() {
    const snap = await getDocs(collection(db, "budget_requests"));
    const all  = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    setBudgetRows(all.filter(r => r.type === "budget" || !r.type));
    setReqRows(all.filter(r => r.type === "requirement"));
  }

  useEffect(() => { load().catch(console.error); }, []);

  /* ── Submit budget request ── */
  async function submitBudget(form) {
    setSubmitting(true);
    const gbp = Number(form.amountGBP) || 0;
    await addDoc(collection(db, "budget_requests"), {
      type:             "budget",
      brId:             nextBrId(budgetRows),
      title:            form.title,
      category:         form.category,
      amountGBP:        gbp,
      amountNPR:        Math.round(gbp * GBP_RATE),
      amount:           gbp,
      urgency:          form.urgency,
      notes:            form.notes,
      status:           "Pending",
      requestedBy:      profile?.name || "Unknown",
      requestedByRole:  profile?.displayRole || profile?.role || "",
      createdAt:        serverTimestamp()
    });
    setShowNew(false);
    await load();
    setSubmitting(false);
  }

  /* ── Submit requirement ── */
  async function submitReq(e) {
    e.preventDefault();
    setSubmitting(true);
    await addDoc(collection(db, "budget_requests"), {
      type:            "requirement",
      title:           reqForm.title,
      category:        reqForm.category,
      quantity:        reqForm.quantity,
      amountNPR:       reqForm.amountNPR ? Number(reqForm.amountNPR) : null,
      amount:          reqForm.amount    ? Number(reqForm.amount)    : null,
      urgency:         reqForm.urgency,
      notes:           reqForm.notes,
      status:          "Pending",
      requestedBy:     profile?.name || "Unknown",
      requestedByRole: profile?.displayRole || profile?.role || "",
      createdAt:       serverTimestamp()
    });
    setReqForm(emptyReqForm);
    await load();
    setSubmitting(false);
  }

  async function review(id, status) {
    await fsUpdateDoc(doc(db, "budget_requests", id), {
      status,
      reviewedBy: profile?.name || "Admin",
      reviewedAt: serverTimestamp()
    });
    await load();
  }

  /* ── Filtered budget rows ── */
  const visibleBudget = useMemo(() => {
    return budgetRows.filter(r => {
      if (filterUrgency !== "All" && r.urgency !== filterUrgency) return false;
      if (filterStatus  !== "All" && r.status  !== filterStatus)  return false;
      return true;
    });
  }, [budgetRows, filterUrgency, filterStatus]);

  const pendingBudget = budgetRows.filter(r => r.status === "Pending").length;
  const pendingReq    = reqRows.filter(r => r.status === "Pending").length;

  /* ── Req helpers ── */
  function handleReqNPR(e) {
    const npr = e.target.value;
    setReqForm(f => ({ ...f, amountNPR: npr, amount: nprToGbp(npr) }));
  }
  function handleReqGBP(e) {
    setReqForm(f => ({ ...f, amount: e.target.value, amountNPR: "" }));
  }

  function statusClass(s) {
    if (s === "Approved") return "badge-ok";
    if (s === "Rejected") return "badge-danger";
    return "badge-muted";
  }
  function urgencyClass(u) {
    if (u === "High")   return "priority-tag high";
    if (u === "Medium") return "priority-tag medium";
    return "priority-tag low";
  }

  const reviewAction = (row) =>
    canReview && row.status === "Pending" ? (
      <div style={{ display: "flex", gap: 6 }}>
        <button className="primary-button" style={{ padding: "5px 12px", fontSize: "0.82rem" }}
          onClick={() => review(row.id, "Approved")}>Approve</button>
        <button className="ghost-button" style={{ padding: "5px 12px", fontSize: "0.82rem", color: "var(--danger)", borderColor: "rgba(198,40,40,0.4)" }}
          onClick={() => review(row.id, "Rejected")}>Reject</button>
      </div>
    ) : canReview ? (
      <span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>by {row.reviewedBy}</span>
    ) : null;

  return (
    <>
      <PageHeader
        title="Budget & Requirements"
        description="Submit budget requests and material requirements for UK director sign-off."
        action={tab === 0 && (
          <button className="primary-button" onClick={() => setShowNew(true)}>+ New request</button>
        )}
      />

      {/* ── Tabs ── */}
      <div className="tab-row">
        <button className={cn("tab-button", tab === 0 && "active")} onClick={() => setTab(0)}>
          Budget Requests
          {pendingBudget > 0 && <span className="tab-badge">{pendingBudget}</span>}
        </button>
        <button className={cn("tab-button", tab === 1 && "active")} onClick={() => setTab(1)}>
          Requirements
          {pendingReq > 0 && <span className="tab-badge">{pendingReq}</span>}
        </button>
      </div>

      {/* ══════════════ BUDGET REQUESTS TAB ══════════════ */}
      {tab === 0 && (
        <>
          {/* Filter bar */}
          <div className="kbrf-bar">
            <span style={{ fontSize: 13, color: "var(--ink-3)" }}>
              {visibleBudget.length} request{visibleBudget.length !== 1 ? "s" : ""}
              {filterStatus !== "All" ? ` · ${filterStatus.toLowerCase()}` : ""}
            </span>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {/* Status filter chips */}
              {["Pending", "Approved", "Rejected", "All"].map(s => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={cn("kbrf-chip", filterStatus === s && "kbrf-chip--on")}
                >{s}</button>
              ))}

              {/* Urgency filter */}
              <select
                className="kbrf-select"
                value={filterUrgency}
                onChange={e => setFilterUrgency(e.target.value)}
              >
                <option value="All">All urgency</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
          </div>

          {/* Card grid */}
          {visibleBudget.length === 0 ? (
            <div className="kbrf-empty">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--ink-5)", marginBottom: 8 }}>
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
              </svg>
              <p>No {filterStatus !== "All" ? filterStatus.toLowerCase() + " " : ""}budget requests</p>
            </div>
          ) : (
            <div className="kbrf-grid">
              {visibleBudget.map(row => (
                <BudgetCard
                  key={row.id}
                  row={row}
                  canReview={canReview}
                  onApprove={id => review(id, "Approved")}
                  onReject={id  => review(id, "Rejected")}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ══════════════ REQUIREMENTS TAB ══════════════ */}
      {tab === 1 && (
        <>
          <section className="panel">
            <h3>New Requirement</h3>
            <form className="grid-form" onSubmit={submitReq}>
              <label className="full-width">
                Item / Description
                <input type="text" value={reqForm.title} required placeholder="What is needed?"
                  onChange={e => setReqForm(f => ({ ...f, title: e.target.value }))} />
              </label>
              <label>
                Category
                <select value={reqForm.category} onChange={e => setReqForm(f => ({ ...f, category: e.target.value }))}>
                  {REQ_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </label>
              <label>
                Quantity
                <input type="text" value={reqForm.quantity} required placeholder="e.g. 50 units"
                  onChange={e => setReqForm(f => ({ ...f, quantity: e.target.value }))} />
              </label>
              <label>
                Urgency
                <select value={reqForm.urgency} onChange={e => setReqForm(f => ({ ...f, urgency: e.target.value }))}>
                  <option>Low</option><option>Medium</option><option>High</option>
                </select>
              </label>
              <label>
                Est. Cost (NPR रू)
                <input type="number" min="0" step="1" value={reqForm.amountNPR} placeholder="0"
                  onChange={handleReqNPR} />
              </label>
              <label>
                Est. Cost (GBP £)
                <div style={{ position: "relative" }}>
                  <input type="number" min="0" step="0.01" value={reqForm.amount} placeholder="0.00"
                    style={{ paddingRight: reqForm.amountNPR ? 90 : 12 }}
                    onChange={handleReqGBP} />
                  {reqForm.amountNPR && <span className="converted-tag">auto</span>}
                </div>
              </label>
              <label className="full-width">
                Notes
                <input type="text" value={reqForm.notes} placeholder="Additional context"
                  onChange={e => setReqForm(f => ({ ...f, notes: e.target.value }))} />
              </label>
              <button className="primary-button" type="submit" disabled={submitting}>
                {submitting ? "Submitting…" : "Submit Requirement"}
              </button>
            </form>
          </section>

          <section className="panel">
            <h3>All Requirements {reqRows.length > 0 && <span style={{ marginLeft: 8, fontWeight: 400, color: "var(--text-muted)" }}>({reqRows.length})</span>}</h3>
            {reqRows.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>No requirements submitted yet.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Item</th><th>Category</th><th>Qty</th><th>Est. Cost</th>
                      <th>Urgency</th><th>Requested By</th><th>Status</th>
                      {canReview && <th>Action</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {reqRows.map(row => (
                      <tr key={row.id}>
                        <td>
                          <span style={{ fontWeight: 600 }}>{row.title}</span>
                          {row.notes && <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", margin: "2px 0 0" }}>{row.notes}</p>}
                        </td>
                        <td>{row.category}</td>
                        <td>{row.quantity}</td>
                        <td style={{ fontFamily: "monospace" }}>
                          {row.amountNPR ? <span style={{ display: "block", fontSize: "0.8rem", color: "var(--text-muted)" }}>NPR {roundAmount(row.amountNPR).toLocaleString()}</span> : null}
                          {row.amount    ? <span style={{ fontWeight: 600 }}>£{Number(row.amount).toFixed(2)}</span> : "—"}
                        </td>
                        <td><span className={urgencyClass(row.urgency)}>{row.urgency}</span></td>
                        <td>{row.requestedBy}</td>
                        <td><span className={statusClass(row.status)}>{row.status}</span></td>
                        {canReview && <td>{reviewAction(row)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {/* ── New request modal ── */}
      {showNew && (
        <NewRequestModal
          onClose={() => setShowNew(false)}
          onSubmit={submitBudget}
          submitting={submitting}
        />
      )}
    </>
  );
}

export default Budget;
