/**
 * A staff member's name (or photo) that opens their profile.
 *
 *   <PersonLink personId={task.assignee_id} name={task.assignee} />            their name, as a link
 *   <PersonLink personId={p.id} name={p.name}><Avatar .../> {first}</PersonLink>   anything else that stands for them
 *
 * Use it wherever a screen names a person who works here. It looks like the text around it (it takes the font, size, weight and
 * colour of its parent and only underlines when pointed at), so putting one in changes how a page reads, not how it looks.
 *
 * Give it `personId` when you have it. With only a `name` it asks the staff directory who that is (AvatarContext.idFor), and when
 * the name is nobody's, or two people share it, it is plain text and not a link at all: a customer who shares a first name with a
 * colleague never opens the colleague's profile.
 *
 * It is a button, so it must not sit inside another button or inside something with role="button" (a screen reader cannot use a
 * button inside a button). In a row that is itself a button, the row's stretched link goes underneath and this sits above it (it
 * carries `position: relative; z-index: 2`, the same as `.dt-act` / `.kb-act`). Where a whole card is `role="button"`, take the
 * line with the name out of it (TaskCard shows how). Pressing it does not press anything under it.
 *
 * Without a visible name (a photo on its own) pass `label`, which becomes its spoken name. A photo that sits beside a name which is
 * already a link needs no second stop for a keyboard or a screen reader: pass `decor` and it can still be pressed with a mouse or
 * a finger, but is skipped by Tab and not read out.
 */
import { cn } from "../ui";
import { possessive } from "../../lib/personName";
import { usePerson } from "./PersonProvider";

export default function PersonLink({ personId, name, children, className, label, title, decor, onClick, ...rest }) {
  const { open, resolve, warm } = usePerson();
  const id = personId ? String(personId) : name ? resolve(name) : null;
  const shown = children ?? name;

  // Not a link (nobody is signed in, or the name is nobody's): the text as it was. A class the caller gave for the link's own sake
  // (`kpl…`) goes with the link; one for layout stays on a wrapper.
  const plain = String(className || "").split(/\s+/).filter((c) => c && !c.startsWith("kpl")).join(" ");
  if (!open || !id) return plain ? <span className={plain}>{shown}</span> : <>{shown}</>;

  return (
    <button
      type="button"
      className={cn("kpl", decor && "kpl--decor", className)}
      aria-haspopup={decor ? undefined : "dialog"}
      aria-label={label}
      aria-hidden={decor ? "true" : undefined}
      tabIndex={decor ? -1 : undefined}
      title={decor ? undefined : title ?? (name ? `Open ${possessive(name)} profile` : "Open their profile")}
      onPointerEnter={warm}
      onFocus={warm}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") e.stopPropagation(); }}   // a parent that opens on Enter must not also fire
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
        open({ personId: id, name });
      }}
      {...rest}
    >
      {shown}
    </button>
  );
}
