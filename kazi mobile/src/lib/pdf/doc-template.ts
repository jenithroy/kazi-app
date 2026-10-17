/**
 * The Kazi document sheet — a byte-for-byte port of the web ERP's `DocPreview`
 * (kazi-app `src/components/DocPreview.jsx`), which is what the website both
 * shows on screen and prints. Same A4 geometry (794×1123 at 96dpi), same
 * letterhead, same fonts, colours, column widths and copy.
 *
 * One HTML builder serves two consumers, so the preview and the PDF can never
 * drift: the in-app viewer (WebView) and `expo-print`.
 *
 * Field names deliberately match the live Postgres row shape rather
 * than the mobile models — the adapters in `doc-data.ts` convert.
 */

const G = '#1a5c1a';
const GB = '#bcdabc';
const GS = '#deeede';
const RED = '#c0392b';

export const COMPANY_PAN = '623583278';
export const COMPANY_NAME = 'Kazi Manufacturing Pvt. Ltd.';

export type DocType = 'invoice' | 'challan' | 'quotation';

export interface DocItem {
  description: string;
  qty: number | string;
  unit?: string;
  rate: number | string;
}

/** The live document shape the web template reads. */
export interface DocData {
  invoiceNumber?: string;
  challanNumber?: string;
  quotationNumber?: string;
  date?: string;
  dueDate?: string;
  validUntil?: string;
  fiscalYear?: string;
  clientName?: string;
  clientAddress?: string;
  clientPAN?: string;
  clientPhone?: string;
  currency?: string;
  items?: DocItem[];
  subtotalNPR?: number;
  discountPct?: number;
  discountAmtNPR?: number;
  discountMode?: string;
  taxableAmtNPR?: number;
  vatAmountNPR?: number;
  totalNPR?: number;
  amountPaid?: number;
  applyVAT?: boolean;
  paymentTerms?: string;
  relatedChallan?: string;
  relatedQuotation?: string;
  relatedInvoice?: string;
  vehicleNo?: string;
  driverName?: string;
  routeFrom?: string;
  routeTo?: string;
  transportDetails?: string;
  terms?: string;
  note?: string;
}

const TITLES: Record<DocType, string> = {
  invoice: 'Tax Invoice',
  challan: 'Challan / Delivery Note',
  quotation: 'Quotation',
};

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function roundAmount(n: unknown): number {
  const num = Number(n) || 0;
  return Math.sign(num) * Math.round(Math.abs(num));
}

/**
 * Indian digit grouping (1,71,810) for NPR, plain thousands for GBP — written
 * out rather than left to `Intl`, so the sheet groups identically on every
 * JS engine the app might run on.
 */
function group(n: number, decimals: number, currency: string): string {
  const neg = n < 0;
  const fixed = Math.abs(n).toFixed(decimals);
  const [intPart, dec] = fixed.split('.');
  let grouped: string;
  if (currency === 'GBP') {
    grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  } else {
    const last3 = intPart.slice(-3);
    const rest = intPart.slice(0, -3);
    grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
  }
  return `${neg ? '−' : ''}${grouped}${dec ? `.${dec}` : ''}`;
}

/** `NPR 1,71,810.00` / `£1,710.00` — two decimals, as on every line and total row. */
export function fmtCurrencyExact(n: number, currency = 'NPR'): string {
  const v = Number.isFinite(n) ? n : 0;
  return currency === 'GBP' ? `£${group(v, 2, 'GBP')}` : `NPR ${group(v, 2, 'NPR')}`;
}

