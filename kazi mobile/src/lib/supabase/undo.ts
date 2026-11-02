import { isSupabaseConfigured } from '@/lib/supabase';

/**
 * The Undo button of a toast, only where it can be true. The `restore*` writers behind these rewind the list on the phone and cannot
 * reach the database: with one behind it, Undo would put a saved record back on screen while it stays saved, or a deleted one while
 * it stays deleted, and the next reload would undo the undo. With no database (the mock) the rewind is the whole of the data, so it is
 * offered there. Where a real inverse write exists, use that instead of this.
 */
export function mockUndo(restore: () => void): { label: string; onPress: () => void } | undefined {
  return isSupabaseConfigured ? undefined : { label: 'Undo', onPress: restore };
}
