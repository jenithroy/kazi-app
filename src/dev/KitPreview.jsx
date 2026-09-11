/**
 * /__kit — every shared component in every state, on one page.
 *
 * Dev only. App.jsx registers the route behind import.meta.env.DEV, so a
 * production build never contains it. It sits outside the sign-in gate so the
 * screenshot script can capture the kit without an account:
 *   npm run shots -- --label kit --kit --widths 390,1440
 *
 * Phase 1 of REDESIGN.md grows this page as each kit component lands. The
 * figures and names below are specimens for showing the components, not
 * business data.
 */
import { useState } from "react";
import {
  Avatar, Btn, Card, Divider, IconBtn, Icons, KPI, PageHeader, Pill, Progress,
  SearchInput, SegBar, Segmented, Spark, Tabs, Toolbar, ToolbarSpacer,
  Field, FormGrid, FormSection, FormActions, Input, Textarea, Select, Checkbox, Switch,
  DataTable, Menu, MenuDivider, MenuItem, MenuLabel, Money, RowActions,
} from "../components/ui";
import { useCurrency } from "../context/CurrencyContext";
import "./KitPreview.css";

const BTN_KINDS = ["primary", "secondary", "ghost", "danger", "soft", "mint"];
const BTN_SIZES = ["xs", "sm", "md", "lg"];
const PILL_TONES = ["neutral", "mint", "amber", "terra", "blue", "dark", "ghost"];
const SPECIMEN_STATUSES = ["Draft", "Sent", "Partial", "Paid", "Overdue", "Cancelled", "Present", "Late", "Leave", "Absent", "Pending", "Approved", "Rejected"];

function Section({ id, title, note, children }) {
  return (
    <section className="kkit-section" id={id}>
      <h2 className="kkit-h">{title}</h2>
      {note && <p className="kkit-note">{note}</p>}
      {children}
    </section>
  );
}

function LoadingDemo() {
  const [busy, setBusy] = useState(false);
  const run = () => {
    setBusy(true);
    setTimeout(() => setBusy(false), 1500);
  };
  return <Btn kind="primary" loading={busy} onClick={run}>{busy ? "Saving" : "Save (click me)"}</Btn>;
}

function SearchDemo() {
  const [q, setQ] = useState("");
  return (
    <Toolbar label="Specimen filters">
      <SearchInput value={q} onChange={setQ} label="Search specimens" />
      <Btn kind="secondary" size="md" icon={<Icons.Filter size={14} />}>Filters</Btn>
      <ToolbarSpacer />
      <span className="kkit-note kkit-note--inline">{q ? `Searching for “${q}”` : "Type, then press Escape to clear"}</span>
      <Btn kind="ghost" icon={<Icons.Download size={14} />}>Export</Btn>
    </Toolbar>
  );
}

const SPECIMEN_TABS = [
  { value: "expenses",  label: "Expenses",      count: 24, group: "Money in & out", shortcut: "E" },
  { value: "purchases", label: "Purchases",     count: 12, group: "Money in & out", shortcut: "P" },
  { value: "vat",       label: "VAT bills",     count: 3,  group: "Money in & out", shortcut: "V" },
  { value: "bank",      label: "Bank",                     group: "Money in & out", shortcut: "K" },
  { value: "journal",   label: "Journal",                  group: "Books",          shortcut: "J" },
  { value: "ledger",    label: "Ledger",                   group: "Books",          shortcut: "L" },
  { value: "pl",        label: "P&L",                      group: "Books" },
  { value: "bs",        label: "Balance sheet",            group: "Books" },
  { value: "orders",    label: "Order P&L",                group: "Orders",         shortcut: "O" },
];

function TabsDemo() {
  const [tab, setTab] = useState("expenses");
  const [chat, setChat] = useState("team");
  return (
    <>
      <div className="kkit-frame">
        <Tabs label="Specimen sections" items={SPECIMEN_TABS} value={tab} onChange={setTab} showShortcuts />
        <p className="kkit-note kkit-note--after">Selected: <strong>{tab}</strong>. Arrow keys move between tabs; on a phone these nine become a select.</p>
      </div>
      <div className="kkit-frame">
        <Tabs
          label="Specimen inbox"
          size="sm"
          value={chat}
          onChange={setChat}
          items={[
            { value: "team", label: "Team", icon: <Icons.Message size={14} />, count: 3 },
            { value: "leads", label: "Leads", icon: <Icons.Bot size={14} /> },
            { value: "archived", label: "Archived", disabled: true },
          ]}
        />
      </div>
    </>
  );
}

