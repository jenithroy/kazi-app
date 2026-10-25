/**
 * The tech pack an order was made from, as one line: its reference and name, and pressing it opens the pack's sheet.
 *
 *   <OrderPackLine patternId={order.patternId} />
 *
 * An order carries only the tech pack's id (`fs_orders.patternId`, set by the order form; null on every order made before tech packs
 * were picked), so the pack is read once, here, for its reference and name. Until that is back, or when it cannot be read, the line
 * says "Open the tech pack" and still opens it. Nothing at all is drawn without an id, or for a position that may not read tech packs
 * (it has no sheet to open): a card should test `useTechPack().openSheet` before it draws a heading for the line.
 *
 * It is a TechPackLink, so it is a button that looks like the text around it; in a one-line cell it clips with "...".
 */
import { useEffect, useState } from "react";
import { fetchOne } from "../../lib/db";
import { packTitle, readPack } from "../../lib/techpack";
import TechPackLink from "../techpack/TechPackLink";
import { useTechPack } from "../techpack/TechPackProvider";

export default function OrderPackLine({ patternId, className = "cl-clip" }) {
  const { openSheet } = useTechPack();
  const [label, setLabel] = useState("");

  useEffect(() => {
    setLabel("");
    if (!patternId || !openSheet) return undefined;
    let alive = true;
    fetchOne("patterns", patternId)
      .then((row) => {
        if (!alive || !row) return;
        const pack = readPack(row);
        setLabel([pack.styleNo, pack.name].filter(Boolean).join(" · ") || packTitle(pack));
      })
      .catch(() => { /* the line still opens the sheet, which says what went wrong */ });
    return () => { alive = false; };
  }, [patternId, openSheet]);

  if (!patternId || !openSheet) return null;
  return <TechPackLink patternId={patternId} className={className}>{label || "Open the tech pack"}</TechPackLink>;
}
