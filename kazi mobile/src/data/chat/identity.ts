/**
 * Who "me" is, and who everyone else is.
 *
 * Chat is the one module where nearly every pure helper — `previewOf`,
 * `messageMeta`, `threadTitle`, the bubble's own/other decision — needs both
 * the signed-in person's id and the staff directory, from call sites that have
 * no props to thread them through (a `map` inside a sort comparator, a
 * `StyleSheet`-level colour choice). Passing them down would mean touching
 * every signature in `utils.ts` and every caller of it.
 *
 * So both live here as a module-level registry that is *written once* per
 * session, the same shape `data/notifications/actor.ts` already uses for the
 * current user. `AuthProvider` sets the id; the directory query sets the
 * roster. Nothing else writes, and nothing reads either one before the app has
 * a session — the chat screen is behind `ScreenGate`.
 *
 * With Supabase unconfigured both fall back to the mock seed, so local
 * development without a `.env` behaves exactly as it did.
 */

import { PEOPLE as MOCK_PEOPLE, MOCK_ME } from './mock';
import type { Person, PersonId } from './types';

let currentId: PersonId = MOCK_ME;
let directory: Record<PersonId, Person> = { ...MOCK_PEOPLE };
let self: Person | null = null;

/** Called from `AuthProvider` whenever the session changes. */
export function setChatIdentity(personId: string | null, person?: Person | null): void {
  currentId = personId ?? MOCK_ME;
  self = person ?? null;
}

/** Called by the directory query once the roster is read. */
export function setChatDirectory(people: Person[]): void {
  directory = Object.fromEntries(people.map((p) => [p.id, p]));
}

export function myId(): PersonId {
  return currentId;
}

export function isMe(id: PersonId | undefined | null): boolean {
  return !!id && id === currentId;
}

const UNKNOWN: Omit<Person, 'id'> = {
  name: 'Unknown',
  role: '',
  initials: '?',
  avatarTint: 'draft',
  online: false,
  status: '',
};

/**
 * A person by id. Never throws and never returns undefined: a message whose
 * author has since been deleted still has to render.
 */
export function personFor(id: PersonId): Person {
  const found = directory[id];
  if (found) return found;
  if (id === currentId) return self ?? { id, ...UNKNOWN, name: 'You', initials: 'ME', avatarTint: 'dark' };
  return { id, ...UNKNOWN };
}
