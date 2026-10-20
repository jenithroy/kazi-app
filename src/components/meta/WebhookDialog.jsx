/**
 * How to connect Meta's lead form webhook, so new leads arrive the moment somebody submits a form rather than at the next sync: the
 * callback address and the verify token to paste into the Meta App Dashboard (Webhooks, Page, leadgen), each with a Copy button.
 */
import { useEffect, useRef, useState } from "react";
import Modal from "../Modal";

const WEBHOOK_URL = "https://kazimfg.com.np/api/meta-ads/webhook";
const VERIFY_TOKEN = "kazi_meta_leads_verify";

function CopyField({ label, value }) {
  const [state, setState] = useState("");                      // "" | "copied" | "failed"
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    let next = "copied";
    try { await navigator.clipboard.writeText(value); } catch { next = "failed"; }       // a page not served over https may not copy: say so instead of throwing
    setState(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState(""), 2000);
  }

  return (
    <div className="ma-copy">
      <label><span>{label}</span>
        <input type="text" readOnly value={value} onFocus={(e) => e.target.select()} />
      </label>
      <button type="button" className="ghost-button" onClick={copy}>{state === "copied" ? "Copied" : state === "failed" ? "Select and copy" : "Copy"}</button>
    </div>
  );
}

export default function WebhookDialog({ onClose }) {
  return (
    <Modal
      title="Meta lead form webhook" subtitle="Real-time Facebook and Instagram form submissions" size="sm" glass className="kmodal--meta" onClose={onClose}
      footer={<button type="button" className="primary-button" onClick={onClose}>Got it</button>}
    >
      <div className="ma-dlg">
        <p className="ma-dlg-text">Connect this in your <b>Meta App Dashboard</b> under <b>Webhooks → Page → leadgen</b> to receive inquiries the moment someone fills in your ad form.</p>
        <CopyField label="Callback URL" value={WEBHOOK_URL} />
        <CopyField label="Verify token" value={VERIFY_TOKEN} />
        <p className="ma-well">You can also press <b>Sync leads</b> at any time to pull leads from active ads without waiting for a webhook.</p>
      </div>
    </Modal>
  );
}
