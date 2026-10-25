/**
 * The printed technical sheet of a tech pack: A4 landscape, one page or two, drawn from `readPack(row)` (or the editor's pack in the
 * same shape, whose pictures may carry a `preview` address while the file is not uploaded yet).
 *
 *   <TechSheet pack={readPack(row)} customer={{ id, name } | null} mode="screen" | "print" />
 *
 * It is a pure picture of what it is given: no data loading, no state, no effects, so the same component is drawn in the document
 * viewer (screen), serialised into the print window (print) and mounted off screen to become the PDF (print). The only difference
 * between the modes is the dashed "No picture yet" box and the grey gap between pages, which are for the screen.
 *
 * Where each thing goes, and what moves to page 2, is worked out by sheetPlan.js; the sizes arrive here as millimetres and are handed to
 * sheet.css as inline styles. Pictures are fitted by `object-fit` (the PDF maker cannot do that: sheetPdf.js gives each one its own box
 * first). The measurement drawing is the one place a picture is NOT fitted by CSS alone: a wrapper the size of the rendered picture holds
 * the red lines, so a line drawn at 25% to 75% of the picture is at 25% to 75% of it on any garment and any paper.
 */
import { bullets, valueFor } from "../../lib/techpack";
import { FRAME, materialKind, pic, planSheet, swatchOf, viewCaption, wordmarkSize } from "./sheetPlan";
import "./sheet.css";

const RED = "#c8261e";
const round3 = (n) => Math.round(n * 1000) / 1000;
const mm = (n) => `${n}mm`;

/** A broken picture must not break the layout: it disappears and leaves its caption. (A server-rendered copy has no handlers; the print
 *  window adds its own after it loads, see printSheet.js.) */
const hide = (e) => { e.currentTarget.style.visibility = "hidden"; };

function Img({ src, alt = "", className = "ts-fit", style }) {
  if (!src) return null;
  return <img className={className} src={src} alt={alt} style={style} crossOrigin="anonymous" decoding="sync" loading="eager" draggable="false" onError={hide} />;
}

/** "Cavalls Studio" is a big word over a small one, like the label on the garment; any other name is one line. */
function markParts(brand) {
  const words = brand.split(/\s+/).filter(Boolean);
  return words.length === 2 ? { big: words[0], small: words[1] } : { big: brand, small: "" };
}

function Facts({ list, className = "ts-facts" }) {
  return (
    <div className={className}>
      {list.map((f, i) => (
        <div className="ts-fact" key={`${i}-${f.label}`} style={{ maxHeight: mm(f.max * 2.85) }}><span className="ts-k">{f.label}:</span> {f.value}</div>
      ))}
    </div>
  );
}

/* ── One measurement drawing ────────────────────────────────────── */

/** Which way to move a letter off its line: sideways of the line, towards the top right, about 2.8 mm. */
function badgeOffset(l) {
  const dx = l.x2 - l.x1;
  const dy = l.y2 - l.y1;
  const len = Math.hypot(dx, dy) || 1;
  const a = { x: dy / len, y: -dx / len };
  const b = { x: -a.x, y: -a.y };
  const p = a.x - a.y >= b.x - b.y ? a : b;                  // the one that points up and to the right
  return { x: p.x * 2.8, y: p.y * 2.8 };
}

/**
 * The picture, with its measurement lines on it. The box is `w` x `h` mm, with `top` mm kept clear above the picture for a letter that
 * stands off a line near the top edge; the picture is as large as fits without being stretched, and the wrapper around it is exactly
 * the picture's rectangle, so every position below is a fraction of the picture.
 */
