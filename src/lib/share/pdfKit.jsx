/**
 * The one PDF layout the generated shares use (a record that has no document of its own: an order's pipeline, a task, a customer...).
 * It imports the PDF maker, so only adapters that need it load this file, and only when a record is being sent.
 *
 *   <CardDoc kind="Order" title="ORD-051 · Autumn jacket" subtitle="Anita Traders" badges={[{ text: "Packing", tone: "info" }]}
 *            sections={[ ...see below... ]} logo={dataUrl} takenAt="22 Oct 2026, 14:32" by="Rishav Chaudhary" />
 *
 * A section is { heading, ...one of }:
 *   rows    [[label, value], ...]                                   a list of facts
 *   text    "free text"                                             a paragraph (notes)
 *   table   { head: [...], rows: [[...]], flex: [...], align: [...] }
 *   strip   [{ label, state: "done" | "now" | "todo" }, ...]        a row of steps (a pipeline)
 *   images  [{ dataUrl, width, height, caption }]                   pictures, side by side
 *   total   { label, value }                                        the figure that is the answer (a total, an amount), set large
 *
 * Everything is the PDF's built-in Helvetica, like the invoice PDF; text it cannot draw is made safe by `pdfText` in helpers.js.
 * Every page says what the file is, when the snapshot was taken, and by whom: it is a copy and must say so.
 */
import { Document, Page, View, Text, Image, StyleSheet, pdf } from "@react-pdf/renderer";
import { pdfText } from "./helpers";

// A long word wraps whole, not as "acces-sories": names and labels must read as they were typed. This is set on each of OUR text nodes
// (`Txt`), never with Font.registerHyphenationCallback: that one is global to the PDF maker and would change every PDF the page makes
// afterwards, the legal invoice's Download PDF included.
const noHyphen = (word) => [word];

/** react-pdf's Text, laid out without hyphenation. Every text in a share PDF is one of these. */
export function Txt(props) {
  return <Text hyphenationCallback={noHyphen} {...props} />;
}

const G = "#1f6e4c";
const INK = "#0a1c14";
const INK3 = "#5b6a62";
const LINE = "#d6ddd9";
const TONES = {
  good: { bg: "#e3f3ea", fg: "#14603d" },
  warn: { bg: "#fbf0d6", fg: "#7d5512" },
  bad: { bg: "#f8e2dc", fg: "#a8442c" },
  info: { bg: "#e1ecf6", fg: "#2a4f6f" },
  neutral: { bg: "#eef1ef", fg: "#3b4a43" },
};

const S = StyleSheet.create({
  page: { paddingTop: 42, paddingBottom: 56, paddingHorizontal: 42, fontFamily: "Helvetica", fontSize: 10, color: INK },
  head: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", borderBottomWidth: 2, borderBottomColor: G, paddingBottom: 10, marginBottom: 12 },
  headL: { flex: 1, paddingRight: 12 },
  kind: { fontSize: 8, fontFamily: "Helvetica-Bold", color: G, letterSpacing: 2, marginBottom: 4, lineHeight: 1.2 },
  title: { fontSize: 19, fontFamily: "Helvetica-Bold", color: INK, lineHeight: 1.2 },
  sub: { fontSize: 10.5, color: INK3, marginTop: 5, lineHeight: 1.3 },
  logo: { width: 70, height: 30, objectFit: "contain" },
  badges: { flexDirection: "row", flexWrap: "wrap", marginBottom: 10 },
  badge: { fontSize: 8.5, fontFamily: "Helvetica-Bold", paddingVertical: 2.5, paddingHorizontal: 8, borderRadius: 8, marginRight: 5, marginBottom: 3, lineHeight: 1.2 },
  sec: { marginBottom: 13 },
  secH: { fontSize: 8, fontFamily: "Helvetica-Bold", color: INK3, letterSpacing: 1.5, borderBottomWidth: 0.75, borderBottomColor: LINE, paddingBottom: 3, marginBottom: 5, lineHeight: 1.2 },
  row: { flexDirection: "row", paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: "#eaeeec" },
  k: { width: 128, color: INK3, paddingRight: 8, fontSize: 10, lineHeight: 1.35 },
  v: { flex: 1, color: INK, fontSize: 10, lineHeight: 1.35 },
  para: { fontSize: 10, color: INK, lineHeight: 1.45 },
  tHead: { flexDirection: "row", backgroundColor: "#eef1ef", paddingVertical: 4, paddingHorizontal: 5, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  tHeadT: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#3b4a43", lineHeight: 1.2 },
  tRow: { flexDirection: "row", paddingVertical: 4, paddingHorizontal: 5, borderBottomWidth: 0.5, borderBottomColor: "#eaeeec" },
  strip: { flexDirection: "row", flexWrap: "wrap" },
  step: { fontSize: 8.5, lineHeight: 1.2, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 4, marginRight: 4, marginBottom: 4, borderWidth: 0.75 },
  images: { flexDirection: "row", flexWrap: "wrap" },
  imgBox: { marginRight: 10, marginBottom: 8, alignItems: "center" },
  img: { maxWidth: 240, maxHeight: 240, objectFit: "contain" },
  cap: { fontSize: 8, color: INK3, marginTop: 2, lineHeight: 1.2 },
  total: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6, paddingVertical: 7, paddingHorizontal: 10, backgroundColor: "#eaf4ee", borderWidth: 0.75, borderColor: "#c4dfce", borderRadius: 4 },
  totalK: { fontSize: 10.5, fontFamily: "Helvetica-Bold", color: INK, lineHeight: 1.2 },
  totalV: { fontSize: 15, fontFamily: "Helvetica-Bold", color: G, lineHeight: 1.2 },
  foot: { position: "absolute", left: 42, right: 42, bottom: 24, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: "#8a9690", borderTopWidth: 0.5, borderTopColor: LINE, paddingTop: 5 },
});

