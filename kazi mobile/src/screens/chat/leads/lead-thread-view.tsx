import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useHideTabBar } from '@/components/tab-bar/tab-bar-visibility';
import { Icon } from '@/components/ui/icon';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useBackHandler } from '@/lib/use-back-handler';
import { useKeyboardInset } from '@/lib/use-keyboard-inset';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import { groupLeadMessagesByDay } from '@/data/leads/format';
import type { LeadUploadFile } from '@/data/leads/api';
import type { Lead, LeadMessage } from '@/data/leads/types';
import type { Attachment } from '@/data/chat/types';

import { LeadAvatar } from './lead-avatar';
import { LeadBubble } from './lead-bubble';
import { LeadComposer } from './lead-composer';
import { MediaViewer } from '../media-viewer';

export interface LeadThreadViewProps {
  lead: Lead;
  messages: LeadMessage[];
  loading: boolean;
  sending: boolean;
  /** May reply, attach, or take over — the messenger-tab "edit" grant. */
  canPost: boolean;
  takeoverBusy: boolean;
  onBack: () => void;
  onSendText: (text: string) => Promise<void>;
  onSendAttachment: (file: LeadUploadFile) => Promise<void>;
  onTakeover: (muted: boolean) => void;
}

export function LeadThreadView({
  lead,
  messages,
  loading,
  sending,
  canPost,
  takeoverBusy,
  onBack,
  onSendText,
  onSendAttachment,
  onTakeover,
}: LeadThreadViewProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [viewing, setViewing] = useState<Attachment | null>(null);

  useHideTabBar();
  useBackHandler(() => {
    onBack();
    return true;
  });
  const keyboardStyle = useKeyboardInset(insets.bottom, () =>
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true })),
  );

  const title = lead.name || 'Instagram user';
  const days = groupLeadMessagesByDay(messages);

  const jumpTo = (id: number) => {
    // No message list ref to scroll a specific bubble into view on native the
    // way the web version's DOM id lookup does — the quote strip still shows
    // what was replied to, which is the information that matters.
    void id;
  };

  return (
    <Animated.View style={[styles.flex, keyboardStyle]}>
      <Animated.View entering={FadeIn.duration(180)} style={styles.flex}>
        <ScreenHeader
          title={title}
          subtitle={lead.platform === 'instagram' ? 'Instagram' : 'Messenger'}
          onBack={onBack}
          rightSlot={
            <Pressable
              onPress={() => onTakeover(!lead.isMuted)}
              disabled={!canPost || takeoverBusy}
              accessibilityRole="button"
              accessibilityLabel={lead.isMuted ? 'Hand this conversation back to the bot' : 'Take over this conversation'}
              style={[
                styles.takeoverBtn,
                {
                  backgroundColor: lead.isMuted ? theme.accentWash : theme.surface,
                  borderColor: lead.isMuted ? theme.accentWash : theme.border,
                  opacity: !canPost || takeoverBusy ? 0.5 : 1,
                },
              ]}
            >
              <Icon name={lead.isMuted ? 'bell' : 'bell-off'} size={14} color={lead.isMuted ? theme.accentWashText : theme.textPrimary} />
              <Text style={[styles.takeoverLabel, { color: lead.isMuted ? theme.accentWashText : theme.textPrimary }]}>
                {lead.isMuted ? 'Hand back' : 'Take over'}
              </Text>
            </Pressable>
          }
        />

        {lead.referral ? (
          <View style={[styles.referral, { backgroundColor: theme.draftWash, borderBottomColor: theme.border }]}>
            <Icon name="tag" size={12} color={theme.draftWashText} />
            <Text style={[styles.referralText, { color: theme.draftWashText }]} numberOfLines={1}>
              Came from: {lead.referral}
            </Text>
          </View>
        ) : null}

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.messages}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {loading ? (
            <Text style={[styles.emptyNote, { color: theme.textSecondary }]}>Loading this conversation…</Text>
          ) : messages.length === 0 ? (
            <View style={styles.emptyState}>
              <LeadAvatar convo={lead.convo} name={lead.name} profilePic={lead.profilePic} size="lg" />
              <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>{title}</Text>
              <Text style={[styles.emptyNote, { color: theme.textSecondary }]}>No messages archived for this conversation yet.</Text>
            </View>
          ) : (
            days.map((day) => (
              <View key={day.key} style={styles.day}>
                <View style={[styles.dayPill, { backgroundColor: theme.background }]}>
                  <Text style={[styles.dayLabel, { color: theme.textSecondary }]}>{day.label}</Text>
                </View>
                {day.items.map((m) => (
                  <LeadBubble key={m.id} message={m} onOpenMedia={setViewing} onJumpTo={jumpTo} />
                ))}
              </View>
            ))
          )}
        </ScrollView>

        <LeadComposer recipientName={title} canPost={canPost} sending={sending} onSendText={onSendText} onSendAttachment={onSendAttachment} />

        <MediaViewer attachment={viewing} onClose={() => setViewing(null)} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  takeoverBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  takeoverLabel: { fontFamily: fontFamily.semibold, fontSize: 12 },
  referral: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  referralText: { fontSize: 11.5, flexShrink: 1 },
  messages: {
    padding: 18,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 14,
  },
  day: { gap: 6 },
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
  emptyState: { alignItems: 'center', gap: 10, paddingVertical: 40 },
  emptyTitle: { fontFamily: fontFamily.semibold, fontSize: 15 },
  emptyNote: { fontSize: 13, textAlign: 'center', paddingVertical: 8 },
});
