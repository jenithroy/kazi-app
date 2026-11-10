#!/usr/bin/env python3
"""Compare speech-to-text settings on our own recordings and say which works best.

For every recording that has a hand-corrected transcript next to it, run each combination of model, language and
prompt, score the result against the transcript, and write a report. See README.md for the folder layout.

    python run_test.py --recordings recordings --glossary glossary.txt --models large-v3-turbo,large-v3
    python run_test.py --recordings recordings --draft          # write draft transcripts to correct by hand
"""

from __future__ import annotations

import argparse
import csv
import gc
import re
import sys
import time
from collections import Counter
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import scoring

AUDIO_EXTENSIONS = {".wav", ".mp3", ".m4a", ".ogg", ".oga", ".opus", ".flac", ".aac", ".mp4", ".webm", ".amr", ".wma"}
PROMPT_LIMIT = 500  # characters of glossary given to the model; Whisper only reads the tail of a long prompt


@dataclass(frozen=True)
class Config:
    model: str
    language: str  # "ne", "en", ... or "auto"
    prompt_mode: str  # "none" or "glossary"

    @property
    def id(self) -> str:
        return f"{re.sub(r'[^A-Za-z0-9._-]+', '_', self.model)}__{self.language}__{self.prompt_mode}"


# ---- the engine ------------------------------------------------------------------------------------------------


class WhisperEngine:
    """faster-whisper: OpenAI's Whisper models, run by CTranslate2 (fast on an NVIDIA card, workable on a CPU)."""

    def __init__(self, model_name: str, device: str, compute_type: str):
        from faster_whisper import WhisperModel  # imported here so the scoring tests need nothing installed

        self.model = WhisperModel(model_name, device=device, compute_type=compute_type)

    def transcribe(self, audio: Path, language: str, prompt: str, beam_size: int, vad: bool):
        segments, info = self.model.transcribe(
            str(audio),
            language=None if language == "auto" else language,
            initial_prompt=prompt or None,
            beam_size=beam_size,
            vad_filter=vad,
            condition_on_previous_text=False,  # stops one bad stretch from repeating through the rest of a call
        )
        text = " ".join(segment.text.strip() for segment in segments)  # decoding happens while this runs
        return text, float(info.duration)


def make_engine(model_name: str, device: str, compute_type: str):
    return WhisperEngine(model_name, device, compute_type)


def pick_device(requested: str) -> str:
    if requested != "auto":
        return requested
    try:
        import ctranslate2

        return "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
    except Exception:
        return "cpu"


def pick_compute_type(requested: str, device: str) -> str:
    if requested != "auto":
        return requested
    # float16 on a graphics card (CTranslate2 turns 8-bit off on the RTX 50 generation anyway), 8-bit on a CPU
    return "float16" if device == "cuda" else "int8"


# ---- inputs ----------------------------------------------------------------------------------------------------


def find_recordings(folder: Path):
    audio = sorted(p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in AUDIO_EXTENSIONS)
    with_reference, without = [], []
    for path in audio:
        reference = path.with_suffix(".txt")
        if reference.is_file() and reference.read_text(encoding="utf-8-sig").strip():
            with_reference.append((path, reference))
        else:
            without.append(path)
    return with_reference, without


def build_prompt(terms: list[str]):
    chosen, used = [], 0
    for term in terms:
        if used + len(term) + 2 > PROMPT_LIMIT:
            break
        chosen.append(term)
        used += len(term) + 2
    return ", ".join(chosen), len(terms) - len(chosen)


# ---- report ----------------------------------------------------------------------------------------------------


def pct(x: float) -> str:
    return "n/a" if x != x else f"{x:.1%}"


def diff_text(ops, limit: int = 120) -> str:
    parts = []
    for op, ref_word, hyp_word in ops or []:
        if op == "ok":
            parts.append(ref_word)
        elif op == "sub":
            parts.append(f"[{ref_word} → {hyp_word}]")
        elif op == "del":
            parts.append(f"[{ref_word} → ·]")
        else:
            parts.append(f"[· → {hyp_word}]")
    if len(parts) > limit:
        parts = parts[:limit] + ["…"]
    return " ".join(parts)


def summarise(records: list[dict]) -> dict:
    ref_words = sum(r["ref_words"] for r in records)
    ref_chars = sum(r["ref_chars"] for r in records)
    audio = sum(r["audio_s"] for r in records)
    run = sum(r["run_s"] for r in records)
    found = sum(r["found"] for r in records)
    total = sum(r["total"] for r in records)
    return {
        "wer": sum(r["word_errors"] for r in records) / ref_words if ref_words else float("nan"),
        "cer": sum(r["char_errors"] for r in records) / ref_chars if ref_chars else float("nan"),
        "found": found,
        "total": total,
        "speed": audio / run if run else float("nan"),
    }


