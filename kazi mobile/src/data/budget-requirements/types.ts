export type RequestStatus = 'pending' | 'approved' | 'declined';
export type Priority = 'Low' | 'Medium' | 'High';
/** Reference `REQ_CATEGORIES` (item 17) — the Requirements-tab category set. */
export type Category =
  | 'Raw Materials'
  | 'Tools'
  | 'Machinery'
  | 'Equipment'
  | 'Office Supplies'
  | 'Safety Equipment'
  | 'Other';
export type Role = 'staff' | 'admin';
export type ByOption = 'This week' | 'This month' | 'Next month';
export type RequirementsFilter = 'all' | 'pending' | 'high' | 'mine';
export type RequirementsView = 'list' | 'detail';

export interface Requirement {
  id: string;
  ref: string;
  item: string;
  cat: Category;
  /** Free-text quantity — "50 units", "400 m", "1 kit" (reference is a plain text field). */
  quantity: string;
  /** Estimated cost, NPR (primary). */
  amount: number;
  /** Estimated cost, GBP — frozen `amount / GBP_RATE` at raise time, or the manually entered figure. */
  amountGBP: number;
  priority: Priority;
  status: RequestStatus;
  who: string;
  init: string;
  team: string;
  date: string;
  by: string;
  quote: string;
  note: string;
  decidedBy?: string;
}

export interface RequirementDraft {
  cat: Category;
  item: string;
  quantity: string;
  /** NPR field (string while editing). */
  amount: string;
  /** GBP field (string while editing). */
  amountGBP: string;
  /** Which side the other was last derived from — drives the "auto" tag. */
  autoSide: 'npr' | 'gbp' | null;
  priority: Priority;
  by: ByOption;
  note: string;
  quote: boolean;
}

// ---- Budget Requests tab (item 17) ----

/** Reference `budget_requests` where `type === 'budget'` — GBP-primary spend asks. */
export type BudgetCategory = 'Equipment' | 'Materials' | 'Services' | 'Training' | 'Travel' | 'Other';
/** Reference status set for both tabs; the Requirements tab maps its own `RequestStatus` onto these. */
export type ReviewStatus = 'Pending' | 'Approved' | 'Rejected';

export interface BudgetRequest {
  id: string;
  /** `BR-0NN`, generated in the UI (not stored in the live sample docs). */
  ref: string;
  title: string;
  category: BudgetCategory;
  /** Primary amount — entered and displayed in GBP. */
  amountGBP: number;
  /** Booked NPR equivalent, frozen at `amountGBP * GBP_RATE` when raised. */
  amountNPR: number;
  urgency: Priority;
  status: ReviewStatus;
  /** Required free text — why the spend is needed. */
  justification: string;
  requestedBy: string;
  requestedByRole: string;
  reviewedBy?: string;
  date: string;
}

export interface BudgetRequestDraft {
  title: string;
  category: BudgetCategory;
  amountGBP: string;
  urgency: Priority;
  justification: string;
}

export type BudgetTab = 'requests' | 'requirements';
/** `all` + the three review states — used by both tabs' status filter. */
export type ReviewFilter = 'all' | ReviewStatus;
export type UrgencyFilter = 'all' | Priority;
