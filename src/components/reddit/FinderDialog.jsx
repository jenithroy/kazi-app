/**
 * "Find from a website": the email finder in a dialog of its own, for a brand that did not come from a Reddit post (one the team found
 * on Instagram, at a show, or by word of mouth). What it saves goes on the same list; it is linked to no post.
 */
import Modal from "../Modal";
import EmailFinder from "./EmailFinder";

export default function FinderDialog({ known, canEdit, onSaved, onClose }) {
  return (
    <Modal
      title="Find emails from a website" subtitle="A brand's own public contact pages" size="sm" glass className="kmodal--reddit" onClose={onClose}
      footer={<button type="button" className="ghost-button" onClick={onClose}>Done</button>}
    >
      <EmailFinder known={known} canEdit={canEdit} onSaved={onSaved} autoFocus />
    </Modal>
  );
}
