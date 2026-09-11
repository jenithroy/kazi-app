/**
 * /__kit — every shared component in every state, on one page.
 *
 * Dev only. App.jsx registers the route behind import.meta.env.DEV, so a
 * production build never contains it. It sits outside the sign-in gate so the
 * screenshot script can capture the kit without an account:
 *   npm run shots -- --label kit --kit --widths 390,1440
 *
 * Phase 1 of REDESIGN.md grows this page as each kit component lands. The
 * figures below are specimens for showing the components, not business data.
 */
import { Avatar, Btn, Card, Divider, Icons, KPI, Pill, Progress, SegBar, Spark } from "../components/ui";
import "./KitPreview.css";

const BTN_KINDS = ["primary", "mint", "ghost", "soft", "outline", "danger"];
const BTN_SIZES = ["xs", "sm", "md", "lg"];
const PILL_TONES = ["neutral", "mint", "amber", "terra", "blue", "dark", "ghost"];

function Section({ title, note, children }) {
  return (
    <section className="kkit-section">
      <h2 className="kkit-h">{title}</h2>
      {note && <p className="kkit-note">{note}</p>}
      {children}
    </section>
  );
}

export default function KitPreview() {
  return (
    <main className="kkit">
      <header className="kkit-head">
        <h1 className="kkit-title">Kazi component kit</h1>
        <p className="kkit-sub">
          Every shared component in every state. Dev builds only. Check it at 390 px and 1440 px after any change to the kit.
        </p>
      </header>

      <Section title="Buttons" note="Btn: kind × size, with icon, disabled">
        <div className="kkit-stack">
          {BTN_KINDS.map((kind) => (
            <div key={kind} className="kkit-row">
              <span className="kkit-label">{kind}</span>
              {BTN_SIZES.map((size) => (
                <Btn key={size} kind={kind} size={size}>{size}</Btn>
              ))}
              <Btn kind={kind} icon={<Icons.Plus size={14} />}>With icon</Btn>
              <Btn kind={kind} disabled>Disabled</Btn>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Pills" note="Pill: tone, with dot">
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
      </Section>

      <Section title="Cards and KPIs">
        <div className="kkit-grid">
          <Card title="Card title" sub="Sub line" action={<Btn size="sm">Action</Btn>}>
            <p className="kkit-body">Body content sits here.</p>
          </Card>
          <Card title="Flush card" pad={false} hint="Footer hint">
            <p className="kkit-body kkit-body--pad">Flush body, footer hint below.</p>
          </Card>
          <KPI label="Specimen KPI" value="1,240" unit="pcs" deltaLabel="label under the value" />
          <KPI label="With spark" value="86" unit="%" spark={<Spark data={[3, 5, 4, 7, 6, 9]} />} />
        </div>
      </Section>

      <Section title="People and progress">
        <div className="kkit-row">
          <Avatar name="Asha Rai" hue={145} />
          <Avatar name="Ben Clarke" hue={30} size={36} />
          <Avatar name="Chandra Gurung" hue={250} size={44} ring="var(--mint-2)" />
          <Divider vertical />
          <div className="kkit-meter"><Progress pct={0} /></div>
          <div className="kkit-meter"><Progress pct={45} /></div>
          <div className="kkit-meter"><Progress pct={100} color="var(--terra)" /></div>
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

      <Section title="Icons" note={`${Object.keys(Icons).length} icons in Icons`}>
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
