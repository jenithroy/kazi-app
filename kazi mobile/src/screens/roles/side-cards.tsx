import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { ORG_TIERS, SHARED_DUTIES } from '@/data/roles/content';
import { fontFamily } from '@/theme';
import { useTheme } from '@/theme/theme-provider';

import { DutyRow } from './duty-row';

/** What everyone on the Nepal team is asked to do, whatever their role: said once here, not under every role. */
export function SharedDutiesCard() {
  const theme = useTheme();
  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Everyone on the Nepal team</Text>
        <Text style={[styles.sub, { color: theme.textSecondary }]}>Asked of everyone in Kathmandu, whatever their role.</Text>
      </View>
      {SHARED_DUTIES.map((d, i) => (
        <DutyRow key={d.what} duty={d} first={i === 0} />
      ))}
    </Card>
  );
}

/** How the roles sit together, read as three rungs: company context, nothing branches on it. */
export function OrgTiersCard() {
  const theme = useTheme();
  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>How the roles sit together</Text>
      </View>
      <View style={styles.tiers}>
        {ORG_TIERS.map((t, i) => (
          <View key={t.tier} style={styles.tier}>
            <View style={[styles.rung, { backgroundColor: theme.accentWash }]}>
              <Text style={[styles.rungText, { color: theme.accentWashText }]}>{i + 1}</Text>
            </View>
            <View style={styles.tierText}>
              <Text style={[styles.tierName, { color: theme.textPrimary }]}>{t.tier}</Text>
              <Text style={[styles.tierDesc, { color: theme.textSecondary }]}>{t.desc}</Text>
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: 18, gap: 4 },
  head: { gap: 4, paddingBottom: 6 },
  title: { fontFamily: fontFamily.semibold, fontSize: 16, letterSpacing: -0.015 * 16 },
  sub: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 13 * 1.45 },
  tiers: { gap: 14, paddingTop: 6 },
  tier: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  rung: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  rungText: { fontFamily: fontFamily.semibold, fontSize: 12 },
  tierText: { flex: 1, gap: 2 },
  tierName: { fontFamily: fontFamily.semibold, fontSize: 14 },
  tierDesc: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 13 * 1.45 },
});
