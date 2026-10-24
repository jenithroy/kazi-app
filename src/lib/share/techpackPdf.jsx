/**
 * A tech pack as one PDF: the garment specification sheet first (style, measurements, sketches, fabrics, trims, wash care, remarks:
 * what components/inventory/TechPackLegacy.jsx `TechPackSpecPreview` shows), then every page picture of the pack, one to a sheet,
 * turned to the way round the picture is. It imports the PDF maker, so it is only ever loaded when a tech pack is being sent.
 */
import { Document, Image, Page, StyleSheet, View } from "@react-pdf/renderer";
import { Footer, Txt } from "./pdfKit";
import { pdfText } from "./helpers";

const G = "#1f6e4c";
const INK = "#0a1c14";
const INK3 = "#5b6a62";
const LINE = "#c9d2ce";

const S = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 54, paddingHorizontal: 40, fontFamily: "Helvetica", fontSize: 9.5, color: INK },
  head: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", borderBottomWidth: 2, borderBottomColor: G, paddingBottom: 9, marginBottom: 12 },
  kind: { fontSize: 8, fontFamily: "Helvetica-Bold", color: G, letterSpacing: 2, marginBottom: 3, lineHeight: 1.2 },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", lineHeight: 1.2 },
  sub: { fontSize: 10, color: INK3, marginTop: 4, lineHeight: 1.3 },
  logo: { width: 66, height: 28, objectFit: "contain" },
  box: { borderWidth: 1, borderColor: INK },
  r: { flexDirection: "row" },
  lbl: { width: "20%", padding: 5, fontSize: 9.5, lineHeight: 1.3, fontFamily: "Helvetica-Bold", backgroundColor: "#f1f3f2", borderRightWidth: 1, borderBottomWidth: 1, borderColor: LINE },
  val: { width: "30%", padding: 5, fontSize: 9.5, lineHeight: 1.3, borderRightWidth: 1, borderBottomWidth: 1, borderColor: LINE },
  valWide: { width: "80%", padding: 5, fontSize: 9.5, lineHeight: 1.3, borderBottomWidth: 1, borderColor: LINE },
  lbl2: { width: "27%", padding: 5, fontSize: 9.5, lineHeight: 1.3, fontFamily: "Helvetica-Bold", backgroundColor: "#f1f3f2", borderRightWidth: 1, borderBottomWidth: 1, borderColor: LINE },
  val2: { width: "73%", padding: 5, fontSize: 9.5, lineHeight: 1.3, borderBottomWidth: 1, borderColor: LINE },
  split: { flexDirection: "row", borderTopWidth: 0 },
  mCol: { width: "34%", borderRightWidth: 1, borderColor: LINE },
  mHead: { flexDirection: "row", backgroundColor: "#f1f3f2", borderBottomWidth: 1, borderColor: LINE },
  mRow: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#e4e9e6" },
  mC1: { width: "16%", padding: 3, fontSize: 8.5, lineHeight: 1.25 },
  mC2: { width: "60%", padding: 3, fontSize: 8.5, lineHeight: 1.25 },
  mC3: { width: "24%", padding: 3, fontSize: 8.5, lineHeight: 1.25, textAlign: "right" },
  mHeadT: { fontSize: 8, fontFamily: "Helvetica-Bold", lineHeight: 1.25 },
  sketches: { width: "66%", flexDirection: "row", padding: 8 },
  sk: { flex: 1, alignItems: "center", paddingHorizontal: 4 },
  skT: { fontSize: 8.5, fontFamily: "Helvetica-Bold", marginBottom: 3, lineHeight: 1.2 },
  skImg: { maxWidth: "100%", maxHeight: 210, objectFit: "contain" },
  skNone: { fontSize: 8.5, color: INK3, marginTop: 40 },
  fabric: { marginBottom: 3, fontSize: 9.5, lineHeight: 1.3 },
  pageFull: { padding: 22, paddingBottom: 44, alignItems: "center", justifyContent: "center" },
  pageImg: { objectFit: "contain", maxWidth: "100%", maxHeight: "100%" },
});

const dash = (v) => (v === undefined || v === null || String(v).trim() === "" ? "-" : pdfText(v));

