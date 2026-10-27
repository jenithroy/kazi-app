/**
 * The Digitizer's canvas: a hoop on a table, the shapes in it, the stitches, and the handles to change them.
 *
 * It is plain JavaScript around one <canvas>, not React: it draws a lot (a design can have a hundred thousand stitches) and
 * follows the pointer closely. React hands it what to show through `set(props)` and hears back through `props.hooks`.
 *
 * Coordinates: millimetres in the hoop (+y down) in the design, pixels on the canvas; `view` is { k, ox, oy }:
 * pixel = mm * k + (ox, oy).
 *
 * What the pointer does depends on the tool (select, hand, rectangle, ellipse, text) and on what is under it. Dragging a shape
 * moves it, dragging a handle of the box scales it (corners keep the proportions, Shift frees them), the round handle above
 * the box turns it (Shift snaps to 15 degrees), dragging empty space draws a box that selects, the wheel zooms where the pointer
 * is, and Space, the middle button or the hand tool pans. Two fingers pan and pinch.
 */
import {
  hitObject, objectBox, boxOfObjects, objectCorners, objectsInRect, moveObject, resizeByHandle, rotateObjectAbout, scaleObjectAbout,
  worldRings, localBox,
} from "../../lib/digitizer/model.js";
import { CMD } from "../../lib/embroidery/pattern.js";

const HANDLE_PX = 7; // half the size of a handle square
const ROTATE_OFFSET_PX = 26; // how far above the box the round handle sits
const SNAP_PX = 6;
const THREAD_MM = 0.45; // sewn thread lies flat and spreads a little: about this wide

