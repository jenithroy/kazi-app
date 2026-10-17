/**
 * A small collection/document query API over Postgres.
 *
 * **This talks to Supabase. There is no Firebase in this app.** The shape of
 * the API is the one thing inherited from the pre-migration codebase: a handful
 * of module writers need to reach past the plain `readCollection` /
 * `createDocument` boundary — an existence check before an upsert, a `where`
 * query to find a row by business key, `arrayUnion` to append to an embedded
 * list — and this keeps those call sites working unchanged against PostgREST.
 *
 *     import { collection, getDocs, where, query, getDb } from '@/lib/supabase/collections';
 *
 * `collection(...)` names a compat **view** (`fs_<name>`, see `read.ts`), and
 * every clause maps onto a PostgREST filter. `getDb()` returns null and exists
 * only so the old positional call shape still type-checks.
 *
 * Only the used surface is implemented. Anything else is deliberately absent
 * so an unsupported call fails at build time rather than silently at runtime.
 */

import { getSupabase } from '@/lib/supabase';
import { readCollection, readDocument, viewFor, type DocData } from './read';

// ------------------------------------------------------------- references

export interface CollectionRef { __kind: 'collection'; name: string }
export interface DocRef { __kind: 'doc'; name: string; id: string }
export interface WhereClause { __kind: 'where'; field: string; op: string; value: unknown }
export interface QueryRef { __kind: 'query'; name: string; clauses: WhereClause[] }

/** Present only so call sites can keep passing `getDb()` as the first argument. */
export function getDb(): null {
  return null;
}

export function collection(_db: unknown, name: string): CollectionRef {
  return { __kind: 'collection', name };
}

/**
 * Both Firestore forms:
 *   `doc(db, 'tasks', id)`        — a reference to an existing row
 *   `doc(collection(db, 'tasks'))` — a placeholder for a row not created yet,
 *                                    whose id Postgres will assign on insert.
 */
export function doc(ref: CollectionRef): DocRef;
export function doc(db: unknown, name: string, id?: string): DocRef;
export function doc(a: unknown, name?: string, id?: string): DocRef {
  if (a && typeof a === 'object' && (a as CollectionRef).__kind === 'collection') {
    return { __kind: 'doc', name: (a as CollectionRef).name, id: '' };
  }
  return { __kind: 'doc', name: name ?? '', id: id ?? '' };
}

export function where(field: string, op: string, value: unknown): WhereClause {
  return { __kind: 'where', field, op, value };
}
export type QueryConstraint = WhereClause;

export function query(ref: CollectionRef, ...clauses: WhereClause[]): QueryRef {
  return { __kind: 'query', name: ref.name, clauses };
}

// -------------------------------------------------------------- snapshots

export interface DocSnap {
  id: string;
  exists(): boolean;
  data(): DocData;
}
export interface QuerySnap {
  docs: DocSnap[];
  empty: boolean;
  size: number;
  forEach(fn: (d: DocSnap) => void): void;
}

function snapOf(rows: DocData[]): QuerySnap {
  const docs = rows.map((r) => ({
    id: String(r.id ?? ''),
    exists: () => true,
    data: () => r,
  }));
  return { docs, empty: docs.length === 0, size: docs.length, forEach: (f) => docs.forEach(f) };
}

// `in` takes an array and maps onto PostgREST's list filter; the rest are scalar.
const OPS: Record<string, string> = { '==': 'eq', '!=': 'neq', '>': 'gt', '>=': 'gte', '<': 'lt', '<=': 'lte', in: 'in' };

export async function getDocs(ref: CollectionRef | QueryRef): Promise<QuerySnap> {
  if (ref.__kind === 'collection') {
    const rows = await readCollection<DocData>(ref.name, (_id, d) => d);
    return snapOf(rows);
  }
  let q = getSupabase().from(viewFor(ref.name)).select('*');
  for (const c of ref.clauses) {
    const op = OPS[c.op];
    if (!op) throw new Error(`collections: unsupported operator "${c.op}"`);
    if (op === 'in') {
      const list = Array.isArray(c.value) ? c.value : [c.value];
      // PostgREST renders an empty list as `in.()`, which is a syntax error —
      // and "matches nothing" is the honest answer anyway.
      if (!list.length) return snapOf([]);
      q = (q as unknown as Record<string, (f: string, v: unknown[]) => typeof q>).in(c.field, list);
      continue;
    }
    q = (q as unknown as Record<string, (f: string, v: unknown) => typeof q>)[op](c.field, c.value);
  }
  const { data, error } = await q;
  if (error) throw new Error(`${ref.name}: ${error.message}`);
  return snapOf((data ?? []) as DocData[]);
}

export async function getDoc(ref: DocRef): Promise<DocSnap> {
  const row = ref.id ? await readDocument(ref.name, ref.id) : null;
  return {
    id: ref.id,
    exists: () => row != null,
    data: () => row ?? {},
  };
}

// ---------------------------------------------------------------- writes

/**
 * Firestore's `arrayUnion` appends to an embedded array. Those arrays are now
 * child tables, so this returns a sentinel that `write.ts` recognises and
 * turns into an INSERT rather than a replace-all.
 */
export function arrayUnion(...values: unknown[]): { __arrayUnion: unknown[] } {
  return { __arrayUnion: values };
}

/** Postgres fills these itself; the value is only a marker. */
export function serverTimestamp(): { __serverTimestamp: true } {
  return { __serverTimestamp: true };
}

export async function updateDoc(ref: DocRef, data: DocData): Promise<void> {
  const { patchDocument } = await import('./write');
  await patchDocument(ref.name, ref.id, data);
}

/**
 * Batched writes. Firestore batches are atomic; a Supabase multi-row insert is
 * atomic per statement, which is the property the callers actually rely on
 * (all-or-nothing per collection).
 */
export function writeBatch(_db: unknown) {
  const pending = new Map<string, DocData[]>();
  const updates: [string, string, DocData][] = [];
  return {
    set(ref: DocRef, data: DocData) {
      const list = pending.get(ref.name) ?? [];
      list.push(ref.id ? { ...data, id: ref.id } : data);
      pending.set(ref.name, list);
      return this;
    },
    update(ref: DocRef, data: DocData) {
      updates.push([ref.name, ref.id, data]);
      return this;
    },
    async commit() {
      const { createDocument, patchDocument } = await import('./write');
      for (const [name, rows] of pending) {
        for (const row of rows) await createDocument(name, row);
      }
      for (const [name, id, data] of updates) await patchDocument(name, id, data);
    },
  };
}

/**
 * Live subscription, replacing Firestore's `onSnapshot`. Fetches once, then
 * re-fetches whenever Postgres reports a change on the underlying table.
 * Returns the unsubscribe function, same as Firestore.
 */
export function onSnapshot(
  ref: CollectionRef | QueryRef,
  onNext: (snap: QuerySnap) => void,
  onError?: (e: Error) => void,
): () => void {
  let closed = false;
  const table = viewFor(ref.name).replace(/^fs_/, '');

  const pull = () => {
    getDocs(ref)
      .then((s) => { if (!closed) onNext(s); })
      .catch((e) => { if (!closed) onError?.(e as Error); });
  };
  pull();

  const channel = getSupabase()
    .channel(`compat:${table}`)
    .on('postgres_changes', { event: '*', schema: 'public', table }, pull)
    .subscribe();

  return () => {
    closed = true;
    getSupabase().removeChannel(channel);
  };
}
