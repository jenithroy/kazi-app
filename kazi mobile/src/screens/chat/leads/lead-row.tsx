import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import { leadListTime, leadPreview } from '@/data/leads/format';
import { useLeadMute } from '@/data/leads/hooks';
import type { Lead } from '@/data/leads/types';

import { LeadAvatar } from './lead-avatar';
import { ValueBadge } from './value-badge';

export interface LeadRowProps {
  lead: Lead;
  active: boolean;
  index: number;
  onPress: () => void;
}

export function LeadRow({ lead, active, index, onPress }: LeadRowProps) {
  const theme = useTheme();
  // The DM bot rarely returns a name, so every lead would otherwise read
  // "Instagram user" — the conversation's own tail is what tells them apart.
  const title = lead.name || `Instagram user · ${lead.convo.slice(-4)}`;
  const { muted, setMuted } = useLeadMute(lead.convo);

  return (
    <Animated.View entering={FadeInUp.delay(Math.min(index, 6) * 30).duration(220)}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: active ? theme.selectedSurface : pressed ? theme.surfaceRaised : theme.surface,
            boxShadow: theme.shadows.card,
          },
        ]}
      >
        <LeadAvatar convo={lead.convo} name={lead.name} profilePic={lead.profilePic} />

        <View style={styles.textWrap}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, { color: active ? theme.selectedText : theme.textPrimary }]} numberOfLines={1}>
              {title}
            </Text>
          </View>
          <Text
            style={[styles.preview, { color: active ? theme.selectedTextMuted : theme.textSecondary }]}
            numberOfLines={1}
          >
            {leadPreview(lead)}
          </Text>
          <View style={styles.marks}>
            <ValueBadge value={lead.value} />
            {lead.isMuted ? (
              <View style={[styles.chip, { backgroundColor: theme.accentWash }]}>
                <Icon name="user" size={9} color={theme.accentWashText} />
                <Text style={[styles.chipLabel, { color: theme.accentWashText }]}>You</Text>
              </View>
            ) : (
              <View style={[styles.chip, { backgroundColor: theme.draftWash }]}>
                <Icon name="cpu" size={9} color={theme.draftWashText} />
                <Text style={[styles.chipLabel, { color: theme.draftWashText }]}>Bot</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.sideCol}>
          <Text style={[styles.time, { color: active ? theme.selectedTextMuted : theme.textSecondary }]} numberOfLines={1}>
            {leadListTime(lead.lastMessage?.createdAt)}
          </Text>
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              setMuted(!muted);
            }}
            hitSlop={10}
            accessibilityLabel={muted ? 'Turn on notifications for this lead' : 'Mute notifications for this lead'}
          >
            <Icon name={muted ? 'bell' : 'bell-off'} size={15} color={theme.textSecondary} />
          </Pressable>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: 18,
    padding: 14,
  },
  textWrap: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    fontFamily: fontFamily.semibold,
    fontSize: 15,
    flexShrink: 1,
  },
  preview: {
    fontSize: 13.5,
  },
  marks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 20,
    paddingHorizontal: 8,
    borderRadius: 999,
  },
  chipLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: 10.5,
  },
  time: {
    fontFamily: fontFamily.mono,
    fontSize: 10.5,
    flexShrink: 0,
  },
  sideCol: {
    alignItems: 'flex-end',
    gap: 10,
    flexShrink: 0,
  },
});
