import { StyleSheet, Text, View } from 'react-native';

import { Money } from '@/components/ui/money';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import { FABRIC_STATUSES, FABRIC_TYPES } from '@/data/inventory/library';
import type { FabricDraft } from '@/data/inventory/types';

import {
  ChoiceChips,
  EditorSection,
  EditorSheet,
  EditorTitle,
  Field,
  FieldRow,
  GhostAction,
  ImageSlot,
} from '@/components/ui/editor-kit';

export interface FabricEditorProps {
  visible: boolean;
  /** true while adding — the heading and the save label follow it. */
  isNew: boolean;
  draft: FabricDraft;
  dirty: boolean;
  saving: boolean;
  uploading: boolean;
  editable: boolean;
  onChange: (patch: Partial<FabricDraft>) => void;
  onPickSwatch: () => void;
  onOpenSwatch: () => void;
  onClose: () => void;
  onDiscard: () => void;
  onSave: () => void;
  onDelete?: () => void;
}

/**
 * A fabric or trim, opened in place on the tab it was tapped from.
 *
 * The fields are the reference's fabric form and drawer put together — the
 * `LibraryModal` fabrics tab has composition, GSM, colours, supplier and
 * price/metre; the `FabricDrawer` adds the swatch, weight, status and
 * price/kg. Splitting them across two screens is a web-layout accident, and on
 * a phone there is only ever one place to look.
 *
 * The one field left out is Region, the web app's UK/Nepal split: it is null on
 * every live fabric and mobile has no region switch to set it from, so the
 * column is neither shown nor written.
 */
export function FabricEditor({
  visible,
  isNew,
  draft,
  dirty,
  saving,
  uploading,
  editable,
  onChange,
  onPickSwatch,
  onOpenSwatch,
  onClose,
  onDiscard,
  onSave,
  onDelete,
}: FabricEditorProps) {
  const theme = useTheme();
  const blocked = draft.name.trim() === '' ? 'A name is needed' : undefined;

  return (
    <EditorSheet
      visible={visible}
      title={isNew ? 'Add fabric or trim' : 'Edit fabric'}
      dirty={dirty}
      saving={saving}
      blockedReason={blocked}
      readOnly={!editable}
      readOnlyNote="You can read the product library but not change it."
      saveLabel={isNew ? 'Add fabric' : 'Save changes'}
      onClose={onClose}
      onDiscard={onDiscard}
      onSave={onSave}
    >
      <View style={styles.body}>
        <EditorTitle
          title={isNew ? 'New fabric or trim' : draft.name || 'Untitled fabric'}
          meta={isNew ? 'Added to the library' : [draft.type || 'Fabric', draft.supplier].filter(Boolean).join(' · ')}
        />

        <EditorSection label="Swatch">
          <ImageSlot
            label="Photo"
            url={draft.swatchUrl}
            ratio={1.4}
            busy={uploading}
            editable={editable}
            onPick={onPickSwatch}
            onRemove={() => onChange({ swatchUrl: '' })}
            onOpen={onOpenSwatch}
          />
        </EditorSection>

        <EditorSection label="Identity">
          <Field
            label="Name"
            required
            value={draft.name}
            onChange={(name) => onChange({ name })}
            placeholder="e.g. 180 GSM Cotton Jersey"
            autoCapitalize="words"
            editable={editable}
          />
          <ChoiceChips label="Type" options={FABRIC_TYPES} value={draft.type} onChange={(type) => onChange({ type })} editable={editable} />
          <ChoiceChips
            label="Status"
            options={FABRIC_STATUSES}
            value={draft.status}
            onChange={(status) => onChange({ status })}
            editable={editable}
          />
        </EditorSection>

        <EditorSection label="Specification">
          <FieldRow>
            <Field
              label="Composition"
              flex
              value={draft.composition}
              onChange={(composition) => onChange({ composition })}
              placeholder="100% Cotton"
              editable={editable}
            />
            <Field
              label="GSM"
              flex
              value={draft.gsm}
              onChange={(gsm) => onChange({ gsm })}
              placeholder="180"
              keyboardType="number-pad"
              editable={editable}
            />
          </FieldRow>
          <Field
            label="Weight"
            value={draft.weight}
            onChange={(weight) => onChange({ weight })}
            placeholder="Light, Mid, Heavy"
            editable={editable}
          />
          <Field
            label="Available colours"
            value={draft.colors}
            onChange={(colors) => onChange({ colors })}
            placeholder="White, Black, Navy"
            autoCapitalize="words"
            editable={editable}
          />
        </EditorSection>

        <EditorSection label="Buying">
          <Field
            label="Supplier"
            value={draft.supplier}
            onChange={(supplier) => onChange({ supplier })}
            autoCapitalize="words"
            editable={editable}
          />
          <FieldRow>
            <Field
              label="Price / metre"
              flex
              value={draft.pricePerMeter}
              onChange={(pricePerMeter) => onChange({ pricePerMeter })}
              placeholder="350"
              keyboardType="decimal-pad"
              editable={editable}
            />
            <Field
              label="Price / kg"
              flex
              value={draft.pricePerKg}
              onChange={(pricePerKg) => onChange({ pricePerKg })}
              placeholder="0"
              keyboardType="decimal-pad"
              editable={editable}
            />
          </FieldRow>
          {Number(draft.pricePerMeter) > 0 ? (
            <View style={styles.priceEcho}>
              <Text style={[styles.priceEchoLabel, { color: theme.textSecondary }]}>Per metre</Text>
              <Money npr={Number(draft.pricePerMeter)} size={14} />
            </View>
          ) : null}
        </EditorSection>

        <EditorSection label="Notes">
          <Field
            value={draft.notes}
            onChange={(notes) => onChange({ notes })}
            placeholder="Anything the next person cutting this should know"
            multiline
            editable={editable}
          />
        </EditorSection>

        {onDelete && !isNew ? (
          <View style={[styles.dangerZone, { borderColor: theme.border }]}>
            <GhostAction label="Delete this fabric" icon="trash-2" tone="danger" onPress={onDelete} />
          </View>
        ) : null}
      </View>
    </EditorSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: 20 },
  priceEcho: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  priceEchoLabel: { fontFamily: fontFamily.mono, fontSize: 9.5, letterSpacing: 0.1 * 9.5, textTransform: 'uppercase' },
  dangerZone: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 16, alignItems: 'flex-start' },
});
