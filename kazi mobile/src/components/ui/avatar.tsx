import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import { fontFamily, type Theme } from '@/theme';

export type AvatarTint = 'dark' | 'mint' | 'clay' | 'draft' | 'amber';
export type AvatarSize = 'lg' | 'md' | 'sm';

const SIZES: Record<AvatarSize, { box: number; radius: number; font: number }> = {
  lg: { box: 44, radius: 15, font: 15 },
  md: { box: 38, radius: 13, font: 13 },
  sm: { box: 34, radius: 12, font: 12 },
};

function tintFor(theme: Theme, tint: AvatarTint) {
  switch (tint) {
    case 'dark':
      return { bg: theme.onDark.avatarBg, text: theme.onDark.avatarText };
    case 'mint':
      return { bg: theme.accentWash, text: theme.accentWashText };
    case 'clay':
      return { bg: theme.dangerWash, text: theme.dangerWashText };
    case 'draft':
      return { bg: theme.draftWash, text: theme.draftWashText };
    case 'amber':
      return { bg: theme.warningWash, text: theme.warningWashText };
  }
}

/** Deterministically picks a tint from initials so repeated identities render consistently without callers tracking it. */
export function tintFromSeed(seed: string): AvatarTint {
  const tints: AvatarTint[] = ['dark', 'mint', 'clay', 'draft', 'amber'];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return tints[hash % tints.length];
}

export interface AvatarProps {
  initials: string;
  size?: AvatarSize;
  tint?: AvatarTint;
  online?: boolean;
  borderColor?: string;
  /** 'tile' (default, per-size rounded square) or 'circle' — e.g. Customers' company-vs-individual distinction. */
  shape?: 'tile' | 'circle';
}

export function Avatar({ initials, size = 'lg', tint, online = false, borderColor, shape = 'tile' }: AvatarProps) {
  const theme = useTheme();
  const { box, radius, font } = SIZES[size];
  const resolvedTint = tint ?? tintFromSeed(initials);
  const { bg, text } = tintFor(theme, resolvedTint);

  return (
    <View style={{ width: box, height: box }}>
      <View
        style={[
          styles.avatar,
          { width: box, height: box, borderRadius: shape === 'circle' ? box / 2 : radius, backgroundColor: bg },
          borderColor ? { borderWidth: 2, borderColor } : null,
        ]}
      >
        <Text style={[styles.initials, { color: text, fontSize: font }]}>{initials}</Text>
      </View>
      {online ? (
        <View
          style={[
            styles.onlineDot,
            { backgroundColor: theme.accent, borderColor: borderColor ?? theme.surface },
          ]}
        />
      ) : null}
    </View>
  );
}

export interface AvatarStackProps {
  people: { initials: string; tint?: AvatarTint }[];
  max?: number;
  size?: AvatarSize;
}

/** Overlapping stack (-7px, 2px border) with a "+N" overflow chip, per the style guide's avatars section. */
export function AvatarStack({ people, max = 3, size = 'sm' }: AvatarStackProps) {
  const theme = useTheme();
  const visible = people.slice(0, max);
  const overflow = people.length - visible.length;
  const { box, radius, font } = SIZES[size];

  return (
    <View style={styles.stackRow}>
      {visible.map((p, i) => (
        <View key={i} style={i > 0 ? styles.stackOverlap : undefined}>
          <Avatar initials={p.initials} tint={p.tint} size={size} borderColor={theme.surface} />
        </View>
      ))}
      {overflow > 0 ? (
        <View
          style={[
            styles.avatar,
            styles.stackOverlap,
            {
              width: box,
              height: box,
              borderRadius: radius,
              backgroundColor: theme.draftWash,
              borderWidth: 2,
              borderColor: theme.surface,
            },
          ]}
        >
          <Text style={[styles.initials, { color: theme.draftWashText, fontSize: font - 2 }]}>+{overflow}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontFamily: fontFamily.semibold,
    letterSpacing: 0.2,
  },
  onlineDot: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 14,
    height: 14,
    borderRadius: 99,
    borderWidth: 2.5,
  },
  stackRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stackOverlap: {
    marginLeft: -7,
  },
});
