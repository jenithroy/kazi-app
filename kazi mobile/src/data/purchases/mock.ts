import type { PurchaseEntry, PurchaseStatus } from './types';

export const STATUS: Record<PurchaseStatus, { label: string; dot: string; bg: string; fg: string; accent: string }> = {
  paid: { label: 'Paid', dot: '#22A97A', bg: '#E2F6EC', fg: '#0E5E43', accent: '#FFFFFF' },
  partial: { label: 'Partial', dot: '#B98514', bg: '#F7EEDA', fg: '#7A5709', accent: '#B98514' },
  unpaid: { label: 'Unpaid', dot: '#C0603C', bg: '#F8E7DF', fg: '#8E4327', accent: '#C0603C' },
};

export const SUPPLIERS = ['Sunrise Mills', 'Kathmandu Trims', 'Bagmati Knits', 'Print House KTM', 'Highland Yarn (UK)'];

/** @deprecated use `PURCHASE_BANKS` from `./types`. */
export const BANKS = ['Nabil Bank', 'Sanima Bank', 'NIC Asia', 'Global IME', 'Standard Chartered'];

/** Seeds carry the shared `finance_purchases` shape — multi-line, `EXP0NN` ids, ISO dates. */
export const seedEntries: PurchaseEntry[] = [
  {
    id: 'p1', expenseId: 'EXP184', party: 'Sunrise Mills', category: 'Raw Materials', paymentType: 'Bank', bankName: 'NIC Asia',
    date: '2026-08-23', vatBill: true, discountAmt: 0, status: 'unpaid', loggedBy: 'Prakash Thapa', grn: 'GRN-1188',
    items: [{ particulars: 'Anti-Grunge Cotton', quantity: 600, unit: 'm', rate: 310, amount: 186000 }],
    subtotalNPR: 186000, taxableAmt: 186000, vatAmountNPR: 24180, amountNPR: 210180,
  },
  {
    id: 'p2', expenseId: 'EXP183', party: 'Kathmandu Trims', category: 'Consumables', paymentType: 'Cash',
    date: '2026-08-23', vatBill: false, discountAmt: 0, status: 'paid', loggedBy: 'Prakash Thapa', grn: 'GRN-1187',
    items: [{ particulars: 'Recycled Poly Zips', quantity: 3000, unit: 'pcs', rate: 46, amount: 138000 }],
    subtotalNPR: 138000, taxableAmt: 138000, vatAmountNPR: 0, amountNPR: 138000,
  },
  {
    id: 'p3', expenseId: 'EXP182', party: 'Print House KTM', category: 'Consumables', paymentType: 'Cash',
    date: '2026-08-22', vatBill: false, discountAmt: 0, status: 'paid', loggedBy: 'Sita Rai', grn: 'GRN-1186',
    items: [{ particulars: 'Woven Care Labels', quantity: 20000, unit: 'pcs', rate: 3, amount: 60000 }],
    subtotalNPR: 60000, taxableAmt: 60000, vatAmountNPR: 0, amountNPR: 60000,
  },
  {
    id: 'p4', expenseId: 'EXP181', party: 'Bagmati Knits', category: 'Raw Materials', paymentType: 'Bank', bankName: 'Nabil Bank',
    date: '2026-08-21', vatBill: true, discountAmt: 12000, status: 'partial', loggedBy: 'Prakash Thapa', grn: 'GRN-1184',
    items: [
      { particulars: 'Terry Fleece · Ink', quantity: 1200, unit: 'm', rate: 540, amount: 648000 },
      { particulars: 'Ribbed Collar Tape', quantity: 800, unit: 'm', rate: 22, amount: 17600 },
    ],
    subtotalNPR: 665600, taxableAmt: 653600, vatAmountNPR: 84968, amountNPR: 738568,
  },
  {
    id: 'p5', expenseId: 'EXP180', party: 'Sunrise Mills', category: 'Raw Materials', paymentType: 'Bank', bankName: 'NIC Asia',
    date: '2026-08-20', vatBill: true, discountAmt: 0, status: 'paid', loggedBy: 'Prakash Thapa', grn: 'GRN-1181',
    items: [{ particulars: 'AP Cotton', quantity: 900, unit: 'm', rate: 268, amount: 241200 }],
    subtotalNPR: 241200, taxableAmt: 241200, vatAmountNPR: 31356, amountNPR: 272556,
  },
  {
    id: 'p6', expenseId: 'EXP179', party: 'Kathmandu Trims', category: 'Consumables', paymentType: 'Cash',
    date: '2026-08-19', vatBill: false, discountAmt: 0, status: 'unpaid', loggedBy: 'Sita Rai', grn: 'GRN-1179',
    items: [{ particulars: 'Ribbed Collar Tape', quantity: 4000, unit: 'm', rate: 22, amount: 88000 }],
    subtotalNPR: 88000, taxableAmt: 88000, vatAmountNPR: 0, amountNPR: 88000,
  },
  {
    id: 'p7', expenseId: 'EXP178', party: 'Highland Yarn (UK)', category: 'Raw Materials', paymentType: 'Bank', bankName: 'Standard Chartered',
    date: '2026-08-18', vatBill: true, discountAmt: 0, status: 'paid', loggedBy: 'Prakash Thapa', grn: 'GRN-1176',
    items: [{ particulars: 'Merino Jersey 19.5µ', quantity: 400, unit: 'm', rate: 1890, amount: 756000 }],
    subtotalNPR: 756000, taxableAmt: 756000, vatAmountNPR: 98280, amountNPR: 854280,
  },
];
