import type { Message, Person, PersonId, Thread, ThreadId } from './types';

const DAY = 86_400_000;

/**
 * The signed-in person's id in the seed. Real sessions replace it with a
 * `people.id` through `setChatIdentity`; this is only what `identity.ts`
 * starts from so the mock renders before (and without) a session.
 */
export const MOCK_ME: PersonId = 'me';

/**
 * Seed timestamps are anchored to *today*, not to a fixed date, so the day
 * separators ("Today" / "Yesterday") and relative times stay truthful however
 * long the mock lives.
 */
function at(hour: number, minute: number, daysAgo = 0): number {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.getTime() - daysAgo * DAY;
}

/** The signed-in user. Listed so `personFor(MOCK_ME)` resolves; the compose sheet filters it back out. */
export const CURRENT_USER: Person = {
  id: MOCK_ME,
  name: 'You',
  role: 'Floor manager',
  initials: 'SR',
  avatarTint: 'dark',
  online: true,
  status: 'On shift',
};

export const PEOPLE: Record<PersonId, Person> = {
  [MOCK_ME]: CURRENT_USER,
  ak: { id: 'ak', name: 'Anil Karki', role: 'Cutting lead', initials: 'AK', avatarTint: 'mint', online: true, status: 'On shift · Line 2' },
  pt: { id: 'pt', name: 'Pramila Thapa', role: 'QC', initials: 'PT', avatarTint: 'clay', online: true, status: 'On shift · QC bay' },
  rb: { id: 'rb', name: 'Rabin Bhandari', role: 'Stores', initials: 'RB', avatarTint: 'draft', online: false, status: 'Off shift · back 14:00' },
  mk: { id: 'mk', name: 'Manisha KC', role: 'Packing', initials: 'MK', avatarTint: 'amber', online: true, status: 'On shift · Packing' },
  jw: { id: 'jw', name: 'David Mott', role: 'London', initials: 'DM', avatarTint: 'draft', online: false, status: 'Off shift · GMT+1' },
  su: { id: 'su', name: 'Sunita Rai', role: 'Line 3 lead', initials: 'SU', avatarTint: 'mint', online: true, status: 'On shift · Line 3' },
  bk: { id: 'bk', name: 'Bikash Gurung', role: 'Sewing', initials: 'BG', avatarTint: 'amber', online: true, status: 'On shift · Line 3' },
  nm: { id: 'nm', name: 'Nirmala Shrestha', role: 'HR', initials: 'NS', avatarTint: 'clay', online: false, status: 'Off shift · back 13:00' },
  kd: { id: 'kd', name: 'Kiran Dahal', role: 'Maintenance', initials: 'KD', avatarTint: 'draft', online: true, status: 'On shift · Floor' },
};

const ME = MOCK_ME;

export const SEED_THREADS: Thread[] = [
  { id: 't-l3', kind: 'group', name: 'Line 3 leads', avatarTint: 'dark', memberIds: ['ak', 'su', 'bk', 'nm', 'mk', 'pt'], ownerId: ME, pinned: true },
  { id: 't-ak', kind: 'dm', memberIds: ['ak'] },
  { id: 't-pt', kind: 'dm', memberIds: ['pt'] },
  { id: 't-floor', kind: 'group', name: 'Floor supervisors', avatarTint: 'mint', memberIds: ['su', 'kd', 'mk'], ownerId: 'su', muted: true },
  { id: 't-rb', kind: 'dm', memberIds: ['rb'], missing: true, preview: 'Zip stock — checking the back shelf now', previewTime: '08:20', ref: 'THR-0418 · deleted 08:52' },
  { id: 't-mk', kind: 'dm', memberIds: ['mk'] },
  { id: 't-jw', kind: 'dm', memberIds: ['jw'] },
];

export const SEED_UNREAD: Record<ThreadId, number> = {
  't-l3': 3,
  't-ak': 2,
  't-pt': 1,
  't-floor': 0,
  't-rb': 0,
  't-mk': 0,
  't-jw': 0,
};