function SegmentedDemo() {
  const [view, setView] = useState("daily");
  const [currency, setCurrency] = useState("NPR");
  const [dates, setDates] = useState("AD");
  const [status, setStatus] = useState("pending");
  const [layout, setLayout] = useState("list");
  const [amount, setAmount] = useState("pct");
  return (
    <div className="kkit-stack">
      <div className="kkit-row">
        <span className="kkit-label">md</span>
        <Segmented label="View" value={view} onChange={setView} options={[{ value: "daily", label: "Daily log" }, { value: "report", label: "Employee report" }]} />
        <Segmented
          label="Status"
          value={status}
          onChange={setStatus}
          options={[{ value: "pending", label: "Pending", count: 4 }, { value: "approved", label: "Approved", count: 12 }, { value: "rejected", label: "Rejected", count: 1 }, { value: "all", label: "All" }]}
        />
      </div>
      <div className="kkit-row">
        <span className="kkit-label">sm</span>
        <Segmented size="sm" label="Currency" value={currency} onChange={setCurrency} options={[{ value: "NPR", label: "NPR" }, { value: "GBP", label: "GBP" }]} />
        <Segmented size="sm" label="Date system" value={dates} onChange={setDates} options={[{ value: "AD", label: "AD" }, { value: "BS", label: "BS" }]} />
        <Segmented size="sm" label="Discount as" value={amount} onChange={setAmount} options={[{ value: "pct", label: "%" }, { value: "amt", label: "Amount" }, { value: "none", label: "None", disabled: true }]} />
        <Segmented
          size="sm"
          label="Layout"
          value={layout}
          onChange={setLayout}
          options={[
            { value: "list", icon: <Icons.Menu size={14} />, ariaLabel: "List" },
            { value: "grid", icon: <Icons.Dashboard size={14} />, ariaLabel: "Grid" },
          ]}
        />
      </div>
      <div className="kkit-meter kkit-meter--wide">
        <Segmented block label="View (block)" value={view} onChange={setView} options={[{ value: "daily", label: "Daily log" }, { value: "report", label: "Employee report" }]} />
      </div>
    </div>
  );
}

const SPECIMEN_DOCS = [
  { id: 1, number: "INV-101", client: "Specimen client A", date: "2026-08-02", due: "2026-09-01", total: 118650, paid: 118650, status: "Paid", note: "Delivered with challan CH-40." },
  { id: 2, number: "INV-102", client: "Specimen client B", date: "2026-08-14", due: "2026-09-13", total: 45200, paid: 20000, status: "Partial", note: "Balance promised by mid-September." },
  { id: 3, number: "INV-103", client: "Specimen client C", date: "2026-08-20", due: "2026-08-30", total: 9800, paid: 0, status: "Overdue", note: "" },
  { id: 4, number: "INV-104", client: "Specimen client A", date: "2026-09-03", due: "2026-10-03", total: 76400, paid: 0, status: "Sent", note: "" },
  { id: 5, number: "INV-105", client: "Specimen client D", date: "2026-09-09", due: null, total: 2350, paid: 0, status: "Draft", note: "Waiting on the client's PAN number." },
];

const fmtDay = (iso) => iso && new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const owed = (r) => r.total - r.paid;

function useDocColumns() {
  return [
    { key: "number", header: "Invoice", phone: "title", mono: true, sortable: true },
    { key: "client", header: "Client", phone: "subtitle", sortable: true },
    { key: "date", header: "Date", sortable: true, nowrap: true, render: (r) => fmtDay(r.date) },
    { key: "due", header: "Due", nowrap: true, render: (r) => fmtDay(r.due) },
    {
      key: "total", header: "Total", align: "right", phone: "amount", sortable: true,
      render: (r) => <Money amount={r.total} stacked />,
      footer: (rows) => <Money amount={rows.reduce((s, r) => s + r.total, 0)} stacked />,
    },
    {
      key: "owed", header: "Credit due", align: "right", sortable: true, sortValue: owed,
      render: (r) => (owed(r) > 0 ? <Money amount={owed(r)} tone="owed" stacked /> : null),
      footer: (rows) => <Money amount={rows.reduce((s, r) => s + owed(r), 0)} tone="owed" stacked />,
    },
    { key: "status", header: "Status", phone: "status", render: (r) => <Pill status={r.status} /> },
    { key: "note", header: "Note", phone: "detail" },
  ];
}

