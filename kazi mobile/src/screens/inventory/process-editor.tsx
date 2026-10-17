import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import { PROCESS_CATEGORIES } from '@/data/inventory/library';
import type { ProcessDraft } from '@/data/inventory/types';

import { ChoiceChips, EditorSection, EditorSheet, EditorTitle, Field, FieldRow, GhostAction } from '@/components/ui/editor-kit';

export interface ProcessEditorProps {
  visible: boolean;
  isNew: boolean;
  draft: ProcessDraft;
  dirty: boolean;
  saving: boolean;
  editable: boolean;
  onChange: (patch: Partial<ProcessDraft>) => void;
  onClose: () => void;
  onDiscard: () => void;
  onSave: () => void;
  onDelete?: () => void;
}

/**
 * A costed production step — the reference's `LibraryModal` processes tab.
 *
 * The specification gets the tallest field on the screen because it is the
 * record: the nine live processes carry a couple of hundred words each of
 * routing times, work-centre capacity and BOM scrap factors, and a two-line box
 * would make the one field people actually come here to read unreadable.
 */
export function ProcessEditor({
  visible,
  isNew,
  draft,
  dirty,
  saving,
  editable,
  onChange,
  onClose,
  onDiscard,
  onSave,
  onDelete,
}: ProcessEditorProps) {
  const theme = useTheme();
  const blocked = draft.name.trim() === '' ? 'A name is needed' : undefined;

  return (
    <EditorSheet
      visible={visible}
      title={isNew ? 'Add process' : 'Edit process'}
      dirty={dirty}
      saving={saving}
      blockedReason={blocked}
      readOnly={!editable}
      readOnlyNote="You can read the product library but not change it."
      saveLabel={isNew ? 'Add process' : 'Save changes'}
      onClose={onClose}
      onDiscard={onDiscard}
      onSave={onSave}
    >
      <View style={styles.body}>
        <EditorTitle
          title={isNew ? 'New process' : draft.name || 'Untitled process'}
          meta={isNew ? 'Added to the costing list' : draft.category}
        />

        <EditorSection label="Identity">
          <Field
            label="Name"
            required
            value={draft.name}
            onChange={(name) => onChange({ name })}
            placeholder="e.g. DTG Printing"
            autoCapitalize="words"
            editable={editable}
          />
          <ChoiceChips
            label="Category"
            options={PROCESS_CATEGORIES}
            value={draft.category}
            onChange={(category) => onChange({ category })}
            editable={editable}
            capitalize
          />
        </EditorSection>

        <EditorSection label="Costing">
          <Field
            label="Cost per unit"
            value={draft.costPerUnit}
            onChange={(costPerUnit) => onChange({ costPerUnit })}
            placeholder="0"
            keyboardType="decimal-pad"
            editable={editable}
          />
          <FieldRow>
            <Field
              label="Min qty"
              flex
              value={draft.minQuantity}
              onChange={(minQuantity) => onChange({ minQuantity })}
              placeholder="1"
              keyboardType="number-pad"
              editable={editable}
            />
            <Field
              label="Lead time (days)"
              flex
              value={draft.leadTimeDays}
              onChange={(leadTimeDays) => onChange({ leadTimeDays })}
              placeholder="1"
              keyboardType="number-pad"
              editable={editable}
            />
          </FieldRow>
        </EditorSection>

        <EditorSection label="Specification">
          <Field
            value={draft.description}
            onChange={(description) => onChange({ description })}
            placeholder="Routing, capacity, consumables, scrap factor…"
            multiline
            lines={8}
            editable={editable}
          />
        </EditorSection>

        <EditorSection label="Notes">
          <Field value={draft.notes} onChange={(notes) => onChange({ notes })} multiline editable={editable} />
        </EditorSection>

        {onDelete && !isNew ? (
          <View style={[styles.dangerZone, { borderColor: theme.border }]}>
            <GhostAction label="Delete this process" icon="trash-2" tone="danger" onPress={onDelete} />
          </View>
        ) : null}
      </View>
    </EditorSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: 20 },
  dangerZone: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 16, alignItems: 'flex-start' },
});