function Drawing({ view, points, w, h, top }) {
  return (
    <div className="ts-draw" style={{ maxWidth: mm(w), height: mm(h) }}>
      <span className="ts-dwrap">
        <img
          className="ts-dimg" src={pic(view)} alt={viewCaption(view)} style={{ maxWidth: mm(w - 5.2), maxHeight: mm(h - top) }}
          crossOrigin="anonymous" decoding="sync" loading="eager" draggable="false" onError={hide}
        />
        <svg className="ts-dsvg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          {points.map((p, i) => (
            <line
              key={`${i}-${p.id}`} data-f={`${p.line.x1},${p.line.y1},${p.line.x2},${p.line.y2}`}
              x1={round3(p.line.x1 * 100)} y1={round3(p.line.y1 * 100)} x2={round3(p.line.x2 * 100)} y2={round3(p.line.y2 * 100)}
              stroke={RED} strokeWidth="1.35" strokeLinecap="round" vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        {points.map((p, i) => {
          const l = p.line;
          const o = badgeOffset(l);
          return (
            <span key={`${i}-${p.id}`}>
              <i className="ts-dot" style={{ left: `${round3(l.x1 * 100)}%`, top: `${round3(l.y1 * 100)}%` }} />
              <i className="ts-dot" style={{ left: `${round3(l.x2 * 100)}%`, top: `${round3(l.y2 * 100)}%` }} />
              <b
                className="ts-badge"
                style={{ left: `${round3(((l.x1 + l.x2) / 2) * 100)}%`, top: `${round3(((l.y1 + l.y2) / 2) * 100)}%`, marginLeft: mm(round3(o.x - 1.5)), marginTop: mm(round3(o.y - 1.5)) }}
              >{p.letter}</b>
            </span>
          );
        })}
      </span>
    </div>
  );
}

/* ── The size chart ─────────────────────────────────────────────── */