function DataTableDemo() {
  const [picked, setPicked] = useState("Click a row, or use a row's actions.");
  const columns = useDocColumns();
  const actions = (row) => (
    <RowActions
      label={`More actions for ${row.number}`}
      actions={[
        { key: "view", label: "View", icon: <Icons.File size={14} />, onSelect: () => setPicked(`View ${row.number}`) },
        { key: "pay", label: "Record payment", icon: <Icons.Plus size={14} />, hidden: row.status === "Paid" || row.status === "Draft", onSelect: () => setPicked(`Record payment on ${row.number}`) },
        { key: "edit", label: "Edit", icon: <Icons.Edit size={14} />, onSelect: () => setPicked(`Edit ${row.number}`) },
        { key: "cancel", label: "Cancel invoice", icon: <Icons.X size={14} />, danger: true, hidden: row.status === "Paid", onSelect: () => setPicked(`Cancel ${row.number}`) },
      ]}
    />
  );
  const table = (
    <DataTable
      caption="Specimen invoices"
      columns={columns}
      rows={SPECIMEN_DOCS}
      actions={actions}
      onRowClick={(r) => setPicked(`Opened ${r.number}`)}
      rowTone={(r) => (r.status === "Overdue" ? "danger" : undefined)}
      defaultSort={{ key: "date", dir: "desc" }}
    />
  );
  return (
    <>
      <p className="kkit-note" aria-live="polite">{picked}</p>
      <div className="kkit-forms">
        <Card title="Invoices" sub="A table while there is room" flush>{table}</Card>
        <div className="kkit-narrow">
          <Card title="Same table, narrow box" flush>{table}</Card>
        </div>
      </div>
    </>
  );
}

function TableStatesDemo() {
  const columns = useDocColumns().slice(0, 4);
  return (
    <div className="kkit-grid kkit-grid--wide">
      <Card title="Loading" flush><DataTable columns={columns} rows={[]} loading loadingRows={3} cardsBelow={0} /></Card>
      <Card title="Empty" flush>
        <DataTable columns={columns} rows={[]} cardsBelow={0} empty="No invoices on this tab yet. New ones appear here as soon as they are saved." />
      </Card>
      <Card title="Error" flush>
        <DataTable columns={columns} rows={[]} cardsBelow={0} error="Invoices could not load. Check the connection." onRetry={() => {}} />
      </Card>
      <Card title="Sticky first column, expandable rows" flush>
        <DataTable
          columns={[
            { key: "number", header: "Invoice", mono: true, width: "110px" },
            { key: "client", header: "Client" },
            { key: "date", header: "Date", nowrap: true, render: (r) => fmtDay(r.date) },
            { key: "due", header: "Due", nowrap: true, render: (r) => fmtDay(r.due) },
            { key: "total", header: "Total", align: "right", render: (r) => <Money amount={r.total} secondary={false} /> },
            { key: "status", header: "Status", render: (r) => <Pill status={r.status} /> },
          ]}
          rows={SPECIMEN_DOCS.slice(0, 3)}
          stickyFirst
          cardsBelow={0}
          expandable={(r) => <p className="kkit-body">{r.note || "No note on this invoice."}</p>}
        />
      </Card>
    </div>
  );
}

