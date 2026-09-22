import { materialItems } from "../utils/productionConsumption";

// Inventory item picker for stock deductions, grouped by category with the
// categories that normally hold this kind of material first.
export default function StockItemSelect({ items, kind, value, onChange, disabled, placeholder = "Choose item…" }) {
  const list = materialItems([...items], kind);
  // The item already chosen stays selectable even if it is filed under a
  // category this picker normally hides.
  if (value && !list.some(i => i.id === value)) {
    const current = items.find(i => i.id === value);
    if (current) list.unshift(current);
  }

  const groups = [];
  for (const item of list) {
    const category = item.category || "Other";
    let group = groups.find(g => g.category === category);
    if (!group) { group = { category, items: [] }; groups.push(group); }
    group.items.push(item);
  }

  return (
    <select
      className="kfin-select"
      value={value || ""}
      disabled={disabled}
      onChange={e => onChange(e.target.value)}
    >
      <option value="">{placeholder}</option>
      {groups.map(g => (
        <optgroup key={g.category} label={g.category}>
          {g.items.map(i => (
            <option key={i.id} value={i.id}>{i.item}{i.unit ? ` (${i.unit})` : ""}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
