import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useToast } from '@/components/toast/toast-provider';
import { useHideTabBar } from '@/components/tab-bar/tab-bar-visibility';
import { useBackHandler } from '@/lib/use-back-handler';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import { useKeyboardInset } from '@/lib/use-keyboard-inset';
import * as haptics from '@/lib/haptics';
import {
  AttachmentError,
  finalizeVoiceNote,
  pickAttachment,
  uploadAttachment,
  type PendingAttachment,
  type PickSource,
} from '@/data/chat/attachments';
import type { Attachment, Message, MessageId, Person, PersonId, Thread } from '@/data/chat/types';
import { attachmentLabel, firstName, groupByDay, isMe, messageText, personFor, threadTitle } from '@/data/chat/utils';

import { AttachmentSheet } from './attachment-sheet';
import { Composer } from './composer';
import { ContactSheet } from './contact-sheet';
import { GroupSheet } from './group-sheet';
import { MediaViewer } from './media-viewer';
import { MessageActionsSheet } from './message-actions-sheet';
import { MessageBubble } from './message-bubble';
import { ReactionSheet } from './reaction-sheet';
import { SelectionHeader, ThreadHeader } from './thread-header';
import { ThreadActionsSheet } from './thread-actions-sheet';
import { ThreadNotFound } from './thread-not-found';

export interface ThreadViewProps {
  thread: Thread;
  messages: Message[];
  /** Everyone on staff but you, for the group editor. */
  people: Person[];
  /** Whoever is mid-message on the other side, if anyone. */
  typingId?: PersonId;
  canPost: boolean;
  /** Whether this position may rename the group and change its membership. */
  canManageGroup: boolean;
  /** Unread count for this thread, so its own options sheet can offer "mark unread". */
  unread: number;
  onBack: () => void;
  /** Resolves false when the message could not be written, so the draft is kept for a retry. */
  onSend: (text: string, replyTo?: MessageId, attachment?: Attachment) => Promise<boolean>;
  onToggleReaction: (messageId: MessageId, emoji: string) => void;
  onDeleteMessages: (ids: MessageId[]) => void;
  onSetRead: (read: boolean) => void;
  onSetFlag: (flag: 'pinned' | 'muted', value: boolean) => void;
  onDeleteThread: () => void;
  onSaveGroup: (name: string, memberIds: PersonId[]) => void;
  groupSaving: boolean;
  groupError?: string | null;
  onReplyPrivately: (personId: PersonId) => void;
  onCompose: () => void;
}

