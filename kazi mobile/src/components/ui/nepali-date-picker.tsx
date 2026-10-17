import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { datePair } from '@/lib/date-display';
import { BS_MONTHS_EN, bsFromAD, bsToAD, type BSParts } from '@/lib/nepaliDate';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';

import { setCalendarPreference, useCalendarPreference, type DateCalendar } from '@/lib/calendar-preference';
import { BottomSheet } from './bottom-sheet';
import { Button } from './button';

export type { DateCalendar };

export interface NepaliDatePickerProps {
  visible: boolean;
  onClose: () => void;
  /** Currently selected date as an AD ISO string (`YYYY-MM-DD`). */
  value: string;
  /** Called with the chosen AD ISO string when the user confirms. */
  onChange: (adISO: string) => void;
  title?: string;
  /** Years offered around the date the picker opened on. Default 4 back / 1 forward. */
  yearsBack?: number;
  yearsForward?: number;
}

const AD_MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const todayISO = () => new Date().toISOString().slice(0, 10);
const pad = (n: number) => String(n).padStart(2, '0');

interface ADParts {
  year: number;
  /** 1-indexed, matching `BSParts`. */
  month: number;
  date: number;
}

function adFromISO(iso: string): ADParts {
  const [year, month, date] = iso.split('-').map(Number);
  return { year, month, date };
}
function adToISO(p: ADParts): string {
  return `${p.year}-${pad(p.month)}-${pad(p.date)}`;
}

/** Day 0 of the next month is the last day of this one. */
function daysInADMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function daysInBSMonth(year: number, month: number): number {
  const start = new Date(`${bsToAD({ year, month, date: 1 })}T12:00:00`);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const next = new Date(`${bsToAD({ year: nextYear, month: nextMonth, date: 1 })}T12:00:00`);
  return Math.round((next.getTime() - start.getTime()) / 86_400_000);
}

function yearsAround(year: number, back: number, forward: number): number[] {
  const out: number[] = [];
  for (let y = year - back; y <= year + forward; y++) out.push(y);
  return out;
}

/**
 * Date picker with a Bikram Sambat / Gregorian switch — the reference
 * `DualDateInput` lets every date field be entered in either calendar, with the
 * stored value staying an AD ISO string either way. The chosen calendar sticks
 * for the session, so someone who works in AD isn't re-switching on every sheet.
 */
