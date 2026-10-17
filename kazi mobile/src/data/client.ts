import { MutationCache, QueryClient } from '@tanstack/react-query';

import { showToast } from '@/components/toast/toast-bridge';

/**
 * The last line of defence for a failed save.
 *
 * Every write goes through `liveWrite`, which throws a `DataWriteError` when
 * Postgres refuses it — an RLS denial, a bad column, being offline. A mutation
 * that rejects with nobody listening used to be invisible: the optimistic
 * update stayed on screen and the person believed it saved. This puts the
 * error in front of them.
 *
 * A mutation with its own `onError` is left alone — a screen that can say
 * something more specific should.
 */
const mutationCache = new MutationCache({
  onError: (error, _vars, _ctx, mutation) => {
    if (mutation.options.onError) return;
    const message = error instanceof Error ? error.message : 'That change could not be saved.';
    showToast({ message: `Not saved · ${message}`, tone: 'bad', durationMs: 6000 });
  },
});

export const queryClient = new QueryClient({
  mutationCache,
  defaultOptions: {
    queries: {
      // Data is live Postgres shared with the web ERP, so it can change under
      // us, and every screen re-reads on mount so an edit made elsewhere shows
      // up on the next visit.
      //
      // `refetchOnMount` is `true` rather than `'always'`: `'always'` ignores
      // `staleTime` entirely and fires a request on every single mount, so
      // stepping from a module back to More and straight into it again — or
      // any of the tab hopping the bottom bar invites — re-read Postgres each
      // time and made the app feel like it was fetching constantly. `true`
      // honours the window below: inside it a revisit is served from cache and
      // draws instantly, outside it the read happens in the background with
      // the cached rows still on screen. Either way nothing blanks, because
      // the gate only stops a screen that has never loaded.
      staleTime: 1000 * 30,
      refetchOnMount: true,
      retry: 1,
    },
    mutations: {
      // A write that failed must not be retried silently — the person needs to
      // know it did not land, and most of these are not idempotent.
      retry: 0,
    },
  },
});