function MenuMoneyDemo() {
  const currencyCtx = useCurrency();
  const [last, setLast] = useState("Nothing chosen yet.");
  return (
    <div className="kkit-stack">
      <div className="kkit-row">
        <span className="kkit-label">menu</span>
        <Menu
          label="Specimen document actions"
          align="start"
          trigger={(props) => <Btn {...props} kind="secondary" iconRight={<Icons.ChevronDown size={14} />}>Open menu</Btn>}
        >
          <MenuLabel>Document</MenuLabel>
          <MenuItem icon={<Icons.Edit size={14} />} onSelect={() => setLast("Edit")}>Edit</MenuItem>
          <MenuItem icon={<Icons.Copy size={14} />} onSelect={() => setLast("Duplicate")}>Duplicate</MenuItem>
          <MenuItem icon={<Icons.Print size={14} />} disabled>Print (disabled)</MenuItem>
          <MenuDivider />
          <MenuItem icon={<Icons.Trash size={14} />} danger onSelect={() => setLast("Delete")}>Delete</MenuItem>
        </Menu>
        <span className="kkit-note kkit-note--inline" aria-live="polite">Last choice: {last}</span>
      </div>
      <div className="kkit-row">
        <span className="kkit-label">money</span>
        <Segmented
          size="sm"
          label="Currency"
          value={currencyCtx?.currency || "NPR"}
          onChange={(v) => v !== currencyCtx?.currency && currencyCtx?.toggle()}
          options={[{ value: "NPR", label: "NPR" }, { value: "GBP", label: "GBP" }]}
        />
        <Money amount={118650} />
        <Money amount={45200} tone="owed" />
        <Money amount={9800} tone="settled" />
        <Money amount={2350} signed />
        <Money amount={-9800} />
        <Money amount={1234.5} exact secondary={false} />
        <Money amount={null} />
        <Money amount={76400} stacked />
      </div>
    </div>
  );
}

function SpecimenForm({ columns = 3 }) {
  const [form, setForm] = useState({
    customer: "", style: "KZ-TEE-01", region: "", qty: "0", rate: "850", due: "2026-09-30",
    notes: "", vat: true, notify: false,
  });
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const qtyError = Number(form.qty) > 0 ? null : "Enter a quantity above zero.";

  return (
    <>
      <FormSection title="Customer and style" description="Who the order is for and what is being made.">
        <FormGrid columns={columns}>
          <Field label="Customer" required>
            <Input value={form.customer} onChange={set("customer")} placeholder="Start typing a name" />
          </Field>
          <Field label="Style code" hint="Printed on the tech pack.">
            <Input value={form.style} onChange={set("style")} />
          </Field>
          <Field label="Region">
            <Select value={form.region} onChange={set("region")} placeholder="Not set">
              <option value="nepal">Nepal</option>
              <option value="uk">UK</option>
            </Select>
          </Field>
        </FormGrid>
      </FormSection>

      <FormSection title="Quantities and pricing">
        <FormGrid columns={columns}>
          <Field label="Quantity" error={qtyError} required>
            <Input type="number" min="0" value={form.qty} onChange={set("qty")} suffix="pcs" />
          </Field>
          <Field label="Rate" hint="Per piece, before VAT.">
            <Input type="number" min="0" value={form.rate} onChange={set("rate")} prefix="NPR" />
          </Field>
          <Field label="Due date">
            <Input type="date" value={form.due} onChange={set("due")} />
          </Field>
          <Field label="Notes" optional span="full">
            <Textarea value={form.notes} onChange={set("notes")} placeholder="Anything the floor should know" />
          </Field>
          <Field label="Locked" hint="Disabled, the way a view-only role sees it.">
            <Input value="Read only for this role" disabled />
          </Field>
          <Field label="Compact">
            <Input compact defaultValue="Denser, for tables" />
          </Field>
        </FormGrid>
      </FormSection>

      <FormSection title="Options">
        <div className="kkit-stack">
          <Checkbox
            label="Apply 13% VAT"
            description="Adds VAT on top of the order value."
            checked={form.vat}
            onChange={(e) => setForm((f) => ({ ...f, vat: e.target.checked }))}
          />
          <Checkbox label="A disabled checkbox" disabled />
          <Switch
            label="Notify the floor on Telegram"
            description="A switch applies as soon as it flips."
            checked={form.notify}
            onChange={(v) => setForm((f) => ({ ...f, notify: v }))}
          />
          <div className="kkit-row">
            <Switch size="sm" ariaLabel="Small switch" checked={form.notify} onChange={(v) => setForm((f) => ({ ...f, notify: v }))} />
            <Switch ariaLabel="Disabled switch" checked disabled onChange={() => {}} />
          </div>
        </div>
      </FormSection>

      <FormActions note="Nothing is saved here: this is the kit page.">
        <Btn kind="secondary">Cancel</Btn>
        <Btn kind="primary">Create order</Btn>
      </FormActions>
    </>
  );
}

