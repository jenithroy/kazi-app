import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import type { PendingAttachment } from '@/data/chat/attachments';
import type { Message } from '@/data/chat/types';
import { clipLength, clipTime, fileSize, firstName, isMe, messageText } from '@/data/chat/utils';

import { useVoiceRecorder } from './use-voice-recorder';

export interface ComposerProps {
  draft: string;
  onChangeDraft: (text: string) => void;
  onSend: () => void;
  recipientName: string;
  /** The message being replied to, shown as a cancellable strip above the input. */
  replyTo: Message | null;
  onCancelReply: () => void;
  /** View-only profiles get a sentence instead of an input. */
  canPost: boolean;
  /** Picked, compressed, and waiting to go up with the next send. */
  attachment: PendingAttachment | null;
  onAttach: () => void;
  onClearAttachment: () => void;
  /** True while a file is being picked, compressed or uploaded. */
  busy: boolean;
  /** A voice note just finished recording — hand it off to be staged like any other attachment. */
  onRecorded: (uri: string, durationSeconds: number) => void;
  onRecordError: (message: string) => void;
  /** Group members you can @mention. Omit (or leave empty) for a DM — there's nobody else to @. */
  mentionCandidates?: { id: string; name: string }[];
}

const KIND_ICON = { image: 'image', video: 'film', file: 'file-text', voice: 'mic' } as const;

