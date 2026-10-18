/**
 * Where a bill goes: a button that opens the file chooser, that also takes a file dropped on it. It says the name of the file
 * once there is one, and lets it be taken back off. A photo or a PDF.
 */
import { useRef, useState } from "react";
import { Icons, cn } from "../ui";

export default function FileDrop({ file, onFile, disabled, label = "Choose the bill", accept = "image/*,application/pdf", id }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);

  function take(list) {
    const f = list && list[0];
    if (f) onFile(f);
  }

  return (
    <div className="fn-drop">
      <button
        type="button"
        id={id}
        className={cn("ec-drop", over && "is-over")}
        disabled={disabled}
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled) take(e.dataTransfer.files); }}
      >
        <Icons.Paperclip size={18} sw={1.7} aria-hidden="true" />
        <span>{file ? file.name : label}</span>
        <small>{file ? "Press to choose a different file" : "A photo or a PDF. Drop it here, or press to choose."}</small>
      </button>
      <input
        ref={input}
        type="file"
        accept={accept}
        hidden
        tabIndex={-1}
        onChange={(e) => { take(e.target.files); e.target.value = ""; }}
      />
      {file && !disabled && (
        <button type="button" className="fn-drop-x" onClick={() => onFile(null)} aria-label={`Remove ${file.name}`}>
          <Icons.X size={14} sw={2} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