export function ThreadView({
  thread,
  messages,
  people,
  typingId,
  canPost,
  canManageGroup,
  unread,
  onBack,
  onSend,
  onToggleReaction,
  onDeleteMessages,
  onSetRead,
  onSetFlag,
  onDeleteThread,
  onSaveGroup,
  groupSaving,
  groupError,
  onReplyPrivately,
  onCompose,
}: ThreadViewProps) {
  const theme = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  // A conversation takes the whole screen: the composer is pinned to the
  // bottom, and the tab bar underneath it would be a second competing bottom
  // row for the keyboard to push around. Back is in the header.
  useHideTabBar();
  // The list is pinned to the bottom, so it has to follow the keyboard up
  // rather than keep an offset that is now behind the composer.
  const keyboardStyle = useKeyboardInset(insets.bottom, () =>
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true })),
  );

  const [draft, setDraft] = useState('');
  const [replyToId, setReplyToId] = useState<MessageId | null>(null);
  const [sheetTarget, setSheetTarget] = useState<MessageId | null>(null);
  const [reactionTarget, setReactionTarget] = useState<MessageId | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<MessageId[]>([]);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupSession, setGroupSession] = useState(0);
  const [contactOpen, setContactOpen] = useState(false);

  const [attachOpen, setAttachOpen] = useState(false);
  const [pending, setPending] = useState<PendingAttachment | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [sending, setSending] = useState(false);
  const [viewing, setViewing] = useState<Attachment | null>(null);
  /** Keyed on the pending file itself, so a retry after a failed insert reuses the upload instead of orphaning a second copy. */
  const uploaded = useRef<{ pending: PendingAttachment; attachment: Attachment } | null>(null);

  const isGroup = thread.kind === 'group';
  const mentionCandidates = useMemo(
    () => (isGroup ? thread.memberIds.filter((id) => !isMe(id)).map((id) => personFor(id)) : []),
    [isGroup, thread.memberIds],
  );
  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const days = useMemo(() => groupByDay(messages), [messages]);

  const replyTo = replyToId ? (byId.get(replyToId) ?? null) : null;
  const sheetMessage = sheetTarget ? (byId.get(sheetTarget) ?? null) : null;
  // Re-resolved rather than held, so the list of who reacted updates live
  // while the sheet is open instead of freezing at the moment it opened.
  const reactionMessage = reactionTarget ? (byId.get(reactionTarget) ?? null) : null;
  const selectedMessages = selected.map((id) => byId.get(id)).filter((m): m is Message => !!m);
  const canDeleteSelection = selectedMessages.length > 0 && selectedMessages.every((m) => isMe(m.authorId) && !m.deleted);

  const exitSelection = useCallback(() => {
    setSelecting(false);
    setSelected([]);
  }, []);

  /**
   * The whole Chat tab's back stack, handled here rather than in `chat.tsx`:
   * a parent's listener is registered after its children's and so is asked
   * first, which would have closed the thread out from under an open
   * selection. One handler, outermost layer first.
   */
  useBackHandler(() => {
    if (selecting) {
      exitSelection();
      return true;
    }
    if (replyToId) {
      setReplyToId(null);
      return true;
    }
    if (pending) {
      setPending(null);
      return true;
    }
    onBack();
    return true;
  });

  const toggleSelected = (id: MessageId) =>
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));

  /** Group copies carry the sender's name — a bare block of text loses who said what. */
  const copyToClipboard = async (items: Message[]) => {
    const body = items
      .map((m) => {
        const text = m.text || (m.attachment ? `[${attachmentLabel(m)}: ${m.attachment.name}]` : messageText(m));
        return isGroup ? `${isMe(m.authorId) ? 'You' : personFor(m.authorId).name}: ${text}` : text;
      })
      .join('\n');
    await Clipboard.setStringAsync(body);
    toast.show({ message: items.length > 1 ? `${items.length} messages copied` : 'Message copied', tone: 'ok' });
  };

  const scrollToEnd = useCallback(
    () => requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true })),
    [],
  );

  /**
   * The reply and attachment strips grow the composer, which shortens the list
   * without moving it — so the newest messages, the ones you are replying to,
   * slide out of sight behind the strip that just appeared. The content size
   * has not changed, so `onContentSizeChange` never fires; this follows the
   * layout instead.
   */
  useEffect(() => {
    if (replyToId || pending) scrollToEnd();
  }, [replyToId, pending, scrollToEnd]);

  /**
   * Opening the thread marks it read once. Anything that lands while it is
   * still on screen has been read by the time it arrives, so the row must not
   * be left carrying a badge for messages you watched come in.
   */
  const seenCount = useRef(messages.length);
  useEffect(() => {
    const grew = messages.length > seenCount.current;
    seenCount.current = messages.length;
    const newest = messages[messages.length - 1];
    if (grew && newest && !isMe(newest.authorId)) onSetRead(true);
  }, [messages, onSetRead]);

  /**
   * Send. The attachment goes up first and only then is the message written,
   * so a failed upload leaves no bubble pointing at a file that isn't there.
   * Whichever step fails, the draft and the picked file both survive for a
   * second try — the composer is only cleared once the write has landed.
   */
  const handleSend = async () => {
    const text = draft.trim();
    if ((!text && !pending) || !canPost || attaching || sending) return;

    let attachment: Attachment | undefined;
    if (pending) {
      if (uploaded.current?.pending === pending) {
        attachment = uploaded.current.attachment;
      } else {
        setAttaching(true);
        try {
          attachment = await uploadAttachment(thread.id, pending);
          uploaded.current = { pending, attachment };
        } catch (err) {
          setAttaching(false);
          toast.show({
            message: err instanceof AttachmentError ? err.message : 'That file could not be uploaded.',
            tone: 'bad',
          });
          return;
        }
        setAttaching(false);
      }
    }

    // `replyTo`, not `replyToId`: a quoted message that has since been deleted
    // is no longer in `byId`, and sending its id would break the insert.
    setSending(true);
    const sent = await onSend(text, replyTo?.id, attachment);
    setSending(false);
    if (!sent) return;

    setDraft('');
    setReplyToId(null);
    setPending(null);
    uploaded.current = null;
    scrollToEnd();
  };

  const handlePick = async (source: PickSource) => {
    setAttachOpen(false);
    setAttaching(true);
    try {
      const picked = await pickAttachment(source);
      if (picked) setPending(picked);
    } catch (err) {
      toast.show({
        message: err instanceof AttachmentError ? err.message : 'That file could not be attached.',
        tone: 'bad',
      });
    } finally {
      setAttaching(false);
    }
  };

  /** A voice note just finished recording — stage it exactly like a picked file. */
  const handleRecorded = async (uri: string, durationSeconds: number) => {
    setAttaching(true);
    try {
      setPending(await finalizeVoiceNote(uri, durationSeconds));
    } catch (err) {
      toast.show({
        message: err instanceof AttachmentError ? err.message : "That recording couldn't be attached.",
        tone: 'bad',
      });
    } finally {
      setAttaching(false);
    }
  };

  /**
   * Photos and videos open in the in-app viewer; documents are handed to
   * whatever the phone uses for them. Video used to go out to the browser with
   * the rest, which meant leaving the app to watch a clip somebody had just
   * sent you — and put a signed storage URL in another app's history.
   */
  const openAttachment = async (attachment: Attachment) => {
    if (!attachment.url) {
      toast.show({ message: 'That file is still loading — try again in a moment.', tone: 'warn' });
      return;
    }
    if (attachment.kind === 'image' || attachment.kind === 'video') {
      setViewing(attachment);
      return;
    }
    try {
      await Linking.openURL(attachment.url);
    } catch {
      toast.show({ message: 'Nothing on this phone can open that file.', tone: 'bad' });
    }
  };

  const handleBubblePress = (message: Message) => {
    if (selecting) toggleSelected(message.id);
    else if (message.attachment) void openAttachment(message.attachment);
  };

  const handleBubbleLongPress = (message: Message) => {
    // A long-press has no feedback of its own until the sheet arrives; this is
    // the app saying "held long enough" at the moment it becomes true.
    haptics.pressed();
    if (selecting) toggleSelected(message.id);
    else setSheetTarget(message.id);
  };

  /**
   * Reply to any message, mine included — but not to one that is still in
   * flight. An optimistic bubble carries a `pending-…` stand-in id, and
   * `chat_messages.reply_to` is a real foreign key, so quoting one would fail
   * the insert outright. It settles into its server id within a moment.
   */
  const startReply = (id: MessageId) => {
    if (!canPost) return;
    if (byId.get(id)?.pending) {
      toast.show({ message: 'Still sending — try replying in a moment.', tone: 'warn' });
      return;
    }
    setSheetTarget(null);
    setReplyToId(id);
  };

  const openGroup = () => {
    setOptionsOpen(false);
    setGroupSession((n) => n + 1);
    setGroupOpen(true);
  };

  if (thread.missing) {
    return (
      <Animated.View entering={FadeIn.duration(180)} style={styles.flex}>
        <ThreadHeader thread={null} onBack={onBack} />
        <ThreadNotFound reference={thread.ref ?? ''} onBack={onBack} onCompose={onCompose} />
      </Animated.View>
    );
  }

  return (
    // The keyboard inset is applied here rather than by a
    // `KeyboardAvoidingView`: on an edge-to-edge Android window nothing is
    // resized when the keyboard opens, so the composer has to be lifted by
    // hand. See `use-keyboard-inset.ts`.
    <Animated.View style={[styles.flex, keyboardStyle]}>
      <Animated.View entering={FadeIn.duration(180)} style={styles.flex}>
        {selecting ? (
          <SelectionHeader
            count={selected.length}
            canDelete={canPost && canDeleteSelection}
            onCancel={exitSelection}
            onCopy={() => {
              void copyToClipboard(selectedMessages);
              exitSelection();
            }}
            onDelete={() => {
              haptics.committed();
              onDeleteMessages(selected);
              exitSelection();
            }}
          />
        ) : (
          <ThreadHeader
            thread={thread}
            onBack={onBack}
            onOptions={() => setOptionsOpen(true)}
            onIdentity={() => (isGroup ? openGroup() : setContactOpen(true))}
          />
        )}

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.messages}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {messages.length === 0 ? (
            <Text style={[styles.emptyNote, { color: theme.textSecondary }]}>
              No messages yet — say hello to {threadTitle(thread)}.
            </Text>
          ) : null}

          {days.map((day) => (
            <View key={day.key} style={styles.day}>
              <View style={[styles.dayPill, { backgroundColor: theme.background }]}>
                <Text style={[styles.dayLabel, { color: theme.textSecondary }]}>{day.label}</Text>
              </View>

              {day.items.map((m, i) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  previous={day.items[i - 1]}
                  index={i}
                  isGroup={isGroup}
                  replyTarget={m.replyTo ? byId.get(m.replyTo) : undefined}
                  selectionMode={selecting}
                  selected={selected.includes(m.id)}
                  canPost={canPost}
                  onPress={() => handleBubblePress(m)}
                  onLongPress={() => handleBubbleLongPress(m)}
                  onReply={() => startReply(m.id)}
                  onToggleReaction={(emoji) => onToggleReaction(m.id, emoji)}
                  onOpenReactions={() => setReactionTarget(m.id)}
                />
              ))}
            </View>
          ))}

          {typingId ? (
            <View style={styles.typingRow}>
              <View style={[styles.typingBubble, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={[styles.typingDot, { backgroundColor: theme.textSecondary }]} />
                <View style={[styles.typingDot, { backgroundColor: theme.border }]} />
                <View style={[styles.typingDot, { backgroundColor: theme.border }]} />
              </View>
              {isGroup ? (
                <Text style={[styles.typingLabel, { color: theme.textSecondary }]}>{firstName(typingId)} is typing</Text>
              ) : null}
            </View>
          ) : null}
        </ScrollView>

        {selecting ? null : (
          <Composer
            draft={draft}
            onChangeDraft={setDraft}
            onSend={() => void handleSend()}
            recipientName={isGroup ? (thread.name ?? 'the group') : firstName(thread.memberIds[0])}
            replyTo={replyTo}
            onCancelReply={() => setReplyToId(null)}
            canPost={canPost}
            attachment={pending}
            onAttach={() => setAttachOpen(true)}
            onClearAttachment={() => setPending(null)}
            busy={attaching || sending}
            onRecorded={(uri, durationSeconds) => void handleRecorded(uri, durationSeconds)}
            onRecordError={(message) => toast.show({ message, tone: 'bad' })}
            mentionCandidates={mentionCandidates}
          />
        )}

        <AttachmentSheet visible={attachOpen} onClose={() => setAttachOpen(false)} onPick={(s) => void handlePick(s)} />

        <MediaViewer attachment={viewing} onClose={() => setViewing(null)} />

        <ThreadActionsSheet
          thread={optionsOpen ? thread : null}
          unread={unread}
          showOpen={false}
          canManageGroup={canManageGroup}
          onGroupSettings={openGroup}
          onClose={() => setOptionsOpen(false)}
          onOpen={() => setOptionsOpen(false)}
          onSetRead={(read) => {
            onSetRead(read);
            setOptionsOpen(false);
            // Flagging the thread unread only means anything back on the list.
            if (!read) onBack();
          }}
          onTogglePin={() => {
            onSetFlag('pinned', !thread.pinned);
            setOptionsOpen(false);
          }}
          onToggleMute={() => {
            onSetFlag('muted', !thread.muted);
            setOptionsOpen(false);
          }}
          onDelete={() => {
            haptics.committed();
            setOptionsOpen(false);
            onDeleteThread();
          }}
        />

        <GroupSheet
          // Remounted per open so the draft starts from the group as it now
          // stands, rather than from whatever was typed and abandoned before.
          key={groupSession}
          thread={groupOpen && isGroup ? thread : null}
          people={people}
          canManage={canManageGroup}
          busy={groupSaving}
          error={groupError}
          onClose={() => setGroupOpen(false)}
          onSave={(name, memberIds) => {
            onSaveGroup(name, memberIds);
            setGroupOpen(false);
          }}
          muted={!!thread.muted}
          onToggleMute={() => {
            onSetFlag('muted', !thread.muted);
            setGroupOpen(false);
          }}
          onLeave={() => {
            haptics.committed();
            setGroupOpen(false);
            onDeleteThread();
          }}
        />

        <ContactSheet
          person={contactOpen && !isGroup ? personFor(thread.memberIds[0]) : null}
          muted={!!thread.muted}
          onClose={() => setContactOpen(false)}
          onToggleMute={() => {
            onSetFlag('muted', !thread.muted);
            setContactOpen(false);
          }}
          onDeleteThread={() => {
            haptics.committed();
            setContactOpen(false);
            onDeleteThread();
          }}
        />

        <ReactionSheet
          message={reactionMessage}
          canPost={canPost}
          onClose={() => setReactionTarget(null)}
          onToggle={(emoji) => {
            if (reactionMessage) onToggleReaction(reactionMessage.id, emoji);
          }}
        />

        <MessageActionsSheet
          message={sheetMessage}
          thread={thread}
          canPost={canPost}
          onClose={() => setSheetTarget(null)}
          onReact={(emoji) => {
            if (sheetMessage) onToggleReaction(sheetMessage.id, emoji);
          }}
          onReply={() => sheetMessage && startReply(sheetMessage.id)}
          onReplyPrivately={() => {
            if (sheetMessage) onReplyPrivately(sheetMessage.authorId);
            setSheetTarget(null);
          }}
          onCopy={() => {
            if (sheetMessage) void copyToClipboard([sheetMessage]);
            setSheetTarget(null);
          }}
          onSeeReactions={() => {
            // Same hand-off the options sheet already uses for the group
            // editor: the outgoing sheet plays its exit while the incoming one
            // plays its entrance.
            if (sheetMessage) setReactionTarget(sheetMessage.id);
            setSheetTarget(null);
          }}
          onSelect={() => {
            if (sheetMessage) {
              setSelecting(true);
              setSelected([sheetMessage.id]);
            }
            setSheetTarget(null);
          }}
          onDelete={() => {
            if (sheetMessage) {
              haptics.committed();
              onDeleteMessages([sheetMessage.id]);
            }
            setSheetTarget(null);
          }}
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  messages: {
    padding: 18,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 14,
  },
  day: {
    gap: 6,
  },
  dayPill: {
    alignSelf: 'center',
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  dayLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.14 * 10,
    textTransform: 'uppercase',
  },
  emptyNote: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 40,
  },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typingBubble: {
    flexDirection: 'row',
    gap: 5,
    borderRadius: 16,
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 99,
  },
  typingLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.1 * 10,
    textTransform: 'uppercase',
  },
});
