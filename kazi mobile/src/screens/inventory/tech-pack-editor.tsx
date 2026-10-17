import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { DateField } from '@/components/ui/date-field';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import {
  COMMON_SIZES,
  GARMENT_CATEGORIES,
  MARKETS,
  MAX_TECH_PACK_FABRICS,
  SEASONS,
  fabricDescriptionFor,
  fabricSwatchFor,
} from '@/data/inventory/library';
import type { Fabric, TechPackDraft, TechPackFabric, TechPackMeasurement } from '@/data/inventory/types';

import {
  ChoiceChips,
  EditorSection,
  EditorSheet,
  EditorTitle,
  Field,
  FieldRow,
  GhostAction,
  ImageSlot,
  ImageStrip,
  MultiChips,
} from '@/components/ui/editor-kit';

export interface TechPackEditorProps {
  visible: boolean;
  isNew: boolean;
  draft: TechPackDraft;
  /** The fabric library, for the fabric rows' name → description autofill. */
  fabrics: Fabric[];
  dirty: boolean;
  saving: boolean;
  /** Which image slot is mid-upload, so only that one shows the spinner. */
  uploading: 'front' | 'back' | 'page' | null;
  editable: boolean;
  onChange: (patch: Partial<TechPackDraft>) => void;
  onPickImage: (slot: 'front' | 'back' | 'page') => void;
  onOpenImage: (url: string, title: string) => void;
  onOpenDocument: (url: string) => void;
  onClose: () => void;
  onDiscard: () => void;
  onSave: () => void;
  onDelete?: () => void;
}

/**
 * The Garment Specification Sheet, in full — the reference's
 * `TechPackSpecModal`, which is the paper form a designer fills in per style,
 * not a summary of it. Everything it holds is here: the header block, the
 * measurement grid, front and back sketches, wash care, up to three
 * fabric/lining rows, trims and remarks, plus the scanned pages and external
 * link the older photo-only tech packs carry instead.
 *
 * Nothing about a tech pack was editable on this phone before, which is why
 * this is the longest form in the app: the alternative is that someone stands
 * at a cutting table with the spec in front of them and has to go and find a
 * laptop to correct a measurement.
 */
