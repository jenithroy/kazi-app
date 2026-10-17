import { Pressable, StyleSheet, Text } from 'react-native';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { TextField } from '@/components/ui/text-field';
import { useTheme } from '@/theme/theme-provider';
import type { StockDetailsDraft, StockItem } from '@/data/inventory/types';

export interface EditSheetProps {
  visible: boolean;
  item: StockItem | null;
  draft: StockDetailsDraft;
  onClose: () => void;
  onChange: (patch: Partial<StockDetailsDraft>) => void;
  onSubmit: () => void;
}

/** Edit the free-text detail fields on a stock item (item 19). */
export function EditSheet({ visible, item, draft, onClose, onChange, onSubmit }: EditSheetProps) {
  const theme = useTheme();
  return (
    <BottomSheet visible={visible} onClose={onClose} title={item ? `Edit ${item.name}` : 'Edit item'} maxHeight={620}>
      <TextField label={`Reorder threshold${item ? ` · ${item.unit}` : ''}`} value={draft.threshold} onChangeText={(v) => onChange({ threshold: v })} placeholder="900" keyboardType="numeric" compact />
      <TextField label="Location" value={draft.location} onChangeText={(v) => onChange({ location: v })} placeholder="Rack B2" compact />
      <TextField label={`Last cost · NPR${item ? ` / ${item.unit}` : ''}`} value={draft.cost} onChangeText={(v) => onChange({ cost: v })} placeholder="310" keyboardType="numeric" compact />
      <TextField label="Supplier" value={draft.supplier} onChangeText={(v) => onChange({ supplier: v })} placeholder="Sunrise Mills" compact />

      <Pressable onPress={onSubmit} style={[styles.saveButton, { backgroundColor: theme.accent }]}>
        <Text style={[styles.saveLabel, { color: theme.accentText }]}>Save changes</Text>
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  saveButton: { height: 54, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  saveLabel: { fontSize: 15, fontWeight: '600' },
});
