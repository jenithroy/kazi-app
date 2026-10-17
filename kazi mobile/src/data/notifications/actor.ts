import type { NotifActor } from './types';

/**
 * Module-level "who is signed in", set by `AuthProvider` whenever the session
 * changes. `notify()` reads it so mutation hooks don't have to thread the
 * current user through every call (same pattern as `mock-auth`'s singleton
 * store). Null when signed out — `notify()` becomes a no-op.
 */
let current: NotifActor | null = null;

export function setActor(actor: NotifActor | null): void {
  current = actor;
}

export function getActor(): NotifActor | null {
  return current;
}
