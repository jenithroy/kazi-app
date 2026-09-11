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
} from "../components/ui";
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
