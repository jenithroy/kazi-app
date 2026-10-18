---
name: Kazi ERP
description: Frosted-glass panes over soft coloured light, one mint-green accent, Geist type, light and dark. The Dashboard, the top bar and the profile card are the reference; every other page is being moved onto them.

colors:
  # ── Ink (text), light theme. CSS: --ink … --ink-5; --kb-ink-3 is the glass variant
  ink: "#0a1c14"
  ink-2: "#2b3b33"
  ink-3: "#5b6a62"
  ink-3-glass: "#526159"
  ink-4: "#8a978f"
  ink-5: "#b5bfb8"
  # ── Surfaces, light theme. --bg, --bg-2, --card. forest is the base of every hairline and wash: rgba(15,46,34,α)
  page: "#eef2ec"
  page-2: "#e6ebe4"
  card: "#ffffff"
  forest: "#0f2e22"
  # ── Brand mint. The only accent.
  mint: "#7dd3a8"
  mint-2: "#5ab98a"
  mint-deep: "#1f6e4c"
  mint-soft: "#e6f3ec"
  mint-wash: "#f2f9f5"
  # ── Status: fill, soft background, text-safe ink (--amber / --amber-soft / --kb-warn …)
  amber: "#d4a04a"
  amber-soft: "#f7ecd5"
  amber-ink: "#7d5512"
  terra: "#c4654a"
  terra-soft: "#f5dfd6"
  terra-ink: "#a8442c"
  blue: "#5688b0"
  blue-soft: "#dde9f1"
  blue-ink: "#2a4f6f"
  # ── Progress ramp, least to most advanced (--kb-r1 … --kb-r5), light
  ramp-1: "#bfe0cf"
  ramp-2: "#9fd3b8"
  ramp-3: "#5ab98a"
  ramp-4: "#2f8f64"
  ramp-5: "#1f6e4c"
  # ── Tone tiles, light: text and accents on a terra / amber tinted tile
  terra-tile-hover: "#f3d7cc"
  terra-tile-ink: "#4a1f12"
  terra-tile-ink-2: "#6a2e1c"
  terra-tile-ink-3: "#7d3a24"
  terra-tile-faint: "#a8625a"
  amber-tile-hover: "#f4e5c4"
  amber-tile-ink: "#3d2a07"
  amber-tile-ink-2: "#5c3f0a"
  amber-tile-ink-3: "#7a5418"
  amber-tile-faint: "#a07a36"
  amber-tile-accent: "#8a5f16"
  wash-tile-hover: "#ecf6f0"
  # ── Glass tints, light (alpha lives in the CSS: tile .6, bar .62, popups .86, card .82)
  glass-white: "#ffffff"
  glass-wash: "#e8f7ef"
  glass-terra: "#f6d4c6"
  glass-amber: "#fae6ba"
  glass-lit-terra: "#fff0e8"
  glass-lit-amber: "#fff7e2"
  # ── The light behind the page, light theme: five soft pools
  pool-green: "#58c492"
  pool-amber: "#f0c070"
  pool-blue: "#70a6d6"
  pool-coral: "#e89276"
  pool-sky: "#80b0e4"
  # ── Dark theme neutrals. Near-black with the faintest green; no green surfaces.
  night: "#0b100e"
  night-surface: "#141b18"
  night-surface-hover: "#19221e"
  night-card: "#16201b"
  night-ink: "#edf1ef"
  night-ink-2: "#c8d0cc"
  night-ink-3: "#aab5b0"
  night-ink-4: "#8a968f"
  night-faint: "#68746f"
  night-mute: "#56625d"
  night-pop: "#101714"
  night-drawer: "#0d1310"
  # ── Dark status inks and fills (--kb-good … in dark)
  night-bad: "#f4ae98"
  night-bad-fill: "#e07b5f"
  night-warn: "#e6bd70"
  night-info: "#9cc3e1"
  night-info-fill: "#6f9fc4"
  night-info-tint: "#8fb8d8"
  night-ramp-1: "#27332e"
  night-ramp-2: "#36463f"
  night-ramp-3: "#4d7a66"
  # ── Dark tone tiles
  night-terra-surface: "#2b1b17"
  night-terra-hover: "#33211c"
  night-terra-ink: "#fbe3da"
  night-terra-ink-2: "#f3c5b6"
  night-terra-ink-3: "#dba592"
  night-terra-faint: "#b07a6a"
  night-terra-accent: "#f0a48d"
  night-amber-surface: "#2b2415"
  night-amber-hover: "#332b19"
  night-amber-ink: "#fbefd0"
  night-amber-ink-2: "#f0d79a"
  night-amber-ink-3: "#d5bb7d"
  night-amber-faint: "#a38b52"
  night-amber-accent: "#e0b45f"
  night-wash-surface: "#16221d"
  night-wash-hover: "#1b2a24"
  # ── Dark glass tints and edges
  glass-night: "#18211d"
  glass-night-hover: "#222e28"
  glass-night-terra: "#42251e"
  glass-night-terra-hover: "#502d24"
  glass-night-amber: "#443518"
  glass-night-amber-hover: "#52401d"
  glass-night-wash: "#182a22"
  glass-night-wash-hover: "#1e342a"
  edge-night: "#b0eed0"
  edge-night-terra: "#ffbeaa"
  edge-night-amber: "#f0c878"
  lit-night-terra: "#ffd6c8"
  lit-night-amber: "#ffe6aa"
  # ── The light behind the page, dark theme
  pool-night-green: "#3ea078"
  pool-night-amber: "#c49246"
  pool-night-blue: "#4c7cb0"
  pool-night-coral: "#be6854"
  pool-night-sky: "#548cbe"
  # ── Profile card extras
  card-night-glass: "#111815"
  card-tab-warn-ink: "#8a3a22"
  card-tab-warn-night: "#4a2820"
  card-tab-mint-night: "#18382a"
  card-mint-ink: "#185a3e"
  card-ink-3: "#4f5e56"
  # ── Form feedback
  field-error: "#b42318"
  field-placeholder: "#66766d"

typography:
  page-title:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  tile-title:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.005em"
  figure:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.035em"
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  row:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.3
  sub:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
  tag:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "11.5px"
    fontWeight: 600
    lineHeight: 1.45
  button:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "12.5px"
    fontWeight: 600
    lineHeight: 1
  micro:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "10.5px"
    fontWeight: 500
  dialog-title:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  mono:
    fontFamily: "Geist Mono, ui-monospace, SF Mono, monospace"
    fontSize: "12px"
    fontWeight: 600
  # The steps font-size may take. Everything else in new-look CSS is off the ramp.
  scale:
    micro: "10.5px"
    caption: "11px"
    tag: "11.5px"
    sub: "12px"
    button: "12.5px"
    row: "13px"
    row-lg: "13.5px"
    body: "14px"
    lead: "15px"
    dialog-title: "16px"
    stat-short: "17px"
    phone-title: "18px"
    page-title: "20px"
    count: "24px"
    count-lg: "30px"

