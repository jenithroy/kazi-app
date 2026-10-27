# Embroidery engine (image to stitch file)

Pure JavaScript that turns a picture (a client's logo, text) into a machine embroidery file. It has no React, no DOM and
no Node-only calls, so the same code runs in the page, in a Web Worker and under plain `node` (that is how it is tested).
The page that uses it is `src/pages/Digitizer.jsx` (route `/digitizer`, Operations menu).

## Units and coordinates (read this first, every module obeys it)

- **Design space** is millimetres, floats, origin at the hoop centre, **+x right, +y DOWN** (screen convention).
- **Pattern space** (what a file holds) is **integer units of 0.1 mm**, +y down, **absolute** positions.
  The writers flip y themselves where a format wants y up (DST does, as pyembroidery does).
- Angles are degrees, 0 = along +x, positive turns clockwise on screen (because y is down).
- Image pixels are in the picture's own pixel grid (floats allowed), +y down. `mmPerPx` converts to design space.

## The pattern (`pattern.js`)

```js
{ name: "design",
  threads: [{ r, g, b, name?, code?, brand? }],        // one per colour block, in sewing order
  stitches: [[x, y, cmd], ...] }                       // absolute, 0.1 mm integers
CMD = { STITCH: 0, JUMP: 1, TRIM: 2, COLOR_CHANGE: 3, STOP: 4, END: 5 }
```

Same meaning as pyembroidery's `EmbPattern`: a JUMP moves without sewing, a TRIM cuts the thread (at the current
position), a COLOR_CHANGE asks for the next thread (at the current position, no movement), END closes the file.
A pattern with N colour blocks has N threads and N-1 COLOR_CHANGE commands.

## Folders

| Folder | What it does | Written by |
|---|---|---|
| `pattern.js` | `CMD`, `createPattern`, `patternStats`, small helpers | engine |
| `formats/` | file writers and readers: DST, EXP, PES, JEF, VP3, XXX ... `writePattern(id, pattern, opts)` / `readPattern(id, bytes)` | formats |
| `trace/` | picture -> palette + vector regions (`traceImage`) | tracer |
| `geometry/` | polygon helpers (area, point in polygon, simplify, offset and boolean ops through `clipper-lib`, skeletons) | engine |
| `stitch/` | regions -> stitches: tatami fill, satin, running stitch, underlay, pull compensation, travel, ordering | engine |
| `text/` | text -> regions (the browser draws the glyphs, the tracer vectorises them) | engine |
| `thread/` | a small thread colour chart and nearest-thread matching | engine |

## Rules

- Plain ES modules, JSDoc comments in plain language, double quotes, semicolons, 2 spaces (match `src/lib/*.js`).
- No imports from React, `window`, `document`, `fs`, `Buffer`. Bytes are `Uint8Array` / `DataView`. Text is ASCII by hand.
- The only dependency allowed is `clipper-lib` (geometry only). Nothing from `kazi mobile/`.
- **Licences.** pyembroidery (MIT) and libembroidery (zlib) may be ported with a credit in the file header.
  **Ink/Stitch is GPL-3 and this repo is public: never copy or transliterate its code, only learn ideas from its
  documentation and behaviour.** PEmbroider's licence is checked per file before anything is ported.
- Every module is testable with `node` alone (no browser). Heavy loops use typed arrays.

## Status (2026-10-27)

| Module | State | Check it with |
|---|---|---|
| `formats/` | DST, EXP, PES (v1 and v6), PEC, JEF, VP3, XXX, U01 written and read; ports of pyembroidery, every file read back by pyembroidery in tests | `node src/lib/embroidery/formats/selftest.mjs` |
| `trace/` | picture to a palette and smooth vector regions (Lab k-means, anti-alias and JPEG clean-up, border-connected background, holes, shared edges; logo, artwork and photo are told apart and traced differently; thin lettering is kept) | `node src/lib/embroidery/trace/selftest.mjs` |
| `geometry/` | polygons, offset and boolean ops (clipper-lib), skeleton of strokes | used by the stitch checks |
| `stitch/` | tatami fill with a continuous path, satin along skeletons (corners, T joins, loops), underlay, outlines, colour order, jumps, trims, tie stitches, quality checks | `node src/lib/embroidery/stitch/selftest.mjs` |
| `thread/` | a plain 48-colour chart and nearest-colour matching | |
| `text/` | not here: lettering is drawn by the page (`src/lib/digitizer/text.js`) and traced | |

