import { useState } from "react";

// Distilled from 12 reels by @anniedesgin (Aug 2026), a Chinese cut-and-sew
// factory running the same play Kazi wants to run: teach construction, never
// pitch. Engagement figures are hers, for topic selection.

const FORMAT = [
  "One narrow topic per reel, 30-45 seconds. Never two.",
  "Numbered from the first line: 3 hood types, 6 tee details, 3 stitch types.",
  "Open on the mistake, not the answer. \"Prints peeling off after a few wears?\"",
  "Same sign-off every time, so it becomes a signature.",
  "Post every 2-3 days. She held that cadence across the whole run."
];

const POSITIONING = [
  "Teach factory knowledge the buyer does not have. No pricing, no MOQ, no pitch.",
  "Target brand owners, not consumers: #clothingbrandowner, #clothingbrandtips, #clothingbrandstartup.",
  "Cite known brands as proof - Patagonia for hemp, Alo and Lululemon for flatlock seams.",
  "Anti-selling earns trust. Her best trust post lists what a real factory will refuse to promise.",
  "Route contact through the bio, not a link tree."
];

const TOPICS = [
  { topic: "Hood construction: 1, 2 and 3-panel", likes: 810, kind: "Construction" },
  { topic: "Six details that separate a premium tee", likes: 732, kind: "Construction" },
  { topic: "Print methods and how long each lasts", likes: 348, kind: "Process" },
  { topic: "Three natural fibres that beat cotton", likes: 314, kind: "Material" },
  { topic: "Laser perforation on activewear", likes: 246, kind: "Process" },
  { topic: "Zipper types for hoodies and outerwear", likes: 218, kind: "Construction" },
  { topic: "Applique embroidery styles", likes: 209, kind: "Construction" },
  { topic: "Stitching: flatlock, French seam, contrast", likes: 189, kind: "Construction" },
  { topic: "What actually counts as wool", likes: 144, kind: "Material" },
  { topic: "When DTG beats screen printing", likes: 71, kind: "Process" },
  { topic: "Polyester is not automatically cheap", likes: 60, kind: "Material" }
];

const READ_ACROSS = [
  "Construction explainers beat material-science ones roughly three to one. Lead with how it is built.",
  "Every topic above is one Kazi can shoot on the Kathmandu floor with the real machines. She is drawing hers.",
  "The blanks range maps straight onto her winners: seven bodies, each with a gsm, a fabric and a fit."
];

export default function ReelPlaybook() {
  const [open, setOpen] = useState(false);

  return (
    <section className="panel">
      <div className="status-row">
        <h3>Reel Playbook</h3>
        <button className="ghost-button" type="button" onClick={() => setOpen((value) => !value)}>
          {open ? "Hide" : "Show"}
        </button>
      </div>

      <p>
        What works for a factory account on Instagram, taken from a competitor
        running the same play. Reference before planning a reel.
      </p>

      {open ? (
        <div className="fade-in">
          <h4>Format</h4>
          <ul>
            {FORMAT.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>

          <h4>Positioning</h4>
          <ul>
            {POSITIONING.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>

          <h4>Topics that landed</h4>
          <div className="content-list">
            {TOPICS.map((item) => (
              <div className="content-card" key={item.topic}>
                <p>{item.topic}</p>
                <div className="status-row">
                  <span className="badge-muted">{item.kind}</span>
                  <small>{item.likes} likes</small>
                </div>
              </div>
            ))}
          </div>

          <h4>Read across to Kazi</h4>
          <ul>
            {READ_ACROSS.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