export function TechPackEditor({
  visible,
  isNew,
  draft,
  fabrics,
  dirty,
  saving,
  uploading,
  editable,
  onChange,
  onPickImage,
  onOpenImage,
  onOpenDocument,
  onClose,
  onDiscard,
  onSave,
  onDelete,
}: TechPackEditorProps) {
  const theme = useTheme();
  const blocked = draft.name.trim() === '' ? 'A garment description is needed' : undefined;

  const patchMeasurement = (index: number, patch: Partial<TechPackMeasurement>) =>
    onChange({ measurements: draft.measurements.map((m, i) => (i === index ? { ...m, ...patch } : m)) });

  const patchFabricRow = (index: number, patch: Partial<TechPackFabric>) =>
    onChange({
      fabrics: draft.fabrics.map((row, i) => {
        if (i !== index) return row;
        const next = { ...row, ...patch };
        // Naming a fabric the library knows fills the description in, exactly as
        // upstream does — and only while it is still blank, so a hand-written
        // one is never overwritten.
        if (patch.fabricName !== undefined && !row.description) {
          next.description = fabricDescriptionFor(fabrics, patch.fabricName) || next.description;
        }
        return next;
      }),
    });

  return (
    <EditorSheet
      visible={visible}
      title={isNew ? 'New specification sheet' : 'Edit tech pack'}
      dirty={dirty}
      saving={saving}
      blockedReason={blocked}
      readOnly={!editable}
      readOnlyNote="You can read the product library but not change it."
      saveLabel={isNew ? 'Create sheet' : 'Save changes'}
      onClose={onClose}
      onDiscard={onDiscard}
      onSave={onSave}
    >
      <View style={styles.body}>
        <EditorTitle
          title={isNew ? 'New specification sheet' : draft.name || 'Untitled tech pack'}
          meta={isNew ? 'Garment specification sheet' : [draft.styleNo, draft.productType].filter(Boolean).join(' · ')}
        />

        <EditorSection label="Header">
          <FieldRow>
            <Field
              label="Style no."
              flex
              value={draft.styleNo}
              onChange={(styleNo) => onChange({ styleNo })}
              placeholder="#KAZI000"
              autoCapitalize="characters"
              editable={editable}
            />
            <View style={styles.flex1}>
              <DateField
                label="Date"
                value={draft.specDate}
                onChange={(specDate) => onChange({ specDate })}
                pickerTitle="Specification date"
                compact
              />
            </View>
          </FieldRow>

          <ChoiceChips
            label="Category"
            options={GARMENT_CATEGORIES}
            value={draft.category}
            onChange={(category) => onChange({ category })}
            editable={editable}
          />
          <ChoiceChips
            label="Market"
            options={MARKETS}
            value={draft.market}
            onChange={(market) => onChange({ market })}
            editable={editable}
            hint="Which side of the UK / Nepal split this appears under on the web app. Left unset it shows under both."
          />
          <ChoiceChips
            label="Season"
            options={SEASONS}
            value={draft.season}
            onChange={(season) => onChange({ season })}
            editable={editable}
          />
          <FieldRow>
            <Field
              label="Spec size"
              flex
              value={draft.specSize}
              onChange={(specSize) => onChange({ specSize })}
              placeholder="Medium, XL"
              editable={editable}
            />
            <Field
              label="Designer"
              flex
              value={draft.designer}
              onChange={(designer) => onChange({ designer })}
              autoCapitalize="words"
              editable={editable}
            />
          </FieldRow>
        </EditorSection>

        <EditorSection label="Garment">
          <Field
            label="Description of garment"
            required
            value={draft.name}
            onChange={(name) => onChange({ name })}
            placeholder="e.g. Men Tailored Tank Top"
            editable={editable}
          />
          <Field
            label="Product type"
            value={draft.productType}
            onChange={(productType) => onChange({ productType })}
            placeholder="T-Shirt, Hoodie, Kurthi…"
            editable={editable}
          />
          <MultiChips
            label="Sizes available"
            options={COMMON_SIZES}
            values={draft.sizes}
            onChange={(sizes) => onChange({ sizes })}
            editable={editable}
          />
        </EditorSection>

        <EditorSection
          label="Measurements (inch)"
          action={
            editable ? (
              <GhostAction
                label="Add point"
                icon="plus"
                onPress={() => onChange({ measurements: [...draft.measurements, { label: '', inch: '' }] })}
              />
            ) : undefined
          }
        >
          {draft.measurements.length === 0 ? (
            <Text style={[styles.empty, { color: theme.textSecondary }]}>No measurement points yet.</Text>
          ) : (
            draft.measurements.map((row, index) => (
              <View key={index} style={styles.gridRow}>
                <Text style={[styles.rowIndex, { color: theme.textSecondary }]}>{index + 1}</Text>
                <View style={styles.grow2}>
                  <Field
                    value={row.label}
                    onChange={(label) => patchMeasurement(index, { label })}
                    placeholder="e.g. Full length"
                    editable={editable}
                  />
                </View>
                <View style={styles.grow1}>
                  <Field
                    value={row.inch}
                    onChange={(inch) => patchMeasurement(index, { inch })}
                    placeholder="Inch"
                    keyboardType="decimal-pad"
                    editable={editable}
                  />
                </View>
                {editable ? (
                  <Pressable
                    onPress={() => onChange({ measurements: draft.measurements.filter((_, i) => i !== index) })}
                    hitSlop={8}
                    style={styles.rowRemove}
                  >
                    <Icon name="trash-2" size={14} color={theme.dangerWashText} />
                  </Pressable>
                ) : null}
              </View>
            ))
          )}
        </EditorSection>

        <EditorSection label="Sketches">
          <FieldRow>
            <ImageSlot
              label="Front"
              url={draft.frontSketchUrl}
              ratio={0.85}
              busy={uploading === 'front'}
              editable={editable}
              onPick={() => onPickImage('front')}
              onRemove={() => onChange({ frontSketchUrl: '' })}
              onOpen={() => onOpenImage(draft.frontSketchUrl, `${draft.name} · Front`)}
            />
            <ImageSlot
              label="Back"
              url={draft.backSketchUrl}
              ratio={0.85}
              busy={uploading === 'back'}
              editable={editable}
              onPick={() => onPickImage('back')}
              onRemove={() => onChange({ backSketchUrl: '' })}
              onOpen={() => onOpenImage(draft.backSketchUrl, `${draft.name} · Back`)}
            />
          </FieldRow>
        </EditorSection>

        <EditorSection
          label="Fabrics / linings"
          action={
            editable && draft.fabrics.length < MAX_TECH_PACK_FABRICS ? (
              <GhostAction
                label="Add fabric"
                icon="plus"
                onPress={() => onChange({ fabrics: [...draft.fabrics, { fabricName: '', description: '' }] })}
              />
            ) : undefined
          }
        >
          {draft.fabrics.map((row, index) => {
            const swatch = fabricSwatchFor(fabrics, row.fabricName);
            return (
              <View key={index} style={[styles.fabricRow, { borderColor: theme.border }]}>
                {swatch ? (
                  <Image source={{ uri: swatch }} style={[styles.fabricSwatch, { borderColor: theme.border }]} resizeMode="cover" />
                ) : null}
                <View style={styles.fabricFields}>
                  <Field
                    value={row.fabricName}
                    onChange={(fabricName) => patchFabricRow(index, { fabricName })}
                    placeholder={`Fabric ${index + 1} name`}
                    autoCapitalize="words"
                    editable={editable}
                  />
                  <Field
                    value={row.description}
                    onChange={(description) => patchFabricRow(index, { description })}
                    placeholder="Composition, construction, GSM"
                    editable={editable}
                  />
                </View>
                {editable && draft.fabrics.length > 1 ? (
                  <Pressable
                    onPress={() => onChange({ fabrics: draft.fabrics.filter((_, i) => i !== index) })}
                    hitSlop={8}
                    style={styles.rowRemove}
                  >
                    <Icon name="trash-2" size={14} color={theme.dangerWashText} />
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </EditorSection>

        <EditorSection label="Make-up">
          <Field
            label="Wash care"
            value={draft.washCare}
            onChange={(washCare) => onChange({ washCare })}
            placeholder="Machine wash, line dry, iron medium, do not bleach"
            editable={editable}
          />
          <Field
            label="Trims and accessories"
            value={draft.trims}
            onChange={(trims) => onChange({ trims })}
            placeholder="e.g. 0.5 inch placket bias, white thread"
            multiline
            editable={editable}
          />
          <Field
            label="Remarks"
            value={draft.remarks}
            onChange={(remarks) => onChange({ remarks })}
            placeholder="Construction notes"
            multiline
            editable={editable}
          />
        </EditorSection>

        <EditorSection
          label="Scanned pages"
          action={editable ? <GhostAction label="Add page" icon="plus" onPress={() => onPickImage('page')} /> : undefined}
        >
          {draft.images.length === 0 ? (
            <Text style={[styles.empty, { color: theme.textSecondary }]}>
              {uploading === 'page' ? 'Uploading…' : 'For a tech pack that exists on paper — photograph it here.'}
            </Text>
          ) : (
            <ImageStrip
              urls={draft.images}
              editable={editable}
              onOpen={(url, index) => onOpenImage(url, `${draft.name} · Page ${index + 1}`)}
              onRemove={(index) => onChange({ images: draft.images.filter((_, i) => i !== index) })}
            />
          )}
          <Field
            label="External link"
            value={draft.techPackUrl}
            onChange={(techPackUrl) => onChange({ techPackUrl })}
            placeholder="https://… (Drive, PDF)"
            autoCapitalize="none"
            editable={editable}
          />
          {draft.techPackUrl ? (
            <Pressable
              onPress={() => onOpenDocument(draft.techPackUrl)}
              style={[styles.doc, { backgroundColor: theme.surface, borderColor: theme.border }]}
            >
              <Icon name="file-text" size={16} color={theme.accentDeep} />
              <Text style={[styles.docLabel, { color: theme.textPrimary }]}>Open the linked document</Text>
              <Icon name="external-link" size={14} color={theme.textSecondary} />
            </Pressable>
          ) : null}
        </EditorSection>

        <EditorSection label="Notes">
          <Field value={draft.notes} onChange={(notes) => onChange({ notes })} multiline editable={editable} />
        </EditorSection>

        {onDelete && !isNew ? (
          <View style={[styles.dangerZone, { borderColor: theme.border }]}>
            <GhostAction label="Delete this tech pack" icon="trash-2" tone="danger" onPress={onDelete} />
          </View>
        ) : null}
      </View>
    </EditorSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: 20 },
  flex1: { flex: 1 },
  empty: { fontSize: 12.5, lineHeight: 12.5 * 1.45 },

  gridRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowIndex: { fontFamily: fontFamily.mono, fontSize: 10.5, width: 14 },
  grow2: { flex: 2 },
  grow1: { flex: 1 },
  rowRemove: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },

  fabricRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderWidth: 1, borderRadius: 14, padding: 9 },
  fabricSwatch: { width: 42, height: 42, borderRadius: 8, borderWidth: 1, marginTop: 3 },
  fabricFields: { flex: 1, gap: 7 },

  doc: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, padding: 12 },
  docLabel: { flex: 1, fontFamily: fontFamily.semibold, fontSize: 13 },

  dangerZone: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 16, alignItems: 'flex-start' },
});
