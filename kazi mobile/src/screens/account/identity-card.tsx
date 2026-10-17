import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { StatusPill } from '@/components/ui/status-pill';
import { ROLE_LABEL } from '@/auth/roles';
import type { Profile } from '@/auth/permissions';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import { useCalendarPreference } from '@/lib/calendar-preference';
import { dateText, isoDay } from '@/lib/date-display';

function formatSince(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return dateText(isoDay(d));
}

export function IdentityCard({ profile }: { profile: Profile }) {
  const theme = useTheme();
  // `formatSince` reads the calendar preference, so subscribe to it.
  useCalendarPreference();
  const since = formatSince(profile.createdAt);

  const facts: { label: string; value: string }[] = [
    { label: 'Job title', value: profile.jobRole?.trim() || '—' },
    { label: 'Location', value: profile.location === 'uk' ? 'United Kingdom' : 'Nepal' },
    { label: 'Access role', value: ROLE_LABEL[profile.role] },
    ...(since ? [{ label: 'Member since', value: since }] : []),
  ];

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, boxShadow: theme.shadows.raised, borderColor: theme.border }]}>
      <View style={styles.head}>
        <Avatar initials={profile.initials} tint="dark" size="lg" />
        <View style={styles.headText}>
          <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={1}>
            {profile.name}
          </Text>
          <Text style={[styles.email, { color: theme.textSecondary }]} numberOfLines={1}>
            {profile.email}
          </Text>
        </View>
      </View>

      <View style={styles.pills}>
        <View style={[styles.rolePill, { backgroundColor: theme.accentWash }]}>
          <Text style={[styles.rolePillText, { color: theme.accentWashText }]}>{ROLE_LABEL[profile.role]}</Text>
        </View>
        <StatusPill
          status={profile.status === 'Inactive' ? 'blocked' : 'on-track'}
          label={profile.status === 'Inactive' ? 'Inactive' : 'Active'}
        />
      </View>

      <View style={[styles.facts, { borderTopColor: theme.border }]}>
        {facts.map((f) => (
          <View key={f.label} style={styles.factRow}>
            <Text style={[styles.factLabel, { color: theme.textSecondary }]}>{f.label}</Text>
            <Text style={[styles.factValue, { color: theme.textPrimary }]} numberOfLines={1}>
              {f.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headText: { flex: 1, gap: 3, minWidth: 0 },
  name: { fontFamily: fontFamily.semibold, fontSize: 18, letterSpacing: -0.015 * 18 },
  email: { fontFamily: fontFamily.mono, fontSize: 11.5 },
  pills: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  rolePill: { paddingHorizontal: 10, height: 26, borderRadius: 999, justifyContent: 'center' },
  rolePillText: { fontFamily: fontFamily.semibold, fontSize: 12 },
  facts: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 9 },
  factRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  factLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.12 * 10,
    textTransform: 'uppercase',
  },
  factValue: { fontFamily: fontFamily.medium, fontSize: 13, flexShrink: 1, textAlign: 'right' },
});
