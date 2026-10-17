import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Icon, type IconName } from '@/components/ui/icon';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import type { LibraryPickSource } from '@/data/inventory/media';

export interface PhotoSourceSheetProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  onPick: (source: LibraryPickSource) => void;
}

/**
 * Where a swatch or a sketch comes from. Two answers, because a library image
 * is either a photo of the cloth in front of you or a drawing already on the
 * phone — chat's four-way attach sheet offers videos and documents this has no
 * use for.
 */
export function PhotoSourceSheet({ visible, title, onClose, onPick }: PhotoSourceSheetProps) {
  const theme = useTheme();

  const options: { source: LibraryPickSource; icon: IconName; label: string; detail: string }[] = [
    { source: 'camera', icon: 'camera', label: 'Take a photo', detail: 'Opens the camera' },
    { source: 'photo', icon: 'image', label: 'Choose a photo', detail: 'From your library' },
  ];

  return (
    <BottomSheet visible={visible} onClose={onClose} title={title} maxHeight={360}>
      <View style={styles.rows}>
        {options.map((o) => (
          <Pressable key={o.source} onPress={() => onPick(o.source)} style={[styles.row, { borderColor: theme.border }]}>
            <View style={[styles.iconWrap, { backgroundColor: theme.draftWash }]}>
              <Icon name={o.icon} size={17} color={theme.textPrimary} />
            </View>
            <View style={styles.text}>
              <Text style={[styles.label, { color: theme.textPrimary }]}>{o.label}</Text>
              <Text style={[styles.detail, { color: theme.textSecondary }]}>{o.detail}</Text>
            </View>
            <Icon name="chevron-right" size={16} color={theme.textSecondary} />
          </Pressable>
        ))}
      </View>

      <Text style={[styles.note, { color: theme.textSecondary }]}>
        Resized on this phone before it is uploaded — small enough to stay off the storage bill, large enough to
        zoom into the weave.
      </Text>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  rows: { gap: 9 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 16, padding: 12 },
  iconWrap: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2, minWidth: 0 },
  label: { fontFamily: fontFamily.semibold, fontSize: 14 },
  detail: { fontSize: 11.5 },
  note: { fontFamily: fontFamily.mono, fontSize: 10.5, lineHeight: 10.5 * 1.6, marginTop: 14 },
});
