/**
 * The customer's card, opened from a name anywhere (CustomerProvider draws this, and fetches it the first time it is wanted).
 *
 * It reads ONE customer and what belongs to them (useCustomerCard), adds it up with the Customers page's own roll-up (`rollUp`,
 * lib/sales.js) so the numbers are the ones that page shows for the same customer, and hands the result to the very same card the
 * Customers and Sales pages open (components/sales/CustomerCard.jsx). What the card offers follows what the Customers page works out
 * for the same card: money only for a position that may read invoices and payments, orders only for one that may read orders, edit
 * the details with the right to edit customers. Merging and deleting stay on the Customers and Sales pages (they move invoices, and
 * need their own dialogs), so the card is given neither.
 *
 * The card is never blank: while the customer is being read a small dialog says so (after a moment, so a quick read shows no flash),
 * a customer who could not be read is said, and a customer who is not there any more (deleted, or merged into another, even while
 * the card was open) closes the card with a note.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Modal from "../Modal";
import CustomerCard from "../sales/CustomerCard";
import { useAuth } from "../../context/AuthContext";
import { useCurrency } from "../../context/CurrencyContext";
import { useRegion } from "../../context/RegionContext";
import { kathmanduDate } from "../../utils/date";
import { sectionCanEdit, sectionVisible } from "../../utils/permissions";
import { rollUp } from "../../lib/sales";
import { saveCustomerRow } from "../../lib/customerWrites";
import useCustomerCard from "./useCustomerCard";

const SOON = 280;     // a read quicker than this shows no "opening" dialog at all

/** True once `waiting` has lasted `ms` (and false the moment it stops). */
function useAfter(waiting, ms) {
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!waiting) { setLate(false); return undefined; }
    const t = setTimeout(() => setLate(true), ms);
    return () => clearTimeout(t);
  }, [waiting, ms]);
  return late;
}

export default function CustomerHost({ customerId, name, tab, onClose, onChanged }) {
  const { profile } = useAuth();
  const { ratesVersion } = useCurrency();
  const { region } = useRegion();
  const card = useCustomerCard(customerId);
  const { raw, status, lost, known, reload } = card;

  // "today" is the office's date, as the Customers and Sales pages' is, and moves on at midnight without a reload
  const [today, setToday] = useState(() => kathmanduDate());
  useEffect(() => {
    const id = setInterval(() => setToday(kathmanduDate()), 60000);
    return () => clearInterval(id);
  }, []);

  const canEdit = sectionCanEdit(profile, "customers");
  // Invoices and payments are Billing's and orders are Orders' (row-level security): a position without them, or whose read failed, would
  // see noughts, so the card leaves the money (or the orders) out instead. The Customers page works these out the same way.
  const seesMoney = sectionVisible(profile, "billing") && Boolean(known.invoices && known.payments);
  const seesOrders = sectionVisible(profile, "orders") && Boolean(known.orders);

  const row = useMemo(() => {
    if (!raw.customer) return null;
    const orderCosts = {};
    raw.orderCosts.forEach((c) => { if (c.orderId) orderCosts[c.orderId] = c; });
    // (ratesVersion: invoice sums convert at the live rate, so new rates mean new sums)
    return rollUp({
      customers: [raw.customer], orders: raw.orders, invoices: raw.invoices, payments: raw.payments, orderCosts,
    }, today)[0] || null;
  }, [raw, today, ratesVersion]);        // eslint-disable-line react-hooks/exhaustive-deps

  const [retrying, setRetrying] = useState(false);
  const retry = async () => { setRetrying(true); try { await reload(); } finally { setRetrying(false); } };

  const slow = useAfter(status === "loading", SOON);

  // In the quiet moment before anything is drawn the cursor is still on the name, inside whatever card or page was pressed, so an Escape
  // would close THAT and the customer's card would then open anyway. Here Escape means "never mind": it stops the opening and nothing else.
  // (Once the small dialog or the card is on screen it takes Escape itself.)
  const quiet = status === "loading" && !slow;
  useEffect(() => {
    if (!quiet) return undefined;
    const never = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", never, true);
    return () => document.removeEventListener("keydown", never, true);
  }, [quiet, onClose]);

  // A save is the Customers page's own (lib/customerWrites.js reads the row back, because a refused update comes back without an error).
  // When it worked the card closes, as that page's does, and the names the links match are read again: a rename must change what a typed
  // name finds. The pages behind the card (Billing's client list, Sales' customers) already look again when the tab comes back, and this is
  // the same news for them: a customer saved here changed under them.
  async function save(payload, id) {
    const res = await saveCustomerRow(payload, id);
    if (res.ok) {
      onChanged?.();
      document.dispatchEvent(new Event("visibilitychange"));
    }
    // A save the database refused may be because the customer is gone (merged or deleted by somebody else): look again, and then the card
    // is replaced by the note that says so. If they are still there nothing changes and the card keeps its own message.
    else reload();
    return res;
  }

  const title = name || "Customer";

  if (status === "missing") {
    return (
      <Modal title={title} size="sm" glass onClose={onClose} footer={<button type="button" className="primary-button" onClick={onClose}>OK</button>}>
        <p className="cl-note" role="status">That customer is not there any more.</p>
      </Modal>
    );
  }

  if (status === "error") {
    return (
      <Modal
        title={title} size="sm" glass onClose={onClose}
        footer={(
          <>
            <button type="button" className="ghost-button" onClick={onClose}>Close</button>
            <button type="button" className="primary-button" onClick={retry} disabled={retrying}>{retrying ? "Trying…" : "Try again"}</button>
          </>
        )}
      >
        <p className="cl-note cl-note--err" role="alert">This customer could not be opened. Check the connection and try again.</p>
      </Modal>
    );
  }

  if (!row) {
    // still reading: nothing for a moment, then a small dialog that says what is going on
    if (!slow) return null;
    return (
      <Modal title={title} size="sm" glass onClose={onClose} footer={<button type="button" className="ghost-button" onClick={onClose}>Close</button>}>
        <div className="cl-skel" role="status" aria-label="Opening the customer"><i /><i /><i /></div>
      </Modal>
    );
  }

  // What could not be read is said where the card has room for it, with a way to try again. A position that may not see the money or the
  // orders is not "missing" them, so only what it may see and could not read is named as left out.
  const out = [
    sectionVisible(profile, "billing") && !seesMoney && "the money",
    sectionVisible(profile, "orders") && !seesOrders && "the orders",
  ].filter(Boolean);
  const couldNot = lost.map((c) => (c === "order_costs" ? "order costs" : c)).join(", ");
  const more = (
    <>
      {lost.length > 0 && (
        <p className="cl-lost" role="status">
          <span>
            Could not load {couldNot}, so {out.length ? `${out.join(" and ")} ${out.length > 1 ? "are" : "is"} left out` : "some figures may be out of date"}.
          </span>
          <button type="button" onClick={retry} disabled={retrying}>{retrying ? "Trying…" : "Try again"}</button>
        </p>
      )}
      <Link to="/customers" className="ghost-button cl-linkbtn" onClick={onClose}>Open on the Customers page</Link>
    </>
  );

  return (
    <CustomerCard
      customer={row}
      startSection={tab}
      canEdit={canEdit}
      seesMoney={seesMoney}
      seesOrders={seesOrders}
      canMerge={false}
      canDelete={false}
      region={region}
      today={today}
      footerMore={more}
      onClose={onClose}
      onSave={save}
    />
  );
}
