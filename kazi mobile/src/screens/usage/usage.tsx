import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/ui/empty-state';
import { FilterChips } from '@/components/ui/filter-chips';
import { HeaderAccount } from '@/components/ui/header-account';
import { Icon } from '@/components/ui/icon';
import { isBlocked, ScreenGate } from '@/components/ui/screen-gate';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useScrollTop } from '@/lib/use-scroll-top';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import {
  collapseFeed,
  computeTotals,
  filterFeed,
  groupByDay,
  groupByPerson,
  groupBySection,
  groupFeedByDay,
  scopeDaily,
} from '@/data/usage/aggregate';
import { useActivityFeed, useUsageDaily } from '@/data/usage/hooks';
import { RANGES } from '@/data/usage/types';
import type { ActionFilterKey, RangeKey } from '@/data/usage/types';

import { ActivityFeedCard } from './activity-feed-card';
import { DayActivityChart } from './day-activity-chart';
import { UsageKpiGrid } from './kpi-grid';
import { PeopleUsageCard } from './people-usage-card';
import { SectionUsageCard } from './section-usage-card';

const FEED_PAGE = 60;
const RANGE_CHIPS = RANGES.map((r) => ({ id: r.key, label: r.label }));

export function Usage() {
  const theme = useTheme();
  const scrollRef = useScrollTop();

  const [range, setRange] = useState<RangeKey>('30d');
  const rangeOption = RANGES.find((r) => r.key === range) ?? RANGES[2];
  const [personScope, setPersonScope] = useState('all');
  const [sectionScope, setSectionScope] = useState('all');
  const [action, setAction] = useState<ActionFilterKey>('all');
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(FEED_PAGE);

  // Reset the feed's "show more" page whenever the range or any filter
  // changes — adjusted during render (React's own recommended pattern for
  // resetting state when an input changes) rather than in an effect, so it
  // takes effect in the same render instead of causing an extra one.
  const filterKey = `${range}|${personScope}|${sectionScope}|${action}|${query}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setShown(FEED_PAGE);
  }

  const dailyQuery = useUsageDaily(rangeOption);
  const feedQuery = useActivityFeed(rangeOption);
  const daily = useMemo(() => dailyQuery.data ?? [], [dailyQuery.data]);
  const feed = useMemo(() => feedQuery.data ?? [], [feedQuery.data]);

  const scopedDaily = useMemo(() => scopeDaily(daily, { person: personScope, section: sectionScope }), [daily, personScope, sectionScope]);
  const totals = useMemo(() => computeTotals(scopedDaily), [scopedDaily]);
  const bySection = useMemo(() => groupBySection(scopedDaily), [scopedDaily]);
  const byPerson = useMemo(() => groupByPerson(scopedDaily), [scopedDaily]);
  const byDay = useMemo(() => groupByDay(scopedDaily, rangeOption.days), [scopedDaily, rangeOption.days]);

  const allByPerson = useMemo(() => groupByPerson(daily), [daily]);
  const allBySection = useMemo(() => groupBySection(daily), [daily]);

  const filteredFeed = useMemo(
    () => filterFeed(feed, { person: personScope, section: sectionScope, action, query }),
    [feed, personScope, sectionScope, action, query],
  );
  const collapsed = useMemo(() => collapseFeed(filteredFeed), [filteredFeed]);
  const feedDays = useMemo(() => groupFeedByDay(collapsed.slice(0, shown)), [collapsed, shown]);

  const scopeLabel = [
    personScope !== 'all' ? allByPerson.find((p) => p.key === personScope)?.name : null,
    sectionScope !== 'all' ? allBySection.find((s) => s.key === sectionScope)?.name : null,
  ].filter(Boolean).join(' · ');

  const clearScope = () => {
    setPersonScope('all');
    setSectionScope('all');
  };

  if (isBlocked(dailyQuery, feedQuery)) {
    return (
      <ScreenGate
        queries={[dailyQuery, feedQuery]}
        header={<ScreenHeader title="Usage & Activity" rightSlot={<HeaderAccount size="sm" />} />}
      />
    );
  }

  const nothingYet = daily.length === 0;

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <ScreenHeader title="Usage & Activity" subtitle="Who's using the ERP" rightSlot={<HeaderAccount size="sm" />} />
      <FilterChips chips={RANGE_CHIPS} active={range} onChange={setRange} />

      {scopeLabel ? (
        <Pressable onPress={clearScope} style={[styles.scopeChip, { backgroundColor: theme.accentWash }]}>
          <Text style={[styles.scopeText, { color: theme.accentWashText }]} numberOfLines={1}>Scoped to {scopeLabel}</Text>
          <Icon name="x" size={12} color={theme.accentWashText} />
        </Pressable>
      ) : null}

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={dailyQuery.isFetching || feedQuery.isFetching}
            onRefresh={() => {
              dailyQuery.refetch();
              feedQuery.refetch();
            }}
            tintColor={theme.accent}
          />
        }
      >
        {nothingYet ? (
          <EmptyState
            icon="activity"
            title="Nothing recorded yet"
            message="The activity log starts from when this page went live, so there's nothing for the period before that. As people open pages and save work, their activity appears here within a few seconds."
          />
        ) : (
          <>
            <UsageKpiGrid totals={totals} everActive={allByPerson.length} bySection={bySection} />
            <DayActivityChart days={byDay} />
            <SectionUsageCard rows={bySection} total={totals.events} selected={sectionScope} onSelect={setSectionScope} />
            <PeopleUsageCard rows={byPerson} total={totals.events} selected={personScope} onSelect={setPersonScope} />
            <ActivityFeedCard
              totalEntries={collapsed.length}
              truncated={feed.length >= 600}
              action={action}
              onActionChange={setAction}
              query={query}
              onQueryChange={setQuery}
              days={feedDays}
              remaining={Math.max(0, collapsed.length - shown)}
              onShowMore={() => setShown((n) => n + FEED_PAGE)}
            />
            <Text style={[styles.foot, { color: theme.textSecondary }]}>
              Times are Kathmandu. Time on a page counts only while the app is open and in front of somebody.
              The log is append-only — it can&rsquo;t be edited or deleted from the app.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, paddingTop: 14, paddingBottom: 40, gap: 14 },
  scopeChip: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: 7,
    marginHorizontal: 16,
    marginTop: 10,
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  scopeText: { fontFamily: fontFamily.semibold, fontSize: 12, maxWidth: 240 },
  foot: { fontSize: 11.5, lineHeight: 11.5 * 1.5, paddingHorizontal: 2 },
});
