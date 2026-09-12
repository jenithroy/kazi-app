import { useEffect, useRef, useState } from "react";
import { IconBtn } from "./Btn";
import { Icons } from "./Icons";
import { Menu, MenuItem, MenuLabel } from "./Menu";
import { Pill } from "./Pill";
import { Segmented } from "./Segmented";
import { useElementWidth } from "./useElementWidth";
import { cn } from "./utils";

/* ── Kanban ───────────────────────────────────────────── */

// Drag payloads. The browser lowercases the type, so these are lowercase already.
const CARD_TYPE = "application/x-kazi-card";
const COLUMN_TYPE = "application/x-kazi-column";

/**
 * A board of columns with cards in them: the task board, the production
 * pipeline. The board handles moving; the page saves the result.
 *
 *   columns     [{ id, label, tone?, hint? }]
 *   items       the cards, in any order
 *   itemKey     (item) => a stable key
 *   columnOf    (item) => the id of the column it sits in
 *   renderCard  (item) => what the card shows inside the shell
 *   onMove      (item, toColumnId) => … saves the move
 *   canMove     true/false, or (item) => boolean: a card that cannot move is
 *               not draggable and has no move menu
 *   onReorderColumns  (draggedId, targetId) => … adds a drag handle to the headers
 *   columnActions  (column) => a node on the right of a column header
 *   columnFooter   (column) => a node under its cards, for an "Add card" form
 *   addColumn      a node after the last column
 *   emptyColumn    what an empty column says
 *   phoneAt        below this width — its own — one column shows at a time
 *
 * Dragging works on a desktop, but every movable card also carries a "Move to"
 * menu: that is the only way on a touch screen, and the fastest way from the
 * keyboard.
 */
export function Kanban({
  columns,
  items,
  itemKey = (item) => item.id,
  columnOf,
  renderCard,
  onMove,
  canMove = true,
  onReorderColumns,
  columnActions,
  columnFooter,
  addColumn,
  emptyColumn = "Nothing here yet.",
  phoneAt = 640,
  label = "Board",
  className,
}) {
  const ref = useRef(null);
  const width = useElementWidth(ref);
  const phone = width != null && width < phoneAt;

  const [dragCard, setDragCard] = useState(null);
  const [dragColumn, setDragColumn] = useState(null);
  const [overColumn, setOverColumn] = useState(null);
  const [shown, setShown] = useState(columns[0]?.id);

  useEffect(() => {
    if (!columns.some((c) => c.id === shown)) setShown(columns[0]?.id);
  }, [columns, shown]);

  const movable = (item) => (typeof canMove === "function" ? canMove(item) : canMove) && Boolean(onMove);
  const cardsIn = (columnId) => items.filter((item) => columnOf(item) === columnId);
  const visible = phone ? columns.filter((c) => c.id === shown) : columns;

  function onCardDrop(e, column) {
    const id = e.dataTransfer.getData(CARD_TYPE);
    const columnId = e.dataTransfer.getData(COLUMN_TYPE);
    setOverColumn(null);
    setDragCard(null);
    setDragColumn(null);
    if (columnId && onReorderColumns) {
      if (columnId !== column.id) onReorderColumns(columnId, column.id);
      return;
    }
    if (!id) return;
    const item = items.find((x) => String(itemKey(x)) === id);
    if (item && columnOf(item) !== column.id) onMove(item, column.id);
  }

  return (
    <div ref={ref} className={cn("k-kb", phone && "k-kb--phone", className)}>
      {phone && columns.length > 1 && (
        <Segmented
          label={`${label} columns`}
          value={shown}
          onChange={setShown}
          options={columns.map((c) => ({ value: c.id, label: c.label, count: cardsIn(c.id).length }))}
        />
      )}

      <div className="k-kb-scroll">
        {visible.map((column) => {
          const cards = cardsIn(column.id);
          return (
            <section
              key={column.id}
              className={cn("k-kb-col", overColumn === column.id && "is-over")}
              aria-label={`${column.label}, ${cards.length} ${cards.length === 1 ? "card" : "cards"}`}
              onDragOver={(e) => {
                if (!onMove && !onReorderColumns) return;
                e.preventDefault();
                setOverColumn(column.id);
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget)) return;
                setOverColumn((id) => (id === column.id ? null : id));
              }}
              onDrop={(e) => onCardDrop(e, column)}
            >
              <header className="k-kb-col-h">
                {onReorderColumns && (
                  <span
                    className="k-kb-grip"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(COLUMN_TYPE, column.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDragColumn(column.id);
                    }}
                    onDragEnd={() => setDragColumn(null)}
                    title={`Drag to reorder ${column.label}`}
                    aria-hidden="true"
                  >
                    <Icons.Grip size={14} />
                  </span>
                )}
                <Pill tone={column.tone || "neutral"} dot>{column.label}</Pill>
                <span className="k-kb-count">{cards.length}</span>
                {columnActions && <div className="k-kb-col-actions">{columnActions(column)}</div>}
              </header>

              <div className="k-kb-cards">
                {cards.length === 0 && <p className="k-kb-empty">{emptyColumn}</p>}
                {cards.map((item) => {
                  const key = String(itemKey(item));
                  const canDrag = movable(item);
                  const others = columns.filter((c) => c.id !== column.id);
                  return (
                    <article
                      key={key}
                      className={cn("k-kb-card", dragCard === key && "is-dragging")}
                      draggable={canDrag}
                      onDragStart={(e) => {
                        e.dataTransfer.setData(CARD_TYPE, key);
                        e.dataTransfer.effectAllowed = "move";
                        setDragCard(key);
                      }}
                      onDragEnd={() => setDragCard(null)}
                    >
                      {canDrag && others.length > 0 && (
                        <div className="k-kb-card-move">
                          <Menu
                            align="end"
                            label={`Move to another column`}
                            trigger={(props) => (
                              <IconBtn {...props} size="sm" icon={<Icons.More size={14} />} label="Move this card" />
                            )}
                          >
                            <MenuLabel>Move to</MenuLabel>
                            {others.map((c) => (
                              <MenuItem key={c.id} onSelect={() => onMove(item, c.id)}>{c.label}</MenuItem>
                            ))}
                          </Menu>
                        </div>
                      )}
                      {renderCard(item, column)}
                    </article>
                  );
                })}
              </div>

              {columnFooter && <div className="k-kb-col-foot">{columnFooter(column)}</div>}
            </section>
          );
        })}

        {!phone && addColumn && <div className="k-kb-add">{addColumn}</div>}
      </div>

      {phone && addColumn && <div className="k-kb-add k-kb-add--phone">{addColumn}</div>}
      {dragColumn && <p className="k-sr" role="status">Drop on another column to reorder.</p>}
    </div>
  );
}