export function NepaliDatePicker({
  visible,
  onClose,
  value,
  onChange,
  title = 'Pick a date',
  yearsBack = 4,
  yearsForward = 1,
}: NepaliDatePickerProps) {
  const theme = useTheme();
  // The switch writes straight to the session preference, so flipping it here
  // also flips every `DateField` chip in the app — one calendar, everywhere.
  const calendar = useCalendarPreference();
  const setCalendar = setCalendarPreference;
  const [iso, setIso] = useState(() => value || todayISO());
  /** The date the picker opened on — the year columns stay anchored to it. */
  const [anchor, setAnchor] = useState(iso);
  const [wasVisible, setWasVisible] = useState(visible);

  // The sheets that own this picker stay mounted, so the draft is re-seeded on
  // each open — otherwise a second open still shows the first open's pick.
  // Adjusted during render rather than from an effect (see `BottomSheet`).
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      const opened = value || todayISO();
      setIso(opened);
      setAnchor(opened);
    }
  }

  const bs = bsFromAD(iso);
  const ad = adFromISO(iso);
  const preview = datePair(iso, calendar);

  const bsYears = yearsAround(bsFromAD(anchor).year, yearsBack, yearsForward);
  const adYears = yearsAround(adFromISO(anchor).year, yearsBack, yearsForward);

  const setBS = (patch: Partial<BSParts>) => {
    const merged = { ...bs, ...patch };
    setIso(bsToAD({ ...merged, date: Math.min(merged.date, daysInBSMonth(merged.year, merged.month)) }));
  };
  const setAD = (patch: Partial<ADParts>) => {
    const merged = { ...ad, ...patch };
    setIso(adToISO({ ...merged, date: Math.min(merged.date, daysInADMonth(merged.year, merged.month)) }));
  };

  const bsDays = Array.from({ length: daysInBSMonth(bs.year, bs.month) }, (_, i) => i + 1);
  const adDays = Array.from({ length: daysInADMonth(ad.year, ad.month) }, (_, i) => i + 1);

  const column = (
    items: (number | string)[],
    isActive: (item: number | string, index: number) => boolean,
    onPick: (index: number) => void,
    label: string,
    flex: number,
  ) => (
    <View style={[styles.col, { flex }]}>
      <Text style={[styles.colLabel, { color: theme.textSecondary }]}>{label}</Text>
      <ScrollView style={styles.colScroll} contentContainerStyle={styles.colContent} showsVerticalScrollIndicator={false}>
        {items.map((item, index) => {
          const on = isActive(item, index);
          return (
            <Pressable
              key={`${item}`}
              onPress={() => onPick(index)}
              style={[styles.cell, on && { backgroundColor: theme.selectedSurface, borderColor: theme.selectedBorder }]}
            >
              <Text
                style={[styles.cellText, tabularNums, { color: on ? theme.selectedText : theme.textPrimary }]}
                numberOfLines={1}
              >
                {item}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  return (
    <BottomSheet visible={visible} onClose={onClose} title={title} maxHeight={600}>
      <View style={styles.calendarRow}>
        {([
          { id: 'bs' as const, label: 'Nepali · BS' },
          { id: 'ad' as const, label: 'English · AD' },
        ]).map((c) => {
          const on = calendar === c.id;
          return (
            <Pressable
              key={c.id}
              onPress={() => setCalendar(c.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[
                styles.calendarButton,
                { backgroundColor: on ? theme.selectedSurface : theme.surface, borderColor: on ? theme.selectedBorder : theme.border },
              ]}
            >
              <Text style={[styles.calendarLabel, { color: on ? theme.selectedText : theme.textPrimary }]}>{c.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.columns}>
        {calendar === 'bs' ? (
          <>
            {column(bsYears, (y) => y === bs.year, (i) => setBS({ year: bsYears[i] }), 'Year', 1)}
            {column(BS_MONTHS_EN.map((m) => m), (_, i) => i + 1 === bs.month, (i) => setBS({ month: i + 1 }), 'Month', 1.4)}
            {column(bsDays, (d) => d === bs.date, (i) => setBS({ date: bsDays[i] }), 'Day', 0.8)}
          </>
        ) : (
          <>
            {column(adYears, (y) => y === ad.year, (i) => setAD({ year: adYears[i] }), 'Year', 1)}
            {column(AD_MONTHS_EN, (_, i) => i + 1 === ad.month, (i) => setAD({ month: i + 1 }), 'Month', 1.4)}
            {column(adDays, (d) => d === ad.date, (i) => setAD({ date: adDays[i] }), 'Day', 0.8)}
          </>
        )}
      </View>

      {/* The calendar being entered in leads here as well, so the big line and
          the columns above it are never reading different dates. */}
      <View style={[styles.preview, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.previewBS, { color: theme.textPrimary }]}>{preview.primary}</Text>
        <Text style={[styles.previewAD, tabularNums, { color: theme.textSecondary }]}>
          {preview.secondary} {preview.secondarySuffix}
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable onPress={() => setIso(todayISO())}>
          <Text style={[styles.today, { color: theme.link }]}>Today</Text>
        </Pressable>
        <Button
          label="Set date"
          onPress={() => {
            onChange(iso);
            onClose();
          }}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  calendarRow: { flexDirection: 'row', gap: 8 },
  calendarButton: { flex: 1, height: 42, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  calendarLabel: { fontFamily: fontFamily.semibold, fontSize: 13 },
  columns: { flexDirection: 'row', gap: 10, height: 240 },
  col: { gap: 8 },
  colLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 9.5,
    letterSpacing: 0.11 * 9.5,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  colScroll: { flex: 1 },
  colContent: { gap: 4, paddingVertical: 2 },
  cell: { height: 38, borderRadius: 10, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  cellText: { fontSize: 13.5, fontWeight: '600' },
  preview: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 3, alignItems: 'center' },
  previewBS: { fontSize: 16, fontWeight: '600' },
  previewAD: { fontFamily: fontFamily.mono, fontSize: 11 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  today: { fontSize: 13.5, fontWeight: '600' },
});
