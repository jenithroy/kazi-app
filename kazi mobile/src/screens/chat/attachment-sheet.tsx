import { StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import { LIMITS, type PickSource } from '@/data/chat/attachments';
import { fileSize } from '@/data/chat/utils';

import { ActionRow } from './action-row';

export interface AttachmentSheetProps {
  visible: boolean;
  onClose: () => void;
  onPick: (source: PickSource) => void;
}

/** The four things a message can carry, and what each of them costs. */
export function AttachmentSheet({ visible, onClose, onPick }: AttachmentSheetProps) {
  const theme = useTheme();

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Attach" maxHeight={480}>
      <View style={styles.actions}>
        <ActionRow
          icon="image"
          label="Photo"
          detail={`From your library · resized before sending`}
          onPress={() => onPick('photo')}
        />
        <ActionRow icon="camera" label="Take a photo" detail="Opens the camera" onPress={() => onPick('camera')} />
        <ActionRow
          icon="film"
          label="Video"
          detail={`Exported at 720p · up to ${fileSize(LIMITS.video)}`}
          onPress={() => onPick('video')}
        />
        <ActionRow
          icon="file-text"
          label="Document"
          detail={`PDFs, sheets, anything · up to ${fileSize(LIMITS.file)}`}
          onPress={() => onPick('file')}
        />
      </View>

      <Text style={[styles.note, { color: theme.textSecondary }]}>
        Photos and videos are compressed on this phone before they are uploaded — enough to keep them off the
        storage bill, not enough to lose what you are photographing.
      </Text>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 2 },
  note: {
    fontFamily: fontFamily.mono,
    fontSize: 10.5,
    lineHeight: 10.5 * 1.6,
  },
});
