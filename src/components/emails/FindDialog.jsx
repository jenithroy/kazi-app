/**
 * "Add by hand": the two ways of looking at one thing yourself, in one dialog with a tab for each. (Finding contacts for many companies at once is the
 * page's "Find emails", which uses the Sources the person chose: lib/contactRun.js.)
 *
 *   A website     read one brand's own public contact pages (SiteFinder): type it, tick, Save
 *   UK tenders    the public notices on Find a Tender, about clothing and textiles (TenderFinder): look, tick, Save
 *
 * What either saves goes on the same list. A tab stays alive once it has been opened (it is only hidden when another is chosen), so choosing another
 * tab never cuts short a search that is going on in this one.
 */
import { useRef, useState } from "react";
import Modal from "../Modal";
import { Seg } from "../EditCard";
import SiteFinder from "./SiteFinder";
import TenderFinder from "./TenderFinder";

const TABS = [["site", "A website"], ["tenders", "UK tenders"]];
const SUBTITLE = {
  site: "A brand's own public contact pages",
  tenders: "Public notices on Find a Tender (gov.uk), about clothing and textiles",
};

export default function FindDialog({ known, canEdit, onSaved, onClose }) {
  const [tab, setTab] = useState("site");
  const opened = useRef(new Set());
  opened.current.add(tab);
  const panel = (id, node) => (opened.current.has(id) ? <div hidden={tab !== id} className="rdl-find-panel">{node}</div> : null);
  return (
    <Modal
      title="Add by hand" subtitle={SUBTITLE[tab]} size="lg" glass className="kmodal--reddit" onClose={onClose}
      footer={<button type="button" className="ghost-button" onClick={onClose}>Done</button>}
    >
      <div className="rdl-find-tabs"><Seg value={tab} onChange={setTab} options={TABS} label="What to look at" /></div>
      {panel("site", <SiteFinder known={known} canEdit={canEdit} onSaved={onSaved} autoFocus />)}
      {panel("tenders", <TenderFinder known={known} canEdit={canEdit} onSaved={onSaved} />)}
    </Modal>
  );
}