/** No seed thread for `t-rb` — it's the deleted/missing thread and never had messages loaded. */
export const SEED_MESSAGES: Record<ThreadId, Message[]> = {
  't-ak': [
    { id: 'm-ak-1', threadId: 't-ak', authorId: 'ak', text: "Fabric for PO-2288 still hasn't cleared the gate. Should I start the chino run instead?", at: at(9, 12), reactions: [] },
    { id: 'm-ak-2', threadId: 't-ak', authorId: ME, text: 'Yes — swap to chino, keep the hoodie table set up.', at: at(9, 14), reactions: [{ emoji: '👍', by: ['ak'] }], read: true },
    { id: 'm-ak-3', threadId: 't-ak', authorId: 'ak', text: "Table's laid. Moving 6 cutters over now.", at: at(9, 31), reactions: [] },
  ],
  't-pt': [
    { id: 'm-pt-1', threadId: 't-pt', authorId: 'pt', text: 'AQL sample on the tee run failed twice — mostly seam slippage.', at: at(8, 41), reactions: [] },
    { id: 'm-pt-2', threadId: 't-pt', authorId: ME, text: "Photograph them and log against QC-113. I'll look before lunch.", at: at(8, 44), replyTo: 'm-pt-1', reactions: [], read: true },
    { id: 'm-pt-3', threadId: 't-pt', authorId: 'pt', text: 'Photos are up. 11 units flagged.', at: at(9, 5), reactions: [{ emoji: '✅', by: [ME] }] },
  ],
  't-mk': [
    { id: 'm-mk-1', threadId: 't-mk', authorId: 'mk', text: 'Trims count is short by 400 zips for the packing line.', at: at(7, 58), reactions: [] },
    { id: 'm-mk-2', threadId: 't-mk', authorId: ME, text: "Rabin's checking stores. Pack what you can in the meantime.", at: at(8, 2), reactions: [], read: true },
  ],
  't-l3': [
    { id: 'm-l3-1', threadId: 't-l3', authorId: 'nm', text: 'Overtime sheet for tonight needs two more names.', at: at(18, 30, 1), reactions: [] },
    { id: 'm-l3-2', threadId: 't-l3', authorId: ME, text: 'Add Sunita and Bikash. 42 staff total.', at: at(18, 35, 1), replyTo: 'm-l3-1', reactions: [{ emoji: '👍', by: ['nm', 'su'] }], read: true },
    { id: 'm-l3-3', threadId: 't-l3', authorId: 'nm', text: "Done. Sheet's with HR.", at: at(18, 41, 1), reactions: [] },
    { id: 'm-l3-4', threadId: 't-l3', authorId: 'su', text: 'Line 3 started 07:05. Two machines still down from last night.', at: at(7, 6), reactions: [] },
    { id: 'm-l3-5', threadId: 't-l3', authorId: 'bk', text: 'Both are the overlockers. Kiran said he can look at them after the break.', at: at(7, 14), replyTo: 'm-l3-4', reactions: [{ emoji: '🙏', by: ['su'] }] },
    { id: 'm-l3-6', threadId: 't-l3', authorId: 'ak', text: "Cutting can hold the feed until 09:30, so we're not blocked yet.", at: at(7, 20), reactions: [] },
  ],
  't-floor': [
    { id: 'm-fl-1', threadId: 't-floor', authorId: 'kd', text: 'Compressor serviced. Pressure back to 6.2 bar.', at: at(6, 50), reactions: [{ emoji: '🎉', by: ['su', 'mk', ME] }] },
    { id: 'm-fl-2', threadId: 't-floor', authorId: 'su', text: 'Good. Line 3 was struggling on the pressers all week.', at: at(6, 58), reactions: [] },
    { id: 'm-fl-3', threadId: 't-floor', authorId: ME, text: "Log the service against MTN-084 so it's on the record.", at: at(7, 2), reactions: [], read: true },
    { id: 'm-fl-4', threadId: 't-floor', authorId: 'mk', text: 'Packing is clear until the 11:00 pickup.', at: at(8, 25), reactions: [] },
  ],
  't-jw': [
    { id: 'm-jw-1', threadId: 't-jw', authorId: 'jw', text: 'Buyer wants the shipped figure by 17:00 London.', at: at(9, 10, 1), reactions: [] },
    { id: 'm-jw-2', threadId: 't-jw', authorId: ME, text: '7,940 as of this morning. Sending the pack now.', at: at(9, 22, 1), reactions: [], read: true },
  ],
};

/** Threads where the other side is mid-message. Drives the typing bubble instead of a hardcoded thread id. */
export const TYPING_IN: Record<ThreadId, PersonId> = {
  't-ak': 'ak',
  't-l3': 'su',
};