export function Composer({
  draft,
  onChangeDraft,
  onSend,
  recipientName,
  replyTo,
  onCancelReply,
  canPost,
  attachment,
  onAttach,
  onClearAttachment,
  busy,
  onRecorded,
  onRecordError,
  mentionCandidates,
}: ComposerProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const [selection, setSelection] = useState({ start: 0, end: 0 });

  // The active "@query" is whatever sits between the nearest preceding `@`
  // and the cursor, as long as nothing has interrupted it (a space, or the
  // cursor having moved past it) — the same detection every mention-style
  // composer uses.
  const mentionMatch = useMemo(() => {
    if (!mentionCandidates || mentionCandidates.length === 0) return null;
    const upToCursor = draft.slice(0, selection.start);
    const at = upToCursor.lastIndexOf('@');
    if (at === -1) return null;
    const between = upToCursor.slice(at + 1);
    if (/\s/.test(between)) return null;
    return { start: at, query: between.toLowerCase() };
  }, [draft, selection.start, mentionCandidates]);

  const mentionSuggestions = useMemo(() => {
    if (!mentionMatch || !mentionCandidates) return [];
    return mentionCandidates.filter((c) => c.name.toLowerCase().includes(mentionMatch.query)).slice(0, 6);
  }, [mentionMatch, mentionCandidates]);

  function insertMention(name: string) {
    if (!mentionMatch) return;
    const before = draft.slice(0, mentionMatch.start);
    const after = draft.slice(selection.start);
    onChangeDraft(`${before}@${name} ${after}`);
    const cursor = before.length + name.length + 2;
    // setNativeProps, not the controlled `selection` prop: RN's TextInput
    // fights a selection prop that's re-applied on every render, so the
    // cursor is only ever nudged imperatively, once, right after an insert.
    setTimeout(() => inputRef.current?.setNativeProps({ selection: { start: cursor, end: cursor } }), 0);
    setSelection({ start: cursor, end: cursor });
  }
  const recorder = useVoiceRecorder(
    (note) => onRecorded(note.uri, note.durationSeconds),
    onRecordError,
  );
  // An attachment on its own is a message; the caption is optional.
  const canSend = (draft.trim().length > 0 || !!attachment) && !busy && !recorder.recording;

  /**
   * Starting a reply should land you in the input with the keyboard already
   * up, not leave you to tap it yourself.
   *
   * It focuses twice on purpose. A reply started from the long-press sheet
   * arrives while that sheet is still playing its 200ms exit, and a `Modal`
   * that is still mounted owns the focus — the first call is swallowed and the
   * keyboard never appears. The second runs once the modal is gone. The
   * `isFocused` guard keeps it from re-opening a keyboard the person has
   * deliberately dismissed in the meantime, and makes the swipe path (where
   * the first call works) a no-op rather than a second flash.
   *
   * Keyed on the id, not the message: `replyTo` is re-resolved from the thread
   * on every refetch, so watching the object would re-raise the keyboard each
   * time a realtime update landed mid-reply.
   */
  const replyToId = replyTo?.id;
  useEffect(() => {
    if (!replyToId) return;
    inputRef.current?.focus();
    const retry = setTimeout(() => {
      if (!inputRef.current?.isFocused()) inputRef.current?.focus();
    }, 260);
    return () => clearTimeout(retry);
  }, [replyToId]);

  if (!canPost) {
    return (
      <View style={[styles.readOnly, { paddingBottom: insets.bottom + 14, borderTopColor: theme.border, backgroundColor: theme.surfaceRaised }]}>
        <Icon name="eye" size={15} color={theme.textSecondary} />
        <Text style={[styles.readOnlyText, { color: theme.textSecondary }]}>View only — you can’t post in this thread</Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { paddingBottom: insets.bottom + 12, borderTopColor: theme.border, backgroundColor: theme.surfaceRaised }]}>
      {replyTo ? (
        <Animated.View
          entering={FadeInDown.duration(160)}
          exiting={FadeOutDown.duration(120)}
          style={[styles.strip, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <View style={[styles.replyBar, { backgroundColor: theme.accent }]} />
          <View style={styles.stripText}>
            <Text style={[styles.stripTitle, { color: theme.accentDeep }]} numberOfLines={1}>
              Replying to {isMe(replyTo.authorId) ? 'yourself' : firstName(replyTo.authorId)}
            </Text>
            <Text style={[styles.stripBody, { color: theme.textSecondary }]} numberOfLines={1}>
              {messageText(replyTo)}
            </Text>
          </View>
          <Pressable onPress={onCancelReply} hitSlop={10}>
            <Icon name="x" size={16} color={theme.textSecondary} />
          </Pressable>
        </Animated.View>
      ) : null}

      {attachment ? (
        <Animated.View
          entering={FadeInDown.duration(160)}
          exiting={FadeOutDown.duration(120)}
          style={[styles.strip, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          {attachment.kind === 'image' ? (
            <Image source={{ uri: attachment.uri }} style={styles.thumb} resizeMode="cover" />
          ) : (
            <View style={[styles.thumb, styles.thumbIcon, { backgroundColor: theme.accentWash }]}>
              <Icon name={KIND_ICON[attachment.kind]} size={17} color={theme.accentWashText} />
            </View>
          )}
          <View style={styles.stripText}>
            <Text style={[styles.stripTitle, { color: theme.textPrimary }]} numberOfLines={1}>
              {attachment.name}
            </Text>
            <Text style={[styles.stripBody, { color: theme.textSecondary }]} numberOfLines={1}>
              {fileSize(attachment.size)}
              {attachment.duration ? ` · ${clipLength(attachment.duration)}` : ''}
              {attachment.kind === 'image' ? ' · compressed' : ''}
            </Text>
          </View>
          <Pressable onPress={onClearAttachment} hitSlop={10} disabled={busy}>
            <Icon name="x" size={16} color={theme.textSecondary} />
          </Pressable>
        </Animated.View>
      ) : null}

      {recorder.recording ? (
        <Animated.View
          entering={FadeInDown.duration(160)}
          exiting={FadeOutDown.duration(120)}
          style={[styles.strip, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <View style={[styles.recDot, { backgroundColor: theme.danger }]} />
          <Text style={[styles.stripTitle, { color: theme.textPrimary }]}>Recording… {clipTime(recorder.seconds)}</Text>
        </Animated.View>
      ) : null}

      {mentionSuggestions.length > 0 ? (
        <Animated.View
          entering={FadeInDown.duration(120)}
          exiting={FadeOutDown.duration(100)}
          style={[styles.mentionList, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <FlatList
            data={mentionSuggestions}
            keyExtractor={(m) => m.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable onPress={() => insertMention(item.name)} style={styles.mentionRow}>
                <Text style={[styles.mentionText, { color: theme.textPrimary }]}>{item.name}</Text>
              </Pressable>
            )}
          />
        </Animated.View>
      ) : null}

      <View style={styles.row}>
        <Pressable
          onPress={onAttach}
          disabled={busy || recorder.recording || !!attachment}
          accessibilityLabel="Attach a photo, video or file"
          style={[styles.iconButton, { backgroundColor: theme.surface, borderColor: theme.border, opacity: busy || !!attachment ? 0.5 : 1 }]}
        >
          {busy ? (
            <ActivityIndicator size="small" color={theme.textSecondary} />
          ) : (
            <Icon name="paperclip" size={18} color={theme.textPrimary} />
          )}
        </Pressable>

        <Pressable
          onPress={recorder.recording ? recorder.stop : recorder.start}
          disabled={busy || !!attachment}
          accessibilityLabel={recorder.recording ? 'Stop recording' : 'Record a voice note'}
          style={[styles.iconButton, { backgroundColor: theme.surface, borderColor: theme.border, opacity: !!attachment ? 0.5 : 1 }]}
        >
          <Icon name={recorder.recording ? 'square' : 'mic'} size={18} color={recorder.recording ? theme.danger : theme.textPrimary} />
        </Pressable>

        <TextInput
          ref={inputRef}
          value={draft}
          onChangeText={onChangeDraft}
          onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
          placeholder={replyTo ? 'Type your reply' : attachment ? 'Add a caption' : `Message ${recipientName}`}
          placeholderTextColor={theme.textSecondary}
          editable={!recorder.recording}
          returnKeyType="send"
          multiline
          onSubmitEditing={onSend}
          submitBehavior="submit"
          style={[styles.input, { borderColor: theme.border, backgroundColor: theme.surface, color: theme.textPrimary }]}
        />

        <Pressable
          onPress={onSend}
          disabled={!canSend}
          style={[styles.iconButton, { backgroundColor: canSend ? theme.accent : theme.surfaceRaised, borderColor: canSend ? theme.accent : theme.border }]}
        >
          <Icon name="send" size={17} color={canSend ? theme.accentText : theme.textSecondary} />
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
  replyBar: {
    width: 3,
    alignSelf: 'stretch',
    borderRadius: 99,
  },
  recDot: { width: 8, height: 8, borderRadius: 999 },
  mentionList: {
    maxHeight: 220,
    borderRadius: 13,
    borderWidth: 1,
    overflow: 'hidden',
  },
  mentionRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  mentionText: {
    fontFamily: fontFamily.medium,
    fontSize: 14.5,
  },
  thumb: {
    width: 38,
    height: 38,
    borderRadius: 10,
    flexShrink: 0,
  },
  thumbIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  stripText: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  stripTitle: {
    fontFamily: fontFamily.semibold,
    fontSize: 12,
  },
  stripBody: {
    fontSize: 12.5,
  },
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