def write_report(path: Path, runs: dict, files: int, ref_words: int, glossary: list[str], meta: dict) -> str:
    summary = {cid: summarise(r["records"]) for cid, r in runs.items()}
    ranked = sorted(summary, key=lambda cid: (summary[cid]["wer"], summary[cid]["cer"]))
    best = ranked[0]
    lines = [
        "# Speech test report",
        "",
        f"{datetime.now():%Y-%m-%d %H:%M} · {files} recordings · {ref_words} words in the corrected transcripts · "
        f"{len(glossary)} glossary terms · device {meta['device']} ({meta['compute_type']}) · beam size {meta['beam_size']}"
        f"{' · voice-activity filter on' if meta['vad'] else ''}",
        "",
        "## Settings compared, best first",
        "",
        "Word error is the share of words in the corrected transcript that the model got wrong (substituted, dropped "
        "or added). Lower is better. Character error counts letters, which is fairer when Nepali words run together "
        "or split differently. Glossary terms found counts how many of your listed terms that really occur in the "
        "transcripts were written correctly. Speed is seconds of audio handled per second of waiting.",
        "",
        "| Model | Language | Prompt | Word error | Character error | Glossary terms found | Speed |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for cid in ranked:
        cfg, s = runs[cid]["cfg"], summary[cid]
        glossary_cell = f"{s['found']} of {s['total']}" if s["total"] else "–"
        speed = "n/a" if s["speed"] != s["speed"] else f"{s['speed']:.1f}x"
        lines.append(f"| {cfg.model} | {cfg.language} | {cfg.prompt_mode} | {pct(s['wer'])} | {pct(s['cer'])} | {glossary_cell} | {speed} |")

    cfg = runs[best]["cfg"]
    lines += ["", f"**Best on word error: {cfg.model}, language {cfg.language}, prompt {cfg.prompt_mode}.**", ""]

    records = runs[best]["records"]
    worst = sorted((r for r in records if r["word_errors"]), key=lambda r: r["word_errors"] / max(r["ref_words"], 1), reverse=True)[:5]
    lines += ["## Worst recordings for the best setting", ""]
    if not worst:
        lines += ["No errors at all on these recordings.", ""]
    for r in worst:
        lines += [f"**{r['name']}**: word error {pct(r['word_errors'] / max(r['ref_words'], 1))}", "", f"> {diff_text(r['ops'])}", ""]
    if worst:
        lines += ["Reading the lines above: `[heard → written]` marks a word that was changed, `·` a word that was dropped or added.", ""]

    confusions = scoring.confusions(r["ops"] for r in records)
    if confusions:
        lines += ["## Most common mistakes for the best setting", "", "| Should be | Written as | Times |", "| --- | --- | --- |"]
        for (ref_word, hyp_word), count in confusions.most_common(15):
            lines.append(f"| {ref_word} | {hyp_word or '(dropped)'} | {count} |")
        lines += ["", "Words that keep appearing here are good candidates for the glossary.", ""]

    missed: Counter = Counter()
    for r in records:
        missed.update(r["missed"])
    if missed:
        lines += ["## Glossary terms the best setting missed", ""]
        lines += [f"- {term} ({count}×)" for term, count in missed.most_common(10)]
        lines.append("")

    path.write_text("\n".join(lines), encoding="utf-8")
    return best


# ---- the two modes ---------------------------------------------------------------------------------------------


def run(args) -> int:
    folder = Path(args.recordings)
    if not folder.is_dir():
        print(f"There is no folder called {folder}. Put the recordings and their transcripts there.", file=sys.stderr)
        return 2
    pairs, without = find_recordings(folder)
    if not pairs:
        print(
            "No recording has a corrected transcript yet. Put a text file with the same name next to each audio file "
            "(call01.ogg and call01.txt), or run again with --draft to get drafts to correct.",
            file=sys.stderr,
        )
        return 2
    for path in without:
        print(f"  skipped (no transcript): {path.name}")
    if args.limit:
        pairs = pairs[: args.limit]

    glossary = scoring.load_glossary(args.glossary) if args.glossary else []
    prompt_modes = args.prompt_modes.split(",") if args.prompt_modes else (["none", "glossary"] if glossary else ["none"])
    if "glossary" in prompt_modes and not glossary:
        print("--prompt-modes asks for 'glossary' but no --glossary file was given.", file=sys.stderr)
        return 2
    prompt, dropped = build_prompt(glossary)
    if dropped and "glossary" in prompt_modes:
        print(f"  note: {dropped} glossary terms did not fit in the prompt (about {PROMPT_LIMIT} characters); all still count in the score")

    models = [m.strip() for m in args.models.split(",") if m.strip()]
    languages = [x.strip() for x in args.languages.split(",") if x.strip()]
    configs = [Config(m, l, p) for m in models for l in languages for p in prompt_modes]
    device = pick_device(args.device)
    compute_type = pick_compute_type(args.compute_type, device)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    print(f"{len(pairs)} recordings, {len(configs)} settings to compare, device {device} ({compute_type})")
    runs: dict = {}
    csv_rows = []
    done = 0
    total = len(configs) * len(pairs)
    for model_name in models:
        print(f"\nLoading {model_name} (the first time this downloads the model) ...")
        engine = make_engine(model_name, device, compute_type)
        for cfg in (c for c in configs if c.model == model_name):
            runs[cfg.id] = {"cfg": cfg, "records": []}
            (out / cfg.id).mkdir(exist_ok=True)
            for audio, reference_path in pairs:
                reference = reference_path.read_text(encoding="utf-8-sig")
                started = time.perf_counter()
                hypothesis, audio_seconds = engine.transcribe(
                    audio, cfg.language, prompt if cfg.prompt_mode == "glossary" else "", args.beam_size, args.vad
                )
                run_seconds = time.perf_counter() - started
                (out / cfg.id / f"{audio.name}.txt").write_text(hypothesis, encoding="utf-8")
                s = scoring.score(reference, hypothesis)
                found, glossary_total, missed = scoring.glossary_recall(reference, hypothesis, glossary)
                record = {
                    "name": audio.name, "ref_words": s.ref_words, "word_errors": s.word_errors,
                    "ref_chars": s.ref_chars, "char_errors": s.char_errors, "found": found, "total": glossary_total,
                    "missed": missed, "audio_s": audio_seconds, "run_s": run_seconds, "ops": s.ops,
                }
                runs[cfg.id]["records"].append(record)
                csv_rows.append([cfg.id, audio.name, s.ref_words, s.word_errors, f"{s.wer:.4f}", s.char_errors,
                                 f"{s.cer:.4f}", found, glossary_total, f"{audio_seconds:.1f}", f"{run_seconds:.1f}"])
                done += 1
                print(f"  [{done}/{total}] {cfg.model} / {cfg.language} / {cfg.prompt_mode}: {audio.name}  word error {pct(s.wer)}  ({run_seconds:.1f} s)")
        del engine
        gc.collect()

    with open(out / "summary.csv", "w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["setting", "file", "reference_words", "word_errors", "word_error_rate", "char_errors",
                         "char_error_rate", "glossary_found", "glossary_total", "audio_seconds", "run_seconds"])
        writer.writerows(csv_rows)
    ref_words = sum(r["ref_words"] for r in next(iter(runs.values()))["records"])
    meta = {"device": device, "compute_type": compute_type, "beam_size": args.beam_size, "vad": args.vad}
    best = write_report(out / "report.md", runs, len(pairs), ref_words, glossary, meta)
    print(f"\nBest on word error: {best}\nReport: {out / 'report.md'}\nPer-file numbers: {out / 'summary.csv'}")
    return 0


