import { cn } from "../ui";

/**
 * The mark of an order that came from the website: a globe, where a person's picture would be.
 *
 *   variant="avatar"   a round mark the size of a person's picture (the list's "who" cell, for an order nobody is assigned to yet)
 *   variant="badge"    a small one on the corner of a person's picture (an order from the website that somebody has been given)
 *   variant="chip"     a small one beside the customer's name, shown where the "who" cell is not (a narrow list, a phone)
 *
 * It says what it is to a screen reader and in a tooltip. In a row the row's own button is laid over everything, so the avatar and the
 * chip sit above it (to take the pointer's hover for the tooltip) and pass a press on to `onClick`, which opens the order as the row does.
 * It has its own inline picture: the shared Icons are not edited for it.
 */
function Globe({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.6 2.4 4 5.5 4 9s-1.4 6.6-4 9c-2.6-2.4-4-5.5-4-9s1.4-6.6 4-9z" />
    </svg>
  );
}

/** The globe on its own, for a label or a tag. */
export function WebGlobe({ size = 14 }) {
  return <Globe size={size} />;
}

export default function WebMark({ variant = "avatar", size, label = "From the website", onClick, className }) {
  const px = size || (variant === "avatar" ? 26 : variant === "badge" ? 15 : 17);
  return (
    <span
      className={cn("pr-web", `pr-web--${variant}`, onClick && "is-press", className)}
      role="img"
      aria-label={label}
      title={label}
      style={{ width: px, height: px }}
      onClick={onClick}
    >
      <Globe size={Math.round(px * (variant === "badge" ? 0.74 : 0.62))} />
    </span>
  );
}
