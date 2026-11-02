import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { Icon } from '@/components/ui/icon';
import { DUTY_LINKS } from '@/data/roles/content';
import type { Duty } from '@/data/roles/types';
import { fontFamily } from '@/theme';
import { useTheme } from '@/theme/theme-provider';

/**
 * One thing a role is expected to log: what it is, how often, why it matters, and a way to the page where it is done. The way in
 * is offered only to somebody who may open that page (the website's link would bounce them), so nobody is sent to a locked door.
 */
export function DutyRow({ duty, first = false }: { duty: Duty; first?: boolean }) {
  const theme = useTheme();
  const { canView } = useAuth();
  const link = DUTY_LINKS[duty.section];
  const canOpen = !!link && canView(link.section);

  return (
    <View style={[styles.row, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
      <Text style={[styles.what, { color: theme.textPrimary }]}>{duty.what}</Text>
      <View style={styles.cadence}>
        <Icon name="clock" size={12} color={theme.textSecondary} />
        <Text style={[styles.cadenceText, { color: theme.textSecondary }]}>{duty.cadence}</Text>
      </View>
      <Text style={[styles.detail, { color: theme.textSecondary }]}>{duty.detail}</Text>
      {canOpen ? (
        <Link href={link.route as never} asChild>
          <Pressable accessibilityRole="link" accessibilityLabel={`Open ${link.label}`} style={styles.open} hitSlop={8}>
            <Text style={[styles.openText, { color: theme.link }]}>Open {link.label}</Text>
            <Icon name="arrow-right" size={14} color={theme.link} />
          </Pressable>
        </Link>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 13, gap: 6 },
  what: { fontFamily: fontFamily.semibold, fontSize: 14.5, lineHeight: 14.5 * 1.3 },
  cadence: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cadenceText: { fontFamily: fontFamily.mono, fontSize: 11, letterSpacing: 0.04 * 11 },
  detail: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 13 * 1.5 },
  open: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingTop: 2 },
  openText: { fontFamily: fontFamily.semibold, fontSize: 13 },
});