/** Grand total: rupees are rounded to whole units (IRD), pounds keep pence. */
export function fmtCurrency(n: number, currency = 'NPR'): string {
  const v = Number.isFinite(n) ? n : 0;
  return currency === 'GBP' ? `£${group(v, 2, 'GBP')}` : `NPR ${group(roundAmount(v), 0, 'NPR')}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtDate(s?: string): string {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  if (!y || !m || !d) return s;
  return `${parseInt(d, 10)} ${MONTHS[parseInt(m, 10) - 1]} ${y}`;
}

/** Amount in words, Indian system for NPR and short scale for GBP. */
export function numWords(value: number, currency = 'NPR'): string {
  const num = Math.round(value * 100) / 100;
  const intPart = Math.floor(num);
  const decPart = Math.round((num - intPart) * 100);
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const h = (n: number): string => {
    if (n === 0) return '';
    if (n < 20) return `${ones[n]} `;
    if (n < 100) return `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ''} `;
    return `${ones[Math.floor(n / 100)]} Hundred ${h(n % 100)}`;
  };

  if (currency === 'GBP') {
    if (intPart === 0 && decPart === 0) return 'Zero Pounds Only';
    let r = '';
    let tmp = intPart;
    if (tmp >= 1000000) { r += `${h(Math.floor(tmp / 1000000))}Million `; tmp %= 1000000; }
    if (tmp >= 1000) { r += `${h(Math.floor(tmp / 1000))}Thousand `; tmp %= 1000; }
    if (tmp > 0) r += h(tmp);
    let res = `Pounds ${r.trim()}`;
    if (decPart > 0) res += ` and ${h(decPart).trim()} Pence`;
    return `${res.trim()} Only`;
  }

  if (intPart === 0 && decPart === 0) return 'Zero Only';
  let r = '';
  let tmp = intPart;
  if (tmp >= 10000000) { r += `${h(Math.floor(tmp / 10000000))}Crore `; tmp %= 10000000; }
  if (tmp >= 100000) { r += `${h(Math.floor(tmp / 100000))}Lakh `; tmp %= 100000; }
  if (tmp >= 1000) { r += `${h(Math.floor(tmp / 1000))}Thousand `; tmp %= 1000; }
  if (tmp > 0) r += h(tmp);
  r = r.trim();
  if (decPart > 0) r += ` and ${h(decPart).trim()} Paisa`;
  return `Rupees ${r.trim()} Only`;
}

/**
 * Line descriptions carry hand-written structure — newlines, `•` bullets,
 * `Label:` prefixes and `**bold**`. The web renders all four; so does this.
 */
function formatDescription(desc?: string): string {
  if (!desc) return '—';

  let normalized = desc;
  if (!normalized.includes('\n') && normalized.includes('•')) {
    const segments = normalized.split(/\s*•\s*/);
    if (segments.length > 1) {
      normalized = segments.map((seg, idx) => (idx === 0 ? seg : `• ${seg}`)).join('\n');
    }
  }

  const bold = (text: string) =>
    text
      .split(/\*\*([^*]+)\*\*/g)
      .map((part, i) => (i % 2 === 1 ? `<strong style="font-weight:700;color:#111">${esc(part)}</strong>` : esc(part)))
      .join('');

  const lines = normalized.split('\n').map((line) => {
    const indent = /^(\s+)/.exec(line)?.[1].length ?? 0;
    const trimmed = line.trim();
    if (!trimmed) return '<div style="height:6px"></div>';

    const bulletMatch = /^([•\-*])\s*(.*)/.exec(trimmed);
    const bullet = bulletMatch ? bulletMatch[1] : null;
    const content = bulletMatch ? bulletMatch[2] : trimmed;

    const colonMatch = /^([A-Za-z0-9\s&/]+:)\s*(.*)/.exec(content);
    const label = colonMatch ? colonMatch[1] : null;
    const main = colonMatch ? colonMatch[2] : content;

    const paddingLeft = indent * 8 + (bullet ? 12 : 0);
    return `<div style="display:flex;align-items:flex-start;padding-left:${paddingLeft}px;line-height:1.45;font-size:11px;color:#333;text-align:left">${
      bullet
        ? `<span style="margin-right:6px;color:${G};font-weight:bold;display:inline-block;width:8px;text-align:center">${esc(bullet)}</span>`
        : ''
    }<span style="flex:1">${
      label ? `<strong style="font-weight:700;color:#111;margin-right:4px">${esc(label)}</strong>` : ''
    }${bold(main)}</span></div>`;
  });

  return `<div style="display:flex;flex-direction:column;gap:4px;padding:2px 0">${lines.join('')}</div>`;
}

function metaRowsFor(data: DocData, docType: DocType, title: string): [string, string][] {
  const docNum = data.invoiceNumber || data.challanNumber || data.quotationNumber || '—';
  const rows: [string, string][] = [[`${title.split(' ')[0]} No.`, docNum]];
  if (data.fiscalYear) rows.push(['Fiscal Year (B.S.)', data.fiscalYear]);

  if (docType === 'invoice') {
    if (data.relatedChallan) rows.push(['Challan Ref', data.relatedChallan]);
    if (data.relatedQuotation) rows.push(['Quotation Ref', data.relatedQuotation]);
    rows.push(['Invoice Date', fmtDate(data.date)]);
    rows.push(['Due Date', fmtDate(data.dueDate)]);
    rows.push(['Payment Terms', data.paymentTerms || 'Net 30']);
    rows.push(['Supplier PAN', COMPANY_PAN]);
  } else if (docType === 'challan') {
    if (data.relatedInvoice) rows.push(['Invoice Ref', data.relatedInvoice]);
    if (data.relatedQuotation) rows.push(['Quotation Ref', data.relatedQuotation]);
    rows.push(['Date', fmtDate(data.date)]);
    if (data.vehicleNo) rows.push(['Vehicle No.', data.vehicleNo]);
    if (data.driverName) rows.push(['Driver', data.driverName]);
    if (data.routeFrom) rows.push(['From', data.routeFrom]);
    if (data.routeTo) rows.push(['To', data.routeTo]);
    if (!data.vehicleNo && data.transportDetails) rows.push(['Transport', data.transportDetails]);
  } else {
    if (data.relatedInvoice) rows.push(['Invoice Ref', data.relatedInvoice]);
    rows.push(['Date', fmtDate(data.date)]);
    rows.push(['Valid Until', fmtDate(data.validUntil)]);
  }
  return rows;
}

export interface DocHtmlOptions {
  /** `data:image/jpeg;base64,…` letterhead. Omitted → plain white page. */
  letterhead?: string;
  /** Screen viewer only: lets the page be pinch-zoomed and centres it on grey. */
  forScreen?: boolean;
  /**
   * Screen viewer only: how much of the 794px sheet fits the device, so the
   * document opens showing the whole page instead of the top-left corner.
   */
  screenScale?: number;
}

/** The A4 sheet itself, without the surrounding document/viewport chrome. */
export function buildDocPage(data: DocData, docType: DocType, letterhead?: string): string {
  const title = TITLES[docType] ?? 'Document';
  const currency = data.currency || 'NPR';
  const items = (data.items ?? []).filter((it) => it.description || Number(it.rate) > 0);
  const subtotal = data.subtotalNPR || 0;
  const discountAmt = data.discountAmtNPR || 0;
  const discountPct = data.discountPct || 0;
  const discountLabel = data.discountMode === 'amount' ? 'Discount' : `Discount (${discountPct}%)`;
  const taxableAmt = data.taxableAmtNPR != null ? data.taxableAmtNPR : subtotal - discountAmt;
  const vatAmt = data.vatAmountNPR || 0;
  const totalAmt = data.totalNPR || 0;
  const amountPaid = data.amountPaid || 0;
  const creditDue = Math.max(0, totalAmt - amountPaid);
  const showVAT = docType === 'invoice' && !!data.applyVAT;
  const showDiscount = discountAmt > 0;
  const wordsTotal = totalAmt > 0 ? numWords(roundAmount(totalAmt), currency) : '—';

  const th = `background:${G};color:#fff;padding:6px 8px;font-size:10px;font-weight:700;text-transform:uppercase`;
  const td = `padding:5.5px 8px;border-bottom:1px solid ${GS};color:#333`;
  const totRow = `display:flex;justify-content:space-between;padding:3.5px 0;border-bottom:1px solid ${GS};font-size:11.5px`;

  const rows = items.length
    ? items
        .map(
          (it, i) => `<tr style="background:${i % 2 === 1 ? 'rgba(26,92,26,0.025)' : 'transparent'}">
        <td style="${td}">${i + 1}</td>
        <td style="${td}">${formatDescription(it.description)}</td>
        <td style="${td};text-align:center">${Number(it.qty) % 1 === 0 ? esc(it.qty) : Number(it.qty).toFixed(2)}</td>
        <td style="${td};text-align:center">${esc(it.unit || 'Pcs')}</td>
        <td style="${td};text-align:right">${fmtCurrencyExact(Number(it.rate || 0), currency)}</td>
        <td style="${td};text-align:right">${fmtCurrencyExact(Number(it.qty || 0) * Number(it.rate || 0), currency)}</td>
      </tr>`,
        )
        .join('')
    : `<tr><td colspan="6" style="${td};color:#999;text-align:center">No items</td></tr>`;

  const meta = metaRowsFor(data, docType, title)
    .map(
      ([label, value]) => `<div style="margin-bottom:4px">
        <div style="font-size:9px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:0.4px">${esc(label)}</div>
        <div style="font-size:12px;color:#222;font-weight:500">${esc(value) || '—'}</div>
      </div>`,
    )
    .join('');

  return `<div class="invoice-page" style="width:794px;min-height:1123px;margin:0 auto;position:relative;${
    letterhead ? `background-image:url('${letterhead}');background-size:100% 100%;background-repeat:no-repeat;` : 'background:#fff;'
  }box-shadow:0 6px 28px rgba(0,0,0,0.25);flex-shrink:0;font-family:'Segoe UI',Arial,sans-serif">
  <div style="position:absolute;top:150px;left:50px;right:50px;bottom:118px;display:flex;flex-direction:column;overflow:hidden">

    <div style="text-align:center;margin-bottom:10px">
      <h2 style="display:inline-block;font-size:16px;font-weight:800;color:${G};letter-spacing:5px;text-transform:uppercase;border-bottom:2.5px solid ${G};padding-bottom:5px">${esc(title)}</h2>
      ${
        docType === 'invoice'
          ? `<div style="font-size:10px;color:#555;margin-top:3px">PAN / VAT Reg. No.: <strong style="color:${G}">${COMPANY_PAN}</strong> &nbsp;|&nbsp; ${COMPANY_NAME}</div>`
          : ''
      }
    </div>

    <div style="display:flex;justify-content:space-between;gap:20px;margin-bottom:12px">
      <div style="flex:1">
        <div style="font-size:9.5px;font-weight:800;color:${G};text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid ${GB};padding-bottom:3px;margin-bottom:5px">Bill To</div>
        <div style="font-size:13.5px;font-weight:700;color:#111;margin-bottom:2px">${esc(data.clientName) || '—'}</div>
        ${data.clientAddress ? `<div style="font-size:11px;color:#555;line-height:1.55;white-space:pre-wrap">${esc(data.clientAddress)}</div>` : ''}
        ${data.clientPAN ? `<div style="font-size:11px;color:#555">PAN: ${esc(data.clientPAN)}</div>` : ''}
        ${data.clientPhone ? `<div style="font-size:11px;color:#555">Tel: ${esc(data.clientPhone)}</div>` : ''}
      </div>
      <div style="text-align:right;min-width:200px">${meta}</div>
    </div>

    <hr style="border:none;border-top:1px solid ${GB};margin-bottom:10px" />

    <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:8px">
      <thead>
        <tr>
          <th style="${th};width:26px">#</th>
          <th style="${th};text-align:left">Description</th>
          <th style="${th};text-align:center;width:42px">Qty</th>
          <th style="${th};text-align:center;width:52px">Unit</th>
          <th style="${th};text-align:right;width:92px">Rate (${esc(currency)})</th>
          <th style="${th};text-align:right;width:92px">Amount (${esc(currency)})</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div style="display:flex;justify-content:flex-end;margin-bottom:9px">
      <div style="width:270px">
        <div style="${totRow}"><span style="color:#555">Subtotal</span><span style="font-weight:600;color:#333">${fmtCurrencyExact(subtotal, currency)}</span></div>
        ${
          showDiscount
            ? `<div style="${totRow}"><span style="color:${RED}">${esc(discountLabel)}</span><span style="font-weight:600;color:${RED}">− ${fmtCurrencyExact(discountAmt, currency)}</span></div>
               <div style="${totRow}"><span style="color:#555">Taxable Amount</span><span style="font-weight:600;color:#333">${fmtCurrencyExact(taxableAmt, currency)}</span></div>`
            : ''
        }
        ${
          showVAT
            ? `<div style="${totRow}"><span style="color:#555">VAT @ 13% (Nepal IRD)</span><span style="font-weight:600;color:#333">${fmtCurrencyExact(vatAmt, currency)}</span></div>`
            : ''
        }
        <div style="display:flex;justify-content:space-between;padding:5px 0;font-size:13px;font-weight:800;border-top:2px solid ${G};border-bottom:2px solid ${G};margin-top:2px">
          <span style="color:${G}">Grand Total</span><span style="color:${G}">${fmtCurrency(totalAmt, currency)}</span>
        </div>
        ${
          docType === 'invoice' && amountPaid > 0
            ? `<div style="${totRow};font-size:11px;margin-top:3px"><span style="color:${G}">Amount Paid</span><span style="font-weight:600;color:${G}">${fmtCurrencyExact(amountPaid, currency)}</span></div>
               <div style="display:flex;justify-content:space-between;padding:3.5px 0;font-size:11.5px;font-weight:800"><span style="color:${creditDue > 0 ? RED : G}">Credit Balance Due</span><span style="color:${creditDue > 0 ? RED : G}">${fmtCurrencyExact(creditDue, currency)}</span></div>`
            : ''
        }
      </div>
    </div>

    <div style="background:rgba(26,92,26,0.04);border:1px solid #c4dac4;border-radius:3px;padding:6px 10px;margin-bottom:9px">
      <div style="font-size:9px;font-weight:800;color:${G};text-transform:uppercase;letter-spacing:0.5px">Amount in Words</div>
      <div style="font-size:11px;color:#333;font-weight:600;margin-top:2px">${esc(wordsTotal)}</div>
    </div>

    ${
      docType === 'quotation' && data.terms
        ? `<div style="margin-bottom:9px">
             <div style="font-size:9px;font-weight:800;color:#777;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px">Terms &amp; Conditions</div>
             <div style="font-size:10.5px;color:#555;white-space:pre-wrap;line-height:1.5">${esc(data.terms)}</div>
           </div>`
        : ''
    }

    ${
      data.note
        ? `<div style="margin-bottom:9px">
             <div style="font-size:9px;font-weight:800;color:#777;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px">Notes / Payment Instructions</div>
             <div style="font-size:10.5px;color:#555;white-space:pre-wrap;line-height:1.5">${esc(data.note)}</div>
           </div>`
        : ''
    }

    ${
      docType === 'invoice'
        ? `<div style="font-size:9px;color:#888;text-align:center;margin-bottom:6px">This is a computer-generated tax invoice as per Nepal VAT Act, 2052. PAN: ${COMPANY_PAN}</div>`
        : ''
    }

    <div style="margin-top:auto;display:flex;justify-content:space-between;padding-top:8px">
      <div style="text-align:center;width:165px">
        <div style="height:36px"></div>
        <div style="border-top:1px solid #555;margin-bottom:4px"></div>
        <div style="font-size:10px;color:#444;font-weight:600">Received By</div>
        <div style="font-size:9px;color:#888;margin-top:1px">Name &amp; Stamp</div>
      </div>
      <div style="text-align:center;width:165px">
        <div style="height:36px"></div>
        <div style="border-top:1px solid #555;margin-bottom:4px"></div>
        <div style="font-size:10px;color:#444;font-weight:600">Authorized Signature</div>
        <div style="font-size:9px;color:#888;margin-top:1px">Kazi Manufacturing Pvt. Ltd.</div>
      </div>
    </div>

  </div>
</div>`;
}

/**
 * Full HTML document.
 * `forScreen` wraps the sheet for the in-app viewer: grey ground, pinch-zoom
 * allowed, and an initial scale that fits the 794px sheet to the phone.
 * Otherwise it is print geometry — A4, zero margin — for `expo-print`.
 */
export function buildDocHtml(data: DocData, docType: DocType, options: DocHtmlOptions = {}): string {
  const { letterhead, forScreen, screenScale } = options;
  const page = buildDocPage(data, docType, letterhead);
  const fit = Math.min(1, Math.max(0.1, screenScale ?? 0.45));
  const viewport = forScreen
    ? `<meta name="viewport" content="width=794, initial-scale=${fit.toFixed(3)}, minimum-scale=${(fit * 0.75).toFixed(3)}, maximum-scale=5, user-scalable=yes" />`
    : '';
  const bodyStyle = forScreen
    ? 'background:#d4e2d4;padding:14px 0;margin:0'
    : 'background:#fff;margin:0';

  return `<!DOCTYPE html><html><head><meta charset="utf-8" />${viewport}<style>
@page { margin: 0; size: A4 portrait; }
* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', Arial, sans-serif; ${bodyStyle}; }
h2 { font-size: 16px; }
</style></head><body>${page}</body></html>`;
}
