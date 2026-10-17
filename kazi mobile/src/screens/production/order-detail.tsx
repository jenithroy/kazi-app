import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import { STAGES, stageById, stageIndex } from '@/data/sales/mock';
import { EMBELLISHMENT_TYPES } from '@/data/sales/types';
import type { Embellishment, Order } from '@/data/sales/types';
import { lakh, priorityOf } from '@/data/sales/utils';
import { money } from '@/lib/money';
import { useCalendarPreference } from '@/lib/calendar-preference';
import { dateText, isoDay } from '@/lib/date-display';

import { StageTimeline } from './stage-timeline';

export interface OrderDetailProps {
  order: Order;
  canEdit: boolean;
  onAdvance: () => void;
  onReverse: () => void;
  onHold: () => void;
  onResume: () => void;
  onEmbellishments: (next: Embellishment[]) => void;
  onAddNote: (body: string) => void;
}

function when(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return dateText(isoDay(iso));
}

const PRIORITY_LABEL = { urgent: 'Urgent', high: 'High', normal: 'Normal' } as const;

export function OrderDetail({
  order,
  canEdit,
  onAdvance,
  onReverse,
  onHold,
  onResume,
  onEmbellishments,
  onAddNote,
}: OrderDetailProps) {
  const theme = useTheme();
  // Dates here go through `fmtDate`, which reads the calendar preference.
  useCalendarPreference();
  const [note, setNote] = useState('');

  const idx = stageIndex(order.stage);
  const stage = stageById(order.stage);
  const priority = priorityOf(order);
  const last = STAGES.length - 1;
  const cancelled = order.status === 'cancelled';
  const live = order.status === 'active' || order.status === 'on-hold';

  const priorityPalette =
    priority === 'urgent'
      ? { bg: theme.dangerWash, fg: theme.dangerWashText }
      : priority === 'high'
        ? { bg: theme.warningWash, fg: theme.warningWashText }
        : { bg: theme.draftWash, fg: theme.draftWashText };

  const facts: { label: string; value: string }[] = [
    { label: 'Order no.', value: order.ref },
    { label: 'Order date', value: when(order.orderDate) },
    { label: 'Delivery date', value: order.deliveryDate ? when(order.deliveryDate) : 'Not set' },
    { label: 'Quantity', value: `${order.qty.toLocaleString('en-US')} pcs` },
    { label: 'Price / pc', value: order.pricePerPc ? money(order.pricePerPc) : '—' },
    { label: 'Order value', value: order.value ? lakh(order.value) : '—' },
    { label: 'Fabric', value: order.fabricType || '—' },
    { label: 'Colorway', value: order.colorway || '—' },
    { label: 'Fabric / pc', value: order.fabricGramsUsed ? `${order.fabricGramsUsed} g` : '—' },
    { label: 'Fabric cost / pc', value: order.fabricCostPerPc ? money(order.fabricCostPerPc) : '—' },
    { label: 'Invoice / challan', value: order.invoiceRef || '—' },
    { label: 'Assigned to', value: order.assignedTo || 'Unassigned' },
    { label: 'Sample', value: order.sampleName || '—' },
  ];

  const submitNote = () => {
    const body = note.trim();
    if (!body) return;
    onAddNote(body);
    setNote('');
  };

  const toggleEmbellishment = (t: Embellishment) => {
    const on = order.embellishments.includes(t);
    onEmbellishments(on ? order.embellishments.filter((e) => e !== t) : [...order.embellishments, t]);
  };

  return (
    <Animated.View entering={FadeInUp.duration(220)} style={styles.wrap}>
      <Card elevation="hero" style={styles.trackerCard}>
        <View style={styles.trackerRow}>
          <View style={styles.gap5}>
            <Text style={[styles.eyebrow, { color: theme.onHero.textMuted }]}>Now at</Text>
            <Text style={[styles.trackerValue, { color: theme.onHero.text }]}>{stage.label}</Text>
          </View>
          <View style={[styles.gap5, styles.alignEnd]}>
            <Text style={[styles.eyebrow, { color: theme.onHero.textMuted }]}>Step</Text>
            <Text style={[styles.trackerValue, tabularNums, { color: theme.onHero.accent }]}>
              {idx + 1} / {STAGES.length}
            </Text>
          </View>
        </View>
        <View style={styles.chipRow}>
          <View style={[styles.chip, { backgroundColor: priorityPalette.bg }]}>
            <Text style={[styles.chipText, { color: priorityPalette.fg }]}>{PRIORITY_LABEL[priority]}</Text>
          </View>
          <Text style={[styles.dueText, { color: theme.onHero.textMuted }]}>
            {order.deliveryDate
              ? order.shipDays < 0
                ? `${Math.abs(order.shipDays)} days overdue`
                : `${order.shipDays} days to delivery`
              : 'No delivery date set'}
          </Text>
        </View>

      </Card>

      {/* Moving the order and pausing it are both statements about where it is
          right now, so they sit directly under the current stage rather than in
          the footer, which is reserved for acting on the record itself. */}
      {canEdit ? (
        <Card elevation="raised" style={styles.moveCard}>
          {live ? (
            <View style={styles.actionRow}>
              <Button
                label="← Previous"
                variant="secondary"
                size="small"
                onPress={onReverse}
                disabled={idx <= 0}
                style={styles.flex1}
              />
              <Button
                label={order.status === 'on-hold' ? 'Resume' : 'Hold'}
                variant="secondary"
                size="small"
                onPress={order.status === 'on-hold' ? onResume : onHold}
                style={styles.holdBtn}
              />
              <Button
                label={idx === last - 1 ? 'Deliver' : 'Advance →'}
                size="small"
                onPress={onAdvance}
                // An order on hold has to be resumed before it can move on.
                disabled={idx >= last || order.status === 'on-hold'}
                style={styles.flex1}
              />
            </View>
          ) : (
            <Text style={[styles.mutedNote, { color: theme.textSecondary }]}>
              {cancelled ? 'This order is cancelled — nothing left to move.' : 'This order is complete.'}
            </Text>
          )}
        </Card>
      ) : null}

      <Card elevation="raised" style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Pipeline</Text>
        <Text style={[styles.mutedNote, { color: theme.textSecondary }]}>
          Tap a stage to see when it was reached and who moved it.
        </Text>
        <StageTimeline stage={order.stage} history={order.stageHistory} />
      </Card>

      {order.stage === 'embellishment' || order.embellishments.length > 0 ? (
        <Card elevation="raised" style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Embellishment</Text>
          <Text style={[styles.mutedNote, { color: theme.textSecondary }]}>
            An order carries any combination of these rather than passing through them one by one.
          </Text>
          <View style={styles.embRow}>
            {EMBELLISHMENT_TYPES.map((t) => {
              const on = order.embellishments.includes(t);
              return (
                <Pressable
                  key={t}
                  onPress={() => canEdit && toggleEmbellishment(t)}
                  disabled={!canEdit}
                  style={[
                    styles.embChip,
                    {
                      backgroundColor: on ? theme.accentWash : theme.surface,
                      borderColor: on ? theme.accentWashText : theme.border,
                      opacity: canEdit ? 1 : 0.7,
                    },
                  ]}
                >
                  <Text style={[styles.embText, { color: on ? theme.accentWashText : theme.textSecondary }]}>{t}</Text>
                </Pressable>
              );
            })}
          </View>
        </Card>
      ) : null}

      <Card elevation="raised" style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Order details</Text>
        <View style={styles.factsGrid}>
          {facts.map((f) => (
            <View key={f.label} style={[styles.factCard, { backgroundColor: theme.background, borderColor: theme.border }]}>
              <Text style={[styles.factLabel, { color: theme.textSecondary }]}>{f.label}</Text>
              <Text style={[styles.factValue, tabularNums, { color: theme.textPrimary }]}>{f.value}</Text>
            </View>
          ))}
        </View>
      </Card>

      <Card elevation="raised" style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Notes</Text>
        {order.notes.length === 0 ? (
          <Text style={[styles.mutedNote, { color: theme.textSecondary }]}>No notes yet.</Text>
        ) : (
          order.notes.map((n) => (
            <View key={n.id} style={[styles.noteCard, { backgroundColor: theme.background, borderColor: theme.border }]}>
              <Text style={[styles.noteBody, { color: theme.textPrimary }]}>{n.body}</Text>
              <Text style={[styles.noteMeta, tabularNums, { color: theme.textSecondary }]}>
                {n.who} · {when(n.at)}
              </Text>
            </View>
          ))
        )}
        {canEdit ? (
          <View style={styles.noteInputRow}>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Add a note…"
              placeholderTextColor={theme.textSecondary}
              style={[styles.noteInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.textPrimary }]}
            />
            <Button label="Add" size="small" onPress={submitNote} disabled={!note.trim()} />
          </View>
        ) : null}
      </Card>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  flex1: { flex: 1 },
  gap5: { gap: 5 },
  alignEnd: { alignItems: 'flex-end' },
  trackerCard: { padding: 16, gap: 14 },
  trackerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  eyebrow: { fontFamily: fontFamily.mono, fontSize: 9.5, letterSpacing: 0.12 * 9.5, textTransform: 'uppercase' },
  trackerValue: { fontFamily: fontFamily.semibold, fontSize: 18, letterSpacing: -0.015 * 18 },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  chip: { height: 22, paddingHorizontal: 9, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontFamily: fontFamily.mono, fontSize: 9.5, letterSpacing: 0.08 * 9.5, textTransform: 'uppercase' },
  dueText: { fontSize: 12, flexShrink: 1 },
  section: { padding: 16, gap: 10 },
  sectionTitle: { fontFamily: fontFamily.semibold, fontSize: 15, paddingHorizontal: 0, letterSpacing: -0.01 * 15 },
  moveCard: { paddingHorizontal: 14, paddingVertical: 12 },
  actionRow: { flexDirection: 'row', gap: 8 },
  holdBtn: { minWidth: 78 },
  mutedNote: { fontSize: 12.5, lineHeight: 18 },
  embRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  embChip: { height: 34, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  embText: { fontFamily: fontFamily.semibold, fontSize: 13 },
  factsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  factCard: { width: '47%', flexGrow: 1, borderRadius: 14, borderWidth: 1, padding: 12, gap: 5 },
  factLabel: { fontFamily: fontFamily.mono, fontSize: 9, letterSpacing: 0.11 * 9, textTransform: 'uppercase' },
  factValue: { fontSize: 13.5, fontWeight: '600' },
  histRow: { flexDirection: 'row', gap: 11 },
  histMarkCol: { alignItems: 'center', width: 10 },
  histDot: { width: 9, height: 9, borderRadius: 99, marginTop: 4 },
  histLine: { width: 1.5, flex: 1, marginTop: 3, minHeight: 14 },
  histText: { flex: 1, gap: 3, paddingBottom: 12 },
  histStage: { fontSize: 13.5, fontFamily: fontFamily.medium },
  histMeta: { fontFamily: fontFamily.mono, fontSize: 10 },
  noteCard: { borderRadius: 12, borderWidth: 1, padding: 11, gap: 5 },
  noteBody: { fontSize: 13, lineHeight: 13 * 1.45 },
  noteMeta: { fontFamily: fontFamily.mono, fontSize: 9.5 },
  noteInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  noteInput: { flex: 1, height: 44, paddingHorizontal: 12, borderRadius: 11, borderWidth: 1, fontSize: 14 },
});
