/**
 * A customer's name that opens their card.
 *
 *   <CustomerLink customerId={doc.customerId} name={doc.clientName}>{doc.clientName}</CustomerLink>
 *
 * Use it wherever a screen names a customer: on a bill, an order, a tech pack. It looks like the text around it (it takes the font, size,
 * weight and colour of its parent and only underlines when pointed at), so putting one in changes how a page reads, not how it looks.
 *
 * Give it `customerId` when the record has one (an invoice does): the id wins, but only an id this position can see, so a customer the
 * database does not hand over is plain text. With no id (a challan or a quotation has only the name that was typed) the name is looked
 * up in the customers: when the name is nobody's, or two customers share it, it is plain text and not a link at all, rather than a link
 * to the wrong customer. Nobody signed in, or a position that may not open Customers, gets plain text too.
 *
 * It is a button, so it must not sit inside another button or inside something with role="button". In a row that is itself a button,
 * the row's stretched link goes underneath and this sits above it (it carries `position: relative; z-index: 2`, the same as `.dt-act`),
 * so pressing the name never presses the row. In a line that cuts long names short with "...", give it className="cl-clip".
 * Pressing it does not press anything under it, and Enter or Space on it do not reach a parent that opens on a key.
 *
 * `tab` opens the card on one of its sections ("details", "invoices", "payments", "orders"; the Tech packs section is only there once it has
 * been read, so it cannot be asked for). `plainTitle` is the tooltip when the name is NOT a link (a cell that cuts long names short shows
 * the whole name that way), where `title` is the link's.
 */
import { useEffect } from "react";
import { cn } from "../ui";
import { useCustomer } from "./CustomerProvider";

export default function CustomerLink({ customerId, name, children, className, label, title, plainTitle, tab, onClick, ...rest }) {
  const { open, resolve, has, ensure, warm } = useCustomer();
  const given = customerId ? String(customerId) : "";
  const wanted = Boolean(open) && Boolean(given || String(name || "").trim());
  const id = !wanted ? null : given ? (has(given) ? given : null) : resolve(name);
  const shown = children ?? name;

  // the first link drawn starts the one read of the customers; a link to an id the directory does not know asks for a fresh look, now and then
  useEffect(() => { if (wanted) ensure(given || undefined); }, [wanted, given, ensure]);

  // Not a link: the text as it was. A class the caller gave for the link's own sake (`cl-…`) goes with the link; one for layout stays on a wrapper.
  if (!id) {
    const plain = String(className || "").split(/\s+/).filter((c) => c && !c.startsWith("cl-")).join(" ");
    return plain || plainTitle ? <span className={plain || undefined} title={plainTitle}>{shown}</span> : <>{shown}</>;
  }

  const who = String(name || "").trim();
  return (
    <button
      type="button"
      className={cn("cl-link", className)}
      aria-haspopup="dialog"
      aria-label={label}
      title={title ?? (who ? `Open ${who}'s customer card` : "Open the customer card")}
      onPointerEnter={warm}
      onFocus={warm}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") e.stopPropagation(); }}   // a parent that opens on Enter must not also fire
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
        open({ customerId: id, name: who, tab, from: e.currentTarget });
      }}
      {...rest}
    >
      {shown}
    </button>
  );
}
