/**
 * "Make it fill the hoop": a short note and one button, shown in the Picture and Design panels when a picture is on the table and what
 * is stitched uses little of the hoop (a bigger hoop was picked after the picture was opened), or more than it. The hoop alone only
 * draws a box: the design keeps its size until this is pressed. Pressing it makes the picture as big as the hoop allows and reads it
 * again at that size, which is where the extra detail of a bigger hoop comes from (a thread is about 0.4 mm wide, so a bigger design
 * has more threads across it for the same picture). Nothing changes until it is pressed.
 */
import { followsPicture } from "../../lib/digitizer/model";

const SMALL = 0.6; // what is stitched fills less than this much of the hoop's tighter side

export default function HoopFit({ api }) {
  const { design, summary, hasImage, converting } = api;
  if (!hasImage || !design.reference || !summary || !(summary.widthMm > 0)) return null;
  const { w, h } = design.hoop;
  const use = Math.max(summary.widthMm / w, summary.heightMm / h);
  const over = use > 1.001;
  if (!over && use >= SMALL) return null;
  // Lettering or shapes of their own may be what sticks out of the hoop: a bigger or smaller picture is no cure for that, so the button is only for a design that is all picture.
  if (over && !design.objects.every(followsPicture)) return null;
  const size = `${summary.widthMm.toFixed(0)} × ${summary.heightMm.toFixed(0)} mm`;
  return (
    <div className="dz-fit">
      <p>
        {over
          ? `The design is ${size}, bigger than this ${w} × ${h} mm hoop.`
          : `The design is ${size}: it fills only ${Math.round(use * 100)}% of this ${w} × ${h} mm hoop. A bigger design keeps more detail.`}
      </p>
      <button type="button" className="kb-btn kb-btn--primary" disabled={converting} onClick={api.fitToHoop}>
        {converting ? "Working…" : over ? "Make it fit the hoop" : "Make it fill the hoop"}
      </button>
      <p className="dz-fit-sub">The picture is read again at the new size, so changes you made to its shapes are replaced (Undo brings them back).</p>
    </div>
  );
}