rounded:
  bar-end: "2px"
  swatch: "3px"
  cell: "5px"
  line: "6px"
  chip: "8px"
  control: "9px"
  field: "10px"
  well: "12px"
  card: "14px"
  panel: "16px"
  tile: "18px"
  sheet: "20px"
  full: "9999px"

spacing:
  hair: "4px"
  tight: "6px"
  gap-sm: "8px"
  gap-md: "10px"
  tile-gap: "12px"
  page-gap: "14px"
  tile-pad-y: "14px"
  tile-pad-x: "16px"
  page-pad-y: "24px"
  page-pad-x: "28px"
  bar-height: "88px"
  bar-height-compact: "64px"
  control-height: "30px"
  field-height: "40px"
  touch-target: "44px"

components:
  tile:
    backgroundColor: "{colors.glass-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.tile}"
    padding: "14px 16px"
  tile-night:
    backgroundColor: "{colors.glass-night}"
    textColor: "{colors.night-ink}"
  tile-needs-attention-terra:
    backgroundColor: "{colors.glass-terra}"
    textColor: "{colors.terra-tile-ink}"
  tile-needs-attention-amber:
    backgroundColor: "{colors.glass-amber}"
    textColor: "{colors.amber-tile-ink}"
  tile-all-clear:
    backgroundColor: "{colors.glass-wash}"
    textColor: "{colors.ink}"
  tile-locked:
    textColor: "{colors.ink-3-glass}"
    rounded: "{rounded.tile}"
  tile-title:
    textColor: "{colors.ink-2}"
    typography: "{typography.tile-title}"
  figure:
    textColor: "{colors.ink}"
    typography: "{typography.figure}"
  button-tile-primary:
    backgroundColor: "{colors.mint-deep}"
    textColor: "{colors.card}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    height: "30px"
    padding: "0 12px"
  button-tile-primary-night:
    backgroundColor: "{colors.mint}"
    textColor: "{colors.night}"
  button-tile-ghost:
    textColor: "{colors.ink-2}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    height: "30px"
    padding: "0 12px"
  button-header-pill:
    textColor: "{colors.ink-2}"
    typography: "{typography.button}"
    rounded: "{rounded.full}"
    height: "32px"
    padding: "0 13px"
  tag-good:
    backgroundColor: "{colors.mint-soft}"
    textColor: "{colors.mint-deep}"
    typography: "{typography.tag}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  tag-warn:
    backgroundColor: "{colors.amber-soft}"
    textColor: "{colors.amber-ink}"
    typography: "{typography.tag}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  tag-bad:
    backgroundColor: "{colors.terra-soft}"
    textColor: "{colors.terra-ink}"
    typography: "{typography.tag}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  tag-info:
    backgroundColor: "{colors.blue-soft}"
    textColor: "{colors.blue-ink}"
    typography: "{typography.tag}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  top-bar:
    backgroundColor: "{colors.glass-white}"
    textColor: "{colors.ink-2}"
    height: "88px"
  top-bar-night:
    backgroundColor: "{colors.night}"
    textColor: "{colors.night-ink-2}"
  dropdown-panel:
    backgroundColor: "{colors.glass-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "8px"
    width: "288px"
  dialog:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.tile}"
    width: "640px"
  profile-card:
    backgroundColor: "{colors.glass-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.tile}"
    width: "620px"
  field:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    height: "40px"
    padding: "0 12px"
---

# Design System: Kazi ERP

