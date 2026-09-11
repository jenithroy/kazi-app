/* ── Avatar ───────────────────────────────────────────── */
export function Avatar({ name, hue, size = 28, ring }) {
  const initials = name
    ? name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";
  const h = hue ?? 145;
  const bg = `oklch(0.78 0.08 ${h})`;
  const fg = `oklch(0.28 0.08 ${h})`;
  return (
    <span
      className="kavatar"
      style={{
        width: size, height: size,
        background: bg, color: fg,
        fontSize: size * 0.4,
        boxShadow: ring ? `0 0 0 2px ${ring}` : undefined,
      }}
    >
      {initials}
    </span>
  );
}
