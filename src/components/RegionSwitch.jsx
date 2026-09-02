import { useRegion } from "../context/RegionContext";
import KeyboardSelect from "./KeyboardSelect";
import { REGIONS, countUntagged, normaliseRegion, regionMeta } from "../utils/region";

/**
 * The UK / Nepal switch, the field that tags a record, and the badge that shows
 * what a record is tagged as.
 *
 * All three live together because they are one idea seen from three angles: the
 * switch asks the question, the field answers it for a single record, and the
 * badge reports the answer back in a list.
 */

/* ── The header switch ───────────────────────────────────────
   Two halves of one control rather than two buttons, so it reads as a position
   ("we are on the Nepal side") and not as a pair of actions. */
export function RegionSwitch({ untagged = 0, hint = true, size = "md" }) {
  const { region, setRegion } = useRegion();

  return (
    <div className={`kregion-switch kregion-switch--${size}`}>
      <div className="kregion-seg" role="radiogroup" aria-label="Region">
        {REGIONS.map((r) => (
          <button
            key={r.id}
            type="button"
            role="radio"
            aria-checked={region === r.id}
            className={`kregion-seg-btn${region === r.id ? " is-on" : ""}`}
            onClick={() => setRegion(r.id)}
            title={`Show ${r.label} data`}
          >
            <span className="kregion-flag" aria-hidden="true">{r.flag}</span>
            {r.label}
          </button>
        ))}
      </div>
      {hint && untagged > 0 && (
        <span
          className="kregion-untagged"
          title="These records have no region yet, so they show under both UK and Nepal. Edit one and set its region to file it on one side."
        >
          {untagged} untagged
        </span>
      )}
    </div>
  );
}

/**
 * The region picker on a form.
 *
 * "Not set" is a real, selectable answer rather than an oversight: a record
 * nobody has filed yet belongs in both lists, and forcing a guess at creation
 * time would put half of them on the wrong side.
 */
export function RegionField({
  value,
  onChange,
  label = "Region",
  allowUnset = true,
  required = false,
  disabled = false,
  hint = "Untagged records show under both UK and Nepal.",
  className,
  style,
}) {
  const current = normaliseRegion(value);
  return (
    <label className={className} style={style}>
      {label}
      <select
        value={current}
        required={required}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {allowUnset && <option value="">— Not set —</option>}
        {REGIONS.map((r) => (
          <option key={r.id} value={r.id}>{r.label}</option>
        ))}
      </select>
      {hint ? <span className="kfield-hint">{hint}</span> : null}
    </label>
  );
}

/**
 * Bare select, for form layouts that build their own <label>.
 *
 * `keyboard` swaps the native <select> for KeyboardSelect. Rows like the
 * purchase entry grid are typed straight through with Enter moving field to
 * field, and a native <select> breaks that chain — Enter does nothing in one,
 * so the region box would be the one place the run stalls.
 */
export function RegionSelect({ value, onChange, allowUnset = true, keyboard = false, className, style, disabled, ...rest }) {
  const current = normaliseRegion(value);

  if (keyboard) {
    const options = [
      ...(allowUnset ? [{ value: "", label: "— Region not set —" }] : []),
      ...REGIONS.map((r) => ({ value: r.id, label: r.label })),
    ];
    return (
      <KeyboardSelect
        className={className}
        style={style}
        disabled={disabled}
        value={current}
        options={options}
        onChange={onChange}
        placeholder="— Region not set —"
      />
    );
  }

  return (
    <select
      className={className}
      style={style}
      disabled={disabled}
      value={current}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
    >
      {allowUnset && <option value="">— Region not set —</option>}
      {REGIONS.map((r) => (
        <option key={r.id} value={r.id}>{r.label}</option>
      ))}
    </select>
  );
}

/** What region a row is filed under, at a glance in a table. */
export function RegionBadge({ value, muted = false }) {
  const id = normaliseRegion(value);
  if (!id) {
    return (
      <span className="kregion-badge kregion-badge--none" title="No region set — shows under both UK and Nepal.">
        —
      </span>
    );
  }
  const meta = regionMeta(id);
  return (
    <span className={`kregion-badge kregion-badge--${id}${muted ? " is-muted" : ""}`}>
      <span aria-hidden="true">{meta.flag}</span> {meta.label}
    </span>
  );
}

/**
 * The line under a page header that says what you are looking at.
 *
 * Worth the space: every count on the page is now a count of one region, and a
 * number that silently halved is the kind of thing people file a bug about.
 */
export function RegionNote({ rows, noun = "records" }) {
  const { label } = useRegion();
  const untagged = countUntagged(rows);
  return (
    <p className="kregion-note">
      Showing <strong>{label}</strong> {noun}
      {untagged > 0 && <> · {untagged} untagged {untagged === 1 ? "record shows" : "records show"} on both sides</>}
    </p>
  );
}

export default RegionSwitch;
