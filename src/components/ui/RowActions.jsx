import { Btn, IconBtn } from "./Btn";
import { Icons } from "./Icons";
import { Menu, MenuItem } from "./Menu";
import { PHONE_QUERY, useMediaQuery } from "./useMediaQuery";

/* ── Row actions ──────────────────────────────────────── */
/**
 * What can be done to one row: the most-used action as a button, the rest in
 * a "More" menu, so a row never grows a wall of buttons.
 *
 *   actions  [{ key, label, icon?, onSelect, danger?, disabled?, hidden? }]
 *            in order of use; `hidden` drops one the row's state rules out
 *   visible  how many to show as buttons on a wide screen (default 1); a phone
 *            always shows one
 *   label    names the row for the More button: "More actions for INV-050"
 *
 * Clicks inside never reach a clickable row underneath.
 */
export function RowActions({ actions, visible = 1, label = "More actions" }) {
  const phone = useMediaQuery(PHONE_QUERY);
  const list = actions.filter((a) => a && !a.hidden);
  const count = phone ? Math.min(1, visible) : visible;
  const shown = list.slice(0, count);
  const rest = list.slice(count);

  return (
    <div className="k-row-actions" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      {shown.map((a) => (
        <Btn
          key={a.key}
          size="sm"
          kind={a.danger ? "danger" : "secondary"}
          icon={a.icon}
          disabled={a.disabled}
          onClick={a.onSelect}
        >
          {a.label}
        </Btn>
      ))}
      {rest.length > 0 && (
        <Menu
          label={label}
          trigger={(props) => <IconBtn {...props} size="sm" kind="ghost" icon={<Icons.More size={15} />} label={label} />}
        >
          {rest.map((a) => (
            <MenuItem key={a.key} icon={a.icon} danger={a.danger} disabled={a.disabled} onSelect={a.onSelect}>
              {a.label}
            </MenuItem>
          ))}
        </Menu>
      )}
    </div>
  );
}
