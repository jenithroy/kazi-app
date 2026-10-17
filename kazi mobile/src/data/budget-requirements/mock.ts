import type { BudgetCategory, BudgetRequest, Category, Priority, RequestStatus, Requirement, ReviewStatus } from './types';

export const STATUS: Record<RequestStatus, { label: string; dot: string; bg: string; fg: string; accent: string }> = {
  pending: { label: 'Pending', dot: '#B98514', bg: '#F7EEDA', fg: '#7A5709', accent: '#B98514' },
  approved: { label: 'Approved', dot: '#22A97A', bg: '#E2F6EC', fg: '#0E5E43', accent: '#FFFFFF' },
  declined: { label: 'Declined', dot: '#C0603C', bg: '#F8E7DF', fg: '#8E4327', accent: '#C0603C' },
};

export const PRIORITY: Record<Priority, { rank: number; hue: string }> = {
  Low: { rank: 1, hue: '#8A9A92' },
  Medium: { rank: 2, hue: '#B98514' },
  High: { rank: 3, hue: '#C0603C' },
};

export const CATEGORY: Record<Category, { mark: string; bg: string; fg: string }> = {
  'Raw Materials': { mark: '#B98514', bg: '#F7EEDA', fg: '#7A5709' },
  Tools: { mark: '#147A57', bg: '#E2F6EC', fg: '#0E5E43' },
  Machinery: { mark: '#0D1F19', bg: '#E9EFEC', fg: '#147A57' },
  Equipment: { mark: '#147A57', bg: '#E2F6EC', fg: '#0E5E43' },
  'Office Supplies': { mark: '#8A9A92', bg: '#F1EEE5', fg: '#5B6C64' },
  'Safety Equipment': { mark: '#8E4327', bg: '#F8E7DF', fg: '#8E4327' },
  Other: { mark: '#3C6E9E', bg: '#E6EEF6', fg: '#2C4E70' },
};

export const CAP = 800000;

// ---- Budget Requests tab (item 17) ----

export const BUDGET_CATEGORIES: BudgetCategory[] = ['Equipment', 'Materials', 'Services', 'Training', 'Travel', 'Other'];

export const BUDGET_CATEGORY: Record<BudgetCategory, { mark: string; bg: string; fg: string }> = {
  Equipment: { mark: '#147A57', bg: '#E2F6EC', fg: '#0E5E43' },
  Materials: { mark: '#B98514', bg: '#F7EEDA', fg: '#7A5709' },
  Services: { mark: '#0D1F19', bg: '#E9EFEC', fg: '#147A57' },
  Training: { mark: '#3C6E9E', bg: '#E6EEF6', fg: '#2C4E70' },
  Travel: { mark: '#8E4327', bg: '#F8E7DF', fg: '#8E4327' },
  Other: { mark: '#8A9A92', bg: '#F1EEE5', fg: '#5B6C64' },
};

/** Review-state pill colours, shared by the Budget Requests tab (Requirements uses `STATUS`). */
export const REVIEW_STATUS: Record<ReviewStatus, { label: string; dot: string; bg: string; fg: string; accent: string }> = {
  Pending: { label: 'Pending', dot: '#B98514', bg: '#F7EEDA', fg: '#7A5709', accent: '#B98514' },
  Approved: { label: 'Approved', dot: '#22A97A', bg: '#E2F6EC', fg: '#0E5E43', accent: '#22A97A' },
  Rejected: { label: 'Rejected', dot: '#C0603C', bg: '#F8E7DF', fg: '#8E4327', accent: '#C0603C' },
};

export const seedBudgetRequests: BudgetRequest[] = [
  { id: 'b1', ref: 'BR-0042', title: 'Reconditioned Juki bartack (spare)', category: 'Equipment', amountGBP: 1450, amountNPR: 290000, urgency: 'High', status: 'Pending', justification: 'A backup bartack head so a breakdown on Line 2 is a swap, not a three-day rental. Quote from the Balaju vendor attached.', requestedBy: 'Ramesh B.', requestedByRole: 'Nepal ops', date: '23 Aug' },
  { id: 'b2', ref: 'BR-0041', title: 'AW26 buyer trip — Leeds', category: 'Travel', amountGBP: 2200, amountNPR: 440000, urgency: 'Medium', status: 'Pending', justification: 'Two people, four days, to sit the Northfield and Halden fittings before the bulk cut is locked. Flights rise sharply after this week.', requestedBy: 'Sunam D.', requestedByRole: 'Accounts', date: '22 Aug' },
  { id: 'b3', ref: 'BR-0040', title: 'Line-supervisor lean training', category: 'Training', amountGBP: 900, amountNPR: 180000, urgency: 'Low', status: 'Pending', justification: 'Three supervisors on a two-day changeover-reduction course. Aim is to cut style-change downtime on the sewing floor.', requestedBy: 'Anita K.', requestedByRole: 'Nepal ops', date: '21 Aug' },
  { id: 'b4', ref: 'BR-0039', title: 'Annual accounting software renewal', category: 'Services', amountGBP: 620, amountNPR: 124000, urgency: 'Medium', status: 'Approved', justification: 'IRD-compliant VAT return module — renewal is due before the Bhadra filing.', requestedBy: 'Sunam D.', requestedByRole: 'Accounts', reviewedBy: 'J. Roy · UK', date: '19 Aug' },
  { id: 'b5', ref: 'BR-0038', title: 'Fabric inspection light booth', category: 'Equipment', amountGBP: 1780, amountNPR: 356000, urgency: 'Medium', status: 'Approved', justification: 'D65 booth for shade approval — buyers are rejecting on colour that looks fine under our current tubes.', requestedBy: 'Sita R.', requestedByRole: 'Nepal ops', reviewedBy: 'J. Roy · UK', date: '16 Aug' },
  { id: 'b6', ref: 'BR-0037', title: 'Courier account — sample dispatch', category: 'Services', amountGBP: 340, amountNPR: 68000, urgency: 'Low', status: 'Rejected', justification: 'Standing DHL account for weekly sample sends.', requestedBy: 'Ramesh B.', requestedByRole: 'Nepal ops', reviewedBy: 'J. Roy · UK', date: '14 Aug' },
];

