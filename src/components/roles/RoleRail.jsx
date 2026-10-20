/**
 * The roles as a list down the left of the page, grouped by where their people are (UK, Nepal), each with who holds it. It is a
 * vertical tab list: Up / Down / Home / End move between roles and open them, as on Finance's rail. Under 1100px it is not drawn
 * and the card has a dropdown for the same choice (RoleCard).
 */
import { useRef } from "react";
import { cn } from "../ui";
import { chipLetters, holdersOf, peopleLine } from "../../lib/rolesPage";

export default function RoleRail({ groups, active, mineId, selectedId, onPick, loading, directoryVisible }) {
  const listRef = useRef(null);
  const flat = groups.flatMap((g) => g.roles);

  function onKey(e) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key) || !flat.length) return;
    const at = Math.max(0, flat.findIndex((r) => r.id === selectedId));
    const next = e.key === "Home" ? 0 : e.key === "End" ? flat.length - 1 : (at + (e.key === "ArrowDown" ? 1 : -1) + flat.length) % flat.length;
    e.preventDefault();
    onPick(flat[next].id);
    requestAnimationFrame(() => listRef.current?.querySelector('[aria-selected="true"]')?.focus());
  }

  return (
    <nav className="kb-tile rl-rail" style={{ gridArea: "rail" }} data-tile="rail" aria-label="Roles">
      {loading ? (
        <div className="rl-rail-in" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((i) => <span key={i} className="kb-skel rl-skel" />)}
        </div>
      ) : (
        <div ref={listRef} className="rl-rail-in" role="tablist" aria-orientation="vertical" aria-label="Roles" onKeyDown={onKey}>
          {groups.map((g) => (
            <div className="rl-rg" role="presentation" key={g.key}>
              <span className="rl-rg-h">{g.label}<i>{g.roles.length}</i></span>
              {g.roles.map((r) => {
                const holders = directoryVisible ? holdersOf(active, r.id) : [];
                const on = r.id === selectedId;
                const line = !directoryVisible ? "" : holders.length ? peopleLine(holders) : "No one yet";
                return (
                  <button
                    key={r.id}
                    type="button"
                    role="tab"
                    id={`rl-tab-${r.id}`}
                    aria-selected={on}
                    aria-controls="rl-pane"
                    tabIndex={on ? 0 : -1}
                    title={r.label}
                    className={cn("rl-ri", on && "is-on")}
                    onClick={() => onPick(r.id)}
                  >
                    <span className="rl-ri-ch" aria-hidden="true">{chipLetters(r.label)}</span>
                    <span className="rl-ri-t">
                      <b>{r.label}</b>
                      {line && <small>{line}</small>}
                    </span>
                    {r.id === mineId && <em className="rl-you">You</em>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </nav>
  );
}
