import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import type { SectionId } from '@/auth/permissions';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';

import { Icon } from './icon';

export interface PermissionNoticeProps {
  section: SectionId;
  /** Override the default "View only" copy. */
  message?: string;
}

/**
 * Inline "you can look but not touch" banner — rendered only when the current
 * profile can *see* the section but not edit it. Mirrors the reference app's
 * `ℹ …` read-only banners. Renders nothing for users who can edit (or can't
 * see the section at all — nav filtering handles that case).
 */
export function PermissionNotice({ section, message }: PermissionNoticeProps) {
  const theme = useTheme();
  const { canView, can } = useAuth();

  if (!canView(section) || can(section)) return null;

  return (
    <View style={[styles.banner, { backgroundColor: theme.draftWash, borderColor: theme.border }]}>
      <Icon name="info" size={14} color={theme.textSecondary} />
      <Text style={[styles.text, { color: theme.textSecondary }]}>
        {message ?? 'View only — you don’t have edit access here.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  text: { flex: 1, fontFamily: fontFamily.medium, fontSize: 12, lineHeight: 12 * 1.4 },
});
