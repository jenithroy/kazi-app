import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { Avatar, tintFromSeed, type AvatarSize } from '@/components/ui/avatar';

const SIZE_PX: Record<AvatarSize, number> = { lg: 44, md: 38, sm: 34 };

/**
 * A lead's real Instagram profile picture, falling back to the initials
 * avatar used everywhere else in chat when there isn't one — or it's expired,
 * which is routine: Meta's picture URLs only last a few days.
 */
export function LeadAvatar({ convo, name, profilePic, size = 'lg' }: { convo: string; name: string | null; profilePic: string | null; size?: AvatarSize }) {
  const [broken, setBroken] = useState(false);
  const title = name || 'Instagram user';
  const initials = title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || 'IG';

  if (profilePic && !broken) {
    const box = SIZE_PX[size];
    return (
      <View style={{ width: box, height: box }}>
        <Image source={{ uri: profilePic }} style={[styles.image, { width: box, height: box }]} onError={() => setBroken(true)} />
      </View>
    );
  }

  return <Avatar initials={initials} size={size} tint={tintFromSeed(convo)} />;
}

const styles = StyleSheet.create({
  image: { borderRadius: 999 },
});
