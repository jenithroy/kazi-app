import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { ROLE_LABEL, ROLES, type Role } from '@/auth/roles';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';

/**
 * Dev-only: switch the signed-in RBAC role so nav filtering / edit gating are
 * testable without a real backend. Goes away when real auth + a real
 * profile resolver land (plan §2.2).
 */
export function RoleSwitcher() {
  const theme = useTheme();
  const { role, setDevRole } = useAuth();

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, boxShadow: theme.shadows.card }]}>
      <View style={styles.textWrap}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Role · dev</Text>
        <Text style={[styles.meta, { color: theme.textSecondary }]}>
          {role ? ROLE_LABEL[role] : '—'} · drives nav + edit access
        </Text>
      </View>
      <View style={styles.chips}>
        {ROLES.map((r: Role) => {
          const active = r === role;
          return (
            <Pressable
              key={r}
              onPress={() => setDevRole(r)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[
                styles.chip,
                { borderColor: active ? theme.selectedBorder : theme.border, backgroundColor: active ? theme.selectedSurface : 'transparent' },
              ]}
            >
              <Text style={[styles.chipText, { color: active ? theme.selectedText : theme.textSecondary }]}>
                {ROLE_LABEL[r]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, padding: 15, gap: 11 },
  textWrap: { gap: 3 },
  label: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.12 * 10,
    textTransform: 'uppercase',
  },
  meta: { fontSize: 12, lineHeight: 12 * 1.4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  chipText: { fontFamily: fontFamily.semibold, fontSize: 11.5 },
});
