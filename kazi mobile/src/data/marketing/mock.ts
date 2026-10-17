import type { AvatarTint } from '@/components/ui/avatar';
import type { CalendarEntry, EntryKind } from './types';

export const KINDS: Record<EntryKind, { label: string; color: string; bg: string; fg: string; border: string; tint: AvatarTint }> = {
  campaign: { label: 'Campaign', color: '#0D1F19', bg: '#EDEFEC', fg: '#243731', border: '#D6DCD7', tint: 'dark' },
  post: { label: 'Social', color: '#22A97A', bg: '#E2F6EC', fg: '#0E5E43', border: '#BFE4D2', tint: 'mint' },
  email: { label: 'Newsletter', color: '#B98514', bg: '#F7EEDA', fg: '#7A5709', border: '#E7D6AE', tint: 'amber' },
  event: { label: 'Event', color: '#8A9A92', bg: '#F1EFE8', fg: '#4A5A53', border: '#DCE0DC', tint: 'draft' },
};

export const KIND_ORDER: EntryKind[] = ['campaign', 'post', 'email', 'event'];

export const PEOPLE = [
  { id: 'pt', initials: 'PT', name: 'Pramila', tint: 'dark' as AvatarTint },
  { id: 'sr', initials: 'SR', name: 'Sita', tint: 'mint' as AvatarTint },
  { id: 'dm', initials: 'DM', name: 'Dan', tint: 'draft' as AvatarTint },
  { id: 'mk', initials: 'MK', name: 'Manisha', tint: 'amber' as AvatarTint },
];

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The real current date — the calendar opens here and marks "today". `m` is 0-indexed. */
export const TODAY = (() => {
  const now = new Date();
  return { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() };
})();

export const seedEntries: CalendarEntry[] = [
  { id: 'e1', y: 2026, m: 7, d: 3, kind: 'campaign', title: 'Autumn knitwear drop — brief out', notes: 'Line sheet + 6 hero shots to agency.', person: 'pt' },
  { id: 'e2', y: 2026, m: 7, d: 6, kind: 'post', title: 'Dye house behind-the-scenes reel', notes: 'Filmed last week in Kathmandu.', person: 'sr' },
  { id: 'e3', y: 2026, m: 7, d: 11, kind: 'email', title: 'Buyer newsletter — lead times', notes: 'Segment: UK wholesale only.', person: 'dm' },
  { id: 'e4', y: 2026, m: 7, d: 13, kind: 'post', title: 'Cashmere care carousel', notes: 'Four slides, reuse studio stills.', person: 'mk' },
  { id: 'e5', y: 2026, m: 7, d: 18, kind: 'event', title: 'Pure London — stand build', notes: 'Samples ship 10 Aug at the latest.', person: 'dm' },
  { id: 'e6', y: 2026, m: 7, d: 19, kind: 'campaign', title: 'Factory-direct story, phase 2', notes: 'Landing page copy needs sign-off.', person: 'pt' },
  { id: 'e7', y: 2026, m: 7, d: 24, kind: 'post', title: 'Sampling week photo set', notes: 'Three posts, Mon / Wed / Fri.', person: 'sr' },
  { id: 'e8', y: 2026, m: 7, d: 24, kind: 'email', title: 'Reorder reminder to AW buyers', notes: 'Cut-off for October delivery.', person: 'dm' },
  { id: 'e9', y: 2026, m: 7, d: 27, kind: 'event', title: 'Studio visit — Northmoor', notes: 'Two buyers, 11:00, sample rail ready.', person: 'pt' },
  { id: 'e10', y: 2026, m: 7, d: 31, kind: 'campaign', title: 'Month wrap — reach + enquiries', notes: 'Pull numbers for the directors\' call.', person: 'mk' },
];
