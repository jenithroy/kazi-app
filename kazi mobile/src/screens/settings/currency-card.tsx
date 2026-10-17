import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { Segmented, type SegmentedOption } from '@/components/ui/segmented';
import { useCurrency } from '@/lib/currency-context';
import { type Currency } from '@/lib/currency';
import * as haptics from '@/lib/haptics';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';

import { SettingRow } from './setting-row';

const OPTIONS: SegmentedOption<Currency>[] = [
  { value: 'NPR', label: 'NPR' },
  { value: 'GBP', label: 'GBP' },
];

/** `2 hours ago` — how stale the rate we're converting at is. */
function ago(ms: number): string {
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return hrs === 1 ? 'an hour ago' : `${hrs} hours ago`;
}

/**
 * The app-wide display currency. Every amount is stored in rupees; this decides
 * what they are shown as, at the live GBP rate the reference web app also
 * pulls (open.er-api.com, cached for six hours). Amounts are still *entered* in
 * rupees — booking a purchase against a rate that moved overnight would quietly
 * rewrite the books.
 */
export function CurrencyCard() {
  const theme = useTheme();
  const { primary, setPrimary, rate, live, fetchedAt, refresh } = useCurrency();
  const [refreshing, setRefreshing] = useState(false);

  const shown = rate.toLocaleString('en-US', { maximumFractionDigits: 2 });
  const source = live
    ? `live rate${fetchedAt ? ` · ${ago(fetchedAt)}` : ''}`
    : 'offline — using the fixed rate';

  const onRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    haptics.pressed();
    await refresh();
    setRefreshing(false);
  };

  return (
    <SettingRow label="Currency" meta={`Amounts show in ${primary} · £1 = रु ${shown} · ${source}`}>
      <Segmented options={OPTIONS} value={primary} onChange={setPrimary} fill />
      <Pressable onPress={onRefresh} accessibilityRole="button" hitSlop={8}>
        <Text style={[styles.refresh, { color: refreshing ? theme.textSecondary : theme.link }]}>
          {refreshing ? 'Fetching rate…' : 'Refresh rate'}
        </Text>
      </Pressable>
    </SettingRow>
  );
}

const styles = StyleSheet.create({
  refresh: { fontFamily: fontFamily.mono, fontSize: 11, letterSpacing: 0.06 * 11 },
});
