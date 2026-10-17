import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DateField } from '@/components/ui/date-field';
import { Icon } from '@/components/ui/icon';
import { isoDay } from '@/lib/date-display';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';

export interface DueDateFieldProps {
  /** AD ISO `YYYY-MM-DD`; `''` = no due date. */
  value: string;
  onChange: (adISO: string) => void;
}

function daysFromToday(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return isoDay(d);
}

const QUICK_PICKS: { label: string; days: number }[] = [
  { label: 'Today', days: 0 },
  { label: 'Tomorrow', days: 1 },
  { label: 'This week', days: 5 },
];

/**
 * A real due date — any day, pickable in BS or AD via the shared `DateField` —
 * plus the quick-pick chips the old today/tomorrow/this-week bucket offered, so
 * the common case is still one tap. Retapping the active chip, or the clear
 * button next to a set date, both return to "no due date" (`''`), matching the
 * reference ERP's own blank-due-date option.
 */
export function DueDateField({ value, onChange }: DueDateFieldProps) {
  const theme = useTheme();

  return (
    <View style={styles.group}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>Due</Text>

      <View style={styles.chipsRow}>
        {QUICK_PICKS.map((qp) => {
          const iso = daysFromToday(qp.days);
          const on = value === iso;
          return (
            <Pressable
              key={qp.label}
              onPress={() => onChange(on ? '' : iso)}
              style={[
                styles.chip,
                { backgroundColor: on ? theme.accentWash : theme.surface, borderColor: on ? theme.accent : theme.border },
              ]}
            >
              <Text style={[styles.chipLabel, { color: on ? theme.accentWashText : theme.textPrimary }]}>{qp.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {value ? (
        <View style={styles.dateRow}>
          <DateField value={value} onChange={onChange} pickerTitle="Due date" compact style={styles.dateFieldFlex} />
          <Pressable
            onPress={() => onChange('')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Clear due date"
            style={[styles.clear, { backgroundColor: theme.surface, borderColor: theme.border }]}
          >
            <Icon name="x" size={15} color={theme.textSecondary} />
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={() => onChange(daysFromToday(0))}
          style={[styles.ghostAdd, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <Icon name="calendar" size={15} color={theme.textSecondary} />
          <Text style={[styles.ghostAddLabel, { color: theme.textSecondary }]}>Add a due date</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 10 },
  label: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.14 * 10,
    textTransform: 'uppercase',
  },
  chipsRow: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1,
    height: 42,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipLabel: { fontFamily: fontFamily.semibold, fontSize: 13 },
  dateRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  dateFieldFlex: { flex: 1 },
  clear: {
    width: 50,
    height: 50,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: 13,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  ghostAddLabel: { fontFamily: fontFamily.semibold, fontSize: 13 },
});