const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const CURSORS = { nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize", n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize" };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Stage {
  constructor(canvas, props) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.props = props;
    this.view = { k: 4, ox: 0, oy: 0 };
    this.size = { w: 0, h: 0, dpr: 1 };
    this.pointers = new Map();
    this.drag = null;
    this.hover = null;
    this.spaceDown = false;
    this.guides = [];
    this.marquee = null;
    this.dirty = true;
    this.raf = 0;
    this.fitted = false;
    this.themeCache = null;
    this.layer = null;
    this.layerTimer = 0;

    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onWheel = this.onWheel.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onDoubleClick = this.onDoubleClick.bind(this);
    this.onContext = (e) => e.preventDefault();

    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("dblclick", this.onDoubleClick);
    canvas.addEventListener("contextmenu", this.onContext);
    this.onLeave = () => { if (this.cursorEl) this.cursorEl.textContent = ""; };
    canvas.addEventListener("pointerleave", this.onLeave);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    // Space held down when the window loses focus never gets its keyup: forget it, or the canvas pans on every drag.
    this.onBlur = () => { if (this.spaceDown) { this.spaceDown = false; this.updateCursor(); } };
    window.addEventListener("blur", this.onBlur);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas.parentElement || canvas);
    this.resize();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.layerTimer);
    this.ro.disconnect();
    const c = this.canvas;
    c.removeEventListener("pointerdown", this.onPointerDown);
    c.removeEventListener("pointermove", this.onPointerMove);
    c.removeEventListener("pointerup", this.onPointerUp);
    c.removeEventListener("pointercancel", this.onPointerUp);
    c.removeEventListener("wheel", this.onWheel);
    c.removeEventListener("dblclick", this.onDoubleClick);
    c.removeEventListener("contextmenu", this.onContext);
    c.removeEventListener("pointerleave", this.onLeave);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
  }

  /** New props from React: remember them and draw again. */
  set(props) {
    const prev = this.props;
    this.props = props;
    if (prev.design?.hoop !== props.design?.hoop && !this.fitted) this.fitHoop();
    if (prev.theme !== props.theme) this.themeCache = null;
    this.invalidate();
  }

  invalidate() {
    if (this.dirty && this.raf) return;
    this.dirty = true;
    this.raf = requestAnimationFrame(() => { this.raf = 0; if (this.dirty) this.draw(); });
  }

  resize() {
    const parent = this.canvas.parentElement || this.canvas;
    const rect = parent.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.floor(rect.width)), h = Math.max(1, Math.floor(rect.height));
    if (w === this.size.w && h === this.size.h && dpr === this.size.dpr) return;
    this.size = { w, h, dpr };
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    if (!this.fitted) this.fitHoop(); else this.emitView();
    this.invalidate();
  }

  /* ── the view ─────────────────────────────────────────────────────── */

  toWorld(sx, sy) { return [(sx - this.view.ox) / this.view.k, (sy - this.view.oy) / this.view.k]; }
  toScreen(wx, wy) { return [wx * this.view.k + this.view.ox, wy * this.view.k + this.view.oy]; }

  emitView() { this.props.hooks?.onView?.({ ...this.view }); }

  /** Show a box of the hoop's millimetres with some air round it. */
  fitBox(box, pad = 36) {
    const { w, h } = this.size;
    if (!box || w < 10 || h < 10) return;
    const bw = Math.max(1, box[2] - box[0]), bh = Math.max(1, box[3] - box[1]);
    const k = Math.max(0.5, Math.min((w - 2 * pad) / bw, (h - 2 * pad) / bh));
    this.view = { k, ox: w / 2 - ((box[0] + box[2]) / 2) * k, oy: h / 2 - ((box[1] + box[3]) / 2) * k };
    this.fitted = true;
    this.emitView();
    this.invalidate();
  }

  fitHoop() {
    const { hoop } = this.props.design || { hoop: { w: 100, h: 100 } };
    this.fitBox([-hoop.w / 2, -hoop.h / 2, hoop.w / 2, hoop.h / 2]);
  }

  fitDesign() {
    const objs = (this.props.design?.objects || []).filter((o) => o.visible);
    const box = boxOfObjects(objs);
    const ref = this.refBox();
    const all = box && ref ? [Math.min(box[0], ref[0]), Math.min(box[1], ref[1]), Math.max(box[2], ref[2]), Math.max(box[3], ref[3])] : box || ref;
    if (all) this.fitBox(all); else this.fitHoop();
  }

  zoomAt(factor, sx, sy) {
    const k = clamp(this.view.k * factor, 0.4, 120);
    const f = k / this.view.k;
    this.view = { k, ox: sx - (sx - this.view.ox) * f, oy: sy - (sy - this.view.oy) * f };
    this.emitView();
    this.invalidate();
  }

  setZoom(k) { this.zoomAt(k / this.view.k, this.size.w / 2, this.size.h / 2); }

  /* ── what is where ────────────────────────────────────────────────── */

  refBox() {
    const r = this.props.reference;
    if (!r || !r.visible) return null;
    return [r.x, r.y, r.x + r.crop.w * r.mmPerPx, r.y + r.crop.h * r.mmPerPx];
  }

  selectedObjects() {
    const sel = new Set(this.props.selection || []);
    return (this.props.design?.objects || []).filter((o) => sel.has(o.id));
  }

  /** The handles of the current selection in the hoop: { corners (4 points for a single object), box, handles: {name: [x, y]}, rotate: [x, y], centre } or null. */
  selectionFrame() {
    const objs = this.selectedObjects();
    if (!objs.length) return null;
    let corners, centre;
    if (objs.length === 1) {
      const c = objectCorners(objs[0]);
      corners = c.c; centre = c.centre;
    } else {
      const b = boxOfObjects(objs);
      corners = [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]];
      centre = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
    }
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const handles = {
      nw: corners[0], n: mid(corners[0], corners[1]), ne: corners[1], e: mid(corners[1], corners[2]),
      se: corners[2], s: mid(corners[2], corners[3]), sw: corners[3], w: mid(corners[3], corners[0]),
    };
    // The rotate handle sits above the top edge, in the direction "up" of the box.
    const up = [handles.n[0] - centre[0], handles.n[1] - centre[1]];
    const ul = Math.hypot(up[0], up[1]) || 1;
    const off = ROTATE_OFFSET_PX / this.view.k;
    return { objs, corners, handles, centre, rotate: [handles.n[0] + (up[0] / ul) * off, handles.n[1] + (up[1] / ul) * off] };
  }

  hitHandle(sx, sy) {
    const frame = this.selectionFrame();
    if (!frame) return null;
    if (frame.objs.every((o) => o.locked)) return null;
    const near = (p, r = HANDLE_PX + 3) => { const [x, y] = this.toScreen(p[0], p[1]); return Math.abs(x - sx) <= r && Math.abs(y - sy) <= r; };
    const [rx, ry] = this.toScreen(frame.rotate[0], frame.rotate[1]);
    if (Math.hypot(rx - sx, ry - sy) <= HANDLE_PX + 4) return { kind: "rotate" };
    for (const h of HANDLES) if (near(frame.handles[h])) return { kind: "resize", handle: h };
    return null;
  }

  /* ── events ───────────────────────────────────────────────────────── */

  pos(e) {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  onWheel(e) {
    e.preventDefault();
    const [sx, sy] = this.pos(e);
    if (e.shiftKey && !e.ctrlKey) {
      this.view = { ...this.view, ox: this.view.ox - e.deltaY, oy: this.view.oy };
      this.emitView();
      this.invalidate();
      return;
    }
    const lines = e.deltaMode === 1 ? 16 : 1;
    const factor = Math.exp(-e.deltaY * lines * (e.ctrlKey ? 0.01 : 0.0015));
    this.zoomAt(factor, sx, sy);
  }

  onKeyDown(e) {
    if (e.code === "Space" && !this.isTyping(e)) { this.spaceDown = true; this.updateCursor(); }
  }
  onKeyUp(e) {
    if (e.code === "Space") { this.spaceDown = false; this.updateCursor(); }
  }
  isTyping(e) {
    const t = e.target;
    return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
  }

  onDoubleClick(e) {
    const [sx, sy] = this.pos(e);
    const [x, y] = this.toWorld(sx, sy);
    const id = hitObject(this.props.design, x, y, 5 / this.view.k);
    if (id) this.props.hooks?.onOpen?.(id);
  }

  onPointerDown(e) {
    this.canvas.setPointerCapture?.(e.pointerId);
    const [sx, sy] = this.pos(e);
    this.pointers.set(e.pointerId, [sx, sy]);
    if (this.pointers.size === 2) { this.startPinch(); return; }
    if (this.pointers.size > 2) return;

    const tool = this.props.tool;
    const mode = this.props.mode;
    const panning = e.button === 1 || e.button === 2 || this.spaceDown || tool === "hand";
    if (panning) { this.drag = { kind: "pan", sx, sy, ox: this.view.ox, oy: this.view.oy }; this.updateCursor(); return; }
    if (e.button !== 0) return;

    const [x, y] = this.toWorld(sx, sy);

    // Picture step: the picture itself is what moves and scales (and crops).
    if (mode === "picture" && this.props.reference?.visible) { this.downPicture(e, sx, sy, x, y); return; }

    if (tool === "rect" || tool === "ellipse") {
      this.props.hooks?.begin?.();
      this.drag = { kind: "create", tool, x0: x, y0: y, x1: x, y1: y, shift: e.shiftKey };
      return;
    }
    if (tool === "text") { this.props.hooks?.onCreateText?.(x, y); return; }

    // Select tool.
    const handle = this.hitHandle(sx, sy);
    if (handle) {
      const frame = this.selectionFrame();
      this.props.hooks?.begin?.();
      this.drag = { kind: handle.kind, handle: handle.handle, start: this.selectedObjects(), frame, x0: x, y0: y };
      this.updateCursor(handle);
      return;
    }
    const id = hitObject(this.props.design, x, y, 4 / this.view.k);
    const selected = new Set(this.props.selection || []);
    if (id) {
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        const next = new Set(selected);
        if (next.has(id)) next.delete(id); else next.add(id);
        this.props.hooks?.onSelect?.([...next]);
        this.drag = null;
        return;
      }
      if (!selected.has(id)) this.props.hooks?.onSelect?.([id]);
      const ids = selected.has(id) ? [...selected] : [id];
      const start = this.props.design.objects.filter((o) => ids.includes(o.id));
      this.props.hooks?.begin?.();
      this.drag = { kind: "move", start, x0: x, y0: y, moved: false };
      return;
    }
    // Empty space: a box that selects (touch: pan instead, so a finger can move around).
    if (e.pointerType === "touch") { this.drag = { kind: "pan", sx, sy, ox: this.view.ox, oy: this.view.oy }; return; }
    if (!(e.shiftKey)) this.props.hooks?.onSelect?.([]);
    this.drag = { kind: "marquee", x0: x, y0: y, base: e.shiftKey ? [...selected] : [] };
    this.marquee = [x, y, x, y];
    this.invalidate();
  }

  downPicture(e, sx, sy, x, y) {
    const ref = this.props.reference;
    const box = this.refBox();
    if (this.props.crop) {
      // Crop box handles.
      const h = this.hitBoxHandle(box, sx, sy);
      if (h) { this.props.hooks?.onCropStart?.(); this.drag = { kind: "crop", handle: h, x0: x, y0: y, crop: { ...ref.crop }, ref: { ...ref } }; return; }
    } else {
      const h = this.hitBoxHandle(box, sx, sy, true);
      if (h) { this.props.hooks?.onRefStart?.(); this.drag = { kind: "refscale", handle: h, ref: { ...ref }, box }; return; }
    }
    if (x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3] && !this.props.crop) {
      this.props.hooks?.onRefStart?.();
      this.drag = { kind: "refmove", x0: x, y0: y, ref: { ...ref } };
    }
  }

  hitBoxHandle(box, sx, sy, cornersOnly = false) {
    if (!box) return null;
    const mid = (a, b) => (a + b) / 2;
    const pts = {
      nw: [box[0], box[1]], ne: [box[2], box[1]], se: [box[2], box[3]], sw: [box[0], box[3]],
      n: [mid(box[0], box[2]), box[1]], s: [mid(box[0], box[2]), box[3]], e: [box[2], mid(box[1], box[3])], w: [box[0], mid(box[1], box[3])],
    };
    for (const [name, p] of Object.entries(pts)) {
      if (cornersOnly && name.length === 1) continue;
      const [x, y] = this.toScreen(p[0], p[1]);
      if (Math.abs(x - sx) <= HANDLE_PX + 3 && Math.abs(y - sy) <= HANDLE_PX + 3) return name;
    }
    return null;
  }

  /** A second finger came down in the middle of an edit: close that edit (a pinch takes over), so the history is not left open. */
  abandonDrag() {
    const d = this.drag;
    if (!d) return;
    const hooks = this.props.hooks;
    if (d.kind === "move" || d.kind === "resize" || d.kind === "rotate") hooks?.end?.();
    else if (d.kind === "create") hooks?.cancel?.();
    else if (d.kind === "refmove" || d.kind === "refscale") hooks?.onRefEnd?.();
    else if (d.kind === "crop") hooks?.onCropEnd?.();
    this.guides = [];
    this.marquee = null;
    this.drag = null;
    this.invalidate();
  }

  startPinch() {
    this.abandonDrag();
    const pts = [...this.pointers.values()];
    this.drag = {
      kind: "pinch",
      dist: Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]) || 1,
      mid: [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2],
    };
  }

  onPointerMove(e) {
    const [sx, sy] = this.pos(e);
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, [sx, sy]);
    const d = this.drag;
    if (this.cursorEl) { const [cx, cy] = this.toWorld(sx, sy); this.cursorEl.textContent = `${cx.toFixed(1)}, ${cy.toFixed(1)} mm`; }
    if (!d) { this.updateHover(sx, sy); return; }
    const hooks = this.props.hooks;
    const [x, y] = this.toWorld(sx, sy);

    if (d.kind === "pinch" && this.pointers.size >= 2) {
      const pts = [...this.pointers.values()];
      const dist = Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]) || 1;
      const mid = [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2];
      this.view = { ...this.view, ox: this.view.ox + (mid[0] - d.mid[0]), oy: this.view.oy + (mid[1] - d.mid[1]) };
      this.zoomAt(dist / d.dist, mid[0], mid[1]);
      d.dist = dist; d.mid = mid;
      return;
    }
    if (d.kind === "pan") {
      this.view = { ...this.view, ox: d.ox + (sx - d.sx), oy: d.oy + (sy - d.sy) };
      this.emitView();
      this.invalidate();
      return;
    }
    if (d.kind === "move") {
      let dx = x - d.x0, dy = y - d.y0;
      if (!d.moved && Math.hypot(dx, dy) * this.view.k < 3) return; // a click, not a drag
      d.moved = true;
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      ({ dx, dy } = this.snapMove(d.start, dx, dy, e.altKey));
      const ids = new Map(d.start.map((o) => [o.id, o]));
      hooks?.live?.((cur) => ({ ...cur, objects: cur.objects.map((o) => (ids.has(o.id) ? moveObject(ids.get(o.id), dx, dy) : o)) }));
      return;
    }
    if (d.kind === "resize") { this.dragResize(d, x, y, e); return; }
    if (d.kind === "rotate") { this.dragRotate(d, x, y, e); return; }
    if (d.kind === "marquee") {
      this.marquee = [d.x0, d.y0, x, y];
      const rect = [Math.min(d.x0, x), Math.min(d.y0, y), Math.max(d.x0, x), Math.max(d.y0, y)];
      const inside = x >= d.x0;
      const ids = objectsInRect(this.props.design, rect, inside);
      hooks?.onSelect?.([...new Set([...d.base, ...ids])]);
      this.invalidate();
      return;
    }
    if (d.kind === "create") {
      d.x1 = x; d.y1 = y; d.shift = e.shiftKey;
      this.invalidate();
      return;
    }
    if (d.kind === "refmove") {
      hooks?.onRefLive?.({ ...d.ref, x: d.ref.x + (x - d.x0), y: d.ref.y + (y - d.y0) });
      return;
    }
    if (d.kind === "refscale") {
      const r = d.ref, b = d.box;
      const ax = d.handle.includes("w") ? b[2] : b[0], ay = d.handle.includes("n") ? b[3] : b[1];
      const w0 = b[2] - b[0], h0 = b[3] - b[1];
      const k = Math.max(0.05, Math.max(Math.abs(x - ax) / w0, Math.abs(y - ay) / h0));
      const mm = r.mmPerPx * k;
      const nx = d.handle.includes("w") ? ax - r.crop.w * mm : ax;
      const ny = d.handle.includes("n") ? ay - r.crop.h * mm : ay;
      hooks?.onRefLive?.({ ...r, mmPerPx: mm, x: nx, y: ny });
      return;
    }
    if (d.kind === "crop") { this.dragCrop(d, x, y); return; }
  }

  dragCrop(d, x, y) {
    const r = d.ref;
    const mm = r.mmPerPx;
    // The pointer in source pixels.
    const px = (x - r.x) / mm + d.crop.x, py = (y - r.y) / mm + d.crop.y;
    const c = { ...d.crop };
    const right = d.crop.x + d.crop.w, bottom = d.crop.y + d.crop.h;
    const minPx = 8;
    if (d.handle.includes("w")) { c.x = clamp(px, 0, right - minPx); c.w = right - c.x; }
    if (d.handle.includes("e")) { c.w = clamp(px - c.x, minPx, r.srcW - c.x); }
    if (d.handle.includes("n")) { c.y = clamp(py, 0, bottom - minPx); c.h = bottom - c.y; }
    if (d.handle.includes("s")) { c.h = clamp(py - c.y, minPx, r.srcH - c.y); }
    this.props.hooks?.onCropLive?.({ ...r, crop: c, x: r.x + (c.x - d.crop.x) * mm, y: r.y + (c.y - d.crop.y) * mm });
  }

  dragResize(d, x, y, e) {
    const hooks = this.props.hooks;
    const keep = !e.shiftKey; // corners keep the proportions unless Shift is held
    if (d.start.length === 1) {
      const o0 = d.start[0];
      const next = resizeByHandle(o0, d.handle, x, y, keep && d.handle.length === 2);
      hooks?.live?.((cur) => ({ ...cur, objects: cur.objects.map((o) => (o.id === o0.id ? next : o)) }));
      return;
    }
    // A group: scale about the opposite side of the group's box.
    const b = boxOfObjects(d.start);
    const hx = d.handle.includes("w") ? -1 : d.handle.includes("e") ? 1 : 0, hy = d.handle.includes("n") ? -1 : d.handle.includes("s") ? 1 : 0;
    const ax = hx > 0 ? b[0] : hx < 0 ? b[2] : (b[0] + b[2]) / 2, ay = hy > 0 ? b[1] : hy < 0 ? b[3] : (b[1] + b[3]) / 2;
    const hxw = hx > 0 ? b[2] : hx < 0 ? b[0] : (b[0] + b[2]) / 2, hyw = hy > 0 ? b[3] : hy < 0 ? b[1] : (b[1] + b[3]) / 2;
    let a = hx ? (x - ax) / (hxw - ax || 1) : 1, c = hy ? (y - ay) / (hyw - ay || 1) : 1;
    if (keep && hx && hy) { const k = Math.max(Math.abs(a), Math.abs(c)); a = Math.sign(a || 1) * k; c = Math.sign(c || 1) * k; }
    if (Math.abs(a) < 0.02) a = 0.02 * (a < 0 ? -1 : 1);
    if (Math.abs(c) < 0.02) c = 0.02 * (c < 0 ? -1 : 1);
    const ids = new Map(d.start.map((o) => [o.id, o]));
    hooks?.live?.((cur) => ({ ...cur, objects: cur.objects.map((o) => (ids.has(o.id) ? scaleObjectAbout(ids.get(o.id), a, c, ax, ay) : o)) }));
  }

  dragRotate(d, x, y, e) {
    const hooks = this.props.hooks;
    const centre = d.frame.centre;
    let deg = (Math.atan2(y - centre[1], x - centre[0]) * 180) / Math.PI - (Math.atan2(d.y0 - centre[1], d.x0 - centre[0]) * 180) / Math.PI;
    if (e.shiftKey) {
      // Snap the object's final turn to 15 degrees when there is one object; for a group snap the turn made.
      const base = d.start.length === 1 ? d.start[0].transform.rot : 0;
      deg = Math.round((base + deg) / 15) * 15 - base;
    }
    const ids = new Map(d.start.map((o) => [o.id, o]));
    hooks?.live?.((cur) => ({ ...cur, objects: cur.objects.map((o) => (ids.has(o.id) ? rotateObjectAbout(ids.get(o.id), deg, centre[0], centre[1]) : o)) }));
  }

  /** The move, nudged so edges and centres line up with the hoop and the other objects; remembers the guide lines to draw. */
  snapMove(start, dx, dy, off) {
    this.guides = [];
    if (off) return { dx, dy };
    const box = boxOfObjects(start);
    const tol = SNAP_PX / this.view.k;
    const others = this.props.design.objects.filter((o) => o.visible && !start.some((s) => s.id === o.id));
    const hoop = this.props.design.hoop;
    const xs = [-hoop.w / 2, 0, hoop.w / 2], ys = [-hoop.h / 2, 0, hoop.h / 2];
    for (const o of others) {
      const b = objectBox(o);
      xs.push(b[0], (b[0] + b[2]) / 2, b[2]);
      ys.push(b[1], (b[1] + b[3]) / 2, b[3]);
    }
    const mine = (b) => ({ x: [b[0] + dx, (b[0] + b[2]) / 2 + dx, b[2] + dx], y: [b[1] + dy, (b[1] + b[3]) / 2 + dy, b[3] + dy] });
    const m = mine(box);
    let bx = null, by = null;
    for (const v of m.x) for (const t of xs) { const dd = t - v; if (Math.abs(dd) <= tol && (!bx || Math.abs(dd) < Math.abs(bx.d))) bx = { d: dd, at: t }; }
    for (const v of m.y) for (const t of ys) { const dd = t - v; if (Math.abs(dd) <= tol && (!by || Math.abs(dd) < Math.abs(by.d))) by = { d: dd, at: t }; }
    if (bx) { dx += bx.d; this.guides.push({ axis: "x", at: bx.at }); }
    if (by) { dy += by.d; this.guides.push({ axis: "y", at: by.at }); }
    return { dx, dy };
  }

  onPointerUp(e) {
    this.pointers.delete(e.pointerId);
    this.canvas.releasePointerCapture?.(e.pointerId);
    const d = this.drag;
    if (this.pointers.size === 1 && d?.kind === "pinch") { this.drag = null; return; }
    if (this.pointers.size > 0) return;
    this.drag = null;
    this.guides = [];
    this.marquee = null;
    const hooks = this.props.hooks;
    if (!d) return;
    if (d.kind === "move" || d.kind === "resize" || d.kind === "rotate") hooks?.end?.();
    else if (d.kind === "create") {
      // Same box as the preview shows: from where the drag began, as a square when Shift is held (toward wherever the pointer went).
      let sw = d.x1 - d.x0, sh = d.y1 - d.y0;
      if (d.shift) { const m = Math.max(Math.abs(sw), Math.abs(sh)); sw = Math.sign(sw || 1) * m; sh = Math.sign(sh || 1) * m; }
      const x0 = Math.min(d.x0, d.x0 + sw), y0 = Math.min(d.y0, d.y0 + sh);
      const w = Math.abs(sw), h = Math.abs(sh);
      hooks?.cancel?.();
      if (w * this.view.k > 6 && h * this.view.k > 6) hooks?.onCreateShape?.(d.tool, [x0, y0, x0 + w, y0 + h]);
      else hooks?.onCreateShape?.(d.tool, null, [d.x0, d.y0]); // a click: the page makes a shape of its usual size there
    } else if (d.kind === "refmove" || d.kind === "refscale") hooks?.onRefEnd?.();
    else if (d.kind === "crop") hooks?.onCropEnd?.();
    this.updateCursor();
    this.invalidate();
  }

  updateHover(sx, sy) {
    const mode = this.props.mode;
    let cursor = "";
    if (this.spaceDown || this.props.tool === "hand") cursor = "grab";
    else if (mode === "picture") {
      const box = this.refBox();
      const h = box && this.hitBoxHandle(box, sx, sy, !this.props.crop);
      cursor = h ? CURSORS[h] : box && !this.props.crop && this.inBox(box, sx, sy) ? "move" : "default";
    } else if (this.props.tool === "rect" || this.props.tool === "ellipse") cursor = "crosshair";
    else if (this.props.tool === "text") cursor = "text";
    else {
      const h = this.hitHandle(sx, sy);
      if (h?.kind === "rotate") cursor = "grab";
      else if (h) cursor = CURSORS[h.handle];
      else {
        const [x, y] = this.toWorld(sx, sy);
        const id = hitObject(this.props.design, x, y, 4 / this.view.k);
        if (id !== this.hover) { this.hover = id; this.invalidate(); }
        cursor = id ? "move" : "default";
      }
    }
    if (this.canvas.style.cursor !== cursor) this.canvas.style.cursor = cursor;
  }

  inBox(box, sx, sy) {
    const [x, y] = this.toWorld(sx, sy);
    return x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3];
  }

  updateCursor(handle) {
    const d = this.drag;
    if (d?.kind === "pan") this.canvas.style.cursor = "grabbing";
    else if (handle) this.canvas.style.cursor = handle.kind === "rotate" ? "grabbing" : CURSORS[handle.handle];
    else this.canvas.style.cursor = this.spaceDown || this.props.tool === "hand" ? "grab" : "";
  }

  /* ── drawing ──────────────────────────────────────────────────────── */

  theme() {
    if (this.themeCache) return this.themeCache;
    const cs = getComputedStyle(this.canvas);
    const get = (name, fallback) => cs.getPropertyValue(name).trim() || fallback;
    this.themeCache = {
      ink: get("--kb-ink", "#0a1c14"),
      ink3: get("--kb-ink-3", "#5b6a62"),
      accent: get("--kb-accent", "#1f6e4c"),
      line: get("--kb-line-hi", "rgba(15,46,34,.2)"),
      well: get("--kb-well", "#e6ebe4"),
    };
    return this.themeCache;
  }

  draw() {
    this.dirty = false;
    const { ctx } = this;
    const { w, h, dpr } = this.size;
    const p = this.props;
    const design = p.design;
    if (!design) return;
    const th = this.theme();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const { k, ox, oy } = this.view;

    // The table, then the fabric inside the hoop.
    const hoop = design.hoop;
    const [hx, hy] = this.toScreen(-hoop.w / 2, -hoop.h / 2);
    ctx.fillStyle = p.fabricColor || "#f4f1ea";
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.18)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 4;
    ctx.fillRect(hx, hy, hoop.w * k, hoop.h * k);
    ctx.restore();
    ctx.fillStyle = p.fabricColor || "#f4f1ea";
    ctx.fillRect(hx, hy, hoop.w * k, hoop.h * k);

    // Grid (10 mm, stronger every 50 mm) inside the hoop, only when it is not too dense.
    if (p.showGrid && k >= 3) this.drawGrid(hoop);

    ctx.save();
    ctx.beginPath();
    ctx.rect(hx, hy, hoop.w * k, hoop.h * k);
    ctx.clip();
    // Reference picture.
    if (p.reference && p.reference.visible && p.refImage && p.mode !== "stitches") this.drawReference();
    // The shapes.
    const mode = p.mode;
    if (mode !== "stitches" || p.showShapes) this.drawObjects(mode === "stitches" ? 0.18 : mode === "picture" ? 0.55 : 1, mode === "picture");
    // The stitches.
    if (mode === "stitches" && p.stitches) this.drawStitches();
    ctx.restore();

    // The hoop's edge and centre marks.
    ctx.strokeStyle = th.line;
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(hx + 0.5, hy + 0.5, hoop.w * k, hoop.h * k);
    ctx.setLineDash([]);
    const [cx, cy] = this.toScreen(0, 0);
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy); ctx.lineTo(cx + 6, cy); ctx.moveTo(cx, cy - 6); ctx.lineTo(cx, cy + 6);
    ctx.stroke();

    this.drawRulers(hoop);
    if (mode === "picture") this.drawPictureHandles();
    else if (mode !== "stitches") this.drawSelection();
    this.drawGuides();
    this.drawMarquee();
    this.drawCreate();
  }

  drawGrid(hoop) {
    const { ctx } = this;
    const { k } = this.view;
    const step = k >= 12 ? 5 : 10;
    ctx.save();
    ctx.lineWidth = 1;
    for (let x = Math.ceil(-hoop.w / 2 / step) * step; x <= hoop.w / 2; x += step) {
      const major = Math.round(x) % 50 === 0;
      ctx.strokeStyle = major ? "rgba(60,70,90,.20)" : "rgba(60,70,90,.09)";
      const [sx, sy0] = this.toScreen(x, -hoop.h / 2), [, sy1] = this.toScreen(x, hoop.h / 2);
      ctx.beginPath(); ctx.moveTo(Math.round(sx) + 0.5, sy0); ctx.lineTo(Math.round(sx) + 0.5, sy1); ctx.stroke();
    }
    for (let y = Math.ceil(-hoop.h / 2 / step) * step; y <= hoop.h / 2; y += step) {
      const major = Math.round(y) % 50 === 0;
      ctx.strokeStyle = major ? "rgba(60,70,90,.20)" : "rgba(60,70,90,.09)";
      const [sx0, sy] = this.toScreen(-hoop.w / 2, y), [sx1] = this.toScreen(hoop.w / 2, y);
      ctx.beginPath(); ctx.moveTo(sx0, Math.round(sy) + 0.5); ctx.lineTo(sx1, Math.round(sy) + 0.5); ctx.stroke();
    }
    ctx.restore();
  }

  drawRulers(hoop) {
    const { ctx } = this;
    const { k } = this.view;
    const { w, h } = this.size;
    const th = this.theme();
    const nice = [1, 2, 5, 10, 20, 50, 100];
    const step = nice.find((n) => n * k >= 46) || 100;
    ctx.save();
    ctx.font = '500 10px "Geist", system-ui, sans-serif';
    ctx.fillStyle = th.ink3;
    ctx.strokeStyle = th.line;
    ctx.lineWidth = 1;
    ctx.textBaseline = "top";
    // Along the top edge of the canvas.
    const [wx0] = this.toWorld(0, 0), [wx1] = this.toWorld(w, 0);
    for (let x = Math.ceil(wx0 / step) * step; x <= wx1; x += step) {
      const [sx] = this.toScreen(x, 0);
      ctx.beginPath(); ctx.moveTo(Math.round(sx) + 0.5, 0); ctx.lineTo(Math.round(sx) + 0.5, 6); ctx.stroke();
      ctx.fillText(String(Math.round(x * 10) / 10), sx + 3, 6);
    }
    const [, wy0] = this.toWorld(0, 0), [, wy1] = this.toWorld(0, h);
    ctx.textBaseline = "alphabetic";
    for (let y = Math.ceil(wy0 / step) * step; y <= wy1; y += step) {
      const [, sy] = this.toScreen(0, y);
      ctx.beginPath(); ctx.moveTo(0, Math.round(sy) + 0.5); ctx.lineTo(6, Math.round(sy) + 0.5); ctx.stroke();
      ctx.save();
      ctx.translate(8, sy - 3);
      ctx.fillText(String(Math.round(y * 10) / 10), 0, 0);
      ctx.restore();
    }
    ctx.restore();
    void hoop;
  }

  drawReference() {
    const { ctx } = this;
    const r = this.props.reference;
    const img = this.props.refImage;
    const [x, y] = this.toScreen(r.x, r.y);
    const w = r.crop.w * r.mmPerPx * this.view.k, h = r.crop.h * r.mmPerPx * this.view.k;
    ctx.save();
    ctx.globalAlpha = this.props.mode === "picture" ? r.opacity ?? 1 : Math.min(r.opacity ?? 1, 0.35);
    if (this.props.crop) {
      // While cropping, show all of the picture dimmed, and the part kept at full strength.
      const fx = r.x - r.crop.x * r.mmPerPx, fy = r.y - r.crop.y * r.mmPerPx;
      const [ax, ay] = this.toScreen(fx, fy);
      ctx.globalAlpha = 0.3;
      ctx.drawImage(img, ax, ay, r.srcW * r.mmPerPx * this.view.k, r.srcH * r.mmPerPx * this.view.k);
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(img, r.crop.x, r.crop.y, r.crop.w, r.crop.h, x, y, w, h);
    ctx.restore();
  }

  /** Path of an object's rings in screen space. */
  pathOf(rings, m) {
    const { k, ox, oy } = this.view;
    const path = new Path2D();
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const px = ring[i][0], py = ring[i][1];
        const wx = m[0] * px + m[2] * py + m[4], wy = m[1] * px + m[3] * py + m[5];
        if (i === 0) path.moveTo(wx * k + ox, wy * k + oy); else path.lineTo(wx * k + ox, wy * k + oy);
      }
      path.closePath();
    }
    return path;
  }

  drawObjects(alpha, outlineOnly) {
    const { ctx } = this;
    const objs = this.props.design.objects;
    ctx.save();
    for (const o of objs) {
      if (!o.visible) continue;
      const t = o.transform;
      const r = (t.rot * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
      const m = [c * t.sx, s * t.sx, -s * t.sy, c * t.sy, t.x, t.y];
      const path = this.pathOf(o.rings, m);
      if (o.fill.type !== "none") {
        if (outlineOnly) {
          // A dark line with a light one inside it shows on any picture, whatever the shape's own colour is.
          ctx.globalAlpha = 0.95;
          ctx.strokeStyle = "rgba(10,28,20,.7)";
          ctx.lineWidth = 3;
          ctx.stroke(path);
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 1.2;
          ctx.stroke(path);
        } else {
          ctx.globalAlpha = alpha;
          ctx.fillStyle = o.fill.color;
          ctx.fill(path, "evenodd");
        }
      }
      if (o.stroke && o.stroke.type !== "none" && !outlineOnly) {
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = o.stroke.color;
        const widthMm = o.stroke.type === "satin" ? o.stroke.width : 0.5;
        ctx.lineWidth = Math.max(1, widthMm * this.view.k);
        ctx.stroke(path);
      }
    }
    ctx.restore();
  }

  /**
   * The stitches live on a layer of their own, a picture the size of the canvas, drawn once and then just placed. Stroking a
   * hundred thousand threads takes a good while on a computer without a graphics card, so it is done only when the stitches or
   * the view change, never for a hover or a selection. While the view is moving (the wheel, a pan) the old layer is
   * stretched and shifted to follow, and a sharp one is drawn a moment after it stops. The player adds only the stitches
   * that are new.
   */
  stitchLayer(st, upto) {
    const { w, h, dpr } = this.size;
    const { k, ox, oy } = this.view;
    let L = this.layer;
    const sameBase = L && L.flat === st.flat && L.dpr === dpr && L.w === w && L.h === h && L.showJumps === !!this.props.showJumps;
    if (!sameBase) {
      const canvas = L?.canvas || document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      L = { canvas, flat: st.flat, dpr, w, h, showJumps: !!this.props.showJumps, k: 0, ox: 0, oy: 0, upto: -1, state: null, stale: false };
      this.layer = L;
    }
    const moved = L.k !== k || L.ox !== ox || L.oy !== oy;
    if (L.upto < 0 || (moved && (this.props.simPos != null || L.upto !== upto))) {
      this.paintStitches(L, st, 0, upto, true);
    } else if (moved) {
      // Follow the view with the old picture now; draw the sharp one when it has stopped.
      L.stale = true;
      clearTimeout(this.layerTimer);
      this.layerTimer = setTimeout(() => { if (this.layer === L) { this.paintStitches(L, st, 0, this.layerUpto(st), true); this.invalidate(); } }, 140);
    } else if (L.upto !== upto) {
      if (upto > L.upto) this.paintStitches(L, st, L.upto, upto, false);
      else this.paintStitches(L, st, 0, upto, true);
    }
    return L;
  }

  layerUpto(st) {
    const total = st.flat.length / 3;
    return this.props.simPos != null ? Math.min(total, Math.max(0, Math.floor(this.props.simPos))) : total;
  }

  /** Draw stitches `from` to `to` onto the layer (everything from the start when `full`), at the view as it is now. */
  paintStitches(L, st, from, to, full) {
    const lctx = L.canvas.getContext("2d");
    const { k, ox, oy } = this.view;
    const flat = st.flat;
    const colors = st.threads.length ? st.threads : [{ r: 20, g: 20, b: 20 }];
    if (full) {
      lctx.setTransform(1, 0, 0, 1, 0, 0);
      lctx.clearRect(0, 0, L.canvas.width, L.canvas.height);
      L.k = k; L.ox = ox; L.oy = oy;
      L.state = { thread: 0, px: null, py: null, lastX: null, lastY: null };
      from = 0;
    }
    const S = L.state;
    const paths = new Map();
    const jumps = new Path2D();
    let any = false;
    for (let i = from; i < to; i++) {
      const x = flat[i * 3] / 10, y = flat[i * 3 + 1] / 10, c = flat[i * 3 + 2];
      if (c === CMD.STITCH) {
        if (S.px !== null) {
          let p = paths.get(S.thread);
          if (!p) { p = new Path2D(); paths.set(S.thread, p); }
          p.moveTo(S.px, S.py); p.lineTo(x, y);
        }
        S.px = x; S.py = y; S.lastX = x; S.lastY = y;
      } else if (c === CMD.JUMP) {
        if (L.showJumps && S.lastX !== null) { jumps.moveTo(S.lastX, S.lastY); jumps.lineTo(x, y); any = true; }
        S.px = null; S.lastX = x; S.lastY = y;
      } else if (c === CMD.COLOR_CHANGE) {
        S.thread = Math.min(S.thread + 1, colors.length - 1);
        S.px = null;
      }
    }
    L.upto = to;
    L.stale = false;
    // Paths are in millimetres; the layer is in device pixels of the view it was drawn at.
    const dpr = L.dpr;
    lctx.setTransform(dpr * L.k, 0, 0, dpr * L.k, dpr * L.ox, dpr * L.oy);
    lctx.lineCap = "round";
    lctx.lineJoin = "round";
    const lw = Math.max(THREAD_MM, 0.7 / L.k); // a thread is never thinner than a pixel on screen
    for (const [thread, path] of paths) {
      const t = colors[thread];
      lctx.lineWidth = lw;
      // A thread is a little darker at its edges and lighter along its middle; kept gentle so a colour reads as itself
      // (white thread must not look grey, and a picture's brightness must survive the preview).
      lctx.strokeStyle = `rgb(${Math.round(t.r * 0.8)},${Math.round(t.g * 0.8)},${Math.round(t.b * 0.8)})`;
      lctx.stroke(path);
      lctx.lineWidth = lw * 0.62;
      lctx.strokeStyle = `rgb(${Math.min(255, Math.round(t.r * 1.1 + 8))},${Math.min(255, Math.round(t.g * 1.1 + 8))},${Math.min(255, Math.round(t.b * 1.1 + 8))})`;
      lctx.stroke(path);
    }
    if (any) {
      lctx.lineWidth = 1 / L.k;
      lctx.strokeStyle = "rgba(220,60,40,.8)";
      lctx.setLineDash([3 / L.k, 3 / L.k]);
      lctx.stroke(jumps);
      lctx.setLineDash([]);
    }
  }

  drawStitches() {
    const { ctx } = this;
    const st = this.props.stitches; // { flat: Int32Array, threads: [{r,g,b}] }
    if (!st || !st.flat) return;
    const upto = this.layerUpto(st);
    const L = this.stitchLayer(st, upto);
    const { w, h } = this.size;
    const { k, ox, oy } = this.view;
    const s = k / L.k;
    ctx.save();
    ctx.drawImage(L.canvas, ox - L.ox * s, oy - L.oy * s, w * s, h * s);
    // Places where many needle holes crowd together: a ring round each, so they can be found and fixed.
    if (this.props.showProblems && st.checks?.piledUp?.length) {
      ctx.strokeStyle = "#e23b2e";
      ctx.lineWidth = 2;
      for (const p of st.checks.piledUp) {
        ctx.beginPath();
        ctx.arc(p.x * k + ox, p.y * k + oy, 8 + Math.min(10, p.holes / 3), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    if (this.props.simPos != null && L.state && L.state.lastX !== null) {
      ctx.fillStyle = "#e23b2e";
      ctx.beginPath();
      ctx.arc(L.state.lastX * k + ox, L.state.lastY * k + oy, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawSelection() {
    const { ctx } = this;
    const th = this.theme();
    const sel = new Set(this.props.selection || []);
    const objs = this.props.design.objects;
    ctx.save();
    // Hover outline.
    if (this.hover && !sel.has(this.hover) && this.props.tool === "select") {
      const o = objs.find((x) => x.id === this.hover);
      if (o) { ctx.strokeStyle = th.accent; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.7; this.strokeObject(o); }
    }
    for (const o of objs) {
      if (!sel.has(o.id)) continue;
      ctx.strokeStyle = th.accent;
      ctx.lineWidth = 1.2;
      ctx.globalAlpha = 0.9;
      this.strokeObject(o);
    }
    ctx.globalAlpha = 1;
    const frame = this.selectionFrame();
    if (frame) {
      const pts = frame.corners.map((c) => this.toScreen(c[0], c[1]));
      ctx.strokeStyle = th.accent;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.closePath();
      ctx.stroke();
      const locked = frame.objs.every((o) => o.locked);
      if (!locked) {
        const [rx, ry] = this.toScreen(frame.rotate[0], frame.rotate[1]);
        const [nx, ny] = this.toScreen(frame.handles.n[0], frame.handles.n[1]);
        ctx.beginPath(); ctx.moveTo(nx, ny); ctx.lineTo(rx, ry); ctx.stroke();
        ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.arc(rx, ry, HANDLE_PX - 1, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        for (const hname of HANDLES) {
          const [x, y] = this.toScreen(frame.handles[hname][0], frame.handles[hname][1]);
          ctx.fillStyle = "#fff";
          ctx.fillRect(x - HANDLE_PX + 1, y - HANDLE_PX + 1, (HANDLE_PX - 1) * 2, (HANDLE_PX - 1) * 2);
          ctx.strokeRect(x - HANDLE_PX + 1, y - HANDLE_PX + 1, (HANDLE_PX - 1) * 2, (HANDLE_PX - 1) * 2);
        }
      }
      // Size label under the box.
      const box = boxOfObjects(frame.objs);
      const label = `${(box[2] - box[0]).toFixed(1)} × ${(box[3] - box[1]).toFixed(1)} mm`;
      const [lx, ly] = this.toScreen((box[0] + box[2]) / 2, box[3]);
      ctx.font = '600 11px "Geist", system-ui, sans-serif';
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = th.accent;
      ctx.beginPath();
      ctx.roundRect(lx - tw / 2 - 6, ly + 12, tw + 12, 20, 6);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.fillText(label, lx, ly + 26);
    }
    ctx.restore();
  }

  strokeObject(o) {
    const t = o.transform;
    const r = (t.rot * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
    this.ctx.stroke(this.pathOf(o.rings, [c * t.sx, s * t.sx, -s * t.sy, c * t.sy, t.x, t.y]));
  }

  drawPictureHandles() {
    const { ctx } = this;
    const th = this.theme();
    const box = this.refBox();
    if (!box) return;
    const a = this.toScreen(box[0], box[1]), b = this.toScreen(box[2], box[3]);
    ctx.save();
    ctx.strokeStyle = th.accent;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
    const mid = (u, v) => (u + v) / 2;
    const pts = this.props.crop
      ? [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]], [mid(a[0], b[0]), a[1]], [mid(a[0], b[0]), b[1]], [a[0], mid(a[1], b[1])], [b[0], mid(a[1], b[1])]]
      : [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]];
    for (const [x, y] of pts) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(x - HANDLE_PX + 1, y - HANDLE_PX + 1, (HANDLE_PX - 1) * 2, (HANDLE_PX - 1) * 2);
      ctx.strokeRect(x - HANDLE_PX + 1, y - HANDLE_PX + 1, (HANDLE_PX - 1) * 2, (HANDLE_PX - 1) * 2);
    }
    ctx.restore();
  }

  drawGuides() {
    if (!this.guides.length) return;
    const { ctx } = this;
    const { w, h } = this.size;
    ctx.save();
    ctx.strokeStyle = "#e23b8a";
    ctx.lineWidth = 1;
    for (const g of this.guides) {
      ctx.beginPath();
      if (g.axis === "x") { const [x] = this.toScreen(g.at, 0); ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, h); }
      else { const [, y] = this.toScreen(0, g.at); ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(w, Math.round(y) + 0.5); }
      ctx.stroke();
    }
    ctx.restore();
  }

  drawMarquee() {
    if (!this.marquee) return;
    const { ctx } = this;
    const th = this.theme();
    const [x0, y0] = this.toScreen(this.marquee[0], this.marquee[1]), [x1, y1] = this.toScreen(this.marquee[2], this.marquee[3]);
    ctx.save();
    ctx.fillStyle = "rgba(31,110,76,.10)";
    ctx.strokeStyle = th.accent;
    ctx.setLineDash(x1 >= x0 ? [] : [4, 3]);
    ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    ctx.strokeRect(Math.min(x0, x1) + 0.5, Math.min(y0, y1) + 0.5, Math.abs(x1 - x0), Math.abs(y1 - y0));
    ctx.restore();
  }

  drawCreate() {
    const d = this.drag;
    if (!d || d.kind !== "create") return;
    const { ctx } = this;
    const th = this.theme();
    let w = d.x1 - d.x0, h = d.y1 - d.y0;
    if (d.shift) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
    const [x0, y0] = this.toScreen(d.x0, d.y0), [x1, y1] = this.toScreen(d.x0 + w, d.y0 + h);
    ctx.save();
    ctx.strokeStyle = th.accent;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    if (d.tool === "ellipse") { ctx.beginPath(); ctx.ellipse((x0 + x1) / 2, (y0 + y1) / 2, Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, 0, 0, Math.PI * 2); ctx.stroke(); }
    else ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    ctx.restore();
  }
}

export { localBox, worldRings };