function Chart({ rows, sizes, refSize, letters, cols }) {
  return (
    <table className="ts-chart">
      <colgroup>
        <col style={cols ? { width: mm(cols.label) } : { width: mm(27) }} />
        {sizes.map((s, i) => <col key={`${i}-${s}`} style={cols ? { width: mm(cols.size) } : undefined} />)}
      </colgroup>
      <thead>
        <tr>
          <th scope="col" className="ts-rowhead"><span className="ts-sr">Measurement</span></th>
          {sizes.map((s, i) => <th scope="col" key={`${i}-${s}`} className={s === refSize ? "ts-ref" : undefined}>{s}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((p, ri) => (
          <tr key={`${ri}-${p.id}`}>
            <th scope="row" className="ts-rowhead">{letters ? <span className="ts-k">{p.letter} </span> : null}{p.label}</th>
            {sizes.map((s, i) => <td key={`${i}-${s}`} className={s === refSize ? "ts-ref" : undefined}>{valueFor(p, s)}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ── A material: a swatch, then what it is made of ──────────────── */

/** A first-generation pack's fabric rows were named by the person ("Rib", "Binding"), and `readPack` only guesses their kind: the name
 *  is the heading there, not the guess. */
function Material({ m, sw, boxes, legacy }) {
  const name = m.name.trim();
  const heading = legacy && name ? name : materialKind(m);
  return (
    <div className="ts-mat" style={{ minHeight: sw ? mm(sw) : undefined }}>
      {boxes ? (
        <div className="ts-swatch" style={{ width: mm(sw), height: mm(sw) }}>
          <Img src={swatchOf(m)} alt="" />
        </div>
      ) : null}
      <div className="ts-mtext">
        <div className="ts-mkind">{heading}</div>
        {!legacy && name ? <div>{name}</div> : null}
        {bullets(m.spec).map((l, i) => <div key={i}>{l}</div>)}
        {m.colour.trim() ? <div>Colour: {m.colour.trim()}</div> : null}
      </div>
    </div>
  );
}

function Notes({ lines, label = "Notes" }) {
  return (
    <>
      <h3 className="ts-label">{label}</h3>
      <ul>{lines.map((l, i) => <li key={i}><span aria-hidden="true">&bull;</span><span>{l}</span></li>)}</ul>
    </>
  );
}

/* ── Page 1 ─────────────────────────────────────────────────────── */

function PageOne({ plan, pages }) {
  const { p1, brand } = plan;
  const { head, lower, details, measure, materials, finishing, foot } = p1;
  const showViews = p1.views.length > 0 || p1.showPlaceholder;
  const hasLower = lower.h > 0;

  // the rows of the frame, from the top: only the parts there are. Nothing to show in the middle leaves it white, above the foot.
  const rows = [mm(head.h)];
  if (showViews) rows.push("minmax(0, 1fr)");
  if (hasLower) rows.push(mm(lower.h));
  if (!showViews) rows.push("minmax(0, 1fr)");
  rows.push(mm(foot.h));

  const wordSize = wordmarkSize(brand, head.brandW - 4, 8.5, 3.2);
  const mark = markParts(brand);
  const markSize = wordmarkSize(mark.big, foot.markW - 8, mark.small ? 6.2 : 5.2, 2.4);

  const hasMeasure = measure.rows.length > 0;
  const hasChart = measure.sizes.length > 0 && hasMeasure;
  const lrows = details.items.length && hasMeasure ? `${mm(details.h)} minmax(0, 1fr)` : "minmax(0, 1fr)";
  const rrows = materials.items.length && finishing.lines.length ? `${mm(materials.h)} minmax(0, 1fr)` : "minmax(0, 1fr)";
  const lowerCols = lower.hasLeft && lower.hasRight ? "71fr 29fr" : "minmax(0, 1fr)";
  const unit = measure.unit;
  const oneDrawing = measure.drawings.length === 1;

  return (
    <section className="ts-page ts-p1" aria-label={`Technical sheet, page 1 of ${pages}`}>
      <div className="ts-frame" style={{ gridTemplateRows: rows.join(" ") }}>
        <header className="ts-head" style={{ gridTemplateColumns: head.shares.map((s) => `${s}fr`).join(" ") }}>
          <div className="ts-brandcell">
            {plan.logo
              ? <Img src={plan.logo} className="ts-logo" alt={brand} />
              : <div className="ts-wordmark" style={{ fontSize: mm(wordSize) }}>{brand}</div>}
            <div className="ts-title">Technical sheet</div>
          </div>
          <Facts list={head.mid} />
          {head.endCols > 1
            ? <div className="ts-facts ts-facts--cols">{head.endSplit.map((col, i) => <Facts key={i} list={col} className="ts-fcol" />)}</div>
            : <Facts list={head.end} />}
        </header>

        {showViews ? (
          <div className="ts-views">
            {p1.views.length ? p1.views.map((v, i) => (
              <figure className="ts-view" key={`${i}-${v.id}`}>
                <div className="ts-vpic"><Img src={pic(v)} alt={viewCaption(v)} /></div>
                <figcaption className="ts-vcap">{viewCaption(v)}</figcaption>
              </figure>
            )) : <div className="ts-noview">No picture yet</div>}
          </div>
        ) : null}

        {hasLower ? (
          <div className="ts-lower" style={{ gridTemplateColumns: lowerCols }}>
            {lower.hasLeft ? (
              <div className={`ts-lcol${lower.hasRight ? " ts-sep-r" : ""}`} style={{ gridTemplateRows: lrows }}>
                {details.items.length ? (
                  <div className={`ts-block ts-details${hasMeasure ? " ts-sep-b" : ""}`}>
                    <h3 className="ts-label">Details</h3>
                    <div className="ts-tiles" style={{ "--tile": mm(details.tile) }}>
                      {details.items.map((d, i) => (
                        <figure className="ts-tile" key={`${i}-${d.id}`}>
                          <div className="ts-tpic"><Img src={pic(d)} alt={d.caption} /></div>
                          <figcaption className="ts-tcap">{d.caption}</figcaption>
                        </figure>
                      ))}
                    </div>
                  </div>
                ) : null}
                {hasMeasure ? (
                  <div className="ts-measure" style={{ gridTemplateColumns: hasChart ? `${mm(measure.blockW)} minmax(0, 1fr)` : "minmax(0, 1fr)" }}>
                    <div className={`ts-block ts-mblock${hasChart ? " ts-sep-r" : ""}`}>
                      <h3 className="ts-label">Measurements ({unit}) - size {measure.refSize} (reference)</h3>
                      <div className="ts-mrow">
                        {measure.drawings.map((d, i) => (
                          <Drawing key={`${i}-${d.view.id}`} view={d.view} points={d.points} w={oneDrawing ? measure.drawW : 39} h={measure.drawH} top={measure.drawTop} />
                        ))}
                        <ul className="ts-mlist">
                          {measure.list.map((l, i) => <li key={`${i}-${l.letter}`}><span className="ts-k">{l.letter}.</span> {l.label}: {l.value || "-"}</li>)}
                        </ul>
                      </div>
                    </div>
                    {hasChart ? (
                      <div className="ts-block ts-cblock">
                        <h3 className="ts-label">Size chart ({unit})</h3>
                        <Chart rows={measure.rows} sizes={measure.sizes} refSize={measure.refSize} letters={measure.hasLetters} cols={measure.cols} />
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {lower.hasRight ? (
              <div className={`ts-rcol${lower.soloRight ? " ts-rcol--solo" : ""}`} style={lower.soloRight ? undefined : { gridTemplateRows: rrows }}>
                {materials.items.length ? (
                  <div className={`ts-block ts-matblock${finishing.lines.length ? (lower.soloRight ? " ts-sep-r" : " ts-sep-b") : ""}`}>
                    <h3 className="ts-label">Materials</h3>
                    {materials.items.map((m, i) => <Material key={`${i}-${m.id}`} m={m} sw={materials.sw} boxes={materials.boxes} legacy={materials.legacy} />)}
                  </div>
                ) : null}
                {finishing.lines.length ? (
                  <div className="ts-block ts-fin">
                    <h3 className="ts-label">Finishing and construction</h3>
                    <ul>{finishing.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {!showViews ? <div /> : null}

        {/* with white space above it (no pictures on paper) the strip draws its own top rule: the one that is usually its neighbour's */}
        <footer className={`ts-foot${showViews ? "" : " ts-sep-t"}`} style={{ gridTemplateColumns: `minmax(0, 1fr) ${mm(foot.markW)}` }}>
          <div className="ts-block ts-notes">{foot.notes.length ? <Notes lines={foot.notes} /> : null}</div>
          <div className="ts-mark ts-sep-l" aria-hidden="true">
            {plan.logo
              ? <Img src={plan.logo} className="ts-logo" alt="" />
              : (
                <>
                  <div className="ts-mark-big" style={{ fontSize: mm(markSize) }}>{mark.big}</div>
                  {mark.small ? <div className="ts-mark-small">{mark.small}</div> : null}
                </>
              )}
          </div>
        </footer>
      </div>
    </section>
  );
}

/* ── Page 2 ─────────────────────────────────────────────────────── */

function Tile({ kind, item, th }) {
  if (kind === "print") {
    const lines = [
      item.colour && `Colour: ${item.colour}`,
      item.technique && `Technique: ${item.technique}`,
      item.width && `Approx. width: ${item.width}`,
    ].filter(Boolean);
    return (
      <figure className="ts-t2">
        <div className="ts-t2pic" style={{ height: mm(th) }}><Img src={pic(item)} alt={item.placement} /></div>
        <figcaption className="ts-t2cap ts-t2cap--print">
          {item.placement ? <div className="ts-k">{item.placement}</div> : null}
          {lines.map((l, i) => <div key={i}>{l}</div>)}
        </figcaption>
      </figure>
    );
  }
  return (
    <figure className="ts-t2">
      <div className="ts-t2pic" style={{ height: mm(th) }}><Img src={pic(item)} alt={item.caption || ""} /></div>
      <figcaption className="ts-t2cap">{item.caption || viewCaption(item)}</figcaption>
    </figure>
  );
}

function PageTwo({ plan, pack, pages }) {
  const { p2, brand } = plan;
  const rows = [mm(p2.head)];
  if (p2.bandA) rows.push(mm(p2.bandA));
  if (p2.bandB) rows.push(mm(p2.bandB));
  rows.push("minmax(0, 1fr)");
  const wordSize = wordmarkSize(brand, 70, 5, 2.4);
  const sep = (i, n) => (i < n - 1 ? " ts-sep-r" : "");
  const hasLetters = plan.p1.measure.hasLetters;
  const spare = FRAME.h - (p2.head + p2.bandA + p2.bandB) > 1;          // white space under the last band: it closes with a rule of its own

  return (
    <section className="ts-page ts-p2" aria-label={`Technical sheet, page 2 of ${pages}`}>
      <div className="ts-frame" style={{ gridTemplateRows: rows.join(" ") }}>
        <header className="ts-head2">
          {plan.logo ? <Img src={plan.logo} className="ts-logo" alt={brand} /> : <div className="ts-wordmark" style={{ fontSize: mm(wordSize) }}>{brand}</div>}
          <div className="ts-h2name">
            <span><span className="ts-k">Name:</span> {pack.name || "-"}</span>
            <span><span className="ts-k">Reference:</span> {pack.styleNo || "-"}</span>
          </div>
          <div className="ts-h2page">Page 2 of {pages}</div>
        </header>

        {p2.bandA ? (
          <div className="ts-bandA" style={{ gridTemplateColumns: p2.picBlocks.map((b) => `${b.w}fr`).join(" ") }}>
            {p2.picBlocks.map((b, bi) => (
              <div className={`ts-block${sep(bi, p2.picBlocks.length)}`} key={b.label}>
                <h3 className="ts-label">{b.label}</h3>
                <div className="ts-grid2" style={{ gridTemplateColumns: `repeat(${b.cols}, ${mm(b.tw)})` }}>
                  {b.items.map((it, i) => <Tile key={`${i}-${it.id}`} kind={b.kind} item={it} th={b.th} />)}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {p2.bandB ? (
          <div className={`ts-bandB${spare ? " ts-sep-b" : ""}`} style={{ gridTemplateColumns: p2.textBlocks.map((b) => `${b.w}fr`).join(" ") }}>
            {p2.textBlocks.map((b, bi) => (
              <div className={`ts-block${sep(bi, p2.textBlocks.length)}`} key={b.label}>
                {b.kind === "materials" ? (
                  <>
                    <h3 className="ts-label">{b.label}</h3>
                    <div className="ts-matgrid" style={{ gridTemplateColumns: `repeat(${b.cols}, minmax(0, 1fr))` }}>
                      {b.items.map((m, i) => <Material key={`${i}-${m.id}`} m={m} sw={b.sw} boxes={b.boxes} legacy={p2.legacy} />)}
                    </div>
                  </>
                ) : null}
                {b.kind === "chart" ? (
                  <>
                    <h3 className="ts-label">{b.label}</h3>
                    <Chart rows={b.rows} sizes={b.sizes} refSize={pack.refSize} letters={hasLetters} cols={b.colsMm} />
                  </>
                ) : null}
                {b.kind === "finishing" ? (
                  <>
                    <h3 className="ts-label">{b.label}</h3>
                    <ul className="ts-fin">{b.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
                  </>
                ) : null}
                {b.kind === "notes" ? <div className="ts-notes"><Notes lines={b.lines} label={b.label} /></div> : null}
              </div>
            ))}
          </div>
        ) : null}
        <div />
      </div>
    </section>
  );
}

/* ── What the paper cannot show ─────────────────────────────────── */

/**
 * The parts of a drawn sheet whose text runs past its box, so the paper would cut it off: plain names, each once, in the order a person
 * reads the sheet. The plan decides what fits by an estimate of how wide the words are; this asks the browser what really happened, so
 * it is for the viewer to say before anything is printed or sent. Call it once the font has loaded (the words are wider before that).
 * A line that was clipped on purpose (a description keeps two lines, a caption two) is reported too: it is still text that is lost.
 */
export function findCutOff(root) {
  if (!root) return [];
  const found = new Set();
  const tall = (el) => el.scrollHeight - (parseFloat(getComputedStyle(el).paddingBottom) || 0) > el.clientHeight + 1.5;
  const wide = (el) => el.scrollWidth - (parseFloat(getComputedStyle(el).paddingRight) || 0) > el.clientWidth + 1.5;
  for (const el of root.querySelectorAll(".ts-fact")) {
    if (tall(el)) {
      const label = (el.querySelector(".ts-k")?.textContent || "").replace(/:$/, "").toLowerCase();
      found.add(label === "name" ? "the name" : label === "description" ? "the description" : "a line in the heading");
    }
  }
  const blocks = [[".ts-details", "the details"], [".ts-mblock", "the measurements"], [".ts-cblock", "the size chart"], [".ts-matblock", "the materials"], [".ts-fin", "finishing and construction"], [".ts-notes", "the notes"]];
  for (const [sel, name] of blocks) for (const el of root.querySelectorAll(sel)) if (tall(el) || wide(el)) found.add(name);
  for (const el of root.querySelectorAll(".ts-tcap, .ts-t2cap")) if (tall(el)) found.add("a picture caption");
  for (const el of root.querySelectorAll(".ts-mlist li, .ts-chart .ts-rowhead")) if (wide(el)) found.add("a measurement name");
  for (const el of root.querySelectorAll(".ts-bandA > .ts-block, .ts-bandB > .ts-block")) if (tall(el) || wide(el)) found.add("the second page");
  return [...found];
}

/* ── The sheet ──────────────────────────────────────────────────── */

export default function TechSheet({ pack, customer = null, mode = "screen" }) {
  const plan = planSheet(pack, customer, { placeholder: mode !== "print" });
  return (
    <div className={`ts-sheet ts-sheet--${mode === "print" ? "print" : "screen"}`} data-pages={plan.pages}>
      <PageOne plan={plan} pages={plan.pages} />
      {plan.p2 ? <PageTwo plan={plan} pack={pack} pages={plan.pages} /> : null}
    </div>
  );
}
