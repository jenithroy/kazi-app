/**
 * The Tech packs tab: a grid of cards in the glass pane (the Inventory page's other tabs are tables; a tech pack is a picture first).
 *
 * Each card is one button that opens the pack (its sheet, or the photographed pages for an older pack), with its own small buttons
 * above it (Edit, Send, the customer's name). What a card says, top to bottom: the picture, who it is for, the name, the reference
 * and collection, then how it stands: "Complete", "Needs 3 things" (what is missing is in its tooltip, and an order cannot be made
 * from it until it is there), or "Old format" (made before the technical sheet; always usable).
 *
 * `packs` are wrappers made by the page: `{ id, row, pack, c, state, customer, customerName, orders }`.
 */
import { Icons, cn } from "../ui";
import ShareButton from "../share/ShareButton";
import CustomerLink from "../customer-link/CustomerLink";
import { coverUrl, missingWords, oneLine, packTitle } from "../../lib/techpack";
import "./techpack.css";

const plural = (n, one, many = `${one}s`) => (n === 1 ? one : many);

function sizesText(sizes) {
  if (!sizes.length) return "";
  return sizes.length > 2 ? `${sizes[0]} to ${sizes[sizes.length - 1]}` : sizes.join(", ");
}

function Status({ w }) {
  if (w.state === "complete") return <span className="kb-tag kb-tag--good">Complete</span>;
  if (w.state === "old") return <span className="kb-tag" title="Made before the technical sheet. It can still be used on an order.">Old format</span>;
  const n = w.c.missing.length;
  return <span className="kb-tag kb-tag--warn" title={`Still needs ${missingWords(w.c)}`}>Needs {n} {plural(n, "thing")}</span>;
}

function Tile({ w, canEdit, onOpen, onEdit }) {
  const { pack, row } = w;
  const cover = coverUrl(pack);
  const scan = !pack.views.some((v) => v.url) && pack.pages.length > 0;       // a photograph of a paper sheet: show its top, not a tiny whole
  const title = packTitle(pack);
  const meta = [pack.styleNo, pack.season, pack.category].map(oneLine).filter(Boolean);
  const bits = [pack.colour && oneLine(pack.colour), sizesText(pack.sizes)].filter(Boolean);
  return (
    <article className={cn("tpg-tile", `is-${w.state}`)}>
      <button type="button" className="tpg-hit" onClick={() => onOpen(w)} aria-label={`Open ${title}${pack.styleNo ? `, ${oneLine(pack.styleNo)}` : ""}`} />
      <div className={cn("tpg-pic", scan && "is-scan")}>
        {cover ? <img src={cover} alt="" loading="lazy" decoding="async" /> : <span className="tpg-nopic"><Icons.Image size={22} sw={1.5} aria-hidden="true" />No picture yet</span>}
        {pack.pages.length > 1 && <span className="tpg-pages">{pack.pages.length} pages</span>}
      </div>
      <div className="tpg-body">
        <p className="tpg-brand">
          {w.customerName
            ? <CustomerLink className="cl-clip" customerId={pack.customerId} name={w.customerName}>{w.customerName}</CustomerLink>
            : <span className="tpg-faint">No customer</span>}
        </p>
        <h2 className="tpg-name">{title}</h2>
        {meta.length > 0 && <p className="tpg-meta">{meta.join(" · ")}</p>}
        {bits.length > 0 && <p className="tpg-meta">{bits.join(" · ")}</p>}
        <div className="tpg-tags">
          <Status w={w} />
          {w.orders > 0 && <span className="kb-tag kb-tag--info">{w.orders} {plural(w.orders, "order")}</span>}
          {pack.market && <span className="kb-tag">{pack.market}</span>}
        </div>
      </div>
      <div className="tpg-acts">
        {canEdit && (
          <button type="button" className="tpg-act" onClick={() => onEdit(w)} aria-label={`Edit ${title}`}>
            <Icons.Edit size={14} sw={1.9} aria-hidden="true" /><span>Edit</span>
          </button>
        )}
        <ShareButton type="techpack" record={row} className="tpg-act" title="Send this tech pack to someone in Chat" />
      </div>
    </article>
  );
}

export default function PackGrid({ packs, loading, canEdit, onOpen, onEdit, empty }) {
  if (loading) {
    return (
      <div className="tpg-scroll" aria-busy="true">
        <div className="tpg-grid" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="tpg-tile tpg-tile--skel"><div className="tpg-pic" /><div className="tpg-body"><span className="kb-skel kb-skel--lg" /><span className="kb-skel" /></div></div>
          ))}
        </div>
      </div>
    );
  }
  if (!packs.length) return <div className="tpg-scroll tpg-scroll--empty">{empty}</div>;
  return (
    <div className="tpg-scroll" role="group" aria-label="Tech pack cards" tabIndex={0}>
      <div className="tpg-grid">
        {packs.map((w) => <Tile key={w.id} w={w} canEdit={canEdit} onOpen={onOpen} onEdit={onEdit} />)}
      </div>
    </div>
  );
}