const STEP = {
  done: { backgroundColor: "#e3f3ea", borderColor: "#b9dcc8", color: "#14603d" },
  now: { backgroundColor: G, borderColor: G, color: "#ffffff" },
  todo: { backgroundColor: "#ffffff", borderColor: LINE, color: "#7c8883" },
};

function Section({ sec }) {
  return (
    <View style={S.sec}>
      {sec.heading ? <Txt style={S.secH} minPresenceAhead={72}>{pdfText(sec.heading).toUpperCase()}</Txt> : null}
      {sec.rows ? sec.rows.filter(([, v]) => v !== undefined && v !== null && String(v) !== "").map(([k, v], i) => (
        <View key={i} style={S.row} wrap={false}>
          <Txt style={S.k}>{pdfText(k)}</Txt>
          <Txt style={S.v}>{pdfText(v)}</Txt>
        </View>
      )) : null}
      {sec.text ? <Txt style={S.para}>{pdfText(sec.text)}</Txt> : null}
      {sec.table ? (
        <View>
          <View style={S.tHead} wrap={false}>
            {sec.table.head.map((h, i) => (
              <Txt key={i} style={[S.tHeadT, { flex: sec.table.flex?.[i] ?? 1, textAlign: sec.table.align?.[i] || "left" }]}>{pdfText(h)}</Txt>
            ))}
          </View>
          {sec.table.rows.map((row, r) => (
            <View key={r} style={S.tRow} wrap={false}>
              {row.map((cell, i) => (
                <Txt key={i} style={{ flex: sec.table.flex?.[i] ?? 1, textAlign: sec.table.align?.[i] || "left", fontSize: 10, lineHeight: 1.3 }}>{pdfText(cell)}</Txt>
              ))}
            </View>
          ))}
        </View>
      ) : null}
      {sec.strip ? (
        <View style={S.strip}>
          {sec.strip.map((s, i) => <Txt key={i} style={[S.step, STEP[s.state] || STEP.todo]}>{pdfText(s.label)}</Txt>)}
        </View>
      ) : null}
      {sec.images ? (
        <View style={S.images}>
          {sec.images.map((im, i) => (
            <View key={i} style={S.imgBox} wrap={false}>
              <Image src={im.dataUrl} style={S.img} />
              {im.caption ? <Txt style={S.cap}>{pdfText(im.caption)}</Txt> : null}
            </View>
          ))}
        </View>
      ) : null}
      {sec.total ? (
        <View style={S.total} wrap={false}>
          <Txt style={S.totalK}>{pdfText(sec.total.label)}</Txt>
          <Txt style={S.totalV}>{pdfText(sec.total.value)}</Txt>
        </View>
      ) : null}
    </View>
  );
}

/** The page footer every page of a snapshot carries. */
export function Footer({ kind, takenAt, by }) {
  return (
    <View style={S.foot} fixed>
      <Txt>{pdfText(`Kazi Manufacturing · ${kind} · a copy taken ${takenAt}${by ? ` by ${by}` : ""}`)}</Txt>
      <Txt render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

export function CardDoc({ kind, title, subtitle, badges = [], sections = [], logo, takenAt, by }) {
  return (
    <Document title={pdfText(`${kind} - ${title}`)} author="Kazi Manufacturing" creator="Kazi">
      <Page size="A4" style={S.page}>
        <View style={S.head}>
          <View style={S.headL}>
            <Txt style={S.kind}>{pdfText(kind).toUpperCase()}</Txt>
            <Txt style={S.title}>{pdfText(title)}</Txt>
            {subtitle ? <Txt style={S.sub}>{pdfText(subtitle)}</Txt> : null}
          </View>
          {logo ? <Image src={logo} style={S.logo} /> : null}
        </View>
        {badges.length > 0 && (
          <View style={S.badges}>
            {badges.map((b, i) => {
              const t = TONES[b.tone] || TONES.neutral;
              return <Txt key={i} style={[S.badge, { backgroundColor: t.bg, color: t.fg }]}>{pdfText(b.text)}</Txt>;
            })}
          </View>
        )}
        {sections.map((sec, i) => <Section key={i} sec={sec} />)}
        <Footer kind={kind} takenAt={takenAt} by={by} />
      </Page>
    </Document>
  );
}

/** Any element made of the pieces above (or react-pdf's own) as a File that can go into Chat. */
export async function pdfFile(element, name) {
  const blob = await pdf(element).toBlob();
  return new File([blob], name, { type: "application/pdf" });
}

export { Document, Page, View, Text, Image, StyleSheet, S as styles };