export default function TechPackDoc({ item, pages, front, back, logo, takenAt, by }) {
  const measurements = Array.isArray(item.measurements) ? item.measurements.filter((m) => m && (m.label || m.inch)) : [];
  const fabricRows = Array.isArray(item.fabricRows) ? item.fabricRows.filter((r) => r && (r.fabricName || r.description)) : [];
  const sizes = Array.isArray(item.sizes_available) ? item.sizes_available.join(", ") : "";
  const colours = Array.isArray(item.available_colors) ? item.available_colors.map((c) => (typeof c === "string" ? c : c?.name)).filter(Boolean).join(", ") : "";
  const hasSpec = Boolean(item.styleNo || measurements.length || fabricRows.length || item.trims || item.washCare || item.remarks || front || back);
  const subtitle = [item.styleNo && `Style ${item.styleNo}`, item.product_type, item.market, item.season].filter(Boolean).join(" · ");

  return (
    <Document title={pdfText(`Tech pack - ${item.name || ""}`)} author="Kazi Manufacturing" creator="Kazi">
      {hasSpec && (
        <Page size="A4" style={S.page}>
          <View style={S.head}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Txt style={S.kind}>TECH PACK · GARMENT SPECIFICATION</Txt>
              <Txt style={S.title}>{pdfText(item.name || "Tech pack")}</Txt>
              {subtitle ? <Txt style={S.sub}>{pdfText(subtitle)}</Txt> : null}
            </View>
            {logo ? <Image src={logo} style={S.logo} /> : null}
          </View>

          <View style={S.box}>
            <View style={S.r}><Txt style={S.lbl}>Style No.</Txt><Txt style={S.val}>{dash(item.styleNo)}</Txt><Txt style={S.lbl}>Date</Txt><Txt style={S.val}>{dash(item.specDate)}</Txt></View>
            <View style={S.r}><Txt style={S.lbl}>Category</Txt><Txt style={S.val}>{dash(item.category)}</Txt><Txt style={S.lbl}>Size</Txt><Txt style={S.val}>{dash(item.specSize)}</Txt></View>
            <View style={S.r}><Txt style={S.lbl}>Season</Txt><Txt style={S.val}>{dash(item.season)}</Txt><Txt style={S.lbl}>Designer</Txt><Txt style={S.val}>{dash(item.designerName)}</Txt></View>
            <View style={S.r}><Txt style={S.lbl}>Garment</Txt><Txt style={S.valWide}>{dash(item.name)}{item.market ? `  (${pdfText(item.market)})` : ""}</Txt></View>
            {(sizes || colours) ? (
              <View style={S.r}>
                <Txt style={S.lbl}>Sizes</Txt><Txt style={S.val}>{dash(sizes)}</Txt><Txt style={S.lbl}>Colours</Txt><Txt style={S.val}>{dash(colours)}</Txt>
              </View>
            ) : null}
          </View>

          <View style={[S.box, S.split]}>
            <View style={S.mCol}>
              <View style={S.mHead}><Txt style={[S.mC1, S.mHeadT]}>No.</Txt><Txt style={[S.mC2, S.mHeadT]}>Measurement</Txt><Txt style={[S.mC3, S.mHeadT]}>Inch</Txt></View>
              {measurements.length === 0 && <View style={S.mRow}><Txt style={[S.mC2, { width: "100%", color: INK3 }]}>No points entered</Txt></View>}
              {measurements.map((m, i) => (
                <View key={i} style={S.mRow} wrap={false}><Txt style={S.mC1}>{i + 1}</Txt><Txt style={S.mC2}>{dash(m.label)}</Txt><Txt style={S.mC3}>{dash(m.inch)}</Txt></View>
              ))}
            </View>
            <View style={S.sketches}>
              <View style={S.sk}>
                <Txt style={S.skT}>Front</Txt>
                {front ? <Image src={front.dataUrl} style={S.skImg} /> : <Txt style={S.skNone}>No sketch</Txt>}
              </View>
              <View style={S.sk}>
                <Txt style={S.skT}>Back</Txt>
                {back ? <Image src={back.dataUrl} style={S.skImg} /> : <Txt style={S.skNone}>No sketch</Txt>}
              </View>
            </View>
          </View>

          <View style={[S.box, { borderTopWidth: 0 }]}>
            <View style={S.r} wrap={false}><Txt style={S.lbl2}>Wash care</Txt><Txt style={S.val2}>{dash(item.washCare)}</Txt></View>
            <View style={S.r}>
              <Txt style={S.lbl2}>Fabrics / linings</Txt>
              <View style={S.val2}>
                {fabricRows.length === 0 ? <Txt>-</Txt> : fabricRows.map((r, i) => (
                  <Txt key={i} style={S.fabric}><Txt style={{ fontFamily: "Helvetica-Bold" }}>{pdfText(r.fabricName || `Fabric ${i + 1}`)}: </Txt>{dash(r.description)}</Txt>
                ))}
              </View>
            </View>
            <View style={S.r} wrap={false}><Txt style={S.lbl2}>Trims and accessories</Txt><Txt style={S.val2}>{dash(item.trims)}</Txt></View>
            <View style={S.r} wrap={false}><Txt style={S.lbl2}>Remarks</Txt><Txt style={S.val2}>{dash(item.remarks)}</Txt></View>
            {item.notes ? <View style={S.r}><Txt style={S.lbl2}>Notes</Txt><Txt style={S.val2}>{pdfText(item.notes)}</Txt></View> : null}
          </View>
          <Footer kind="Tech pack" takenAt={takenAt} by={by} />
        </Page>
      )}

      {pages.map((p, i) => (
        <Page key={i} size="A4" orientation={p.width > p.height ? "landscape" : "portrait"} style={[S.page, S.pageFull]}>
          <Image src={p.dataUrl} style={S.pageImg} />
          <Footer kind={`Tech pack · ${item.name || ""} · page ${i + 1} of ${pages.length}`} takenAt={takenAt} by={by} />
        </Page>
      ))}
    </Document>
  );
}