> **Read this before touching the look of any page.** It is for whoever is redoing the next page (a person or a Claude session), and it is about *how the site looks and is built*, nothing else. What Kazi is and who uses it: [PRODUCT.md](PRODUCT.md). What must not change while restyling (logic, documents, `data-tour` anchors): [REDESIGN.md](REDESIGN.md) §2.
>
> Rewritten **2026-10-17**. It replaces a Firebase-era spec (Poppins, a dark sidebar, a gradient-green look) that no longer matched anything. **Where this file and the code disagree, the code wins: fix the file.**
>
> **If you are about to build a page, jump to [Building a page in this look](#building-a-page-in-this-look) and [Known gaps](#known-gaps).** Which files own what, and which pages are already redone: [Where things live](#where-things-live).

## Overview

The site is being rebuilt, page by page, to one look: **frosted glass**. Every surface is a translucent pane (blur, a tint, a fine grain, a light edge) lying over a soft multicoloured glow that sits behind the whole page. A pale "reveal" light follows the mouse across the panes and lights their edges, the way Windows 10 did, and carries across the gaps onto the neighbouring pane. Colour is rationed: panes are neutral; one mint green marks what is *alive* (the current item, the latest bar, the clock ring); terracotta and amber tint a whole tile only when it needs attention. Type is Geist, mostly 12–14px, with one large tabular figure per tile. Light and dark both run from the same tokens.

It is plain on purpose. Kazi is a tool for a dozen people who log factory work, and a tile should read in a second: a title, one number, one line of context.

**Key characteristics**
- Glass in three layers, back to front: the page's coloured light → each pane's blur + tint + grain + edge → content. Every pane has an opaque fallback.
- One accent (mint), rationed. Status colours (mint good, amber warn, terracotta bad, blue info) appear as small fills and text-safe inks, and as a whole-tile tone only on demand.
- Tiles are the unit. Each tile is a size container: it shows what fits and hides the rest. The whole tile is the link; controls inside sit above it.
- Light and dark from one set of tokens that tones and themes *remap*; nothing inside a tile knows which it is in.
- Honest state everywhere: skeleton while loading, a stated reason when empty, a locked tile when a position cannot open the page, a visible line when a write is refused.
- Built for the desktop window with no scroll (bento) and for the phone with a scroll, with a tablet step between.

**Decisions the user has made about this look** (don't relitigate; extend them)
- Light is white glass on a pale page. No dark-green emphasis tiles. Dark is near-black, not green ("all green, odd"); green is only the accent.
- The Windows-style cursor light that crosses between cards, and glass on the top bar and the profile card too.
- The top bar follows the theme everywhere (white in light, near-black in dark) and is glass over the page light on redone pages.
- The light/dark switch lives in the profile card, under Sign out. It left the Dashboard header.
- "Like Discord / like X" means take the *shape or structure*, not the decoration. They rejected a cloned banner and an avatar-coloured header. Never tint a surface with a person's colour.
- No emoji as icons, and **no flag emoji** on the UK / Nepal switch or tag (removed 2026-10-17). Region is plain text.
- Pruning is welcome: tiles and tabs have been removed on request ("a Jump to tile", the sales target). Don't defend features out of habit.
- Never change `kazi mobile/` (a separate Expo app). The web look is its own thing.

## Colors

A pale green-tinted neutral world with one green, lit from behind by soft colour. The CSS variable is the contract; the token names in the frontmatter are the same values by role.

### Neutrals (light)
- **Ink** (`--ink` `#0a1c14`): headings and key numbers. **Ink-2** (`--ink-2` `#2b3b33`): tile titles, row text. **Ink-3** (`--ink-3` `#5b6a62`): secondary text; on glass use `--kb-ink-3` (`#526159`), a touch deeper because it sits on a tint. **Ink-4** (`--ink-4`): placeholders, disabled. **Ink-5** (`--ink-5`): rules, scrollbar thumbs.
- **Page** (`--bg` `#eef2ec`) and **page-2** (`--bg-2` `#e6ebe4`): the canvas and the recessed track. **Card** (`--card` white): opaque surface and the fallback for glass.
- **Lines** are `rgba(15,46,34,α)`: `--line` .08, `--line-strong` .14, wells .05–.06, tracks .09. Never grey.

### Brand: mint
- **Mint deep** (`--mint-deep` `#1f6e4c`): the accent in light theme: primary buttons, the current item, the latest bar, the clock ring, links that matter. **Mint** (`--mint` `#7dd3a8`): the accent in dark theme (and `::selection`). **Mint-2** (`--mint-2`): focus ring on old pages, good-status fills. **Mint-soft / mint-wash**: chip and selected-item backgrounds.
- Inside a tile the accent is `--kb-accent` (mint-deep in light, mint in dark) and the text on it `--kb-on-accent`.

### Status
- **Good** = mint, **warn** = amber (`#d4a04a`), **bad** = terracotta (`#c4654a`), **info** = blue (`#5688b0`). Each has a soft background and a *text-safe ink*: `--kb-good`, `--kb-warn` `#7d5512`, `--kb-bad` `#a8442c`, `--kb-info` `#2a4f6f`. Fills (bars, dots) use `--kb-*-fill`, soft backgrounds `--kb-*-bg`. `--kb-mute-fill` / `--kb-mute-bg` are the neutral.
- **Progress ramp** `--kb-r1 … --kb-r5` (pale to deep mint; in dark, dim to bright): least to most advanced, for production stages and quiet bars.
- Dark theme swaps all of these for the `night-*` tokens above; the names stay the same.

### The tokens available inside a `.kb` page
Surfaces and ink: `--kb-page`, `--kb-surface`, `--kb-surface-hover`, `--kb-well`, `--kb-line`, `--kb-line-hi`, `--kb-ink`, `--kb-ink-2`, `--kb-ink-3`, `--kb-faint`, `--kb-accent`, `--kb-on-accent`, `--kb-chip`, `--kb-track`, `--kb-shadow`, `--kb-shadow-hi`. Glass: `--kb-glass`, `--kb-glass-hover`, `--kb-glass-edge`, `--kb-glass-shadow`, `--kb-glass-shadow-hi`, `--kb-lit` (the pointer's light on the surface), `--kb-edge` (on the ring), `--kb-blur`. Status: `--kb-good|warn|bad|info` plus `-fill` and `-bg`; `--kb-mute-fill`, `--kb-mute-bg`. Ramp: `--kb-r1…5`. Motion and shape: `--kb-ease`, `--kb-gap`, `--kb-r`. Page-wide (outside `.kb`, in `glass.css`): `--glass-blur`, `--glass-lit`, `--glass-ring`, `--glass-grain`.

### Tones (remap the tokens inside one tile)
`tone="terra"` and `"amber"` tint a whole tile because it is asking for attention; `"wash"` is a breath of mint for "nothing wrong". Each has a light and a dark version that rewrites the `--kb-*` tokens, so everything inside follows. A new tone needs a real meaning and both versions.

### Page light
Behind the glass, `glass.css` paints five radial pools (green top-left, amber top-right, blue bottom-right, coral bottom-left, sky centre) over `--bg` / near-black, at .24–.4 alpha in light and .2–.36 in dark. Without something behind it the blur has nothing to show. It exists only while a bento page is on screen (`.kapp:has(.kb)`).

### Per-person colour
Avatars use `hueFromName` → `oklch(0.78 0.08 h)` background, `oklch(0.28 0.08 h)` initials (`ui.jsx`). It identifies a person on an avatar and nowhere else; a profile picture, when the person has set one, replaces it.

### Named rules
**The Rationed Green Rule.** Green marks what is alive, never a surface. In dark mode the page is `#0b100e`, not green-black.
**The Tone-on-Demand Rule.** A tile is tinted only when it needs attention (terra, amber) or says all is well (wash). Everything else is the default pane.
**The Remap-Don't-Hard-Code Rule.** Inside a tile or page, colour comes from `--kb-*` tokens. A tone or a theme changes the tokens; a component never checks which it is in. A new hex belongs in the tokens first.
**The Text-Safe Ink Rule.** Status *text* uses the ink tokens, fills use the fill tokens. `--kb-faint` is for icons and arrows, never text. `--kb-ink-3` is the lightest text allowed on glass.
**The 4.5 Rule.** Text on glass must hold 4.5:1 against the real pixels behind it, with the pointer light fully on. This was measured for every role × theme (worst case 4.47–4.55). Re-measure when you change a tint or a tone.

## Typography

**Geist** for everything, **Geist Mono** for ids, codes, currency codes and fiscal-year chips. Weights 400, 500, 600 (and 700 for dialog titles and the profile name). Body base is 14px / 1.45, antialiased, `optimizeLegibility`.

### Hierarchy
- **Page title** (20 / 600 / -0.02em / 1.25; 18 on phones): the greeting. **Greeting sub** 13 in ink-2 (12 on phones).
- **Tile title** (13 / 600 / -0.005em, ink-2, one line, ellipsis).
- **Figure** (the one big number): 28 base, stepping with the tile's height: 24 when it is ≤83px tall, 32 from 130, 38 from 180, 46 from 260; capped by `--figw` in narrow tiles. 600, -0.035em, line-height 1, tabular. Its unit sits at .5em in ink-3.
- **Row text** 13 with a second line at 12 or 11.5 in ink-3. **Sub** 12 / 1.4 ink-3. **Button** 12.5 / 600. **Tag** 11.5 / 600. **Micro** 10.5–11 (weekday heads, stat captions, bar labels).
- **Dialog title** 16 / 700; field label 12.5 / 600 ink-3; group label 11.5 / 600 / uppercase / .05em; input 14 (16 on touch).
- **Money** is the `Money` component, never hand-formatted: it carries a long and a short spelling (`₨ 1,23,456`, `₨ 1.2L`) and shows whichever the tile has room for.

### Named rules
**The One Number Rule.** A tile exists to show one number. Everything else is subordinate, ink-3 at 12px.
**The Tabular Rule.** Every number, date and time uses `font-variant-numeric: tabular-nums`; table and list numbers right-align.
**The Sentence-Case Rule.** Titles and buttons are sentence case. Uppercase is only for tiny group labels with .05em tracking.
**The Never-Wrap Rule (tiles).** Titles, rows and notes are one line with an ellipsis. Free text from users (clock messages) may wrap with `overflow-wrap: anywhere`.
**The 16px Input Rule.** Inputs are 16px on touch and under 640px, so iOS does not zoom on focus.

## Layout

### Shell
`.kapp` is a column: the top bar `.kn-bar` (88px; 64px below 1200px), then `<main class="kmain">` holding the one scroller `.kscroll`. Its padding steps down with the window: 24px 28px 28px, then 20px 18px 18px at ≤1024px, 16px 12px 24px at ≤768px, 14px 8px 20px at ≤480px. The old sidebar and page topbar no longer exist.
- **Desktop and tablet (>768px):** the window never scrolls; `.kscroll` is the scroller.
- **Phone (≤768px):** the page scrolls in `#root`, `.kscroll` is `overflow: visible`, and the bar is `position: fixed`. `position: sticky` silently does nothing on a phone (`.kmain` clips), so don't rely on it.
- **Native app (Capacitor):** a fixed bottom tab bar (`.kbnav`, 60px + safe area; still opaque white and light-only) covers the bottom; `.kscroll` pads for it.
- `noPadding` pages (Marketing, Chat) are full-bleed and manage their own scrolling.

### Page frames
- **Bento page** (`BentoPage` → `.kb`): fills what the shell leaves, `flex: 1`, minimum height 436px (780px at ≤1023px) below which the shell scroller takes over instead of crushing the tiles. A header (`DashHead`) over a grid. This is the only frame that exists in the new look.
- **Everything else** is a plain scrolling column of opaque cards. There is no flow frame in the new look yet (see Known gaps).

### The bento grid
12 columns × 4 rows, gap 12px, every cell belonging to a named `grid-template-areas` area (no holes). One template per role in `bento.css`; a page with its own tiles writes its templates as `.kb-grid.kb-grid--<name>` in its own stylesheet (one class more than bento's rules, so they win at every size). At ≤1023px it is 6 columns and 4–10 rows (it depends on the page; Attendance raises `.kb`'s minimum height to 980px for its ten); at ≤768px 2 columns, auto rows, the page scrolls and tiles grow with their content. Tile padding 14px 16px (14px on phones), inner gap 8px, head 24px high.

### Sizing by container, not window
Each tile is `container: kb / size`. Its usable box is the tile minus its padding (width − 34px, height − 30px). Content responds with `@container kb (min-height: …)` steps, and any piece that needs room carries `.kb-h-NNN` (hide below that height) or `.kb-w-NNN` (below that width). **Hide what doesn't fit; don't shrink text below 11px.** `RowList` lets rows that don't fit wrap into a column beyond the edge, where they are clipped. On phones tiles are inline-size containers only (so a height rule never fires there, which is how phone tiles show everything). **A helper loses to any rule that sets `display` on the same element and loads after `bento.css`** (a page's own stylesheet does): for those elements write the `@container kb (max-height: …) { … { display: none } }` yourself, as `attendance.css` does for its key, list and facts.

### Breakpoints
| Width | What changes |
|---|---|
| ≥1200 | Menu groups as dropdowns around the centred logo; 88px bar |
| <1200 | Groups fold into the accordion drawer behind a menu button; 64px bar, 48px logo; currency moves beside Chat |
| <1024 | Grid goes to 6 columns; tile blur 18→12px |
| <900 | Profile card's side tabs become footer buttons (touch keeps them out at any width) |
| ≤768 | Phone: page scrolls, grid is 2 columns, **no backdrop blur** (tint only), top bar fixed |
| ≤640 | Dialogs become bottom sheets (20px top corners); inputs 44px tall, 16px text |
| ≤480 | Currency list becomes a fixed popup |

### Rhythm
Spacing steps 4 / 6 / 8 / 10 / 12 / 14 / 16 / 24 / 28 (page padding: see Shell). Header to grid 14px; tile to tile 12px; list rows 8px of padding with a hairline between. Touch targets ≥40–44px on coarse pointers without inflating desktop density. Nothing may depend on hover alone.

### Scroll and stacking traps (all learned the hard way)
Portal anything that covers the whole viewport (dialogs, drawers, drop zones) into `document.body`. Never put a fixed element inside the `.fade-in` wrapper (`.kscr`): its transform becomes the containing block while it plays. Keep `transform` and `backdrop-filter` off `.kn-bar` itself: it would trap the currency popup's `position: fixed`.

## Elevation & Depth

Depth is *glass over light*, not shadow. At rest a pane is a tint, an inner top highlight, a 1px ring and a soft drop shadow; it lifts 2px on hover.

### The recipe (a tile, back to front)
1. **Page light** (`glass.css`): the five pools on `.kapp:has(.kb)`.
2. **Glass** (`.kb-tile::before`, z -2): `background-color: var(--kb-glass)` (white .6 light, #18211d .58 dark; .76 / .7 on hover) + a radial pointer light + the grain, with `backdrop-filter: blur(var(--kb-blur)) saturate(1.45)`. `--kb-blur` is 18px, 12px under 1024px, none on phones.
3. **Edge** (`::after`, z -1): a 1.5px ring cut out with a mask (`mask-composite: exclude`), coloured `--kb-edge`, strength `--near`.
4. **Content**, in a separate layer so text is never blurred.

The glass is its own layer, not the tile's `background`, so it can change tint on hover without losing the blur.

### Every glass pane
| Pane | Blur | Tint |
|---|---|---|
| Tile | 18px (12 / none) saturate 1.45 | .6 light, .58 dark |
| Top bar (`::before`) | 18px saturate 1.45 | .62 |
| Dropdown panels, currency list | 22px saturate 1.5 | .86 |
| Phone drawer | 22px | .93 light, .88 dark |
| Profile card | 24px saturate 1.5 | .82 light, .74 dark |
| Card's side tabs | 20px saturate 1.4 | .8 |
| Scrim behind the card | 2px | rgba(10,28,20,.45) / black .56 |

### The reveal
`useReveal(getItems, { inModal })` listens to one `pointermove` and writes `--mx --my --near --in` on every pane within 210px, so the light is *one* light across panes: with the pointer in a gap both neighbours glow. Mouse and pen only; a touch has no hover so nothing is written. The light is light, not movement, so it keeps running under `prefers-reduced-motion`. While any `.kmodal-overlay` is open the page behind does not glow. Used by `BentoGrid`, `TopNav` and `ProfileModal`.

### The fallback ladder (write all of it with the glass)
- No `backdrop-filter` support: the opaque card it was. All glass sits inside `@supports`.
- `prefers-reduced-transparency: reduce`: opaque `--kb-surface`, plain page, no blur; the reveal still plays. (On Windows this is Settings → Personalization → Colors → *Transparency effects* off. Chrome and Edge pass it to pages, so on such a PC the solid look is what you see by design.)
- ≤1023px lighter blur, ≤768px no blur. `forced-colors: active`: plain `Canvas`.
- `prefers-reduced-motion`: transitions and animations off.

### Shadow vocabulary
- `--shadow-1` `0 1px 0 rgba(15,46,34,.04), 0 1px 2px rgba(15,46,34,.04)`: legacy opaque cards.
- `--shadow-2` `0 4px 12px -2px rgba(15,46,34,.08), 0 2px 4px -1px rgba(15,46,34,.04)`; `--shadow-pop` `0 16px 48px -12px rgba(15,46,34,.18), 0 4px 12px -2px rgba(15,46,34,.08)`: legacy and dialogs.
- `--kb-glass-shadow` `inset 0 1px 0 rgba(255,255,255,.9), 0 0 0 1px rgba(15,46,34,.045), 0 12px 30px -16px rgba(15,46,34,.24)`; `-hi` on hover (`… 0 20px 40px -16px rgba(15,46,34,.34)`). Dark: an inset 7–10% white highlight and deep black drops.
- Dropdowns `--nav-pop-shadow`; profile card `--pf-shadow` (a long, soft, 30–80px drop).

### Motion
Ease `--kb-ease` = `cubic-bezier(.22,.8,.24,1)`. Hover lift .2s; theme colour change .22s; meters and bars grow .7s; the ring sweeps .8s; dropdowns pop .16s; dialogs in .22s `cubic-bezier(.16,1,.3,1)` (bottom sheet .3s); the drawer slides .26s. Press-in: buttons `scale(.96)`, a tile's own link `scale(.992)` (not when a button inside was pressed). Motion states a change (open, close, grow); there is no page-load choreography. Every animation has a `prefers-reduced-motion` off switch.

### Named rules
**The Backdrop Root Rule.** An element with `backdrop-filter` becomes a "backdrop root": nothing inside it can see what is behind it. So glass is a pseudo-element layer (`::before`), never the container, whenever the container has children that blur too. That is why the bar's glass is `.kn-bar::before` and why the card's scrim blur moved to the overlay's `::before`.
**The Inherited Property Rule.** `--in` and `--near` are registered with `@property … inherits: true`. With `inherits: false` the pseudo-elements read 0 and no light ever shows (this cost an hour).
**The Specificity Rule.** Component stylesheets (`bento`, `nav-theme`, `profile-theme`, `glass`) are emitted *before* `styles.css`. On equal specificity `styles.css` wins, so every override of an old rule must be one step more specific than it.
**The Flat-Pages-Stay-Flat Rule.** The glass bar and the page light switch on only while `.kb` is on screen (`:has(.kb)`). A see-through bar over a flat page just reads grey.

## Shapes

Soft and nested: outer panes round more than what they hold. Radius by role: **tile 18**, dialog 18 (20 on a phone sheet's top corners), dropdown panel 16, legacy card 14 (`--r-card`), well 12 (message wells, currency list), field and menu item 10 (`--r-input`), tile button 9, icon chip and calendar day 8, skeleton and small cell 6, chart bar 5, key swatch 3, priority bar 2. **Tags, chips, segmented controls and the region switch are pills (999px).** Avatars, dots, the clock ring and the meter caps are circles. Borders are 1px `--kb-line`; a glass edge ring is 1.5px; a **dashed** border means *locked* (the position cannot open this).

## Components

**Top bar.** Three columns: account + currency at the far left, the menu groups either side of a centred logo, Chat as a solid icon at the far right. Logo `public/kazi-logo-trimmed.png` (white on transparent; `filter: brightness(0)` in light). Triggers are 40px pills (14px / 500, radius 10); hovered or open is `--dark-2`, the group you are in is `--dark-3` with mint text. Panels: 288–344px wide, radius 16, 8px padding; each item is a 34px icon chip + 14px/600 label + 12px description; the current item has a mint-soft background and a filled mint-deep chip. The Finance panel ends with fiscal-year chips in Geist Mono. Below 1200px it is a 64px bar and a 340px accordion drawer. The menu is data in `src/constants/nav.js`; an entry shows exactly when its route opens (same permission helpers as `App.jsx`). The theme works by redefining the old `--dark*` tokens on `.kn-bar`.

**Profile card.** `<Modal size="card">`, 620px, roughly square: a 216px left pane (avatar, name, email, chips, password) and the details on the right. The avatar is the edit control. *Sign out* and *light/dark* are tabs tucked behind the card's right edge that slide out on hover or focus; the card itself never moves (below 900px they are footer buttons). Glass, with the reveal light on the card and its edge.

**Tile** (`Tile` in `Bento.jsx`). Anatomy: a head (24px icon chip, title, optional note, arrow) and a body. Props: `area` (grid area), `tone` (`default | terra | amber | wash`), `to` (route) or `onOpen` (a pop-up), `section` / `can` (permission gate; if the position can't open the destination the tile renders *locked*: dashed, "Not part of your position", no zeros), `icon`, `title`, `note`, `loading` (skeleton), `align` (`end | top | center`), `label`. The whole tile is the click target through a stretched link `.kb-hit`; anything pressed on its own carries `.kb-act` so it sits above it. Hover: lift 2px, arrow nudges.

**Pieces inside a tile.** `Figure` (+ `Sub`), `Meter` (8px track, grows in), `Money`, `RowList`/`.kb-row`, `TileButton` (`primary | ghost | good | bad`), `EmptyNote`, tags `.kb-tag--good|warn|bad|info` (pill, 11.5/600), dots `.kb-dot`, priority bar `.kb-prio`, and `charts.jsx`: `Ring` (proportions, never a made-up arc when empty), `Trend` (filled line, peak and latest marked, no hover because the tile is a link), `StackBar`, `MiniBars` (latest bar is the accent). Charts take no pixel sizes: an SVG on a fixed viewBox or flex boxes, coloured by CSS values so they follow tone and theme.

**Buttons.** Three families exist; pick by where it sits:
- *Inside a glass pane:* `.kb-btn` (30px, radius 9, 12.5/600): `primary` accent fill, `ghost` outline, `good`/`bad` for decisions (tinted and outlined so it reads as a button; filled on hover so the press is certain). Disabled keeps `pointer-events` so a second tap can't fall through to the tile link.
- *In a page header:* `.kb-pillbtn` (32px, pill, outline).
- *Legacy (pages not yet redone, dialogs):* `.primary-button` / `.ghost-button` (mint-deep fill / outline), `Btn` + `.kbtn`, `.kap-btn`. Opaque and light-only. Don't extend them for new-look work.

**Region switch** (`RegionSwitch.jsx`). A segmented pill (`kregion-seg`): a `--bg-2` track, the active segment lifted on a card with accent text. Text labels only (UK / Nepal): no flags. In a bento header it takes the page's tokens (`.kb-head .kregion-seg`). On a phone the old shared rule (≤560px, `styles.css`) stretches every `.kregion-seg` to the full width, which is far too heavy in a header: a page sizes its own there (Tasks: `.tk-ctrls`). `RegionBadge` and the org-chart tag are text too.

**Dialog** (`Modal.jsx`). Fixed header and footer, only the body scrolls; focus moves in and is restored; Tab is trapped; Escape and a backdrop click (that also *began* on the backdrop) close it; it portals to `document.body`; below 640px it is a bottom sheet. Sizes: `sm` 480, `md` 640 (default), `lg` 760, `xl` 1040, `card` 620 (`className` adds a page's own variation, e.g. the task card's 860). `onSubmit` wraps body and footer in one `<form>`. Left alone the shell is opaque and light-only; `glass` and `size="card"` are the themed, glass versions (next).

**Glass dialog and drawer** (`<Modal glass>`, `<Modal size="drawer">`; `components/modal-glass.css`). The same recipe as the tiles and the profile card (a translucent tint, 24px blur, grain, an edge the pointer lights), light and dark. It is self-contained: inside it the base tokens (`--ink`, `--card`, `--line` …) are remapped for dark, so what is drawn in a glass dialog uses those and never names a theme. The drawer floats in from the right edge (460px) on a wide screen and is the usual bottom sheet on a phone. Fields in these dialogs are `.tk-f` (label above, 40px control, 1.5px border, radius 10, the mint focus ring; 44px and 16px text on touch). Give a dialog the glass look when its page is a `.kb` page; leave the old opaque shell on pages that are not.

**Board and cards** (the Tasks page, `components/tasks/`). A section is a `.kb-tile` pane with a head (dot, name, count, +, ⋯) and its own scrolling list. A card is a near-opaque surface on that glass: a tick, the title (two lines), chips (a "High" label for High priority, the customer, the category), who and when, what finishing it is worth. There is no coloured side stripe: priority is a word, not a colour. A card is three real buttons (tick, open, options), so a keyboard gets what a mouse does. Dragging is mouse-only; the options menu moves a card on a touch screen. Within a section the order is fixed by urgency (High first, then the soonest due), not by hand. **The Archive is personal and lives on the device**: "Clear" on the Done list hides those tasks for this person on this browser only (`hooks/useClearedTasks.js`, localStorage under their id), so nothing changes in the database or for anyone else; tasks finished more than a week ago, or with no finish date, are archived for everyone by that rule alone. Deleting from the Archive is the one thing that reaches the database, and says it is for everyone. A pane that has to take its height from what is in it (the rail's small tiles) must not be a size container: give it `container-type: inline-size`. **On a phone** (≤768px; the wide page is untouched, checked pixel by pixel against a before picture) the header is two lines: the title with its counts and *New task* on the first, then one line of two small switches (Mine | Everyone, Nepal | UK with the "untagged" hint) over the search and *Filters*; adding a section is the dashed **+** after the section tabs (`.tk-tabbar`); the rail's tiles (points, Done, this week) stack under the board and the Done list is capped at about five rows, scrolling inside its tile. Pieces that must move on a phone and not on a desktop sit in an element that is `display: contents` there (`.tk-ctrls`) or hidden there (`.tk-tabbar`), so the desktop DOM draws exactly as before. A phone rule that has to beat a desktop one must be as specific: the Done tile's desktop `flex: 1 1 0` (`.tk-rail > .kb-tile.tk-rt--grow`) beat the phone's `flex: none` and squashed the tile to its heading, with the next tile drawn over it.

**The Attendance page** (`pages/Attendance.jsx`, `components/attendance/`, `attendance.css`; every sum in `lib/attendance.js`). One screen with three layouts, chosen by who is looking: *team* (position tier 2+ with Attendance: their own clock-in if they may edit, the day's ring, the roll call or one person's report, a calendar, the month in numbers), *view-only team* (the same without the clock-in; the ring tile is tall enough to name who is not in) and *staff* (clock-in, the chosen day, their own month as a timesheet calendar, counts, recent days). The database already limits what each of them can read, so the page only draws what it returns. The **clock-in** is `ClockInCard variant="ring" showTime`: one circle with the time of day in it, pressed once (the old wide card is gone). **There is no way round the location check**: a refused location, a weak signal or a spot more than 100 m from the workshop each say what is wrong and offer only to try again (the old "Clock in anyway" is gone from the ring and from the dashboard's strip). Someone whose phone cannot get a fix is marked by hand in the roll call. The check runs in the browser, so it stops honest mistakes, not a determined faker; a ring that is both pressable and showing an error keeps the error colours (`.kb-ringbtn--err.is-press`). The **ring's key is the roll call's filter**: pressing "Late" shows only the late, pressing it again shows everyone. The **roll call** is a fixed header over a list that scrolls inside its tile (`.at-th` / `.at-row`: flex rows with fixed cell widths so columns line up and hide by container width). *Edit* (tier 2+ with edit rights) turns each status into five buttons that save **that one person** at once; a quiet strip says what changed and offers Undo (which puts the old row back, or removes the one the change created); taking a late mark off asks first, because it also takes the 25% salary cut off. Someone nobody has marked reads "No record", never a made-up Absent. The **calendar** is a grid of buttons with the arrow keys (PageUp / PageDown change month) and a spoken name per day; team days carry a little stacked bar, your own days are painted with how they went and show the times when there is room (drawn from `data-v` by the stylesheet so the button's name can say them). Sums are built once: `teamMonth` adds up each person's `personMonth`, so the calendar, the stats and a person's report cannot disagree; a past day with a clock-in and no clock-out counts as Absent, unless someone set that day by hand (the clock-in stamps its record `GPS`). Attendance is not in the realtime feed, so the page looks again every minute while this month is on screen and when the tab comes back; **Refresh** forces it.

**Forms** (`.kof` grid in the order dialog). 12 columns above 640px (`.kof-c3/c4/c6/c8` say how many a field takes), 2 below. Field = label above control (12.5/600 ink-3). Input 40px, 1.5px `--line-strong` border, radius 10, 14px; hover darkens the border; focus is a `--mint-2` border plus a 3px mint ring; `:user-invalid` is terracotta; dates and numbers are normalised (no spinners, a left-aligned date). 44px / 16px on touch.

**Dropdown** (`Select` in `components/Select.jsx`, styles in `components/controls.css`). The new look never uses the browser's own <select>. A button that shows the choice (`variant="field"`: a 40px form control; `variant="pill"`: a 32px filter in a page's header row, lit when something is chosen) and a frosted-glass list under it (22px blur, radius 14, portalled to <body> so nothing can clip it, flips upward when there is no room, its own light and dark tokens). Options can carry an avatar (`icon`), a colour dot (`dot`) or a `hint`; an option with `value: ""` means none / any. More than seven options adds a search box that takes the keys. It is the select-only combobox pattern: arrows, Home / End, Enter, type-ahead, Escape (which closes only the list, never the dialog around it), Tab. Rows are 44px on touch. Give it a `label` (its spoken name); the visible label is the caller's `<label htmlFor>`.

**Date picker** (`DatePicker` in `components/DatePicker.jsx`, day maths in `lib/calendar.js`). Replaces <input type="date">: a field that reads "18 Oct 2026" with a small × to clear it, and a glass month under it with today ringed, Saturday (the day off) quieter, shortcuts (Today, Tomorrow, In a week, No date) and a click on the month's name to jump to another month or year. The value is the same "YYYY-MM-DD" string. "Today" is Kathmandu's. Keyboard like a calendar grid (arrows, Home / End, PageUp / PageDown, Shift for a year, Escape). Both controls position through `hooks/useAnchoredPopover.js`.

**The task card** (`TaskPanel.jsx`, `.kmodal--task`). The profile card's shape (`<Modal size="card" glass className="kmodal--task">`) at 860px: what the task is on the left (title, details, progress, what finishing it earns), who and when on a veiled right pane (person, priority, due date, section, category, customer, order, region). **It never scrolls**: it is wide enough for every field, controls tighten on a short window, and on a phone the two halves are two tabs in the sheet. A new form with this many fields should do the same rather than scroll.

**Scrollbars.** On a `.kb` page every scroll area gets one slim pill (12px with 3px of air, no track, no arrow buttons): calm at rest, firmer when the area is pointed at, firm under the pointer (`--kb-sb*` tokens in `bento.css`, light and dark). Dialog bodies and dropdown lists have their own matching pill. Chromium and Safari read the `::-webkit-scrollbar` pieces; Firefox gets `scrollbar-width: thin` in the same colour, **inside `@supports not selector(::-webkit-scrollbar)`** (setting `scrollbar-width` where the pieces are understood switches the pill off and brings the arrows back; `@supports (-moz-appearance: none)` is not a dependable Firefox test, other browsers have started to accept that property). Touch screens keep their overlay bar.

**Icons.** `Icons.*` from `ui.jsx`, built on `Ico({ d, s, size = 18, sw = 1.6 })`; in tiles 13–15px at stroke 1.8. Extras the set lacked live in `bento/icons.jsx` (ArrowUpRight, Sun, Moon, Lock, Bank, Star, Layers, TrendUp, Package). Never emoji, and never a unicode glyph (✕ ‹ › +) next to them.

**Avatar** (`Avatar` in `ui.jsx`). A circle: the person's picture when they have one, otherwise their initials on a colour from their name. Pass `personId` when you have it; with only a `name` it still finds the picture, because `AvatarContext` knows every name that belongs to exactly one person (a shared name finds nobody rather than the wrong face). Pictures are 256px square JPEGs in the public `avatars` bucket, linked from the `person_avatars` table (migration 0056). A link only counts if it is an https file in the person's own folder (the table checks that), and `AvatarContext` only draws links into this project's own bucket, so no one can aim everyone's browser at an address of their choosing; a new place that shows pictures (the phone app, say) must do the same. A person sets theirs in the profile card: while editing, the avatar becomes the photo picker and `PhotoCropper` offers drag, zoom and "Use photo". It saves on its own, not with the Save button. Everything degrades to initials if the table isn't there yet.

**Points** (`PointsPanel`, a section of the profile card; the Tasks page shows the same numbers). A total in the figure style, a level name with a thin progress bar to the next level, "#2 of 9 this week", and the last five awards, each with when it was earned. What a task is worth and the level thresholds are in `src/constants/points.js`. Points are only ever awarded by the database (migration 0057); the app reads them (`lib/points.js`, `hooks/usePoints.js`) and shows nothing at all until that migration has been run. The ledger itself is not readable by the app (an award's reason is a task title): everything comes through `my_points()`, `points_leaderboard()` and `my_point_history()`, which only rank people who are still Active. Tasks finished before points existed are closed off with 0-point rows, so reopening and finishing one again pays nothing.

**Loading, empty, error.** Loading is skeleton lines (`.kb-skel`), never a "Loading…" paragraph. Empty is `EmptyNote` / `.kb-empty`: an icon, one honest line. A grid that could not load shows `.kb-error` with a retry. A refused write shows a visible line ("Not saved…"), because row-level security drops it silently.

**Legacy parts still in the tree** (fine on pages not yet redone; don't build new-look UI on them): `Card`/`.kazi-card`, `KPI`/`.kkpi`, `StatCard`, `PageHeader`/`.page-header`, `.panel`, `.tab-row`/`.tab-button`, `.table-wrap`, `.stat-card`.

## Do's and Don'ts

### Do
- **Do** build a page from the `--kb-*` tokens inside a `.kb` page and let tones and themes remap them.
- **Do** give each tile one destination (the stretched link) and lift real controls above it with `.kb-act`.
- **Do** write the glass and its whole fallback ladder together, in `@supports`.
- **Do** decide what a tile shows with container queries, and the page with media queries.
- **Do** keep text on glass at 4.5:1 with the pointer light fully on, and re-measure after changing a tint.
- **Do** show honest state: skeleton, a stated reason when empty, locked when the position can't open it, a visible error when a write is refused.
- **Do** use `Icons.*` for every icon and `hueFromName` for a person's colour.
- **Do** portal anything full-screen to `document.body`.
- **Do** verify in both themes and in the solid fallback (below).

### Don't
- **Don't** paint a surface green, or tint one with a person's avatar colour.
- **Don't** hard-code a hex or a radius inside a component; add or reuse a token.
- **Don't** put `backdrop-filter` on a container whose children also need to blur.
- **Don't** use emoji as icons, and don't put flags next to UK / Nepal.
- **Don't** copy a named product's decoration; take its shape only.
- **Don't** hide something behind hover with no touch route.
- **Don't** use Tailwind classes. The Play CDN script is still in `index.html` (its Preflight reset is doing silent work for older pages, so don't delete it yet), but nothing uses its classes.
- **Don't** make a page scroll sideways or show the window scrollbar on desktop for a bento page.
- **Don't** change business logic, permissions, `data-tour` / `data-role` anchors or printed documents in a design commit (REDESIGN.md §2).
- **Don't** touch `kazi mobile/`.

## Where things live

| What | Where |
|---|---|
| Tokens, shell, old components | `src/styles.css`: `:root` at the top (ink, surfaces, mint, status, radii, shadows, fonts), app shell, top bar, legacy components, modal shell, profile card |
| The bento kit: frame, grid, tiles, pieces, container-query sizing, glass for tiles | `src/components/bento/bento.css`, `Bento.jsx`, `charts.jsx`, `icons.jsx` |
| Page light + grain + blur size shared by all glass | `src/components/glass.css` |
| Top bar light/dark + glass | `src/components/nav-theme.css`, markup in `TopNav.jsx`, menu as data in `src/constants/nav.js` |
| Profile card light/dark + glass | `src/components/profile-theme.css`, `ProfileModal.jsx` |
| The reveal light | `src/hooks/useReveal.js` |
| Light / dark choice | `src/hooks/useTheme.js` (`localStorage` key `kazi_theme`; `AppLayout` calls `useApplyTheme()` so `data-theme` is on `<html>` for every signed-in page) |
| Dashboard pages | `src/pages/Dashboard.jsx` picks a layout by `profile.positionId` through `src/pages/dash/roles.js` (owner, ops, accountant, designer, marketing, staff); one file per role in `src/pages/dash/`, shared tiles in `tiles.jsx` |
| Dialog shell | `src/components/Modal.jsx` (+ `.kmodal-*` in `styles.css`) |
| Icons, avatar, legacy Btn/Pill/Card/KPI | `src/components/ui.jsx` |
| Profile pictures | `src/lib/avatars.js` (shrink, save, remove), `src/context/AvatarContext.jsx`, `src/components/PhotoCropper.jsx` + `photo-cropper.css` |
| Points | `src/constants/points.js`, `src/lib/points.js`, `src/hooks/usePoints.js`, `src/components/PointsPanel.jsx` + `points.css` |
| Dropdown, date picker | `src/components/Select.jsx`, `src/components/DatePicker.jsx`, `src/components/controls.css`, `src/hooks/useAnchoredPopover.js`, `src/lib/calendar.js` |
| Tasks page | `src/pages/Tasks.jsx` (data, filters, every write), `src/hooks/useClearedTasks.js` (the on-device archive), `src/components/tasks/` (card, section, task card, dialogs, rail tiles, `tasks.css`), `src/lib/tasks.js` (what is done or archived, due dates, ordering, the database calls) |
| Attendance page | `src/pages/Attendance.jsx` (loading, selection, saving one person), `src/components/attendance/` (one file per tile, `attendance.css`), `src/lib/attendance.js` (dates, the roll call, month sums, what a manual change writes), `src/components/ClockInCard.jsx` (the clock-in ring and the dashboard's strip) |
| Glass dialogs, the drawer | `src/components/Modal.jsx` (`glass`, `size="drawer"`) + `src/components/modal-glass.css` |
| Fonts | `index.html` loads Geist (400–700) and Geist Mono (400–600) from Google Fonts |

Stylesheets from components load **before** `styles.css` in the build (`main.jsx` imports `App` first). See the Specificity Rule under Elevation & Depth.

### Which pages are on this look

| Page / part | State |
|---|---|
| Dashboard (all six role layouts) | **Redone**: bento, glass, light + dark |
| Top bar, dropdown menus, phone drawer | **Redone**: themed on every page, glass only while a `.kb` page is on screen |
| Profile card (avatar menu) | **Redone**: glass, light + dark, side tabs |
| Production order dialog, Meta Ads dialogs, the dashboard's product-cost editor | On the new `Modal` shell (opaque, light only) |
| Marketing calendar | On the real tokens (opaque, light only) |
| Chat, Admin Panel, Usage, Roles | The earlier "newer pages" look (`kchat-`, `kap-`, `kusg-`, `krole-`): light, opaque, not the target any more |
| Tasks | **Redone**: a board of glass sections, a rail (your points, Done, this week), a task card in the middle of the screen, glass dropdowns and a date picker; light + dark |
| Attendance | **Redone**: one screen of glass tiles for the team (clock-in, the day's ring and filter, roll call with edit and Undo, report, calendar, month) and for staff (clock-in, their day, their month, recent days); light + dark |
| Everything else (Production, QC, Inventory, Sales, Finance, Purchases, Billing, Budget, Employees, Customers, Bug report, Changelog, Login) | Earlier mint-and-white-card look, **light only**, many inline styles. Dark mode does not reach them: under a dark bar they stay light |

## Building a page in this look

1. **Read the page's entry in [REDESIGN.md](REDESIGN.md) §8** for what must be preserved (logic, anchors, edge behaviours) and its known bugs. §4's *look* is superseded by this file; §2 (ground rules), §3, §5, §8 and §11 still apply.
2. **Pick the frame.** One-screen overview → `BentoPage` + `BentoGrid` + `Tile`s with a named-area template at all three sizes (desktop, tablet, phone). A page that scrolls on desktop (long lists, boards, tables) needs a flow frame that doesn't exist yet: build it first (Known gaps 1–2) and record it here.
3. **Wrap the page in `.kb`.** That alone brings the theme tokens, dark mode, the page light and the glass top bar.
4. **Reuse the page's data code verbatim** (queries, handlers, permission checks, region filtering). Design commits don't change logic.
5. **Gate what the position can't open or edit.** `Tile section=`/`can=`; `sectionCanEdit` for writes. A view-only role still sees the whole page, read-only; hidden edit controls stay hidden.
6. **Cover the states**: loading, empty, error, locked, "not saved".
7. **Delete the page's legacy CSS in the same commit** (inline `style={{}}` objects and `k<page>-*` rules), and keep `data-tour` / `data-role` anchors.
8. **Verify.** The repo has no test runner or lint config. `npx vite build --outDir <a temp folder> --emptyOutDir` proves it compiles (and leaves `dist/` alone). Vite builds past undefined names and hook-order bugs, so also run `tsc --allowJs --checkJs` filtered to TS2304 / TS2552 / TS2305 / TS2724, and ESLint with `react-hooks` in a scratch folder. Then drive the real page in headless Chrome (`puppeteer-core`) with a faked db and check: one screen, no clipped tile, no sideways scroll at 1920×950, 1536×730, 1366×650, 1280×600, 820×1180 and 390×844; light and dark; glass *and* the solid fallback (emulate `prefers-reduced-transparency` over CDP: a PC with Windows Transparency effects off reports `reduce` by default); reduced motion; keyboard focus rings; text contrast measured from the pixels behind it.
9. **Update this file**: new tokens, new components, the page-status table, and any Known gap you closed.

## Known gaps

1. **The frame is bento-only.** `.kb` is a fixed-height flex column for a non-scrolling grid. Tasks works within it because each section scrolls inside itself; a page that must scroll as a whole (a long table, a form) has no flow variant yet.
2. **A pane is still just a `.kb-tile`.** Any `.kb-tile` can hold a list, a board column or a card (Tasks does), but there is no component for it: you write `<section className="kb-tile …">` and give its body a scroll. Extract one the next time a page needs the same.
3. **Some page-level form controls are still not redone.** The dropdown (`Select`) and the date picker are done and work in a dialog or on a page; text inputs on a page (apart from the Tasks search box, `.tk-search`), checkboxes, tabs and number / money fields are still opaque and light-only. There is no shared table: Attendance wrote its own glass row list (a fixed header over a scrolling list, `.at-th` / `.at-row`, with the scrollbar's width allowed for so columns line up); the next page that needs a table should extract it from there.
4. **Older pages ignore dark mode** and stay light under a dark bar until they are written for it.
5. **Login** still uses the old white-logo screen.
6. **`.impeccable/config.json` carries ignores** that were added only because this file used to be stale (their reasons say so). They are harmless; remove them when convenient.

## Tooling

The impeccable design hook reads the frontmatter of this file and flags literal colours, font sizes and radii in the code that fall outside it, as advisories on every edit. Pre-existing code on older pages will show findings until it is redone; that is the signal, not noise to silence. If a literal is intentional, either add it to the frontmatter (a real token) or ignore the narrowest value with a stated reason (`node .claude/skills/impeccable/scripts/hook-admin.mjs ignore-value <rule> "<value>" --file <path> --reason "<who decided: why>"`).
