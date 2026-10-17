import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, radii } from '@/theme';
import { SCOPES, type RoleFields, type RoleRow } from '@/data/admin-panel/types';
import { scopeBucket, slugify } from '@/data/admin-panel/utils';

export interface RoleEditorSheetProps {
  visible: boolean;
  onClose: () => void;
  /** null = creating. */
  role: RoleRow | null;
  existingIds: string[];
  holderCount: number;
  busy: boolean;
  error: string | null;
  onSubmit: (fields: RoleFields) => void;
  onDelete: () => void;
}

/** Create or rename a role, and set the one thing tier still decides: whose records it can see. */
export function RoleEditorSheet({ visible, onClose, role, ...rest }: RoleEditorSheetProps) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title={role ? `Edit ${role.label}` : 'New role'}>
      {/* The form seeds its fields from the role it opens on. `BottomSheet`
          unmounts its children when closed, so each open starts fresh without
          an effect to copy props into state. */}
      <RoleEditorForm key={role?.id ?? 'new'} role={role} {...rest} />
    </BottomSheet>
  );
}

type RoleEditorFormProps = Omit<RoleEditorSheetProps, 'visible' | 'onClose'>;

function RoleEditorForm({
  role,
  existingIds,
  holderCount,
  busy,
  error,
  onSubmit,
  onDelete,
}: RoleEditorFormProps) {
  const theme = useTheme();
  const editing = !!role;

  const [label, setLabel] = useState(role?.label ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [scope, setScope] = useState(() => scopeBucket(role?.tier ?? 0));

  const id = editing ? role.id : slugify(label);
  const clash = !editing && !!id && existingIds.includes(id);
  const valid = !!label.trim() && !!id && !clash;

  const submit = () => {
    if (!valid || busy) return;
    // Keep an existing tier that already sits inside the chosen bucket, so
    // renaming a role never quietly re-ranks it.
    const tier = scopeBucket(role?.tier ?? 0) === scope ? (role?.tier ?? 0) : scope;
    onSubmit({ id, label: label.trim(), description: description.trim() || null, tier });
  };

  return (
    <View style={styles.body}>
      <TextField
        label="Role name"
        value={label}
        onChangeText={setLabel}
        placeholder="e.g. Production Supervisor"
        autoCapitalize="words"
      />
      <Text style={[styles.hint, { color: clash ? theme.dangerWashText : theme.textSecondary }]}>
        {clash
          ? 'A role with that name already exists.'
          : editing
            ? `Id ${id} never changes.`
            : id
              ? `Saved as ${id}`
              : 'The id is derived from the name.'}
      </Text>

      <TextField
        label="Description"
        value={description}
        onChangeText={setDescription}
        placeholder="What this role is for"
        autoCapitalize="sentences"
      />
      <Text style={[styles.hint, { color: theme.textSecondary }]}>
        Shown here only, to explain the role to whoever edits it next.
      </Text>

      <View style={styles.scopeBlock}>
        <Text style={[styles.fieldLabel, { color: theme.textPrimary }]}>Record scope</Text>
        <View style={styles.scopeRow}>
          {SCOPES.map((s) => {
            const on = s.tier === scope;
            return (
              <Pressable
                key={s.tier}
                onPress={() => setScope(s.tier)}
                style={[
                  styles.scopeButton,
                  {
                    backgroundColor: on ? theme.selectedSurface : theme.surface,
                    borderColor: on ? theme.selectedBorder : theme.border,
                  },
                ]}
              >
                <Text style={[styles.scopeLabel, { color: on ? theme.selectedText : theme.textPrimary }]}>
                  {s.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.hint, { color: theme.textSecondary }]}>
          {SCOPES.find((s) => s.tier === scope)?.hint}
        </Text>
      </View>

      {error ? (
        <View style={[styles.error, { backgroundColor: theme.dangerWash }]}>
          <Text style={[styles.errorText, { color: theme.dangerWashText }]}>{error}</Text>
        </View>
      ) : null}

      {!editing ? (
        <Text style={[styles.hint, { color: theme.textSecondary }]}>
          Starts with no access at all. Grant pages next, then assign people to it.
        </Text>
      ) : null}

      <Button
        label={busy ? 'Saving…' : editing ? 'Save changes' : 'Create role'}
        variant="primary"
        loading={busy}
        disabled={!valid}
        onPress={submit}
      />

      {editing ? (
        <>
          <Button
            label="Delete role"
            variant="dangerOutline"
            disabled={busy || holderCount > 0}
            onPress={onDelete}
          />
          <Text style={[styles.hint, { color: theme.textSecondary }]}>
            {holderCount > 0
              ? `${holderCount} ${holderCount === 1 ? 'person holds' : 'people hold'} this role — move them first.`
              : 'Its permissions go with it.'}
          </Text>
        </>
      ) : null}
  </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: 10 },
  fieldLabel: { fontFamily: fontFamily.semibold, fontSize: 12.5 },
  hint: { fontFamily: fontFamily.mono, fontSize: 10.5, lineHeight: 10.5 * 1.5, marginTop: -4 },
  scopeBlock: { gap: 8, marginTop: 4 },
  scopeRow: { flexDirection: 'row', gap: 8 },
  scopeButton: {
    flex: 1,
    height: 42,
    borderRadius: radii.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scopeLabel: { fontFamily: fontFamily.semibold, fontSize: 13 },
  error: { borderRadius: radii.md, padding: 12 },
  errorText: { fontFamily: fontFamily.regular, fontSize: 12.5, lineHeight: 12.5 * 1.5 },
});
