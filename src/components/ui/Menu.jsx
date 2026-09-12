import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { placeFloating } from "./floating";
import { cn } from "./utils";

/* ── Menu ─────────────────────────────────────────────── */

const MenuContext = createContext(null);

/**
 * A popover list of actions, opened from a button.
 *
 *   <Menu label="Invoice actions" trigger={(props) => (
 *     <IconBtn {...props} icon={<Icons.More size={15} />} label="More actions" />
 *   )}>
 *     <MenuItem icon={<Icons.Edit size={14} />} onSelect={edit}>Edit</MenuItem>
 *     <MenuDivider />
 *     <MenuItem danger onSelect={cancel}>Cancel invoice</MenuItem>
 *   </Menu>
 *
 *   trigger  a function given the props the opening button needs (onClick,
 *            aria-haspopup, aria-expanded, onKeyDown); spread them onto it
 *   align    "end" lines the menu up with the trigger's right edge, "start" its left
 *   label    names the menu for screen readers
 *
 * The menu renders at the end of <body>, so a table scroller or a card with
 * overflow hidden cannot clip it. It flips above the trigger when there is no
 * room below. Arrow keys, Home and End move through the items; Escape closes it
 * and puts focus back on the trigger.
 */
export function Menu({ trigger, children, align = "end", label, className }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const anchorRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = `m${useId().replace(/:/g, "")}`;

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    setPos(null);
    if (returnFocus) anchorRef.current?.querySelector("button, [tabindex]")?.focus();
  }, []);

  const place = useCallback(() => {
    if (anchorRef.current && menuRef.current) {
      setPos(placeFloating(anchorRef.current, menuRef.current, { align }));
    }
  }, [align]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e) => {
      if (menuRef.current?.contains(e.target) || anchorRef.current?.contains(e.target)) return;
      close(false);
    };
    const onReflow = () => place();
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    menuRef.current?.querySelector('[role="menuitem"]:not(:disabled)')?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [open, close, place]);

  const onMenuKeyDown = (e) => {
    const items = [...menuRef.current.querySelectorAll('[role="menuitem"]:not(:disabled)')];
    const i = items.indexOf(document.activeElement);
    const focus = (n) => items[(n + items.length) % items.length]?.focus();
    if (e.key === "ArrowDown") { e.preventDefault(); focus(i + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); focus(i - 1); }
    else if (e.key === "Home") { e.preventDefault(); focus(0); }
    else if (e.key === "End") { e.preventDefault(); focus(items.length - 1); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === "Tab") close(false);
  };

  const triggerProps = {
    onClick: () => (open ? close(false) : setOpen(true)),
    onKeyDown: (e) => {
      if (e.key === "ArrowDown" && !open) { e.preventDefault(); setOpen(true); }
    },
    "aria-haspopup": "menu",
    "aria-expanded": open,
    "aria-controls": open ? menuId : undefined,
  };

  return (
    <>
      <span ref={anchorRef} className="k-menu-anchor">{trigger(triggerProps)}</span>
      {open && createPortal(
        <MenuContext.Provider value={{ close }}>
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={label}
            className={cn("k-menu", className)}
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
            onKeyDown={onMenuKeyDown}
          >
            {children}
          </div>
        </MenuContext.Provider>,
        document.body,
      )}
    </>
  );
}

/** One action in a Menu. It closes the menu, then runs `onSelect`. */
export function MenuItem({ icon, children, onSelect, danger = false, disabled = false }) {
  const menu = useContext(MenuContext);
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      className={cn("k-menu-item", danger && "is-danger")}
      disabled={disabled}
      onClick={(e) => {
        menu?.close(true);
        onSelect?.(e);
      }}
    >
      {icon && <span className="k-menu-ico" aria-hidden="true">{icon}</span>}
      <span>{children}</span>
    </button>
  );
}

export const MenuDivider = () => <div role="separator" className="k-menu-sep" />;

/** A small heading over a group of items. */
export const MenuLabel = ({ children }) => <div className="k-menu-label" aria-hidden="true">{children}</div>;
