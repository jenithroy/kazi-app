/**
 * The photographs of a paper tech pack, one at a time.
 *
 * Tech packs made before the technical sheet existed are mostly this: somebody photographed the sheet the customer sent and
 * attached the pages (`tech_pack_images`). They are still how the factory reads those packs, so this stays: a glass card with the
 * page big on a veiled stage, Previous / Next (arrow keys, a swipe on a phone), a strip of small pages to jump by, the original
 * picture in a new tab, and Send. It only reads; nothing here writes.
 *
 *   <PagesViewer row={fs_patterns row} customer={{ id, name }} | null onClose />
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Modal from "../Modal";
import { Icons, cn } from "../ui";
import ShareButton from "../share/ShareButton";
import { brandName, packTitle, readPack } from "../../lib/techpack";
import "./techpack.css";

export default function PagesViewer({ row, customer, onClose }) {
  const pack = useMemo(() => readPack(row), [row]);
  const pages = pack.pages;
  const [page, setPage] = useState(0);
  const touchX = useRef(null);
  const thumbs = useRef(null);
  const last = pages.length - 1;
  const go = (n) => setPage((p) => Math.min(last, Math.max(0, typeof n === "function" ? n(p) : n)));

  // arrow keys turn the page (Escape and Tab are the dialog's own)
  useEffect(() => {
    function onKey(e) {
      if (e.target?.closest?.("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowRight") { e.preventDefault(); go((p) => p + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go((p) => p - 1); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [last]);                                                                // eslint-disable-line react-hooks/exhaustive-deps

  // keep the chosen small page in view when the strip scrolls sideways
  useEffect(() => {
    thumbs.current?.querySelector(".is-on")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [page]);

  const brand = brandName(pack, customer);
  const current = pages[Math.min(page, last)];
  const subtitle = [brand, pack.styleNo, `${pages.length} ${pages.length === 1 ? "page" : "pages"}`].filter(Boolean).join(" · ");

  const swipe = (e) => {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) < 50) return;
    go((p) => (dx < 0 ? p + 1 : p - 1));
  };

  return (
    <Modal
      title={packTitle(pack)}
      subtitle={subtitle}
      size="card"
      className="kmodal--tpp"
      glass
      onClose={onClose}
      footer={(
        <>
          <a className="ghost-button" href={current} target="_blank" rel="noopener noreferrer">Open the original<span className="tpp-sr"> (new tab)</span></a>
          <ShareButton type="techpack" record={row} title="Send this tech pack to someone in Chat" />
          <button type="button" className="primary-button" onClick={onClose}>Close</button>
        </>
      )}
    >
      {pages.length === 0 ? (
        <p className="tpp-none">This tech pack has no pages.</p>
      ) : (
        <div className="tpp">
          <div className="tpp-stage" onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }} onTouchEnd={swipe}>
            <img className="tpp-img" src={current} alt={`${packTitle(pack)}, page ${page + 1} of ${pages.length}`} />
            {pages.length > 1 && (
              <>
                <button type="button" className="tpp-nav tpp-nav--prev" onClick={() => go((p) => p - 1)} disabled={page === 0} aria-label="Previous page">
                  <Icons.ChevronLeft size={20} sw={2.2} aria-hidden="true" />
                </button>
                <button type="button" className="tpp-nav tpp-nav--next" onClick={() => go((p) => p + 1)} disabled={page === last} aria-label="Next page">
                  <Icons.ChevronRight size={20} sw={2.2} aria-hidden="true" />
                </button>
                <span className="tpp-count" aria-live="polite">{page + 1} of {pages.length}</span>
              </>
            )}
          </div>
          {pages.length > 1 && (
            <div className="tpp-thumbs" ref={thumbs} role="group" aria-label="Pages">
              {pages.map((url, i) => (
                <button key={`${i}:${url.slice(-24)}`} type="button" className={cn("tpp-thumb", i === page && "is-on")} onClick={() => go(i)} aria-label={`Page ${i + 1}`} aria-current={i === page ? "true" : undefined}>
                  <img src={url} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
