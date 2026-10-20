import { useMemo } from "react";
import { Icons } from "../ui";
import { EmptyNote, Tile } from "../bento/Bento";
import DataTable, { TwoLine } from "../table/DataTable";
import { FilterChips, SearchBox } from "../table/Bar";
import Select from "../Select";
import { Amt } from "../finance/parts";
import { Face, HoursCell, StatusTag, Strip, personName } from "./parts";
import { hoursOf, isActive, plural } from "../../lib/employees";

const FOCUS = [
  { value: "", label: "Everyone" },
  { value: "nohours", label: "No working hours" },
  { value: "prod", label: "Production workers" },
];
const WHERE = [
  { value: "", label: "Both sides" },
  { value: "nepal", label: "Nepal" },
  { value: "uk", label: "UK" },
];

/**
 * The name cell. The line under the name is the position; when the table has no room for a column, what that column said
 * rides there instead (the department, that the person is inactive, that they are a production worker): a narrow table loses
 * width, not facts.
 */
function WhoCell({ row, dropped }) {
  const parts = [row.role || "No position"];
  if (dropped.has("dept") && row.department) parts.push(row.department);
  if (dropped.has("status") && !isActive(row)) parts.push("Inactive");
  if (row.isProductionWorker) parts.push("Production");
  return <TwoLine lead={<Face row={row} size={30} />} main={personName(row)} sub={parts.join(" · ")} />;
}

function ContactCell({ row }) {
  if (!row.email && !row.phone) return <span className="dt-dim">—</span>;
  return (
    <span className="em-lines" title={[row.email, row.phone].filter(Boolean).join(" · ")}>
      <b>{row.email || row.phone}</b>
      {row.email && row.phone ? <span>{row.phone}</span> : null}
    </span>
  );
}

function PayCell({ row }) {
  const n = Number(row.basicSalaryNPR);
  return n > 0 ? <Amt n={n} strong /> : <span className="dt-dim">—</span>;
}

function columnsFor({ pay, onSlip }) {
  return [
    {
      id: "who", label: "Person", grow: true, min: 220, max: 440, sort: (r) => personName(r).toLowerCase(),
      render: (r, { dropped }) => <WhoCell row={r} dropped={dropped} />,
    },
    {
      id: "dept", label: "Department", width: 130, drop: 5, sort: (r) => (r.department || "").toLowerCase(),
      render: (r) => (r.department ? <span className="em-plain">{r.department}</span> : <span className="dt-dim">—</span>),
    },
    {
      id: "hours", label: "Working hours", width: 156, drop: 2, sort: (r) => hoursOf(r).time || null,
      render: (r) => <HoursCell row={r} />,
    },
    {
      id: "contact", label: "Contact", width: 228, drop: 4, sort: (r) => (r.email || r.phone || "").toLowerCase(),
      render: (r) => <ContactCell row={r} />,
    },
    ...(pay ? [{
      id: "pay", label: "Basic pay", width: 128, align: "end", drop: 3, first: "desc", sort: (r) => Number(r.basicSalaryNPR) || null,
      render: (r) => <PayCell row={r} />,
    }] : []),
    {
      id: "status", label: "Status", width: 92, drop: 6, sort: (r) => (isActive(r) ? 0 : 1),
      render: (r) => <StatusTag row={r} />,
    },
    {
      id: "act", label: <span className="em-sr">Salary slip</span>, width: 88, align: "end", drop: 1,
      render: (r) => (
        <button
          type="button" className="kb-btn kb-btn--ghost dt-act em-slipbtn" aria-label={`Make a salary slip for ${personName(r)}`}
          onClick={() => onSlip(r)}
        >
          <Icons.File size={13} sw={1.9} aria-hidden="true" /> Slip
        </button>
      ),
    },
  ];
}

const emptyText = ({ all, status, filtered }) => {
  if (all === 0) return "Nobody is on the list yet.";
  if (filtered) return "Nobody matches that.";
  return { active: "Nobody is active.", inactive: "Nobody is inactive. Everyone is on the team." }[status] || "Nobody to show.";
};

/**
 * The people themselves: Active | Inactive | All with their counts, a search, and two filters (the tiles set the first, "Show").
 * A row is the button (anywhere you press opens that person's card); the one thing worth doing without opening it is a
 * salary slip, which is a button on the row. The table scrolls inside the pane and its heads sort it.
 */
export default function PeoplePane({
  rows, counts, status, onStatus, query, onQuery, focus, onFocus, where, onWhere,
  pay, canEdit, hidden, onOpen, onSlip, activeId, loading, strip, onStripClose,
}) {
  const filtered = Boolean(query || focus || where);
  const columns = useMemo(() => columnsFor({ pay, onSlip }), [pay, onSlip]);
  const total = counts[status];

  return (
    <Tile
      area="list"
      icon={<Icons.Employees size={14} sw={1.8} />}
      title="People"
      note={filtered ? `${rows.length} of ${total}` : `${rows.length} ${plural(rows.length, "person", "people")}`}
      align="top"
      className="em-pane"
    >
      {/* what the filters left, said to a screen reader when they change (a tile that sets a filter changes a list nobody is looking at) */}
      <span className="em-sr" role="status">{filtered || status !== "all" ? `${rows.length} of ${total} ${plural(total, "person", "people")} shown` : `${rows.length} ${plural(rows.length, "person", "people")}`}</span>
      <div className="em-tools">
        <FilterChips
          label="Which people"
          value={status}
          onChange={onStatus}
          options={[
            { value: "active", label: "Active", count: counts.active },
            { value: "inactive", label: "Inactive", count: counts.inactive },
            { value: "all", label: "All", count: counts.all },
          ]}
        />
        <SearchBox value={query} onChange={onQuery} placeholder="Search people" label="Search people by name, position, department, email or phone" />
        <Select variant="pill" label="Show" value={focus} onChange={onFocus} options={FOCUS} searchable={false} />
        <Select variant="pill" label="Side of the business" value={where} onChange={onWhere} options={WHERE} searchable={false} />
      </div>

      {(!canEdit || hidden) && (
        <p className="em-note">
          {!canEdit && "View only. Adding or changing people needs edit rights on Employees."}
          {!canEdit && hidden ? " " : ""}
          {hidden && "Phone, address, pay and bank details are hidden for your position."}
        </p>
      )}

      {/* With nothing to list there is no table at all: a table body that holds only a message is a broken table to a screen
          reader, and a head of column names over "Nobody matches that" says nothing. */}
      {!loading && rows.length === 0 ? (
        <div className="dt-empty">
          <EmptyNote icon={<Icons.Employees size={22} sw={1.5} />}>{emptyText({ all: counts.all, status, filtered })}</EmptyNote>
        </div>
      ) : (
        <DataTable
          label="People"
          rows={rows}
          rowKey={(r) => r.id}
          columns={columns}
          onOpen={(r) => onOpen(r.id)}
          rowLabel={(r) => `Open ${personName(r)}, ${r.role || "no position"}, ${isActive(r) ? "active" : "inactive"}`}
          activeKey={activeId}
          loading={loading}
        />
      )}

      <Strip strip={strip} onClose={onStripClose} />
    </Tile>
  );
}