**What the stitch engine decides (`stitch/engine.js`).** Each island of a shape is tried as satin and kept only if it is a steady stroke (for "Auto": at most 5 mm wide, at least 3.5 times longer than wide, no part more than 2.2 times its average width) whose stitches would cover it (85%, thread taken as 0.45 mm), not spill past its edge, not pile four threads on more than 20% of it, not lay more than its share of thread, and not leave more than 1.3 mm between neighbouring needle holes on an edge; otherwise it is filled with tatami and `generate()` says why in `info`. Parts thinner than 0.6 mm are left out of a satin layout. A satin column's rows are 0.3 mm apart (a fill's 0.4): the holes on one edge are twice the row spacing apart, and at 0.4 cloth shows in the notches of narrow lettering. The separate pieces of one shape (the letters of a word) are sewn in a planned order, nearest first and then untangled, so there is no long hop at the end. Colours are grouped to save colour changes only where nothing overlaps; the design's own order decides which colour comes first. Jumps up to 3 mm are not cut; longer ones are tied off, trimmed, and tied in. Pieces too small to sew are named in ONE warning, and the crowded-spot check (`stitch/checks.js`) flags 15 or more needle holes in a millimetre and a half square (the lock stitches of every start and end are a dozen at most).

**How a picture becomes shapes (`trace/`, `src/lib/digitizer/convert.js`).** (1) The picture's kind is found from how well 16 colours describe its FLAT pixels, on a lightly blurred copy, so edges, lettering and JPEG noise do not count (`trace/photo.js`): a logo (flat colours, however many up to 16), artwork with soft shading, or a photograph. A photograph is first flattened (Kuwahara filter) and traced on a grid of about 0.25 mm; the colours of artwork and photographs are merged more (delta-E 8 and 6 against 11 for a logo). Whatever the kind, the grid is never finer than 0.06 mm a pixel (a small design is traced on a smaller copy of a big picture: the widening below costs time with the cube of the pixels a millimetre). (2) A background is removed only when it is plain (a photograph's sky stays, and sets the cloth colour). (3) Thin strokes are kept, not cleaned away: lettering and hairlines of the minor colours, and any thin letter that stands by itself inside the picture (white lettering on a dark badge), are widened to about a millimetre along their own middle lines (in a photograph or artwork only pieces that are long and thin count, not patches of colour). The widened pixels are marked (`PAINTED`) so they are not counted when the colour is measured; a colour that is only thin strokes takes its ink from the far end of what it holds, not the washed-out mean. Ink that is only thin lines never makes a flat-pixel cluster, so `missingColours` looks for pixels that no palette colour and no mix of two explains, beside only one palette colour (the halo of JPEG between two regions is beside two), and adds that colour. (4) Every shape reaches 0.4 mm under the shapes sewn after it, so a gap in the stitching or the seam between two colours shows thread, never cloth. (5) A dark or coloured background means the picture was made for that garment, so it becomes the cloth colour; a light one leaves the cream default. (6) A new picture is made as big as the hoop allows (what is stitched, not the margins), then traced again at that size. The thread colours are the picture's own (the chart name is only a label unless "Use the nearest thread colours" is on). What is still hard: lettering under about 4 mm tall (the page says so), and hairline calligraphy, whose strokes are thinner than any needle.

**Test pictures.** `sample images/` at the repo root holds the owner's own pictures; it is untracked on purpose and must never be committed (the repo is public and the pictures are not ours). Tests use made-up pictures.

**Guard rails (so a damaged file or a typo cannot hang the page).** Every number a shape carries (row spacing, stitch length, pull compensation, outline width and length ...) is held to a range the engine can work with, a ring with a NaN or a point further than 5000 mm from the hoop's middle is left out with a warning, and a design that would need more than `maxStitches` (1.5 million) is refused at once with a plain message before any work is done. The page's `engineClient.js` adds a second net: one job per kind in flight, and a job running over a minute is given up on (the worker is stopped and a fresh one starts). Checked in `stitch/selftest.mjs` (damaged settings, a 6000 mm rectangle) and, for the client, with a pretend worker.

**Known limits.** Satin at junctions of non-perpendicular strokes (K, M, X, the points of a star) is tangled; fine serif lettering under about 10 mm falls back to tatami; lettering has many trims; underlay is by rule of thumb (no fabric-specific testing yet); nothing here has been sewn on a real machine. Pull compensation and density defaults are the usual starting points (`stitch/presets.js`), to be tuned with the factory.

**Licences.** Formats: ported from pyembroidery (MIT, credited in each file). Everything else is written for this repo from ideas and behaviour only. Do not copy from Ink/Stitch (GPL-3) or PEmbroider (GPL-3 + anti-capitalist licence): the repo is public.
