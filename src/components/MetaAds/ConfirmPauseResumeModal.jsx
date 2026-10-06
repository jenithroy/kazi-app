import Modal from "../Modal";
import { Btn } from "../ui";

export default function ConfirmPauseResumeModal({
  entity,
  level,
  action,
  busy = false,
  onConfirm,
  onClose,
}) {
  if (!entity) return null;

  const isPause = action === "pause";
  const actionLabel = isPause ? "Pause" : "Resume";
  const title = `${actionLabel} ${level} — ${entity.name}`;

  return (
    <Modal
      size="sm"
      title={title}
      subtitle={entity.name}
      onClose={onClose}
      footer={
        <>
          <Btn kind="ghost" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </Btn>
          <Btn
            kind={isPause ? "danger" : "primary"}
            type="button"
            disabled={busy}
            onClick={() => onConfirm(entity, level, action)}
          >
            {busy ? `${actionLabel}ing…` : actionLabel}
          </Btn>
        </>
      }
    >
      <div style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.5, padding: "4px 0" }}>
        {isPause ? (
          <p style={{ margin: 0 }}>
            Pausing this {level} will stop delivery on Meta (Facebook & Instagram)
            {level === "campaign" ? " for all of its ad sets and ads." : "."} You can resume it anytime.
          </p>
        ) : (
          <p style={{ margin: 0 }}>
            Resuming this {level} will reactivate ad delivery on Meta and begin spending toward its budget.
          </p>
        )}
      </div>
    </Modal>
  );
}
