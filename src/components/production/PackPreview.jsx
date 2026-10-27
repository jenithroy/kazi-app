/**
 * The chosen tech pack, under the order form's picker: its picture, who it is for and what it is called, so the person can see it is
 * the one they meant. The picture opens the whole sheet.
 *
 *   <PackPreview picked={pickedPack} brand="Cavalls Studio" />
 *
 * `picked` is `{ row, pack }` as the form holds it (the row as the list read it, and readPack of that row), or null: nothing is drawn.
 *
 * A new-format pack's pictures are in Storage and come with the list. An older pack keeps its photographs inside its row, which every
 * list leaves out on purpose (lib/packColumns.js), so once one of those is chosen its pictures are read on their own: one row, three
 * columns, once per pack for as long as the form is open.
 */
import { useEffect, useState } from "react";
import { Icons, cn } from "../ui";
import { fetchAll } from "../../lib/db";
import { PACK_PICTURE_COLUMNS } from "../../lib/packColumns";
import { coverUrl, oneLine, packTitle, readPack } from "../../lib/techpack";
import TechPackLink from "../techpack/TechPackLink";

/** The picture to show, and whether it is a photographed paper page (drawn from its top, as the Tech packs tab does). */
const coverOf = (pack) => ({ url: coverUrl(pack), scan: !pack.views.some((v) => v.url) && pack.pages.length > 0 });

export default function PackPreview({ picked, brand }) {
  const [read, setRead] = useState({});        // `${id}:${updatedAt}` -> the cover read for that pack, or the list's own with `failed` when the read did not work
  const row = picked?.row;
  const pack = picked?.pack;
  const key = row ? `${row.id}:${pack.updatedAt}` : "";
  const older = Boolean(pack?.legacy);

  useEffect(() => {
    if (!older || (read[key] && !read[key].failed)) return undefined;
    fetchAll("patterns", { columns: PACK_PICTURE_COLUMNS, filters: [{ field: "id", value: row.id }] })
      .then(([pictures]) => setRead((r) => ({ ...r, [key]: coverOf(readPack({ ...row, ...pictures })) })))
      .catch((err) => {
        console.error("Could not read the tech pack's picture:", err);
        setRead((r) => ({ ...r, [key]: { ...coverOf(pack), failed: true } }));
      });
    return undefined;
  }, [key]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!row) return null;
  const got = older ? read[key] : null;
  const waiting = older && !got;
  const { url, scan } = older ? got || { url: "", scan: false } : coverOf(pack);
  const title = packTitle(pack);
  const meta = [pack.styleNo, pack.season, pack.category].map(oneLine).filter(Boolean).join(" · ");
  const colour = oneLine(pack.colour);

  return (
    <div className="kof-pack">
      {url ? (
        <div className={cn("kof-pack-pic", scan && "is-scan")}>
          <img src={url} alt="" decoding="async" />
          <TechPackLink patternId={row.id} className="kof-pack-hit" label={`Open the sheet of ${title}`} title="Open the whole sheet" />
        </div>
      ) : (
        <div className="kof-pack-pic is-none" role={waiting ? "status" : undefined}>
          {waiting ? "Loading the picture…" : (
            <>
              <Icons.Image size={20} sw={1.5} aria-hidden="true" />
              {got?.failed ? "Could not load it" : "No picture yet"}
            </>
          )}
        </div>
      )}
      <div className="kof-pack-txt">
        {brand && <p className="kof-pack-brand">{brand}</p>}
        <p className="kof-pack-name">{title}</p>
        {meta && <p className="kof-pack-meta">{meta}</p>}
        {colour && <p className="kof-pack-meta">{colour}</p>}
      </div>
    </div>
  );
}
