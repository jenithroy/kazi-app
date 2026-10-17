import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import type { TechPack } from '@/data/inventory/types';

export interface TechPacksViewProps {
  techPacks: TechPack[];
  query: string;
  onOpen: (pack: TechPack) => void;
}

/** The first picture a pack has, whichever field it lives in. */
export function techPackThumb(pack: TechPack): string {
  return pack.frontSketchUrl || pack.images[0] || pack.backSketchUrl || '';
}

/** Sizes come as an array on older records and free text on newer ones. */
export function techPackSizes(pack: TechPack): string {
  if (pack.sizes.length > 0) return pack.sizes.join(' · ');
  return pack.specSize
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' · ');
}

/**
 * Two-column grid of tech packs, newest first. A tech pack is recognised by its
 * sketch, so the thumbnail leads — but the older half of the live records have
 * no sketch at all, only an attached document, so those get a labelled document
 * tile rather than an empty box.
 */
export function TechPacksView({ techPacks, query, onOpen }: TechPacksViewProps) {
  if (techPacks.length === 0) {
    return (
      <EmptyState
        icon="search"
        title={query ? 'Nothing matches' : 'No tech packs yet'}
        message={query ? 'Try a shorter search.' : 'Start a garment specification sheet with the button below.'}
      />
    );
  }

  return (
    <View style={styles.grid}>
      {techPacks.map((p, index) => (
        <TechPackCard key={p.id} pack={p} index={index} onPress={() => onOpen(p)} />
      ))}
    </View>
  );
}

function TechPackCard({ pack, index, onPress }: { pack: TechPack; index: number; onPress: () => void }) {
  const theme = useTheme();
  const thumb = techPackThumb(pack);
  const sizes = techPackSizes(pack);
  const sub = [pack.productType, pack.category].filter(Boolean).join(' · ');

  return (
    <Animated.View entering={FadeInUp.delay(Math.min(index, 10) * 22).duration(200)} style={styles.cell}>
      <Pressable
        onPress={onPress}
        style={[styles.card, { backgroundColor: theme.surface, boxShadow: theme.shadows.card, borderColor: theme.border }]}
      >
        {thumb ? (
          <Image source={{ uri: thumb }} style={styles.sketch} resizeMode="cover" />
        ) : (
          <View style={[styles.sketch, styles.sketchEmpty, { backgroundColor: theme.draftWash }]}>
            <Icon name={pack.techPackUrl ? 'file-text' : 'image'} size={20} color={theme.textSecondary} />
            {pack.techPackUrl ? (
              <Text style={[styles.sketchHint, { color: theme.textSecondary }]}>Document</Text>
            ) : null}
          </View>
        )}

        <View style={styles.text}>
          {pack.styleNo ? (
            <Text style={[styles.style, { color: theme.accentDeep }]} numberOfLines={1}>
              {pack.styleNo}
            </Text>
          ) : null}
          <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={2}>
            {pack.name}
          </Text>
          {sub ? (
            <Text style={[styles.meta, { color: theme.textSecondary }]} numberOfLines={1}>
              {sub}
            </Text>
          ) : null}
          {sizes ? (
            <Text style={[styles.sizes, { color: theme.textSecondary }]} numberOfLines={1}>
              {sizes}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  cell: { width: '48%' },
  card: { borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  // Taller than the fabric swatch: a garment sketch is a portrait drawing.
  sketch: { width: '100%', aspectRatio: 0.85 },
  sketchEmpty: { alignItems: 'center', justifyContent: 'center', gap: 6 },
  sketchHint: { fontFamily: fontFamily.mono, fontSize: 9, letterSpacing: 0.08 * 9, textTransform: 'uppercase' },
  text: { padding: 11, gap: 3 },
  style: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.06 * 10 },
  name: { fontFamily: fontFamily.semibold, fontSize: 13.5, letterSpacing: -0.01 * 13.5 },
  meta: { fontSize: 11.5, textTransform: 'capitalize' },
  sizes: { fontFamily: fontFamily.mono, fontSize: 10, marginTop: 1 },
});
