import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { TextField } from '@/components/ui/text-field';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import { isRelayConfigured } from '@/data/bug-reports/api';
import { BUG_AREAS, SEVERITY_META, SEVERITY_ORDER } from '@/data/bug-reports/mock';
import type { BugReportDraft } from '@/data/bug-reports/types';

export interface ReportSheetProps {
  visible: boolean;
  draft: BugReportDraft | null;
  onClose: () => void;
  onChange: (patch: Partial<BugReportDraft>) => void;
  onSubmit: () => void;
}

export function ReportSheet({ visible, draft, onClose, onChange, onSubmit }: ReportSheetProps) {
  const theme = useTheme();
  if (!draft) return null;

  const canSubmit = draft.title.trim().length > 0 && draft.steps.trim().length > 0;

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Report a bug">
      <TextField
        label="Title"
        value={draft.title}
        onChangeText={(v) => onChange({ title: v })}
        placeholder="Short summary of what's wrong"
        autoCapitalize="sentences"
      />

      <View style={styles.group}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Area</Text>
        <View style={styles.chipWrap}>
          {BUG_AREAS.map((a) => {
            const on = draft.area === a;
            return (
              <Pressable
                key={a}
                onPress={() => onChange({ area: a })}
                style={[styles.chip, { backgroundColor: on ? theme.selectedSurface : theme.surface, borderColor: on ? theme.selectedBorder : theme.border }]}
              >
                <Text style={[styles.chipLabel, { color: on ? theme.selectedText : theme.textPrimary }]}>{a}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.group}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Severity</Text>
        <View style={styles.sevRow}>
          {SEVERITY_ORDER.map((s) => {
            const meta = SEVERITY_META[s];
            const on = draft.severity === s;
            return (
              <Pressable
                key={s}
                onPress={() => onChange({ severity: s })}
                style={[styles.sevButton, { backgroundColor: on ? theme.surface : theme.surface, borderColor: on ? meta.dot : theme.border }]}
              >
                <View style={[styles.sevDot, { backgroundColor: meta.dot }]} />
                <Text style={[styles.sevLabel, { color: on ? theme.textPrimary : theme.textSecondary, fontFamily: on ? fontFamily.semibold : fontFamily.regular }]}>
                  {meta.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.group}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Steps to reproduce</Text>
        <TextInput
          value={draft.steps}
          onChangeText={(v) => onChange({ steps: v })}
          placeholder="What you did, what happened, what you expected…"
          placeholderTextColor={theme.textSecondary}
          multiline
          style={[styles.textarea, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.textPrimary }]}
        />
      </View>

      <Pressable
        onPress={() => onChange({ screenshot: !draft.screenshot })}
        style={[styles.attachRow, { backgroundColor: theme.surface, borderColor: draft.screenshot ? theme.accent : theme.border }]}
      >
        <Icon name={draft.screenshot ? 'check-square' : 'camera'} size={16} color={draft.screenshot ? theme.accentDeep : theme.textSecondary} />
        <Text style={[styles.attachLabel, { color: draft.screenshot ? theme.textPrimary : theme.textSecondary }]}>
          {draft.screenshot ? 'Screenshot will be attached' : 'Attach a screenshot'}
        </Text>
        <Text style={[styles.attachNote, { color: theme.textSecondary }]}>image upload soon</Text>
      </Pressable>

      <View style={styles.footer}>
        <Button label="Submit report" onPress={onSubmit} disabled={!canSubmit} fullWidth style={styles.submit} />
        <Text style={[styles.footNote, { color: theme.textSecondary }]}>
          {isRelayConfigured()
            ? 'Posts to the team’s Discord channel, and stays on this phone so you can find it again.'
            : 'Saved on this phone for now — reports aren’t sent to the team yet.'}
        </Text>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  group: { gap: 9 },
  label: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.14 * 10, textTransform: 'uppercase' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { height: 34, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chipLabel: { fontFamily: fontFamily.medium, fontSize: 12.5 },
  sevRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sevButton: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 40, paddingHorizontal: 13, borderRadius: 12, borderWidth: 1 },
  sevDot: { width: 8, height: 8, borderRadius: 99 },
  sevLabel: { fontSize: 13 },
  textarea: { minHeight: 96, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14, borderWidth: 1, fontSize: 15, lineHeight: 15 * 1.5, textAlignVertical: 'top' },
  attachRow: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, paddingHorizontal: 14, borderRadius: 13, borderWidth: 1 },
  attachLabel: { flex: 1, fontFamily: fontFamily.medium, fontSize: 13 },
  attachNote: { fontFamily: fontFamily.mono, fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.08 * 9.5 },
  footer: { paddingTop: 4, gap: 9 },
  footNote: { fontSize: 12, textAlign: 'center' },
  submit: { height: 54 },
});
