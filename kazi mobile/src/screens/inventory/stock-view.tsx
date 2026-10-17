import { Pressable, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/ui/empty-state';
import { FilterChips } from '@/components/ui/filter-chips';
import { Icon } from '@/components/ui/icon';
import { Money } from '@/components/ui/money';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import { stockLevel } from '@/data/inventory/utils';
import type { StockItem } from '@/data/inventory/types';

import { StockRow } from './stock-row';

export type StockFilter = 'all' | 'low' | 'raw' | 'finished' | 'trims';

export interface StockViewProps {
  items: StockItem[];
  totalCount: number;
  filter: StockFilter;
  filterCounts: Record<StockFilter, number>;
  onFilterChange: (f: StockFilter) => void;
  lowCount: number;
  /** What everything on hand is worth. Lives here rather than in a card above
   *  the tabs: it is the Stock tab's own headline, and nothing else reads it. */
  stockValueNPR: number;
  onOpen: (item: StockItem) => void;
}

const FILTER_LABELS: Record<StockFilter, string> = {
  all: 'All',
  low: 'Below reorder',
  raw: 'Raw materials',
  finished: 'Finished goods',
  trims: 'Trims',
};

export function StockView({ items, totalCount, filter, filterCounts, onFilterChange, lowCount, stockValueNPR, onOpen }: StockViewProps) {
  const theme = useTheme();

  // Only offer a category chip when the live data actually has that category —
  // upstream categories are free text, so an empty chip is a dead end.
  const chips = (Object.keys(FILTER_LABELS) as StockFilter[])
    .filter((id) => id === 'all' || filterCounts[id] > 0)
    .map((id) => ({ id, label: FILTER_LABELS[id], count: filterCounts[id] }));

  return (
    <View style={styles.wrap}>
      {stockValueNPR > 0 ? (
        <View style={[styles.valueRow, { borderColor: theme.border }]}>
          <Text style={[styles.valueLabel, { color: theme.textSecondary }]}>Stock value</Text>
          <Money npr={stockValueNPR} compact size={17} />
          <Text style={[styles.valueContext, { color: theme.textSecondary }]}>
            {totalCount} {totalCount === 1 ? 'item' : 'items'}
          </Text>
        </View>
      ) : null}

      <FilterChips chips={chips} active={filter} onChange={onFilterChange} />

      {lowCount > 0 && filter !== 'low' ? (
        <Pressable
          onPress={() => onFilterChange('low')}
          style={[styles.banner, { backgroundColor: theme.dangerWash, borderColor: theme.scheme === 'light' ? '#E3C9BE' : theme.border }]}
        >
          <Icon name="alert-triangle" size={18} color={theme.dangerWashText} />
          <Text style={[styles.bannerText, { color: theme.dangerWashText }]}>
            {lowCount} {lowCount === 1 ? 'item is' : 'items are'} below reorder threshold
          </Text>
          <Icon name="chevron-right" size={15} color={theme.dangerWashText} />
        </Pressable>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          icon="search"
          title="Nothing matches"
          message={`Try a shorter search, or clear the filter to see all ${totalCount} items.`}
        />
      ) : (
        items.map((item, index) => (
          <StockRow key={item.id} item={item} index={index} onPress={() => onOpen(item)} />
        ))
      )}
    </View>
  );
}

/** Category chip buckets. Upstream `category` is free text, so match loosely. */
export function stockFilterOf(item: StockItem): Exclude<StockFilter, 'all' | 'low'> | null {
  const c = item.category.toLowerCase();
  if (c.includes('raw')) return 'raw';
  if (c.includes('finished')) return 'finished';
  if (c.includes('trim')) return 'trims';
  return null;
}

export function matchesStockFilter(item: StockItem, filter: StockFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'low') return stockLevel(item) === 'low';
  return stockFilterOf(item) === filter;
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 11 },
  valueLabel: { fontFamily: fontFamily.mono, fontSize: 9.5, letterSpacing: 0.11 * 9.5, textTransform: 'uppercase' },
  valueContext: { flex: 1, textAlign: 'right', fontSize: 11.5 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 16, borderWidth: 1, padding: 14 },
  bannerText: { flex: 1, fontSize: 13.5, lineHeight: 13.5 * 1.4 },
});