export const seedRequirements: Requirement[] = [
  { id: 'r1', ref: 'REQ-0184', item: 'Bartack machine head', cat: 'Machinery', quantity: '1 head', amount: 245000, amountGBP: 1225, priority: 'High', status: 'pending', who: 'Ramesh B.', init: 'RB', team: 'Line 2 · Sewing', date: '23 Aug', by: 'This week', quote: 'Not attached', note: 'Line 2 bartack has been down since Thursday. We are renting a head at रु 4,800/day, so the buy pays for itself in eight weeks. Vendor holds one in stock in Balaju.' },
  { id: 'r2', ref: 'REQ-0183', item: 'Cutting table LED strips', cat: 'Tools', quantity: '6 strips', amount: 38500, amountGBP: 193, priority: 'Medium', status: 'pending', who: 'Sita R.', init: 'SR', team: 'Cutting', date: '23 Aug', by: 'This month', quote: 'PDF · 23 Aug', note: 'Two of the six bays are lit by a single tube. Cutters are marking by phone torch on dark fabric, which is showing up as QC notches on the AW26 fleece.' },
  { id: 'r3', ref: 'REQ-0182', item: 'Fusible interlining · 400 m', cat: 'Raw Materials', quantity: '400 m', amount: 92000, amountGBP: 460, priority: 'High', status: 'pending', who: 'Prakash T.', init: 'PT', team: 'Store', date: '22 Aug', by: 'This week', quote: 'PDF · 22 Aug', note: 'Collar fusing for PO-2291 needs 380 m and we hold 60 m. Without it the hoodie order stops at collar stage on Tuesday.' },
  { id: 'r4', ref: 'REQ-0181', item: 'Needle stock · DBx1 #11', cat: 'Raw Materials', quantity: '20 boxes', amount: 14200, amountGBP: 71, priority: 'Low', status: 'approved', who: 'Bindu S.', init: 'BS', team: 'Sewing', date: '22 Aug', by: 'This month', quote: 'IMG · 22 Aug', note: 'Routine top-up — six months of breakage cover across all three lines.' },
  { id: 'r5', ref: 'REQ-0180', item: 'Steam irons × 2', cat: 'Tools', quantity: '2 units', amount: 56000, amountGBP: 280, priority: 'Medium', status: 'approved', who: 'Ramesh B.', init: 'RB', team: 'Finishing', date: '21 Aug', by: 'This month', quote: 'PDF · 21 Aug', note: 'Finishing runs four irons for three tables; two are leaking and staining light shells.' },
  { id: 'r6', ref: 'REQ-0179', item: 'Overlock spare parts kit', cat: 'Machinery', quantity: '1 kit', amount: 31400, amountGBP: 157, priority: 'Medium', status: 'approved', who: 'Anita K.', init: 'AK', team: 'Maintenance', date: '20 Aug', by: 'Next month', quote: 'PDF · 20 Aug', note: 'Loopers and knives for the four Juki overlocks so a breakdown is an hour, not a day.' },
  { id: 'r7', ref: 'REQ-0178', item: 'Printer toner + box files', cat: 'Office Supplies', quantity: 'assorted', amount: 8900, amountGBP: 45, priority: 'Low', status: 'approved', who: 'Anita K.', init: 'AK', team: 'Office', date: '20 Aug', by: 'This month', quote: 'IMG · 20 Aug', note: 'Challan printing for despatch, plus filing for the VAT quarter.' },
  { id: 'r8', ref: 'REQ-0177', item: 'Safety gloves · 50 pairs', cat: 'Safety Equipment', quantity: '50 pairs', amount: 12000, amountGBP: 60, priority: 'Low', status: 'approved', who: 'Sita R.', init: 'SR', team: 'Cutting', date: '19 Aug', by: 'This week', quote: 'IMG · 19 Aug', note: 'Cut-resistant gloves for the band knife station — the current set is past its wear date.' },
];
