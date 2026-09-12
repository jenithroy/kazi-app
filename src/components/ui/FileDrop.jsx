import { useId, useRef, useState } from "react";
import { IconBtn, Spinner } from "./Btn";
import { Icons } from "./Icons";
import { Progress } from "./Progress";
import { cn } from "./utils";

/* ── File drop ────────────────────────────────────────── */

const KB = 1024;
const sizeText = (bytes) => (bytes >= KB * KB ? `${(bytes / KB / KB).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / KB))} KB`);

/** Does this file match an accept string such as "image/*,.pdf"? */
function accepted(file, accept) {
  if (!accept) return true;
  return accept.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).some((rule) => {
    if (rule.startsWith(".")) return file.name.toLowerCase().endsWith(rule);
    if (rule.endsWith("/*")) return file.type.toLowerCase().startsWith(rule.slice(0, -1));
    return file.type.toLowerCase() === rule;
  });
}

/**
 * Somewhere to drop a file, or pick one.
 *
 * It handles choosing, dragging, checking the type and size, showing what has
 * been chosen and showing progress. It does not upload: the page keeps its own
 * compressing, uploading and fallbacks, and tells this what to show.
 *
 *   onFiles    (files) => … the files that passed the checks
 *   accept     "image/*,.pdf" — also what the picker filters by
 *   multiple   allow more than one at a time
 *   maxSize    largest file in bytes; bigger ones are refused with a message
 *   title      the line inside the zone ("Drop the VAT bill here")
 *   hint       what is allowed, in the page's own words
 *   files      [{ name, size?, url? }] already chosen, shown under the zone
 *   onRemove   (file, index) => … adds a remove button to each
 *   progress   0–100 while uploading, or null
 *   busy       true for work with no percentage (compressing, say)
 *   busyLabel  what that work is
 *   error      a message from the page (an upload that failed)
 *   disabled   for a view-only role
 */
export function FileDrop({
  onFiles,
  accept,
  multiple = false,
  maxSize,
  title = "Drop a file here",
  hint,
  files = [],
  onRemove,
  progress = null,
  busy = false,
  busyLabel = "Working…",
  error,
  disabled = false,
  className,
}) {
  const inputRef = useRef(null);
  const [over, setOver] = useState(false);
  const [refused, setRefused] = useState(null);
  const id = `fd${useId().replace(/:/g, "")}`;
  const uploading = typeof progress === "number";

  function take(list) {
    const chosen = [...list];
    if (!chosen.length) return;
    const tooBig = maxSize ? chosen.filter((f) => f.size > maxSize) : [];
    const wrongType = chosen.filter((f) => !accepted(f, accept));
    const ok = chosen.filter((f) => !tooBig.includes(f) && !wrongType.includes(f));

    if (wrongType.length) setRefused(`${wrongType.map((f) => f.name).join(", ")}: not a kind of file this takes.`);
    else if (tooBig.length) setRefused(`${tooBig.map((f) => f.name).join(", ")}: larger than ${sizeText(maxSize)}.`);
    else setRefused(null);

    if (ok.length) onFiles(multiple ? ok : [ok[0]]);
  }

  return (
    <div className={cn("k-drop-wrap", className)}>
      <label
        className={cn("k-drop", over && "is-over", disabled && "is-disabled")}
        htmlFor={id}
        onDragOver={(e) => {
          if (disabled) return;
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget)) return;
          setOver(false);
        }}
        onDrop={(e) => {
          if (disabled) return;
          e.preventDefault();
          setOver(false);
          take(e.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          id={id}
          type="file"
          className="k-sr k-drop-input"
          accept={accept}
          multiple={multiple}
          disabled={disabled || uploading}
          onChange={(e) => {
            take(e.target.files);
            e.target.value = ""; // so the same file can be picked twice
          }}
        />
        <span className="k-drop-ico" aria-hidden="true">
          {busy || uploading ? <Spinner size={18} /> : <Icons.Upload size={18} sw={1.8} />}
        </span>
        <span className="k-drop-text">
          <span className="k-drop-title">{busy ? busyLabel : title}</span>
          {hint && !busy && <span className="k-drop-hint">{hint}</span>}
        </span>
      </label>

      {uploading && (
        <div className="k-drop-progress">
          <Progress pct={progress} label={`Uploading, ${Math.round(progress)}%`} />
          <span className="k-drop-pct">{Math.round(progress)}%</span>
        </div>
      )}

      {(error || refused) && <p className="k-drop-err" role="alert">{error || refused}</p>}

      {files.length > 0 && (
        <ul className="k-drop-files">
          {files.map((file, i) => (
            <li key={file.url || file.name || i} className="k-drop-file">
              {file.url && /\.(png|jpe?g|webp|gif)$/i.test(file.url) ? (
                <img className="k-drop-thumb" src={file.url} alt="" />
              ) : (
                <span className="k-drop-thumb k-drop-thumb--icon" aria-hidden="true"><Icons.File size={15} /></span>
              )}
              <span className="k-drop-name">
                {file.url ? <a href={file.url} target="_blank" rel="noopener noreferrer">{file.name}</a> : file.name}
                {file.size ? <span className="k-drop-size">{sizeText(file.size)}</span> : null}
              </span>
              {onRemove && !disabled && (
                <IconBtn size="sm" icon={<Icons.X size={13} />} label={`Remove ${file.name}`} onClick={() => onRemove(file, i)} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
