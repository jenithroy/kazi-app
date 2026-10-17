import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import { AttachmentError, pickAttachment } from '@/data/chat/attachments';
import { clipTime } from '@/data/chat/utils';
import type { LeadUploadFile } from '@/data/leads/api';

import { useVoiceRecorder } from '../use-voice-recorder';

type PendingLead = { kind: 'image' | 'voice' } & LeadUploadFile & { previewUri?: string; durationSeconds?: number };

export interface LeadComposerProps {
  recipientName: string;
  /** View-only profiles get a sentence instead of an input. */
  canPost: boolean;
  sending: boolean;
  onSendText: (text: string) => Promise<void>;
  onSendAttachment: (file: LeadUploadFile) => Promise<void>;
}

/**
 * Text, or one pending photo/voice note. Sending anything always mutes the
 * bot on this thread — the same "takeover" rule the header's toggle exposes —
 * so this composer has no separate "send as me" affordance of its own.
 */
export function LeadComposer({ recipientName, canPost, sending, onSendText, onSendAttachment }: LeadComposerProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<PendingLead | null>(null);
  const [notice, setNotice] = useState('');
  const [picking, setPicking] = useState(false);

  const recorder = useVoiceRecorder(
    (note) => {
      const ext = note.uri.split('.').pop()?.toLowerCase() || 'm4a';
      setPending({
        kind: 'voice',
        uri: note.uri,
        name: `voice-note.${ext}`,
        mime: `audio/${ext}`,
        durationSeconds: note.durationSeconds,
      });
    },
    (message) => setNotice(message),
  );

  if (!canPost) {
    return (
      <View style={[styles.readOnly, { paddingBottom: insets.bottom + 14, borderTopColor: theme.border, backgroundColor: theme.surfaceRaised }]}>
        <Icon name="eye" size={15} color={theme.textSecondary} />
        <Text style={[styles.readOnlyText, { color: theme.textSecondary }]}>Your role can read this conversation but not post to it.</Text>
      </View>
    );
  }

  const pickPhoto = async () => {
    setPicking(true);
    setNotice('');
    try {
      const picked = await pickAttachment('photo');
      if (picked) setPending({ kind: 'image', uri: picked.uri, name: picked.name, mime: picked.mime, previewUri: picked.uri });
    } catch (err) {
      setNotice(err instanceof AttachmentError ? err.message : 'That photo could not be attached.');
    } finally {
      setPicking(false);
    }
  };

  const busy = sending || picking;
  const canSend = !busy && !recorder.recording && (draft.trim().length > 0 || !!pending);

  const submit = async () => {
    if (!canSend) return;
    setNotice('');

    if (pending) {
      const toSend = pending;
      setPending(null);
      try {
        await onSendAttachment({ uri: toSend.uri, name: toSend.name, mime: toSend.mime });
      } catch (err) {
        setPending(toSend);
        setNotice(err instanceof Error ? err.message : "That didn't send.");
      }
      return;
    }

    const text = draft.trim();
    if (!text) return;
    setDraft('');
    try {
      await onSendText(text);
    } catch (err) {
      setDraft(text);
      setNotice(err instanceof Error ? err.message : "That message didn't send.");
    }
  };

  return (
    <View style={[styles.wrap, { paddingBottom: insets.bottom + 12, borderTopColor: theme.border, backgroundColor: theme.surfaceRaised }]}>
      {pending ? (
        <View style={[styles.strip, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {pending.kind === 'image' ? (
            <Image source={{ uri: pending.previewUri }} style={styles.thumb} resizeMode="cover" />
          ) : (
            <View style={[styles.thumb, styles.thumbIcon, { backgroundColor: theme.accentWash }]}>
              <Icon name="mic" size={17} color={theme.accentWashText} />
            </View>
          )}
          <View style={styles.stripText}>
            <Text style={[styles.stripTitle, { color: theme.textPrimary }]} numberOfLines={1}>
              {pending.kind === 'image' ? 'Photo' : 'Voice note'}
            </Text>
            {pending.durationSeconds ? (
              <Text style={[styles.stripBody, { color: theme.textSecondary }]}>{clipTime(pending.durationSeconds)}</Text>
            ) : null}
          </View>
          <Pressable onPress={() => setPending(null)} hitSlop={10} disabled={busy}>
            <Icon name="x" size={16} color={theme.textSecondary} />
          </Pressable>
        </View>
      ) : null}

      {recorder.recording ? (
        <View style={[styles.strip, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={[styles.recDot, { backgroundColor: theme.danger }]} />
          <Text style={[styles.stripTitle, { color: theme.textPrimary }]}>Recording… {clipTime(recorder.seconds)}</Text>
        </View>
      ) : notice ? (
        <Text style={[styles.notice, { color: theme.dangerWashText }]}>{notice}</Text>
      ) : null}

      <View style={styles.row}>
        <Pressable
          onPress={pickPhoto}
          disabled={busy || recorder.recording || !!pending}
          style={[styles.iconButton, { backgroundColor: theme.surface, borderColor: theme.border, opacity: pending ? 0.5 : 1 }]}
        >
          {picking ? <ActivityIndicator size="small" color={theme.textSecondary} /> : <Icon name="paperclip" size={18} color={theme.textPrimary} />}
        </Pressable>

        <Pressable
          onPress={recorder.recording ? recorder.stop : recorder.start}
          disabled={busy || !!pending}
          style={[styles.iconButton, { backgroundColor: theme.surface, borderColor: theme.border, opacity: pending ? 0.5 : 1 }]}
        >
          <Icon name={recorder.recording ? 'square' : 'mic'} size={18} color={recorder.recording ? theme.danger : theme.textPrimary} />
        </Pressable>

        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={pending ? 'Send as-is — captions aren’t supported' : `Message ${recipientName}`}
          placeholderTextColor={theme.textSecondary}
          editable={!pending && !recorder.recording}
          multiline
          returnKeyType="send"
          onSubmitEditing={() => void submit()}
          submitBehavior="submit"
          style={[styles.input, { borderColor: theme.border, backgroundColor: theme.surface, color: theme.textPrimary }]}
        />

        <Pressable
          onPress={() => void submit()}
          disabled={!canSend}
          style={[styles.iconButton, { backgroundColor: canSend ? theme.accent : theme.surfaceRaised, borderColor: canSend ? theme.accent : theme.border }]}
        >
          {sending ? <ActivityIndicator size="small" color={theme.accentText} /> : <Icon name="send" size={17} color={canSend ? theme.accentText : theme.textSecondary} />}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 9,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 13,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  recDot: { width: 8, height: 8, borderRadius: 999 },
  thumb: { width: 38, height: 38, borderRadius: 10, flexShrink: 0 },
  thumbIcon: { alignItems: 'center', justifyContent: 'center' },
  stripText: { flex: 1, gap: 2, minWidth: 0 },
  stripTitle: { fontFamily: fontFamily.semibold, fontSize: 12 },
  stripBody: { fontSize: 12.5 },
  notice: { fontSize: 12, fontFamily: fontFamily.medium },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 120,
    paddingHorizontal: 16,
    paddingTop: 13,
    paddingBottom: 13,
    borderRadius: 15,
    borderWidth: 1,
    fontSize: 15,
  },
  readOnly: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  readOnlyText: {
    fontFamily: fontFamily.mono,
    fontSize: 11,
  },
});