def draft(args) -> int:
    """Write a first-pass transcript next to every recording that has none, for a person to correct. Never overwrites."""
    folder = Path(args.recordings)
    if not folder.is_dir():
        print(f"There is no folder called {folder}.", file=sys.stderr)
        return 2
    _, without = find_recordings(folder)
    if args.limit:
        without = without[: args.limit]
    if not without:
        print("Every recording already has a transcript. Nothing to draft.")
        return 0
    model_name = args.models.split(",")[0].strip()
    language = args.languages.split(",")[0].strip()
    device = pick_device(args.device)
    engine = make_engine(model_name, device, pick_compute_type(args.compute_type, device))
    glossary = scoring.load_glossary(args.glossary) if args.glossary else []
    prompt, _ = build_prompt(glossary)
    for audio in without:
        target = audio.with_suffix(".txt")
        if target.exists() and target.read_text(encoding="utf-8-sig").strip():
            continue
        text, _seconds = engine.transcribe(audio, language, prompt, args.beam_size, args.vad)
        target.write_text(text + "\n", encoding="utf-8")
        print(f"  drafted {target.name}")
    print("\nNow read each draft while listening and correct it. A draft left unchecked scores that model too kindly.")
    return 0


def parse(argv=None):
    p = argparse.ArgumentParser(description="Compare speech-to-text settings on our own recordings.")
    p.add_argument("--recordings", default="recordings", help="folder with audio files and same-name .txt transcripts")
    p.add_argument("--glossary", help="text file, one term per line (garment words, product names, people)")
    p.add_argument("--models", default="large-v3-turbo", help="comma-separated faster-whisper models or folders")
    p.add_argument("--languages", default="ne", help="comma-separated: ne, en, auto, ...")
    p.add_argument("--prompt-modes", help="comma-separated: none, glossary (default: both when a glossary is given)")
    p.add_argument("--device", default="auto", choices=["auto", "cuda", "cpu"])
    p.add_argument("--compute-type", default="auto", help="auto, float16, int8, int8_float16, float32")
    p.add_argument("--beam-size", type=int, default=5)
    p.add_argument("--vad", action="store_true", help="skip long silences (often helps on phone recordings)")
    p.add_argument("--limit", type=int, help="only the first N recordings, for a quick check")
    p.add_argument("--out", default="results")
    p.add_argument("--draft", action="store_true", help="write draft transcripts for recordings that have none")
    return p.parse_args(argv)


def main(argv=None) -> int:
    args = parse(argv)
    return draft(args) if args.draft else run(args)


if __name__ == "__main__":
    sys.exit(main())
