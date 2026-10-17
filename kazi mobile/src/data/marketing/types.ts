export type EntryKind = 'campaign' | 'post' | 'email' | 'event';
export type MarketingView = 'calendar' | 'list';
export type KindFilter = 'all' | EntryKind;

export interface CalendarEntry {
  id: string;
  y: number;
  m: number;
  d: number;
  kind: EntryKind;
  title: string;
  notes: string;
  person: string;
}

export interface MonthCursor {
  y: number;
  m: number;
}

export interface SelectedDay {
  y: number;
  m: number;
  d: number;
}
