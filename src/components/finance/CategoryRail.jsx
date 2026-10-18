/**
 * Where the purchases went: the biggest categories, each with its share. It sits beside the table on a wide window, so a director can
 * see the shape of the spending without leaving the list. The same numbers the old "Purchases by category" chart drew (the top eight).
 */
import { Tile, EmptyNote, Meter } from "../bento/Bento";
import { Icons } from "../ui";
import { useMoney } from "./parts";
import { purchaseCategories } from "../../lib/finance";

export default function CategoryRail({ purchases, loading, area = "cat" }) {
  const money = useMoney();
  const cats = purchaseCategories(purchases);
  const top = cats[0]?.total || 1;
  return (
    <Tile area={area} icon={<Icons.Cart size={14} sw={1.8} />} title="By category" note={cats.length ? `top ${cats.length}` : undefined} loading={loading} align="top" className="fn-cat">
      {cats.length === 0 ? (
        <EmptyNote icon={<Icons.Cart size={22} sw={1.5} />}>No purchases in this period.</EmptyNote>
      ) : (
        <ul className="fn-cats" tabIndex={0} aria-label="Purchases by category">
          {cats.map((c) => (
            <li key={c.cat}>
              <div className="fn-cats-h"><span title={c.cat}>{c.cat}</span><b>{money(c.total)}</b></div>
              <Meter pct={(c.total / top) * 100} />
            </li>
          ))}
        </ul>
      )}
    </Tile>
  );
}
