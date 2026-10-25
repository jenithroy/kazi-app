/**
 * A tech pack's name (or picture) that opens its sheet.
 *
 *   <TechPackLink patternId={order.patternId}>{order.styleName}</TechPackLink>
 *
 * It reads like the text around it (it takes the font, size, weight and colour of its parent and only underlines when pointed at),
 * the way PersonLink does for a person. With no `patternId`, or for a position that may not read tech packs, it is the text as it
 * was and not a link. It is a button, so it must not sit inside another button; in a row that is itself a button, the row's stretched
 * link goes underneath and this sits above it (it carries `position: relative; z-index: 2`). Pressing it does not press anything
 * under it.
 */
import { cn } from "../ui";
import { useTechPack } from "./TechPackProvider";

export default function TechPackLink({ patternId, children, className, label, title, onClick, ...rest }) {
  const { openSheet, warm } = useTechPack();
  if (!patternId || !openSheet) return <>{children}</>;
  return (
    <button
      type="button"
      className={cn("tpl", className)}
      aria-haspopup="dialog"
      aria-label={label}
      title={title ?? "Open the tech pack"}
      onPointerEnter={warm}
      onFocus={warm}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") e.stopPropagation(); }}   // a parent that opens on Enter must not also fire
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
        openSheet({ id: patternId });
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
