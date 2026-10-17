import { EditorSection, EditorSheet, Field, FieldRow, GhostAction } from '@/components/ui/editor-kit';
import type { Customer, CustomerDraft } from '@/data/customers/types';

import { AccountHistory } from './account-history';

export interface CustomerSheetProps {
  visible: boolean;
  draft: CustomerDraft;
  /** The record being edited, with its live orders/invoices — null when adding. */
  editing: Customer | null;
  dirty: boolean;
  saving: boolean;
  /** No `customers` grant: the sheet reads, and the only way out is the X. */
  canEdit: boolean;
  onChange: (patch: Partial<CustomerDraft>) => void;
  onClose: () => void;
  onDiscard: () => void;
  onSave: () => void;
  onDelete: () => void;
}

/**
 * Add / edit a customer — the reference web form (`src/pages/Customers.jsx`)
 * field for field, minus its Region select, in the app's standard editor sheet:
 * a half-height sheet with the X, which refuses to close on an edited draft
 * until it is saved or discarded.
 */
export function CustomerSheet({
  visible,
  draft,
  editing,
  dirty,
  saving,
  canEdit,
  onChange,
  onClose,
  onDiscard,
  onSave,
  onDelete,
}: CustomerSheetProps) {
  const nameOk = draft.name.trim().length > 0;

  return (
    <EditorSheet
      visible={visible}
      title={editing ? 'Edit customer' : 'New customer'}
      dirty={dirty}
      saving={saving}
      blockedReason={nameOk ? undefined : 'A customer name is required'}
      readOnly={!canEdit}
      readOnlyNote="You can read the customer book but not change it."
      saveLabel="Save customer"
      onClose={onClose}
      onDiscard={onDiscard}
      onSave={onSave}
    >
      <EditorSection label={editing ? 'Contact record' : 'New contact record'}>
        <Field
          label="Customer name"
          required
          editable={canEdit}
          value={draft.name}
          onChange={(v) => onChange({ name: v })}
          placeholder="e.g. Next plc"
          autoCapitalize="words"
        />
        <FieldRow>
          <Field
            flex
            label="Country"
            editable={canEdit}
            value={draft.country}
            onChange={(v) => onChange({ country: v })}
            placeholder="UK"
            autoCapitalize="words"
          />
          <Field
            flex
            label="City"
            editable={canEdit}
            value={draft.city}
            onChange={(v) => onChange({ city: v })}
            placeholder="London"
            autoCapitalize="words"
          />
        </FieldRow>
        <Field
          label="Contact person"
          editable={canEdit}
          value={draft.contact}
          onChange={(v) => onChange({ contact: v })}
          placeholder="Jane Smith"
          autoCapitalize="words"
        />
        <Field
          label="Email"
          editable={canEdit}
          value={draft.email}
          onChange={(v) => onChange({ email: v })}
          placeholder="jane@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Field
          label="Phone"
          editable={canEdit}
          value={draft.phone}
          onChange={(v) => onChange({ phone: v })}
          placeholder="+44 20 7946 0958"
          keyboardType="phone-pad"
          autoCapitalize="none"
        />
        <Field
          label="Address"
          editable={canEdit}
          value={draft.address}
          onChange={(v) => onChange({ address: v })}
          placeholder="123 High Street, London, W1A 1AA"
        />
        <Field
          label="Notes"
          editable={canEdit}
          value={draft.notes}
          onChange={(v) => onChange({ notes: v })}
          placeholder="Any additional notes…"
          multiline
          lines={2}
        />
      </EditorSection>

      {editing ? (
        <EditorSection label="Account">
          <AccountHistory customer={editing} />
        </EditorSection>
      ) : null}

      {editing && canEdit ? (
        <GhostAction label="Delete this customer" icon="trash-2" tone="danger" onPress={onDelete} />
      ) : null}
    </EditorSheet>
  );
}
