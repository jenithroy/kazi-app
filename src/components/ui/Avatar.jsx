import { initials } from "../../lib/people";

/* ── Avatar ───────────────────────────────────────────── */
/** A person's initials on a tint of their hue (lib/people.js hueFromName gives a stable one). */
export function Avatar({ name, hue, size = 28, ring }) {
  const h = hue ?? 145;
  return (
    <span
      className="kavatar"
      style={{
        width: size, height: size,
        background: `oklch(0.78 0.08 ${h})`,
        color: `oklch(0.28 0.08 ${h})`,
        fontSize: size * 0.4,
        boxShadow: ring ? `0 0 0 2px ${ring}` : undefined,
      }}
    >
      {initials(name)}
    </span>
  );
}
