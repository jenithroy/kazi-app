/**
 * A voice-note bubble styled like Instagram's own: a play/pause circle, a
 * waveform, and elapsed/total time.
 *
 * The waveform is real, not decorative — fetched once and decoded with the
 * Web Audio API into peak-per-bucket bars. Playback itself goes through a
 * plain <audio> element (seeking, buffering, and format support are all
 * already solved there); the decode is only for drawing the bars. If decode
 * fails — an unusual codec, a CORS hiccup — the bars fall back to a flat
 * row rather than breaking playback, since <audio> doesn't need the decode
 * to succeed to actually play the file.
 */

import { useEffect, useRef, useState } from "react";
import { Icons } from "../ui";

const BAR_COUNT = 40;

async function extractPeaks(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("fetch failed");
  const arrayBuffer = await res.arrayBuffer();
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    const channel = audioBuffer.getChannelData(0);
    const bucketSize = Math.max(1, Math.floor(channel.length / BAR_COUNT));
    const peaks = [];
    for (let i = 0; i < BAR_COUNT; i++) {
      let peak = 0;
      const start = i * bucketSize;
      for (let j = start; j < start + bucketSize && j < channel.length; j++) {
        peak = Math.max(peak, Math.abs(channel[j]));
      }
      peaks.push(peak);
    }
    const max = Math.max(...peaks, 0.01);
    return peaks.map((p) => Math.max(0.12, p / max));
  } finally {
    ctx.close?.();
  }
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export default function VoicePlayer({ src, mine }) {
  const [peaks, setPeaks] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setPeaks(null);
    if (src) {
      extractPeaks(src)
        .then((p) => !cancelled && setPeaks(p))
        .catch(() => !cancelled && setPeaks(Array(BAR_COUNT).fill(0.35)));
    }
    return () => {
      cancelled = true;
    };
  }, [src]);

  useEffect(() => {
    setPlaying(false);
    setCurrent(0);
  }, [src]);

  if (!src) {
    return (
      <div className={`kchat-voice${mine ? " kchat-voice--mine" : ""}`}>
        <span className="kchat-voice-play" aria-hidden>
          <Icons.Play size={14} />
        </span>
        <span className="kchat-voice-bars kchat-voice-bars--placeholder" />
        <span className="kchat-voice-time">Link unavailable</span>
      </div>
    );
  }

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) el.pause();
    else el.play().catch(() => {});
  };

  const ratio = duration ? current / duration : 0;

  return (
    <div className={`kchat-voice${mine ? " kchat-voice--mine" : ""}`}>
      <button type="button" className="kchat-voice-play" onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
        {playing ? <Icons.Pause size={14} /> : <Icons.Play size={14} />}
      </button>

      <button
        type="button"
        className="kchat-voice-bars"
        onClick={(e) => {
          const el = audioRef.current;
          if (!el || !duration) return;
          const rect = e.currentTarget.getBoundingClientRect();
          el.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
        }}
        aria-label="Seek"
      >
        {(peaks || Array(BAR_COUNT).fill(0.15)).map((h, i) => (
          <span
            key={i}
            className={`kchat-voice-bar${i / BAR_COUNT <= ratio ? " kchat-voice-bar--played" : ""}`}
            style={{ height: `${Math.round(h * 100)}%` }}
          />
        ))}
      </button>

      <span className="kchat-voice-time">{formatTime(playing || current ? current : duration)}</span>

      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
        }}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        hidden
      />
    </div>
  );
}
