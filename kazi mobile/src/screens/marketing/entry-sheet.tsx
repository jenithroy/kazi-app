import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import { KIND_ORDER, KINDS, MONTHS, PEOPLE, WEEKDAYS } from '@/data/marketing/mock';
import type { CalendarEntry } from '@/data/marketing/types';

export interface EntrySheetProps {
  visible: boolean;
  mode: 'new' | 'edit' | null;
  draft: CalendarEntry | null;
  onClose: () => void;
  onChange: (patch: Partial<CalendarEntry>) => void;
  onSave: () => void;
  onDelete: () => void;
}

export function EntrySheet({ visible, mode, draft, onClose, onChange, onSave, onDelete }: EntrySheetProps) {
  const theme = useTheme();
  if (!draft) return null;

  const daysInMonth = new Date(draft.y, draft.m + 1, 0).getDate();
  const dateOptions = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <BottomSheet visible={visible} onClose={onClose} title={mode === 'new' ? 'New entry' : 'Edit entry'}>
      <TextField label="Title" value={draft.title} onChangeText={(v) => onChange({ title: v })} placeholder="What is going out?" />

      <View style={styles.group}>
        <View style={styles.dateHeaderRow}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>Date</Text>
          <Text style={[styles.dateNote, tabularNums, { color: theme.textSecondary }]}>
            {MONTHS[draft.m]} {draft.y}
          </Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateRow}>
          {dateOptions.map((day) => {
            const on = draft.d === day;
            return (
              <Pressable
                key={day}
                onPress={() => onChange({ d: day })}
                style={[styles.dateChip, { backgroundColor: on ? theme.selectedSurface : theme.surface, borderColor: on ? theme.selectedBorder : theme.border }]}
              >
                <Text style={[styles.dateWeekday, { color: on ? theme.selectedTextMuted : theme.textSecondary }]}>{WEEKDAYS[new Date(draft.y, draft.m, day).getDay()]}</Text>
                <Text style={[styles.dateDay, tabularNums, { color: on ? theme.selectedText : theme.textPrimary }]}>{day}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.group}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Type</Text>
        <View style={styles.kindGrid}>
          {KIND_ORDER.map((k) => {
            const meta = KINDS[k];
            const on = draft.kind === k;
            return (
              <Pressable
                key={k}
                onPress={() => onChange({ kind: k })}
                style={[styles.kindButton, { backgroundColor: on ? meta.bg : theme.surface, borderColor: on ? meta.color : theme.border }]}
              >
                <View style={[styles.kindDot, { backgroundColor: meta.color }]} />
                <Text style={[styles.kindLabel, { color: on ? meta.fg : theme.textPrimary }]}>{meta.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.group}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Notes</Text>
        <TextInput
          value={draft.notes}
          onChangeText={(v) => onChange({ notes: v })}
          placeholder="Angle, assets needed, who is drafting it…"
          placeholderTextColor={theme.textSecondary}
          multiline
          style={[styles.textarea, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.textPrimary }]}
        />
      </View>

      <View style={styles.group}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Owner</Text>
        <View style={styles.peopleRow}>
          {PEOPLE.map((p) => {
            const on = draft.person === p.id;
            return (
              <Pressable key={p.id} onPress={() => onChange({ person: p.id })} style={styles.personButton}>
                <Avatar initials={p.initials} tint={p.tint} size="lg" borderColor={on ? theme.accent : undefined} />
                <Text style={[styles.personName, { color: on ? theme.textPrimary : theme.textSecondary, fontFamily: on ? fontFamily.semibold : fontFamily.regular }]}>
                  {p.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.footer}>
        <Button label={mode === 'new' ? 'Add to calendar' : 'Save changes'} onPress={onSave} fullWidth style={styles.saveButton} />
        {mode === 'edit' ? <Button label="Delete entry" variant="dangerOutline" onPress={onDelete} fullWidth /> : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  group: { gap: 9 },
  label: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.14 * 10, textTransform: 'uppercase' },
  dateHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateNote: { fontFamily: fontFamily.mono, fontSize: 11 },
  dateRow: { gap: 7, paddingBottom: 2 },
  dateChip: { width: 48, height: 60, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  dateWeekday: { fontFamily: fontFamily.mono, fontSize: 9.5, letterSpacing: 0.08 * 9.5, textTransform: 'uppercase' },
  dateDay: { fontSize: 17, fontWeight: '600' },
  kindGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kindButton: { width: '47%', flexGrow: 1, height: 46, borderRadius: 13, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  kindDot: { width: 7, height: 7, borderRadius: 99 },
  kindLabel: { fontFamily: fontFamily.semibold, fontSize: 13.5 },
  textarea: { minHeight: 72, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14, borderWidth: 1, fontSize: 15, lineHeight: 15 * 1.5, textAlignVertical: 'top' },
  peopleRow: { flexDirection: 'row', gap: 10 },
  personButton: { width: 56, alignItems: 'center', gap: 6 },
  personName: { fontSize: 11, textAlign: 'center' },
  footer: { gap: 10, paddingTop: 4 },
  saveButton: { height: 54 },
});