export default function KitPreview() {
  return (
    <main className="kkit">
      <div className="kkit-head">
        <PageHeader
          title="Kazi component kit"
          description="Every shared component in every state. Dev builds only. Check it at 390 px and 1440 px after any change to the kit."
        />
      </div>

      <Section title="Page header" note="PageHeader: title and description, a back link, stats, actions. Stacks on a phone.">
        <div className="kkit-frame">
          <PageHeader
            back={{ to: "/__kit", label: "Finance" }}
            title="Fiscal year 2082/83"
            description="Every transaction recorded in this fiscal year, newest first."
            stats={[{ label: "Entries", value: "312" }, { label: "Types", value: "6" }]}
            actions={<><Btn kind="secondary" icon={<Icons.Download size={14} />}>Export</Btn><Btn kind="primary" icon={<Icons.Plus size={14} />}>New entry</Btn></>}
          />
        </div>
        <div className="kkit-frame">
          <PageHeader title="Quality control" description="Log a batch inspection, then review past results below." />
        </div>
      </Section>

      <Section title="Toolbar and search" note="Toolbar wraps instead of scrolling; ToolbarSpacer pushes the rest right on wide screens.">
        <div className="kkit-frame">
          <SearchDemo />
        </div>
        <div className="kkit-frame">
          <Toolbar>
            <SearchInput value="" onChange={() => {}} label="Small search" size="sm" />
            <SearchInput value="Stretches to fill" onChange={() => {}} label="Block search" block />
          </Toolbar>
        </div>
      </Section>

      <Section title="Tabs" note="Tabs: counts, group separators (group names from 1200 px), shortcut hints on mouse-and-keyboard screens, a select on phones">
        <TabsDemo />
      </Section>

      <Section title="Segmented" note="Segmented: a radiogroup of a few exclusive choices. Counts, icon-only with a label, a disabled option, full width.">
        <SegmentedDemo />
      </Section>

      <Section title="Data table" note="DataTable with RowActions and Money: sort by a header, click a row, open the More menu. The narrow copy turns rows into cards.">
        <DataTableDemo />
      </Section>

      <Section title="Table states" note="Loading, empty and error; a sticky first column with expandable rows.">
        <TableStatesDemo />
      </Section>

      <Section title="Menu and money" note="Menu renders at the end of the page so nothing clips it. Money follows the top bar's NPR / GBP choice.">
        <MenuMoneyDemo />
      </Section>

      <Section title="Forms" note="Field, FormGrid, FormSection, FormActions and the inputs. The grid follows the form's own width: the second copy sits in a 320 px box.">
        <div className="kkit-forms">
          <Card title="New order" sub="Specimen form, three columns when there is room">
            <SpecimenForm columns={3} />
          </Card>
          <div className="kkit-narrow">
            <Card title="Same form, narrow box">
              <SpecimenForm columns={3} />
            </Card>
          </div>
        </div>
      </Section>

      <Section title="Buttons" note="Btn: kind × size, with an icon, loading, disabled">
        <div className="kkit-stack">
          {BTN_KINDS.map((kind) => (
            <div key={kind} className="kkit-row">
              <span className="kkit-label">{kind}</span>
              {BTN_SIZES.map((size) => (
                <Btn key={size} kind={kind} size={size}>{size}</Btn>
              ))}
              <Btn kind={kind} icon={<Icons.Plus size={14} />}>With icon</Btn>
              <Btn kind={kind} loading>Loading</Btn>
              <Btn kind={kind} disabled>Disabled</Btn>
            </div>
          ))}
          <div className="kkit-row">
            <span className="kkit-label">live</span>
            <LoadingDemo />
            <Btn kind="secondary" iconRight={<Icons.ArrowRight size={14} />}>Icon on the right</Btn>
          </div>
        </div>
      </Section>

      <Section title="Icon buttons" note="IconBtn: label is required and becomes the accessible name and tooltip">
        <div className="kkit-row">
          <span className="kkit-label">ghost</span>
          <IconBtn size="sm" icon={<Icons.Edit size={14} />} label="Edit (small)" />
          <IconBtn icon={<Icons.More size={16} />} label="More actions" />
          <IconBtn size="lg" icon={<Icons.Print size={18} />} label="Print (large)" />
          <IconBtn icon={<Icons.X size={16} />} label="Disabled" disabled />
        </div>
        <div className="kkit-row">
          <span className="kkit-label">secondary</span>
          <IconBtn kind="secondary" icon={<Icons.Filter size={15} />} label="Filters" />
          <IconBtn kind="secondary" icon={<Icons.Download size={15} />} label="Download" />
          <span className="kkit-label">danger</span>
          <IconBtn kind="danger" icon={<Icons.Trash size={15} />} label="Delete" />
        </div>
      </Section>

      <Section title="Pills" note="Pill: tone, with a dot, or a status looked up in lib/status.js">
        <div className="kkit-row">
          {PILL_TONES.map((tone) => (
            <Pill key={tone} tone={tone}>{tone}</Pill>
          ))}
        </div>
        <div className="kkit-row">
          {PILL_TONES.map((tone) => (
            <Pill key={tone} tone={tone} dot>{tone}</Pill>
          ))}
        </div>
        <div className="kkit-row">
          <span className="kkit-label">status</span>
          {SPECIMEN_STATUSES.map((s) => (
            <Pill key={s} status={s} />
          ))}
        </div>
      </Section>

      <Section title="Cards">
        <div className="kkit-grid">
          <Card title="Card title" sub="One line under the title" actions={<Btn kind="secondary" size="sm">Action</Btn>}>
            <p className="kkit-body">Body content sits here, with the header on a hairline above it.</p>
          </Card>
          <Card
            title="A card with a long title that wraps"
            sub="Actions drop under the title when the card is narrow"
            actions={<><Btn kind="ghost" size="sm">Export</Btn><Btn kind="primary" size="sm" icon={<Icons.Plus size={13} />}>New</Btn></>}
          >
            <p className="kkit-body">Resize the window to see the header wrap.</p>
          </Card>
          <Card title="Flush card" flush hint="Footer hint line">
            <ul className="kkit-list">
              <li><span>First row</span><Pill status="Paid" /></li>
              <li><span>Second row</span><Pill status="Sent" /></li>
              <li><span>Third row</span><Pill status="Overdue" /></li>
            </ul>
          </Card>
          <Card title="With an accent" accent="var(--amber)">
            <p className="kkit-body">A small colour tab before the title.</p>
          </Card>
        </div>
      </Section>

      <Section title="KPIs" note="KPI: plain, with an icon and unit, linked (to / href / onClick), with a real comparison">
        <div className="kkit-grid">
          <KPI label="Specimen count" value="1,240" unit="pcs" />
          <KPI label="With an icon" value="86" unit="%" icon={<Icons.QC size={16} />} />
          <KPI label="Linked" value="12" unit="/ 20" href="#kit-icons" deltaLabel="Opens the icon list below" />
          <KPI label="With a comparison" value="4,380" delta={-3.2} deltaLabel="vs last month" spark={<Spark data={[3, 5, 4, 7, 6, 5]} />} />
        </div>
      </Section>

      <Section title="People and progress">
        <div className="kkit-row">
          <Avatar name="Asha Rai" hue={145} />
          <Avatar name="Ben Clarke" hue={30} size={36} />
          <Avatar name="Chandra Gurung" hue={250} size={44} ring="var(--mint-2)" />
          <Avatar name="" size={28} />
          <Divider vertical />
          <div className="kkit-meter"><Progress pct={0} label="Empty" /></div>
          <div className="kkit-meter"><Progress pct={45} label="Part way" /></div>
          <div className="kkit-meter"><Progress pct={100} color="var(--terra)" label="Full" /></div>
        </div>
        <div className="kkit-meter kkit-meter--wide">
          <SegBar
            segments={[
              { label: "Collected", v: 6, color: "var(--mint-deep)" },
              { label: "Due", v: 3, color: "var(--amber)" },
              { label: "Overdue", v: 1, color: "var(--terra)" },
            ]}
          />
        </div>
      </Section>

      <Section id="kit-icons" title="Icons" note={`${Object.keys(Icons).length} icons in Icons`}>
        <div className="kkit-icons">
          {Object.entries(Icons).map(([name, Icon]) => (
            <div key={name} className="kkit-icon">
              <Icon size={20} />
              <span>{name}</span>
            </div>
          ))}
        </div>
      </Section>
    </main>
  );
}
