import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { DateField } from '@/components/ui/date-field';
import { DualDate } from '@/components/ui/dual-date';
import { Icon } from '@/components/ui/icon';
import { TextField } from '@/components/ui/text-field';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import type { Expense, VatBill, VatBillKind } from '@/data/finance/types';

export interface VatBillDraft {
  expenseId: string;
  fileName: string;
  kind: VatBillKind;
  /** AD ISO date the bill is filed under. */
  date: string;
}

interface UploadProps {
  mode: 'upload';
  /** Expenses with no VAT bill yet. */
  candidates: Expense[];
  draft: VatBillDraft;
  onChange: (patch: Partial<VatBillDraft>) => void;
  onSave: () => void;
  bill?: undefined;
  onDelete?: undefined;
}

interface ViewProps {
  mode: 'view';
  bill: VatBill;
  onDelete: () => void;
  candidates?: undefined;
  draft?: undefined;
  onChange?: undefined;
  onSave?: undefined;
}

export type VatBillSheetProps = { visible: boolean; onClose: () => void } & (UploadProps | ViewProps);

const KINDS: { id: VatBillKind; label: string; icon: 'image' | 'file-text' }[] = [
  { id: 'image', label: 'Photo', icon: 'image' },
  { id: 'pdf', label: 'PDF', icon: 'file-text' },
];

export function VatBillSheet(props: VatBillSheetProps) {
  const theme = useTheme();
  const { visible, onClose } = props;

  if (props.mode === 'view') {
    const { bill, onDelete } = props;
    return (
      <BottomSheet visible={visible} onClose={onClose} title="VAT bill">
        <View style={[styles.preview, { backgroundColor: theme.draftWash, borderColor: theme.border }]}>
          <Icon name={bill.kind === 'pdf' ? 'file-text' : 'image'} size={30} color={theme.textSecondary} />
          <Text style={[styles.previewName, { color: theme.textPrimary }]}>{bill.fileName}</Text>
          <Text style={[styles.previewMeta, { color: theme.textSecondary }]}>Preview not available in mock build</Text>
        </View>
        <View style={styles.facts}>
          <Fact label="Expense" value={`${bill.item} · ${bill.expenseId.toUpperCase()}`} />
          <Fact label="Uploaded by" value={bill.uploadedBy} />
        </View>
        <View style={styles.dateRow}>
          <Text style={[styles.factLabel, { color: theme.textSecondary }]}>Date</Text>
          <DualDate iso={bill.date} inline size={13} />
        </View>
        <Button label="Delete bill" variant="dangerOutline" onPress={onDelete} />
      </BottomSheet>
    );
  }

  const { candidates, draft, onChange, onSave } = props;
  const ready = !!draft.expenseId && draft.fileName.trim().length > 0;

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Upload VAT bill">
      <View style={styles.group}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Link to expense</Text>
        {candidates.length === 0 ? (
          <Text style={[styles.emptyNote, { color: theme.textSecondary }]}>Every expense already has a VAT bill.</Text>
        ) : (
          <View style={styles.candidates}>
            {candidates.map((e) => {
              const on = draft.expenseId === e.id;
              return (
                <Pressable
                  key={e.id}
                  onPress={() => onChange({ expenseId: e.id })}
                  style={[styles.candidate, { backgroundColor: on ? theme.selectedSurface : theme.surface, borderColor: on ? theme.selectedBorder : theme.border }]}
                >
                  <Text style={[styles.candidateName, { color: on ? theme.selectedText : theme.textPrimary }]} numberOfLines={1}>
                    {e.name}
                  </Text>
                  <Text style={[styles.candidateMeta, { color: on ? theme.selectedTextMuted : theme.textSecondary }]} numberOfLines={1}>
                    {e.id.toUpperCase()} · {e.status}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      <View style={styles.group}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>File type</Text>
        <View style={styles.kinds}>
          {KINDS.map((k) => {
            const on = draft.kind === k.id;
            return (
              <Pressable
                key={k.id}
                onPress={() => onChange({ kind: k.id })}
                style={[styles.kind, { backgroundColor: on ? theme.accentWash : theme.surface, borderColor: on ? theme.accent : theme.border }]}
              >
                <Icon name={k.icon} size={16} color={on ? theme.accentWashText : theme.textSecondary} />
                <Text style={[styles.kindLabel, { color: on ? theme.accentWashText : theme.textPrimary }]}>{k.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <TextField
        label="File name"
        value={draft.fileName}
        onChangeText={(v) => onChange({ fileName: v })}
        placeholder={draft.kind === 'pdf' ? 'e.g. nea-44112.pdf' : 'e.g. bill-photo.jpg'}
      />

      <DateField label="Bill date" value={draft.date} onChange={(iso) => onChange({ date: iso })} pickerTitle="VAT bill date" />

      <Button label={ready ? 'Save VAT bill' : 'Pick an expense & file name'} onPress={onSave} disabled={!ready} />
    </BottomSheet>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={styles.fact}>
      <Text style={[styles.factLabel, { color: theme.textSecondary }]}>{label}</Text>
      <Text style={[styles.factValue, { color: theme.textPrimary }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 8 },
  label: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.11 * 10, textTransform: 'uppercase' },
  emptyNote: { fontSize: 13 },
  candidates: { gap: 7 },
  candidate: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 10, gap: 2 },
  candidateName: { fontSize: 13.5, fontWeight: '600' },
  candidateMeta: { fontFamily: fontFamily.mono, fontSize: 10 },
  kinds: { flexDirection: 'row', gap: 8 },
  kind: { flex: 1, height: 46, borderRadius: 13, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  kindLabel: { fontFamily: fontFamily.semibold, fontSize: 13.5 },
  preview: { borderRadius: 16, borderWidth: 1, paddingVertical: 26, alignItems: 'center', gap: 8 },
  previewName: { fontSize: 14, fontWeight: '600' },
  previewMeta: { fontSize: 11.5 },
  facts: { gap: 12 },
  fact: { gap: 3 },
  factLabel: { fontFamily: fontFamily.mono, fontSize: 9.5, letterSpacing: 0.11 * 9.5, textTransform: 'uppercase' },
  factValue: { fontSize: 14, fontWeight: '600' },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
