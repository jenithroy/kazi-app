
/**
 * The help, opened by the "?" button (or the ? key): every feature of the digitizer with a short video of it and a few plain words
 * (helpContent.js). A floating card over the canvas: the page behind stays usable, so a video can be followed on
 * the real thing. The video repeats until the help is closed (Esc, or the cross); it has a pause button, and where the visitor has asked
 * for less motion it does not start by itself.
 */
import { useEffect, useRef, useState } from "react";
import { Pause, Play, X } from "./icons";
import { HELP, HELP_ITEMS } from "./helpContent";
import { HAS_CLIPS, VIDEOS, clips, stopWarming, warmAfter } from "./helpClips"; // (a clip already fetched into memory, and fetching the next ones early: see there)

function FeatureVideo({ id, title, onPlaying }) {
  const ref = useRef(null);
  const [reduced] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [playing, setPlaying] = useState(!reduced);
  const [failed, setFailed] = useState(false);

  const src = clips.get(id); // in memory: plays at once; otherwise it streams (below)
  // A clip that has to stream gets the connection to itself: any quiet fetch still under way (this clip's own, or another's) is stopped
  useEffect(() => { if (!src) stopWarming(); }, [id, src]);

  // A fresh <video> for each feature (key), so the last one stops and lets go; this one starts at once unless the visitor wants less motion.
  useEffect(() => {
    setFailed(false);
    setPlaying(!reduced);
    const v = ref.current;
    if (v && !reduced) v.play().catch(() => setPlaying(false));
  }, [id, reduced]);

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) { v.play().then(() => setPlaying(true)).catch(() => setPlaying(false)); } else { v.pause(); setPlaying(false); }
  };

  return (
    <div className="dz-help-video">
      <video key={id} ref={ref} muted loop playsInline preload="auto" autoPlay={!reduced} poster={`${VIDEOS}/${id}.jpg`} src={src} onPlaying={onPlaying} aria-label={`Video: ${title}`}>
        {!src && (
          <>
            <source src={`${VIDEOS}/${id}.webm`} type="video/webm" />
            <source src={`${VIDEOS}/${id}.mp4`} type="video/mp4" onError={() => setFailed(true)} />
          </>
        )}
      </video>
      {failed && <p className="dz-help-novideo">The video could not be loaded.</p>}
      <button type="button" className="dz-help-pp" onClick={toggle} aria-label={playing ? "Pause the video" : "Play the video"} title={playing ? "Pause" : "Play"}>
        {playing ? <Pause size={14} weight="fill" aria-hidden="true" /> : <Play size={14} weight="fill" aria-hidden="true" />}
      </button>
    </div>
  );
}

export default function Help({ onClose, onTour, start }) {
  const [id, setId] = useState(HELP_ITEMS.some((i) => i.id === start) ? start : HELP_ITEMS[0].id);
  const item = HELP_ITEMS.find((i) => i.id === id) || HELP_ITEMS[0];
  const close = useRef(null);
  const warmNext = () => warmAfter(item.id); // once this clip is playing, the next two are fetched quietly

  useEffect(() => { close.current?.focus({ preventScroll: true }); }, []);
  // Esc closes it (and is not also the editor's Esc, which would let go of the selection)
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <section className="dz-help" role="dialog" aria-modal="false" aria-labelledby="dz-help-title">
      <header className="dz-help-hd">
        <h2 id="dz-help-title">Help</h2>
        <button type="button" className="dz-linkbtn" onClick={onTour}>Take the tour</button>
        <button type="button" ref={close} className="dz-card-x" aria-label="Close the help" title="Close (Esc)" onClick={onClose}><X size={14} aria-hidden="true" /></button>
      </header>
      <div className="dz-help-body">
        <nav className="dz-help-list" aria-label="Features">
          {HELP.map((g) => (
            <div key={g.group} className="dz-help-grp">
              <p className="dz-help-group">{g.group}</p>
              {g.items.map((it) => (
                <button key={it.id} type="button" className={`dz-help-item${it.id === id ? " is-on" : ""}`} aria-current={it.id === id ? "true" : undefined} onClick={() => setId(it.id)}>
                  {it.title}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="dz-help-view">
          {HAS_CLIPS && <FeatureVideo id={item.id} title={item.title} onPlaying={warmNext} />}
          <h3>{item.title}</h3>
          <p>{item.text}</p>
          {item.keys && (
            <ul className="dz-help-keys" aria-label="Keys">
              {item.keys.map((k) => {
                const [key, ...rest] = k.split(" ");
                return <li key={k}><kbd>{key}</kbd> {rest.join(" ")}</li>;
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
