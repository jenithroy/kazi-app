import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { TextField } from '@/components/ui/text-field';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';

export interface AddDraft {
  name: string;
  /** The real product code — `#kazi1011` / `IT001`. It is what `product_costs` joins on. */
  sku: string;
  qty: string;
  threshold: string;
  unit: string;
  kind: string;
  note: string;
}

export interface UploadEntry {
  name: string;
  meta: string;
  /** Public `product-media` URL of the file that actually went up. */
  url: string;
}

export interface AddSheetProps {
  visible: boolean;
  isFabric: boolean;
  step: 1 | 2 | 3;
  draft: AddDraft;
  uploads: UploadEntry[];
  uploading?: boolean;
  onClose: () => void;
  onChange: (patch: Partial<AddDraft>) => void;
  onUpload: () => void;
  onRemoveUpload: (index: number) => void;
  onBack: () => void;
  onNext: () => void;
}

const UNIT_OPTIONS = ['m', 'kg', 'pcs'];
const KIND_OPTIONS = ['Sketch', 'Spec', 'Lab dip'];
const STEP_NAMES_FABRIC = ['Details', 'Photo', 'Review'];
const STEP_NAMES_LIBRARY = ['Item details', 'Photo', 'Review'];

export function AddSheet({ visible, isFabric, step, draft, uploads, uploading, onClose, onChange, onUpload, onRemoveUpload, onBack, onNext }: AddSheetProps) {
  const theme = useTheme();
  const stepNames = isFabric ? STEP_NAMES_FABRIC : STEP_NAMES_LIBRARY;
  // The code is what joins the row to its costing sheet in the web ERP, so the
  // step will not advance without one.
  const canAdvance = step !== 1 || !isFabric || (draft.name.trim().length > 0 && draft.sku.trim().length > 0);

  return (
    <BottomSheet visible={visible} onClose={onClose} title={isFabric ? 'Add fabric' : 'Add library item'}>
      <View style={styles.stepHeader}>
        <Text style={[styles.stepLabel, { color: theme.textSecondary }]}>
          Step {step} of 3 · {stepNames[step - 1]}
        </Text>
        <View style={styles.progressRow}>
          {[1, 2, 3].map((n) => (
            <View key={n} style={[styles.progressSegment, { backgroundColor: n <= step ? theme.accent : theme.border }]} />
          ))}
        </View>
      </View>

      {step === 1 ? (
        <Animated.View entering={FadeInUp.duration(200)} style={styles.stepGroup}>
          <TextField
            label={isFabric ? 'Fabric or trim name' : 'Item name'}
            value={draft.name}
            onChangeText={(v) => onChange({ name: v })}
            placeholder={isFabric ? 'e.g. Anti-Grunge Cotton' : 'e.g. Oversized hoodie · AW26'}
          />
          {isFabric ? (
            <>
              <TextField
                label="Item code"
                value={draft.sku}
                onChangeText={(v) => onChange({ sku: v })}
                placeholder="e.g. #kazi1011"
                autoCapitalize="none"
              />
              <View style={styles.row2}>
                <View style={styles.flex1}>
                  <TextField label="Opening qty" value={draft.qty} onChangeText={(v) => onChange({ qty: v })} placeholder="0" keyboardType="numeric" />
                </View>
                <View style={styles.flex1}>
                  <TextField label="Reorder at" value={draft.threshold} onChangeText={(v) => onChange({ threshold: v })} placeholder="0" keyboardType="numeric" />
                </View>
              </View>
              <View style={styles.optionGroup}>
                <Text style={[styles.optionLabel, { color: theme.textSecondary }]}>Unit</Text>
                <View style={styles.optionsRow}>
                  {UNIT_OPTIONS.map((u) => {
                    const on = draft.unit === u;
                    return (
                      <Pressable
                        key={u}
                        onPress={() => onChange({ unit: u })}
                        style={[styles.optionButton, { backgroundColor: on ? theme.selectedSurface : theme.surface, borderColor: on ? theme.selectedBorder : theme.border }]}
                      >
                        <Text style={[styles.optionButtonLabel, { color: on ? theme.selectedText : theme.textPrimary }]}>{u}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </>
          ) : (
            <View style={styles.optionGroup}>
              <Text style={[styles.optionLabel, { color: theme.textSecondary }]}>Type</Text>
              <View style={styles.optionsRow}>
                {KIND_OPTIONS.map((k) => {
                  const on = draft.kind === k;
                  return (
                    <Pressable
                      key={k}
                      onPress={() => onChange({ kind: k })}
                      style={[styles.optionButton, { backgroundColor: on ? theme.selectedSurface : theme.surface, borderColor: on ? theme.selectedBorder : theme.border }]}
                    >
                      <Text style={[styles.optionButtonLabel, { color: on ? theme.selectedText : theme.textPrimary }]}>{k}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}
        </Animated.View>
      ) : step === 2 ? (
        <Animated.View entering={FadeInUp.duration(200)} style={styles.stepGroup}>
          <Pressable
            onPress={onUpload}
            disabled={uploading}
            style={[styles.dropzone, { backgroundColor: uploads.length ? theme.accentWash : theme.surfaceRaised, borderColor: uploads.length ? theme.accent : theme.border }]}
          >
            <View style={[styles.dropIcon, { backgroundColor: theme.accentWash }]}>
              <Icon name="upload" size={22} color={theme.accentWashText} />
            </View>
            <Text style={[styles.dropTitle, { color: theme.textPrimary }]}>
              {uploading ? 'Uploading…' : 'Tap to add a photo'}
            </Text>
            <Text style={[styles.dropHint, { color: theme.textSecondary }]}>
              {isFabric ? 'A swatch photo or the roll label. JPG or PNG, up to 10 MB.' : 'The sketch, spec sheet or approval photo. PDF, AI, JPG or PNG.'}
            </Text>
          </Pressable>
          {uploads.map((u, i) => (
            <View key={i} style={[styles.uploadRow, { backgroundColor: theme.surface }]}>
              <View style={[styles.uploadThumb, { borderColor: theme.border }]} />
              <View style={styles.uploadTextWrap}>
                <Text style={[styles.uploadName, { color: theme.textPrimary }]} numberOfLines={1}>
                  {u.name}
                </Text>
                <Text style={[styles.uploadMeta, tabularNums, { color: theme.textSecondary }]}>{u.meta}</Text>
              </View>
              <Pressable onPress={() => onRemoveUpload(i)} style={[styles.removeButton, { borderColor: theme.scheme === 'light' ? '#E3C9BE' : theme.border }]}>
                <Icon name="x" size={14} color={theme.dangerWashText} />
              </Pressable>
            </View>
          ))}
          <Text style={[styles.footnote, { color: theme.textSecondary }]}>
            A photo is optional but it is how the floor recognises a roll — the store keeper matches the swatch, not the SKU.
          </Text>
        </Animated.View>
      ) : (
        <Animated.View entering={FadeInUp.duration(200)} style={styles.stepGroup}>
          <View style={[styles.reviewCard, { backgroundColor: theme.surface }]}>
            {(isFabric
              ? [
                  { label: 'Name', value: draft.name.trim() || 'Untitled fabric' },
                  { label: 'Item code', value: draft.sku.trim() || '—' },
                  { label: 'Opening qty', value: `${draft.qty || '0'} ${draft.unit}` },
                  { label: 'Reorder at', value: `${draft.threshold || '0'} ${draft.unit}` },
                  { label: 'Photo', value: uploads.length ? `${uploads.length} attached` : 'None' },
                  { label: 'Added by', value: 'Prakash T. · today' },
                ]
              : [
                  { label: 'Name', value: draft.name.trim() || 'Untitled item' },
                  { label: 'Type', value: draft.kind },
                  { label: 'File', value: uploads.length ? `${uploads.length} attached` : 'None' },
                  { label: 'Added by', value: 'Prakash T. · today' },
                ]
            ).map((r, i) => (
              <View key={r.label} style={[styles.reviewRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.background }]}>
                <Text style={[styles.reviewLabel, { color: theme.textSecondary }]}>{r.label}</Text>
                <Text style={[styles.reviewValue, tabularNums, { color: theme.textPrimary }]}>{r.value}</Text>
              </View>
            ))}
          </View>
          <TextField label="Note (optional)" value={draft.note} onChangeText={(v) => onChange({ note: v })} placeholder="Where is it stored?" />
        </Animated.View>
      )}

      <View style={styles.actionsRow}>
        {step > 1 ? <Button label="Back" variant="secondary" onPress={onBack} style={styles.backAction} /> : null}
        <View style={styles.flex1}>
          <Button
            label={step === 3 ? (isFabric ? 'Save fabric' : 'Save item') : 'Continue'}
            onPress={onNext}
            disabled={!canAdvance}
            fullWidth
          />
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  stepHeader: { gap: 8, marginTop: -8 },
  stepLabel: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.11 * 10, textTransform: 'uppercase' },
  progressRow: { flexDirection: 'row', gap: 4 },
  progressSegment: { flex: 1, height: 4, borderRadius: 99 },
  stepGroup: { gap: 12 },
  row2: { flexDirection: 'row', gap: 10 },
  flex1: { flex: 1 },
  optionGroup: { gap: 7 },
  optionLabel: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.11 * 10, textTransform: 'uppercase' },
  optionsRow: { flexDirection: 'row', gap: 7 },
  optionButton: { flex: 1, height: 44, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  optionButtonLabel: { fontFamily: fontFamily.semibold, fontSize: 13.5 },
  dropzone: { borderRadius: 20, borderWidth: 1.5, borderStyle: 'dashed', paddingVertical: 34, paddingHorizontal: 20, alignItems: 'center', gap: 11 },
  dropIcon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dropTitle: { fontFamily: fontFamily.semibold, fontSize: 15.5 },
  dropHint: { fontSize: 12.5, lineHeight: 12.5 * 1.5, textAlign: 'center', maxWidth: 260 },
  uploadRow: { flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 16, padding: 11 },
  uploadThumb: { width: 46, height: 46, borderRadius: 12, borderWidth: 1 },
  uploadTextWrap: { flex: 1, gap: 4, minWidth: 0 },
  uploadName: { fontSize: 13.5, fontWeight: '600' },
  uploadMeta: { fontFamily: fontFamily.mono, fontSize: 10.5 },
  removeButton: { width: 34, height: 34, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  footnote: { fontSize: 12.5, lineHeight: 12.5 * 1.5 },
  reviewCard: { borderRadius: 20, padding: 16 },
  reviewRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 14, paddingVertical: 11 },
  reviewLabel: { fontFamily: fontFamily.mono, fontSize: 10.5, letterSpacing: 0.09 * 10.5, textTransform: 'uppercase' },
  reviewValue: { fontSize: 14, fontWeight: '600' },
  actionsRow: { flexDirection: 'row', gap: 8 },
  backAction: { width: 62 },
});
