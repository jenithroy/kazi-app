import { useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { HeaderAccount } from '@/components/ui/header-account';
import { Icon } from '@/components/ui/icon';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useScrollTop } from '@/lib/use-scroll-top';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import { useCommitFeed } from '@/data/changelog/hooks';
import { buildFilters, groupByDay } from '@/data/changelog/parse';
import type { Commit, FilterKey } from '@/data/changelog/types';

import { CommitDetailSheet } from './commit-detail-sheet';
import { CommitSummaryCard } from './commit-summary-card';
import { DayGroup } from './day-group';
import { FilterChipsBar } from './filter-chips-bar';

export function Changelog() {
  const theme = useTheme();
  const scrollRef = useScrollTop();
  const { data: feed, isLoading, isError, error, refetch, isRefetching } = useCommitFeed();

  const [filter, setFilter] = useState<FilterKey>('All');
  const [openSha, setOpenSha] = useState<string | null>(null);

  const commits = useMemo(() => feed?.commits ?? [], [feed]);
  const filters = useMemo(() => buildFilters(commits), [commits]);
  const visible = filter === 'All' ? commits : commits.filter((c) => c.type === filter);
  const days = useMemo(() => groupByDay(visible), [visible]);
  const openCommit: Commit | null = commits.find((c) => c.sha === openSha) ?? null;

  if (isLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  if (isError && !feed) {
    const privateRepo = (error as Error)?.message === 'PRIVATE_REPO';
    return (
      <View style={[styles.flex, { backgroundColor: theme.background }]}>
        <ScreenHeader title="Changelog" subtitle="Commit history" />
        <View style={styles.errorWrap}>
          <EmptyState
            icon={privateRepo ? 'lock' : 'wifi-off'}
            title={privateRepo ? 'Changelog unavailable' : 'Couldn’t load commits'}
            message={
              privateRepo
                ? 'The repository is private, so the app can’t read its commits directly. This needs a server-side feed before it can work.'
                : String((error as Error)?.message ?? 'Check your connection and try again.')
            }
          />
          {privateRepo ? null : <Button label="Retry" variant="secondary" onPress={() => refetch()} style={styles.retry} />}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <ScreenHeader
        title="Changelog"
        subtitle={`${commits.length} commits · ${days.length} days`}
        rightSlot={<HeaderAccount size="sm" />}
      />
      <FilterChipsBar filters={filters} active={filter} onPick={setFilter} />

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={theme.accent} />}
      >
        {feed ? <CommitSummaryCard feed={feed} /> : null}

        {feed?.stale ? (
          <View style={[styles.staleBanner, { backgroundColor: theme.warningWash, borderColor: theme.border }]}>
            <Icon name="wifi-off" size={14} color={theme.warningWashText} />
            <Text style={[styles.staleText, { color: theme.warningWashText }]}>
              Offline — showing the last cached commits. Pull to refresh.
            </Text>
          </View>
        ) : null}

        {days.length === 0 ? (
          <EmptyState icon="git-commit" title="Nothing to show" message="No commits match this filter." />
        ) : (
          days.map((day, i) => <DayGroup key={day.key} day={day} index={i} onOpen={(c) => setOpenSha(c.sha)} />)
        )}
      </ScrollView>

      <CommitDetailSheet commit={openCommit} onClose={() => setOpenSha(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, paddingTop: 16, paddingBottom: 40, gap: 18 },
  errorWrap: { padding: 20, gap: 14 },
  retry: { alignSelf: 'flex-start' },
  staleBanner: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  staleText: { flex: 1, fontFamily: fontFamily.medium, fontSize: 12, lineHeight: 12 * 1.4 },
});
