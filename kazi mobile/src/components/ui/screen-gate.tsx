import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/theme-provider';

import { ErrorState } from './error-state';

/**
 * The slice of a React Query result this needs. Declared structurally so any
 * `UseQueryResult` satisfies it without a cast.
 */
export interface GateQuery {
  isError: boolean;
  isPending: boolean;
  isFetching: boolean;
  error: unknown;
  /** Undefined until the query has ever succeeded. */
  data: unknown;
  refetch: () => unknown;
}

/**
 * A failure worth replacing the screen for.
 *
 * A query that errored but still holds data from an earlier success is not
 * one: React Query serves the cached rows and retries in the background, and
 * tearing a working screen down over a dropped refetch would be its own kind
 * of lying about the state of things. Only a failure with nothing behind it
 * leaves the screen with nothing honest to draw.
 */
function fatally(q: GateQuery): boolean {
  return q.isError && q.data === undefined;
}

/**
 * True while a screen has nothing worth rendering — still loading, or failed.
 *
 * Deliberately a plain function rather than a hook: several screens return
 * early above their gate, and a hook there would be a conditional hook.
 */
export function isBlocked(...queries: GateQuery[]): boolean {
  return queries.some((q) => fatally(q) || q.isPending);
}

/**
 * Failed, ignoring whether it is still loading.
 *
 * For a query a screen renders progressively around rather than waiting on:
 * its absence is fine and draws a local spinner, but its FAILURE still has to
 * stop the screen instead of leaving that spinner up for ever.
 */
export function hasFailed(...queries: GateQuery[]): boolean {
  return queries.some(fatally);
}

/**
 * What a data screen renders instead of its content.
 *
 * Screens used to open with `if (!data) return <ActivityIndicator/>`, which
 * worked only because a failed read quietly resolved to mock data — there was
 * no third outcome to draw. Now that a failed read throws, `data` stays
 * undefined on failure and that gate would spin forever, so loading and failure
 * have to be told apart:
 *
 *     const tasksQuery = useTasks();
 *     const { data: tasks } = tasksQuery;
 *     if (isBlocked(tasksQuery))
 *       return <ScreenGate queries={[tasksQuery]} header={<ScreenHeader title="Tasks" />} />;
 */
export interface ScreenGateProps {
  queries: GateQuery[];
  /**
   * The screen's own `ScreenHeader`, drawn above the spinner.
   *
   * Any screen that owns its header should pass one. Without it the gate
   * replaces the entire screen, so a module opened from More slid in as an
   * empty page with no title and no back chevron, and the header only appeared
   * once the read finished — which read as the navigation itself being slow,
   * and left the only way out (the chevron) missing for as long as the network
   * took.
   *
   * Holding the header still means the push lands on something that already
   * looks like the module, and only the body it cannot know yet is waiting.
   * Any subtitle counted off the data has to be dropped here, of course —
   * pass the title alone, or a subtitle that doesn't depend on the read.
   *
   * Left out only by a gate that is already *inside* a screen whose header is
   * drawn above it: the dashboard variants sit under `DashboardHeader`, so
   * they gate their body and nothing else.
   */
  header?: ReactNode;
}

export function ScreenGate({ queries, header }: ScreenGateProps) {
  const theme = useTheme();

  const failed = queries.find(fatally);
  const body = failed ? (
    // Retry everything that broke, not just the one being shown — screens that
    // read from several modules usually lose them all to the same cause.
    <ErrorState
      error={failed.error}
      onRetry={() => queries.filter((q) => q.isError).forEach((q) => q.refetch())}
      retrying={queries.some((q) => q.isError && q.isFetching)}
    />
  ) : (
    <ActivityIndicator color={theme.accent} />
  );

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      {header}
      <View style={[styles.fill, !failed && styles.centre]}>{body}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  fill: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  centre: {
    alignItems: 'center',
  },
});
