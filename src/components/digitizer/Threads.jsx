
/**
 * "My threads": the threads the person has in their box, picked from the chart or typed in as any colour. The picture is then turned into
 * shapes in those threads alone (each colour of it goes to the nearest of them: lib/digitizer/convert.js, threadPicker); with none added it
 * keeps the colours it has. The list is remembered on this computer (useDigitizer.js), so it is not typed in again every visit.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, X } from "./icons";
import { Group, Toggle, popoverKeys } from "./Controls";
import { useAnchoredPopover } from "../../hooks/useAnchoredPopover";
import { THREADS, threadName, hexToRgb } from "../../lib/embroidery/thread/chart";

const isHex = (h) => /^#[0-9a-f]{6}$/i.test(h);
/** A mark on a swatch is white on a dark colour and near-black on a light one. */
const markOn = (hex) => { const { r, g, b } = hexToRgb(hex); return r * 0.299 + g * 0.587 + b * 0.114 < 140 ? "#fff" : "#111"; };

export default function ThreadsGroup({ api }) {
  const { settings } = api;
  const threads = settings.threads || [];
  const use = settings.useThreads !== false;
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState("#2f6fb0");
  const trigger = useRef(null);
  const pop = useRef(null);
  const { pos } = useAnchoredPopover({ open, triggerRef: trigger, popRef: pop, onDismiss: () => setOpen(false), estimate: 440, exactWidth: 276, maxHeight: 480 });
  const shown = open && !!pos;

  // The pop-up is a dialog: when it opens, keyboard focus goes into it.
  useEffect(() => {
    if (shown) pop.current?.querySelector(".dz-swatch.is-on, .dz-swatch")?.focus();
  }, [shown]);

  const close = () => { setOpen(false); trigger.current?.focus(); };
  // Adding a thread switches "use only my threads" on: that is what adding one means. Several picked in a row are one change (useDigitizer.js waits a moment).
  const add = (h) => { const x = String(h).toLowerCase(); if (isHex(x) && !threads.includes(x)) api.changeSettings({ threads: [...threads, x], useThreads: true }); };
  const take = (h) => api.changeSettings({ threads: threads.filter((t) => t !== h) });
  const pick = (h) => (threads.includes(h) ? take(h) : add(h));

  return (
    <Group title="My threads" data-tour="threads" action={threads.length ? <span className="dz-busy">{threads.length}</span> : null}>
      <div className="dz-threadlist" role="group" aria-label="The threads I have">
        {threads.map((h) => (
          <button key={h} type="button" className="dz-thread" style={{ background: h, color: markOn(h) }} title={`${threadName(h)} ${h.toUpperCase()}: press to take it away`} aria-label={`Take away ${threadName(h)}`} onClick={() => take(h)}>
            <X size={11} weight="bold" aria-hidden="true" />
          </button>
        ))}
        <button type="button" ref={trigger} className="dz-thread dz-thread--add" aria-haspopup="dialog" aria-expanded={open} aria-label="Add a thread I have" title="Add the threads you have" onClick={() => setOpen((o) => !o)}>
          <Plus size={14} weight="bold" aria-hidden="true" />
        </button>
      </div>
      {threads.length > 0 ? (
        <div className="dz-threadbar">
          <Toggle checked={use} onChange={(v) => api.changeSettings({ useThreads: v })}>Use only my threads</Toggle>
          <button type="button" className="dz-linkbtn" onClick={() => api.changeSettings({ threads: [] })}>Clear</button>
        </div>
      ) : (
        <p className="dz-hint">None added: the picture keeps its own colours.</p>
      )}
      {shown && createPortal(
        <div ref={pop} className="dz-pop dz-chart" role="dialog" aria-label="Add the threads I have" onKeyDown={popoverKeys(pop, close)} style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, maxHeight: pos.maxH }}>
          <p className="dz-pop-h">Press the threads you have</p>
          <div className="dz-swatches">
            {THREADS.map((t) => {
              const on = threads.includes(t.hex);
              return (
                <button key={t.hex} type="button" className={`dz-swatch dz-swatch--pick${on ? " is-on" : ""}`} style={{ background: t.hex, color: markOn(t.hex) }} title={t.name} aria-label={t.name} aria-pressed={on} onClick={() => pick(t.hex)} />
              );
            })}
          </div>
          <p className="dz-pop-h">Any other colour</p>
          <div className="dz-hexrow">
            <input type="color" aria-label="Pick any colour" value={isHex(hex) ? hex : "#000000"} onChange={(e) => setHex(e.target.value)} />
            <input type="text" aria-label="Colour as hex" value={hex} maxLength={7} onChange={(e) => setHex(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(hex); } }} />
            <button type="button" className="kb-btn" disabled={!isHex(hex) || threads.includes(hex.toLowerCase())} onClick={() => add(hex)}>Add</button>
          </div>
          <div className="dz-actions dz-actions--end">
            <button type="button" className="kb-btn kb-btn--primary" onClick={close}>Done</button>
          </div>
        </div>,
        document.body,
      )}
    </Group>
  );
}
