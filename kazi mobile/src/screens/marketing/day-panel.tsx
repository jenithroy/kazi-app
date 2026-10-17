import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import { KINDS, MONTHS_SHORT } from '@/data/marketing/mock';
import type { CalendarEntry, SelectedDay } from '@/data/marketing/types';

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface DayPanelProps {
  selected: SelectedDay;
  entries: CalendarEntry[];
  onOpen: (entry: CalendarEntry) => void;
  onNewEntry: () => void;
}

export function DayPanel({ selected, entries, onOpen, onNewEntry }: DayPanelProps) {
  const theme = useTheme();
  const selDate = new Date(selected.y, selected.m, selected.d);
  const label = `${WEEKDAY_NAMES[selDate.getDay()]} ${selected.d} ${MONTHS_SHORT[selected.m]}`;
  const countLabel = entries.length === 1 ? '1 entry' : `${entries.length} entries`;

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={[styles.label, { color: theme.textPrimary }]}>{label}</Text>
        <Text style={[styles.count, { color: theme.textSecondary }]}>{countLabel}</Text>
      </View>

      {entries.length === 0 ? (
        <Pressable onPress={onNewEntry} style={[styles.emptyCard, { borderColor: theme.border }]}>
          <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>Nothing planned</Text>
          <Text style={[styles.emptyHint, { color: theme.textSecondary }]}>Tap to add an entry for this day</Text>
        </Pressable>
      ) : (
        entries.map((e, i) => {
          const k = KINDS[e.kind];
          return (
            <Animated.View key={e.id} entering={FadeInUp.delay(Math.min(i, 6) * 30).duration(220)}>
              <Pressable onPress={() => onOpen(e)} style={[styles.entryCard, { backgroundColor: theme.surface, boxShadow: theme.shadows.card }]}>
                <View style={[styles.entryAccent, { backgroundColor: k.color }]} />
                <View style={styles.entryTextWrap}>
                  <Text style={[styles.entryTitle, { color: theme.textPrimary }]}>{e.title}</Text>
                  <Text style={[styles.entryNotes, { color: theme.textSecondary }]}>{e.notes || 'No notes'}</Text>
                </View>
                <View style={[styles.kindTag, { backgroundColor: k.bg }]}>
                  <Text style={[styles.kindTagText, { color: k.fg }]}>{k.label}</Text>
                </View>
              </Pressable>
            </Animated.View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 2 },
  label: { fontFamily: fontFamily.semibold, fontSize: 15 },
  count: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.12 * 10, textTransform: 'uppercase' },
  emptyCard: { borderRadius: 18, borderWidth: 1, borderStyle: 'dashed', padding: 22, alignItems: 'center', gap: 6 },
  emptyTitle: { fontSize: 14, fontWeight: '600' },
  emptyHint: { fontSize: 13 },
  entryCard: { borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  entryAccent: { width: 4, alignSelf: 'stretch', minHeight: 38, borderRadius: 99, flexShrink: 0 },
  entryTextWrap: { flex: 1, gap: 5, minWidth: 0 },
  entryTitle: { fontSize: 15, fontWeight: '600', lineHeight: 15 * 1.3 },
  entryNotes: { fontSize: 13, lineHeight: 13 * 1.45 },
  kindTag: { flexShrink: 0, height: 24, paddingHorizontal: 9, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  kindTagText: { fontSize: 11.5, fontWeight: '600' },
});
