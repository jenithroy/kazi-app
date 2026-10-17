import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ThresholdBar } from '@/components/ui/threshold-bar';
import { useScrollTop } from '@/lib/use-scroll-top';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import { money, useMoneySignature } from '@/lib/money';
import { stockLevel, stockRatio } from '@/data/inventory/utils';
import type { Fabric, StockItem, StockMovement } from '@/data/inventory/types';

export interface DetailViewProps {
  item: StockItem;
  movements: StockMovement[];
  /**
   * The library row this item is costed against, resolved from
   * `unit_economics.fabricName`. Omitted when the item names no material or the
   * name matches nothing — the "Linked library" card is then left out entirely.
   */
  linkedFabric?: Fabric;
  onBack: () => void;
  onRaisePO: () => void;
  /** Omitted for view-only users — the Adjust / Edit affordances then hide. */
  onAdjust?: () => void;
  onEditDetails?: () => void;
}

export function DetailView({ item, movements, linkedFabric, onBack, onRaisePO, onAdjust, onEditDetails }: DetailViewProps) {
  const theme = useTheme();
  useMoneySignature();
  // Keyed on the item: this view stays mounted while you close one item and
  // open another, so without it the second one opens at the first one's offset.
  const scrollRef = useScrollTop(item.id);
  const level = stockLevel(item);
  const barColor = level === 'low' ? theme.danger : level === 'near' ? theme.warning : theme.accent;
  const statusLine =
    level === 'low'
      ? `Short by ${(item.threshold - item.qty).toLocaleString()} ${item.unit}`
      : level === 'near'
        ? 'Within 15% of the reorder line'
        : item.threshold > 0
          ? `Healthy · ${Math.round((item.qty / item.threshold) * 100)}% of reorder point`
          : 'Healthy · no reorder point set';

  const facts = [
    { label: 'Supplier', value: item.supplier || '—' },
    { label: 'Location', value: item.location || '—' },
    { label: 'Last cost', value: item.unitCostNPR ? money(item.unitCostNPR) : '—' },
  ];

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <ScreenHeader title={item.name} subtitle={[item.sku, item.supplier].filter(Boolean).join(' · ')} onBack={onBack} />

      <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
        <Card elevation="hero" style={styles.onHandCard}>
          <View style={styles.onHandRow}>
            <View style={styles.gap5}>
              <Text style={[styles.eyebrow, { color: theme.onHero.textMuted }]}>On hand</Text>
              <View style={styles.baselineRow}>
                <Text style={[styles.onHandValue, tabularNums, { color: theme.onHero.text }]}>{item.qty.toLocaleString()}</Text>
                <Text style={[styles.onHandUnit, { color: theme.onHero.textMuted }]}>{item.unit}</Text>
              </View>
            </View>
            <View style={[styles.gap5, styles.alignEnd]}>
              <Text style={[styles.eyebrow, { color: theme.onHero.textMuted }]}>Reorder at</Text>
              <Text style={[styles.reorderValue, tabularNums, { color: theme.onHero.text }]}>{item.threshold.toLocaleString()}</Text>
            </View>
          </View>
          <ThresholdBar
            ratio={Math.min(stockRatio(item), 1)}
            markRatio={item.threshold > 0 ? 0.5 : 0}
            color={barColor}
            trackColor={theme.onHero.track}
            tickColor={theme.onHero.text}
            height={6}
          />
          <Text style={[styles.statusLine, { color: theme.onHero.avatarText }]}>{statusLine}</Text>
          <View style={styles.statusRow}>
            {onAdjust ? <Button label="Adjust stock" size="small" onPress={onAdjust} /> : null}
            <Button label="Raise PO" size="small" variant="secondary" onPress={onRaisePO} />
          </View>
        </Card>

        <View style={styles.detailsHeader}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Details</Text>
          {onEditDetails ? (
            <Pressable onPress={onEditDetails} hitSlop={8} style={styles.editLink}>
              <Icon name="edit-2" size={13} color={theme.link} />
              <Text style={[styles.editLinkText, { color: theme.link }]}>Edit</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.factsGrid}>
          {facts.map((f) => (
            <View key={f.label} style={[styles.factCard, { backgroundColor: theme.surface }]}>
              <Text style={[styles.factLabel, { color: theme.textSecondary }]}>{f.label}</Text>
              <Text style={[styles.factValue, tabularNums, { color: theme.textPrimary }]}>{f.value}</Text>
            </View>
          ))}
        </View>

        <Card elevation="raised" style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Stock history</Text>
            <Text style={[styles.sectionMeta, tabularNums, { color: theme.textSecondary }]}>
              {movements.length} {movements.length === 1 ? 'movement' : 'movements'}
            </Text>
          </View>

          {movements.length === 0 ? (
            <Text style={[styles.noMoves, { color: theme.textSecondary }]}>No movements logged yet — tap “Adjust stock” to post one.</Text>
          ) : (
            <View>
              {movements.map((m, i) => {
                const isIn = m.delta >= 0;
                return (
                  <View key={m.id} style={[styles.movementRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
                    <View style={[styles.movementIcon, { backgroundColor: isIn ? theme.accentWash : theme.draftWash }]}>
                      <Text style={[styles.movementSign, { color: isIn ? theme.accentWashText : theme.textSecondary }]}>{isIn ? '+' : '−'}</Text>
                    </View>
                    <View style={styles.movementTextWrap}>
                      <View style={styles.movementLine}>
                        <Text style={[styles.movementTitle, { color: theme.textPrimary }]} numberOfLines={1}>
                          {m.reason}
                        </Text>
                        <Text style={[styles.movementAmount, tabularNums, { color: isIn ? theme.accentWashText : theme.textPrimary }]}>
                          {isIn ? '+' : '−'}{Math.abs(m.delta).toLocaleString()} {item.unit}
                        </Text>
                      </View>
                      <View style={styles.movementLine}>
                        <Text style={[styles.movementRef, { color: theme.textSecondary }]} numberOfLines={1}>
                          {m.ref ? `${m.ref} · ` : ''}{m.date}{m.kind === 'adjust' ? ' · count' : ''}
                        </Text>
                        <Text style={[styles.movementBalance, tabularNums, { color: theme.textSecondary }]}>bal {m.balance.toLocaleString()}</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </Card>

        {linkedFabric ? (
          <Card elevation="raised" style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Linked library</Text>
            <View style={styles.linkRow}>
              {linkedFabric.swatchUrl ? (
                <Image source={{ uri: linkedFabric.swatchUrl }} style={[styles.linkThumb, { borderColor: theme.border }]} />
              ) : (
                <View style={[styles.linkThumb, { borderColor: theme.border }]} />
              )}
              <View style={[styles.gap2, styles.flex]}>
                <Text style={[styles.linkName, { color: theme.textPrimary }]} numberOfLines={1}>
                  {linkedFabric.name}
                </Text>
                <Text style={[styles.linkMeta, { color: theme.textSecondary }]} numberOfLines={2}>
                  {[
                    linkedFabric.type || 'Fabric',
                    linkedFabric.composition,
                    linkedFabric.gsm ? `${linkedFabric.gsm} GSM` : '',
                    linkedFabric.supplier,
                    linkedFabric.status,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
            </View>
          </Card>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, paddingBottom: 32, gap: 12 },
  onHandCard: { padding: 17, gap: 14 },
  onHandRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14 },
  gap5: { gap: 5 },
  gap2: { gap: 2 },
  alignEnd: { alignItems: 'flex-end' },
  eyebrow: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.12 * 10, textTransform: 'uppercase' },
  baselineRow: { flexDirection: 'row', alignItems: 'baseline', gap: 7 },
  onHandValue: { fontFamily: fontFamily.semibold, fontSize: 32, letterSpacing: -0.03 * 32 },
  onHandUnit: { fontFamily: fontFamily.mono, fontSize: 12 },
  reorderValue: { fontFamily: fontFamily.semibold, fontSize: 17 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusLine: { fontSize: 13, lineHeight: 13 * 1.4 },
  detailsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2, marginTop: 2 },
  editLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editLinkText: { fontFamily: fontFamily.semibold, fontSize: 12.5 },
  noMoves: { fontSize: 12.5, lineHeight: 12.5 * 1.5 },
  factsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  factCard: { width: '47%', flexGrow: 1, borderRadius: 16, padding: 13, gap: 5 },
  factLabel: { fontFamily: fontFamily.mono, fontSize: 9.5, letterSpacing: 0.11 * 9.5, textTransform: 'uppercase' },
  factValue: { fontSize: 14.5, fontWeight: '600' },
  section: { padding: 16, gap: 14 },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sectionTitle: { fontFamily: fontFamily.semibold, fontSize: 15 },
  sectionMeta: { fontFamily: fontFamily.mono, fontSize: 11 },
  movementRow:{ flexDirection: 'row', gap: 12, paddingVertical: 11 },
  movementIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  movementSign: { fontFamily: fontFamily.mono, fontSize: 15, fontWeight: '600' },
  movementTextWrap: { flex: 1, gap: 3, minWidth: 0 },
  movementLine: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  movementTitle: { fontSize: 14, fontWeight: '600' },
  movementAmount: { fontSize: 14, fontWeight: '600', flexShrink: 0 },
  movementRef: { flex: 1, fontFamily: fontFamily.mono, fontSize: 10.5 },
  movementBalance: { fontFamily: fontFamily.mono, fontSize: 10.5, flexShrink: 0 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  linkThumb: { width: 38, height: 46, borderRadius: 10, borderWidth: 1, flexShrink: 0 },
  linkName: { fontSize: 13.5, fontWeight: '600' },
  linkMeta: { fontFamily: fontFamily.mono, fontSize: 10.5 },
});
