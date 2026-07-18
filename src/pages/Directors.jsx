import AppLayout from "../components/AppLayout";
import { TEAM_MEMBERS } from "../constants";
import { Avatar } from "../components/ui";

function hueFromName(name = "") {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

const ROLE_LABELS = {
  uk_admin:    "Director",
  nepal_admin: "Nepal Admin",
  super_admin: "Super Admin",
  employee:    "Staff",
};

const uk   = TEAM_MEMBERS.filter(m => m.location === "uk");
const nepal = TEAM_MEMBERS.filter(m => m.location === "nepal" && m.appRole !== "super_admin");

function MemberCard({ m }) {
  return (
    <div style={{
      background: "var(--card)", border: "1px solid var(--line)",
      borderRadius: 12, padding: "16px 18px",
      display: "flex", alignItems: "center", gap: 14,
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
        background: `oklch(55% .16 ${hueFromName(m.name)})`,
        color: "#fff", fontSize: 15, fontWeight: 700,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {m.name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: "var(--ink)" }}>{m.name}</div>
        <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>{m.role}</div>
        <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 1 }}>{m.email}</div>
      </div>
      <span style={{
        fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 20,
        background: m.appRole === "uk_admin" ? "var(--mint-soft)" : "var(--bg-2)",
        color: m.appRole === "uk_admin" ? "var(--mint-deep)" : "var(--ink-3)",
      }}>
        {ROLE_LABELS[m.appRole] || m.appRole}
      </span>
    </div>
  );
}

function Section({ title, sub, children }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>{title}</h3>
        {sub && <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--ink-3)" }}>{sub}</p>}
      </div>
      {children}
    </div>
  );
}

export default function Directors() {
  return (
    <AppLayout>
      <div className="kscr fade-in" style={{ padding: "4px 0 0", maxWidth: 800 }}>

        {/* Header */}
        <div className="kph" style={{ padding: "8px 0 24px" }}>
          <div>
            <h2>Company Overview</h2>
            <p>Directors view — structure, team, and roles</p>
          </div>
        </div>

        {/* About */}
        <Section title="About Kazi Manufacturing">
          <div className="kdir-about-grid" style={{
            background: "var(--card)", border: "1px solid var(--line)",
            borderRadius: 12, padding: "20px 22px",
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20,
          }}>
            {[
              { label: "Location", value: "Kathmandu, Nepal" },
              { label: "Market", value: "UK & European brands (B2B)" },
              { label: "Products", value: "T-shirts, hoodies, private label" },
              { label: "Pricing currency", value: "GBP" },
              { label: "Nepal office", value: "Kazi Office, Kathmandu" },
              { label: "Model", value: "Factory-direct manufacturing" },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>{value}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* Org structure */}
        <Section title="Organisation Structure">
          <div style={{
            background: "var(--card)", border: "1px solid var(--line)",
            borderRadius: 12, padding: "18px 22px",
            display: "flex", flexDirection: "column", gap: 10,
          }}>
            {[
              { tier: "Directors (UK)", desc: "Own the business, set strategy, manage client relationships and finance from the UK." },
              { tier: "Nepal Admins", desc: "Run day-to-day ops in Kathmandu — production, billing, payroll, inventory, QC." },
              { tier: "Nepal Staff", desc: "Delivery team — production floor, marketing, fashion, operations support." },
            ].map(({ tier, desc }) => (
              <div key={tier} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--mint-deep)", marginTop: 5, flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>{tier}</div>
                  <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 2 }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* UK team */}
        <Section title="UK Directors" sub="Strategic oversight and client-facing leadership">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {uk.map(m => <MemberCard key={m.name} m={m} />)}
          </div>
        </Section>

        {/* Nepal team */}
        <Section title="Nepal Team" sub="On-the-ground operations in Kathmandu">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {nepal.map(m => <MemberCard key={m.name} m={m} />)}
          </div>
        </Section>

      </div>
    </AppLayout>
  );
}
