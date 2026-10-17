import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import type { Fabric } from '@/data/inventory/types';

export interface FabricsViewProps {
  fabrics: Fabric[];
  query: string;
  onOpen: (fabric: Fabric) => void;
}

/** Status → the wash palette it reads as. Anything unrecognised stays neutral. */
export function fabricStatusTone(status: string): 'ok' | 'low' | 'out' | 'none' {
  const s = status.toLowerCase();
  if (s.includes('out')) return 'out';
  if (s.includes('low')) return 'low';
  if (s.includes('in stock')) return 'ok';
  return 'none';
}

/**
 * A two-column card grid. Fabric is the one thing on this page you recognise by
 * eye before you read it, so the swatch photo leads and the text supports it —
 * and 40% of the live rows have no photo, so the fallback tile has to look
 * deliberate rather than broken.
 */
export function FabricsView({ fabrics, query, onOpen }: FabricsViewProps) {
  if (fabrics.length === 0) {
    return (
      <EmptyState
        icon="search"
        title={query ? 'Nothing matches' : 'No fabrics yet'}
        message={query ? 'Try a shorter search.' : 'Add the first fabric or trim with the button below.'}
      />
    );
  }

  return (
    <View style={styles.grid}>
      {fabrics.map((f, index) => (
        <FabricCard key={f.id} fabric={f} index={index} onPress={() => onOpen(f)} />
      ))}
    </View>
  );
}

function FabricCard({ fabric, index, onPress }: { fabric: Fabric; index: number; onPress: () => void }) {
  const theme = useTheme();
  const tone = fabricStatusTone(fabric.status);
  const toneWash =
    tone === 'out' ? theme.dangerWash : tone === 'low' ? theme.warningWash : tone === 'ok' ? theme.accentWash : theme.draftWash;
  const toneText =
    tone === 'out'
      ? theme.dangerWashText
      : tone === 'low'
        ? theme.warningWashText
        : tone === 'ok'
          ? theme.accentWashText
          : theme.draftWashText;

  const meta = [fabric.gsm ? `${fabric.gsm} GSM` : '', fabric.composition].filter(Boolean).join(' · ');

  return (
    <Animated.View entering={FadeInUp.delay(Math.min(index, 10) * 22).duration(200)} style={styles.cell}>
      <Pressable
        onPress={onPress}
        style={[styles.card, { backgroundColor: theme.surface, boxShadow: theme.shadows.card, borderColor: theme.border }]}
      >
        {fabric.swatchUrl ? (
          <Image source={{ uri: fabric.swatchUrl }} style={styles.swatch} resizeMode="cover" />
        ) : (
          <View style={[styles.swatch, styles.swatchEmpty, { backgroundColor: theme.draftWash }]}>
            <Icon name="image" size={19} color={theme.textSecondary} />
          </View>
        )}

        <View style={styles.text}>
          <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={2}>
            {fabric.name}
          </Text>
          {meta ? (
            <Text style={[styles.meta, { color: theme.textSecondary }]} numberOfLines={2}>
              {meta}
            </Text>
          ) : null}
          <View style={styles.chips}>
            {fabric.status ? (
              <View style={[styles.chip, { backgroundColor: toneWash }]}>
                <Text style={[styles.chipText, { color: toneText }]}>{fabric.status}</Text>
              </View>
            ) : null}
            {fabric.type ? (
              <View style={[styles.chip, { backgroundColor: theme.draftWash }]}>
                <Text style={[styles.chipText, { color: theme.draftWashText }]}>{fabric.type}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  // Two per row: `48%` leaves the 12px gap without measuring the container.
  cell: { width: '48%' },
  card: { borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  swatch: { width: '100%', aspectRatio: 1.25 },
  swatchEmpty: { alignItems: 'center', justifyContent: 'center' },
  text: { padding: 11, gap: 5 },
  name: { fontFamily: fontFamily.semibold, fontSize: 13.5, letterSpacing: -0.01 * 13.5 },
  meta: { fontSize: 11.5, lineHeight: 11.5 * 1.35 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 1 },
  chip: { height: 21, paddingHorizontal: 8, borderRadius: 999, justifyContent: 'center' },
  chipText: { fontSize: 10.5, fontWeight: '600' },
});
