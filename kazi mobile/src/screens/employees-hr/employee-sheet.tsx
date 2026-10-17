import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Icon } from '@/components/ui/icon';
import { Switch } from '@/components/ui/switch';
import { TextField } from '@/components/ui/text-field';
import { useTheme } from '@/theme/theme-provider';
import * as haptics from '@/lib/haptics';
import { fontFamily, radii, tabularNums } from '@/theme';
import { BANKS, DEPTS } from '@/data/employees-hr/mock';
import { DAY_NAMES } from '@/data/attendance/live-shared';
import { acctDigits, acctHint, acctValid, dateValid, emailValid, timeValid } from '@/data/employees-hr/utils';
import type {
  EmployeeDraft,
  EmployeeLocation,
  Position,
  ScheduleOverrides,
  SheetMode,
} from '@/data/employees-hr/types';

/** Someone this person could report to — the roster minus themself. */
export interface ManagerOption {
  id: number;
  name: string;
  role: string;
}

export interface EmployeeSheetProps {
  visible: boolean;
  mode: SheetMode;
  draft: EmployeeDraft;
  onChange: (patch: Partial<EmployeeDraft>) => void;
  onClose: () => void;
  onSave: () => void;
  sheetMeta: string;
  saveHint: string;
  saveCode: string;
  /** `positions` rows — what actually grants this person their access. */
  positions: Position[];
  managers: ManagerOption[];
  /** The draft differs from the record it was opened on. */
  dirty: boolean;
  changeCount: number;
  onDiscard: () => void;
  onViewSlip: () => void;
  /** Edit mode only (item 28). */
  onDelete?: () => void;
}

const LOCATIONS: { id: EmployeeLocation; label: string; note: string }[] = [
  { id: 'nepal', label: 'Nepal', note: 'Balaju plant' },
  { id: 'uk', label: 'UK', note: 'remote arm' },
];

function SectionTitle({ children }: { children: string }) {
  const theme = useTheme();
  return <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{children}</Text>;
}

/** Bare label + input, for the fields that sit inside a card and can't use `TextField`'s chrome. */
function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize = 'none',
  mono = false,
  invalid = false,
  hint,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'email-address' | 'phone-pad';
  autoCapitalize?: 'none' | 'words' | 'sentences' | 'characters';
  mono?: boolean;
  invalid?: boolean;
  hint?: string;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.group, styles.flex1]}>
      <Text style={[styles.smallLabel, { color: theme.textSecondary }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.smallInput,
          mono && tabularNums,
          {
            backgroundColor: theme.surfaceRaised,
            borderColor: invalid ? theme.danger : theme.border,
            color: theme.textPrimary,
            fontFamily: mono ? fontFamily.mono : fontFamily.regular,
          },
        ]}
      />
      {hint ? <Text style={[styles.fieldHint, { color: invalid ? theme.dangerWashText : theme.textSecondary }]}>{hint}</Text> : null}
    </View>
  );
}

/** Horizontal single-select. Used for position, department, bank and manager. */
function ChipPicker<T extends string | number | null>({
  options,
  value,
  onSelect,
  accent = false,
}: {
  options: { id: T; label: string }[];
  value: T;
  onSelect: (id: T) => void;
  accent?: boolean;
}) {
  const theme = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
      {options.map((o) => {
        const on = o.id === value;
        const bg = on ? (accent ? theme.accentWash : theme.selectedSurface) : accent ? theme.surfaceRaised : theme.surface;
        const fg = on ? (accent ? theme.accentWashText : theme.selectedText) : theme.textPrimary;
        return (
          <Pressable
            key={String(o.id)}
            onPress={() => onSelect(o.id)}
            style={[styles.chip, { backgroundColor: bg, borderColor: on ? (accent ? theme.accent : theme.selectedBorder) : theme.border }]}
          >
            <Text style={[styles.chipLabel, { color: fg }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function EmployeeSheet({
  visible,
  mode,
  draft,
  onChange,
  onClose,
  onSave,
  sheetMeta,
  saveHint,
  saveCode,
  positions,
  managers,
  dirty,
  changeCount,
  onDiscard,
  onViewSlip,
  onDelete,
}: EmployeeSheetProps) {
  const theme = useTheme();
  const shake = useSharedValue(0);
  const scrollRef = useRef<ScrollView | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Held as "which record is awaiting confirmation" rather than a bare flag, so
  // closing the sheet or opening someone else drops the armed state for free.
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const confirmDelete = visible && draft.id !== null && confirmingId === draft.id;

  useEffect(() => () => { if (confirmTimer.current) clearTimeout(confirmTimer.current); }, []);

  const digits = acctDigits(draft.acct);
  const acctOk = acctValid(draft.acct);
  const emailOk = emailValid(draft.email);
  const emailMissing = mode === 'add' && !draft.email.trim();
  const dateOk = dateValid(draft.joinDate);
  const overrideDays = DAY_NAMES.filter((d) => draft.scheduleOverrides[d]);
  const timesOk =
    timeValid(draft.scheduleStart) &&
    timeValid(draft.scheduleEnd) &&
    overrideDays.every((d) => timeValid(draft.scheduleOverrides[d].start) && timeValid(draft.scheduleOverrides[d].end));
  const canSave = draft.name.trim().length > 0 && emailOk && !emailMissing && dateOk && timesOk;
  // An exception can only be added to a day the person actually works.
  const freeDay = DAY_NAMES.find((d) => draft.scheduleWorkingDays.includes(d) && !draft.scheduleOverrides[d]);

  const patchOverride = (day: string, patch: Partial<{ start: string; end: string }>) => {
    const current = draft.scheduleOverrides[day] ?? { start: '', end: '' };
    onChange({ scheduleOverrides: { ...draft.scheduleOverrides, [day]: { ...current, ...patch } } });
  };
  const removeOverride = (day: string) => {
    const next: ScheduleOverrides = { ...draft.scheduleOverrides };
    delete next[day];
    onChange({ scheduleOverrides: next });
  };

  /** Flash the save bar at someone trying to walk away mid-edit (AdminPanel's `nudge`). */
  const nudge = () => {
    shake.value = withSequence(
      withTiming(-6, { duration: 55 }),
      withTiming(6, { duration: 70 }),
      withTiming(-4, { duration: 70 }),
      withTiming(0, { duration: 70 }),
    );
  };
  const barStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  /** Bring the save bar on screen and flash it — used by the pill and by a blocked close. */
  const revealSaveBar = () => {
    scrollRef.current?.scrollToEnd({ animated: true });
    nudge();
  };

  const blockClose = () => {
    if (!dirty) return false;
    // BottomSheet scrolls to the end itself; this only has to flash the bar
    // once it has arrived, so the shake is not wasted off-screen.
    setTimeout(nudge, 260);
    return true;
  };

  const handleDelete = () => {
    if (!onDelete) return;
    if (!confirmDelete) {
      // Armed, not done — the button now means something different from the
      // one that was there a moment ago.
      haptics.warned();
      setConfirmingId(draft.id);
      confirmTimer.current = setTimeout(() => setConfirmingId(null), 4000);
      return;
    }
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    setConfirmingId(null);
    haptics.committed();
    onDelete();
  };

  const positionOptions = positions.map((p) => ({ id: p.id, label: p.label }));
  const managerOptions: { id: number | null; label: string }[] = [
    { id: null, label: 'No manager' },
    ...managers.map((m) => ({ id: m.id, label: m.name })),
  ];

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      blockClose={blockClose}
      scrollRef={scrollRef}
      title={mode === 'edit' ? 'Edit employee' : 'Add employee'}
      headerAccessory={
        dirty ? (
          // The save bar sits at the foot of a long form, so from the top a
          // blocked close looks like a broken sheet. This rides in the sticky
          // header, is always visible, and jumps to the bar when tapped.
          <Pressable
            onPress={revealSaveBar}
            hitSlop={6}
            style={[styles.dirtyPill, { backgroundColor: theme.warningWash, borderColor: theme.warning }]}
          >
            <View style={[styles.dirtyDot, { backgroundColor: theme.warningWashText }]} />
            <Text style={[styles.dirtyPillLabel, { color: theme.warningWashText }]}>{changeCount} unsaved</Text>
          </Pressable>
        ) : null
      }
    >
      <Text style={[styles.subtitle, { color: theme.textSecondary }]} numberOfLines={1}>
        {sheetMeta}
      </Text>

      <TextField label="Full name" value={draft.name} onChangeText={(v) => onChange({ name: v })} placeholder="e.g. Sanjita Rai" autoCapitalize="words" />

      {/* Position, not a typed-in job title: it is the single input to this
          person's permissions, exactly as the reference app's dropdown is. */}
      <View style={styles.group}>
        <SectionTitle>Role · position</SectionTitle>
        <ChipPicker options={positionOptions} value={draft.positionId} onSelect={(id) => onChange({ positionId: id })} />
        <Text style={[styles.hint, { color: theme.textSecondary }]}>
          Access follows the position — every screen this person can open is set by the permission matrix, not per person.
        </Text>
      </View>

      <View style={styles.group}>
        <SectionTitle>Department</SectionTitle>
        <ChipPicker options={DEPTS.map((d) => ({ id: d, label: d }))} value={draft.dept} onSelect={(id) => onChange({ dept: id })} />
      </View>

      <View style={[styles.card, { backgroundColor: theme.surface, boxShadow: theme.shadows.card }]}>
        <View style={styles.cardHeader}>
          <Text style={[styles.cardHeaderLabel, { color: theme.textSecondary }]}>Contact</Text>
          <Icon name="mail" size={15} color={theme.textSecondary} />
        </View>
        <Field
          label="Email"
          value={draft.email}
          onChangeText={(v) => onChange({ email: v })}
          placeholder="name@example.com"
          keyboardType="email-address"
          invalid={!emailOk || emailMissing}
          hint={emailMissing ? 'Required — a new record needs an email address' : !emailOk ? 'That does not look like an email address' : undefined}
        />
        <View style={styles.rowGroup}>
          <Field label="Phone" value={draft.phone} onChangeText={(v) => onChange({ phone: v })} placeholder="+977-" keyboardType="phone-pad" />
          <Field
            label="Join date"
            value={draft.joinDate}
            onChangeText={(v) => onChange({ joinDate: v })}
            placeholder="YYYY-MM-DD"
            mono
            invalid={!dateOk}
            hint={!dateOk ? 'Use YYYY-MM-DD' : undefined}
          />
        </View>
        <Field label="Address" value={draft.address} onChangeText={(v) => onChange({ address: v })} placeholder="City, District" autoCapitalize="words" />
      </View>

      <View style={[styles.card, { backgroundColor: theme.surface, boxShadow: theme.shadows.card }]}>
        <View style={styles.cardHeader}>
          <Text style={[styles.cardHeaderLabel, { color: theme.textSecondary }]}>Bank account · salary transfer</Text>
          <Icon name="credit-card" size={15} color={theme.textSecondary} />
        </View>

        <ChipPicker accent options={BANKS.map((b) => ({ id: b, label: b }))} value={draft.bank} onSelect={(id) => onChange({ bank: id })} />

        <View style={styles.group}>
          <Text style={[styles.smallLabel, { color: theme.textSecondary }]}>Account number</Text>
          <TextInput
            value={draft.acct}
            onChangeText={(v) => onChange({ acct: v })}
            placeholder="13 digits"
            keyboardType="numeric"
            placeholderTextColor={theme.textSecondary}
            style={[styles.acctInput, { borderColor: digits.length === 0 || acctOk ? theme.border : theme.danger, backgroundColor: theme.surfaceRaised, color: theme.textPrimary }]}
          />
          <Text style={[styles.acctHint, { color: digits.length === 0 || acctOk ? theme.textSecondary : theme.dangerWashText }]}>{acctHint(draft.acct)}</Text>
        </View>

        <View style={styles.rowGroup}>
          <Field label="Branch" value={draft.branch} onChangeText={(v) => onChange({ branch: v })} placeholder="Balaju" autoCapitalize="words" />
          <Field label="Monthly basic" value={draft.basic} onChangeText={(v) => onChange({ basic: v })} placeholder="18,600" keyboardType="numeric" mono />
        </View>

        <Field label="PAN number" value={draft.pan} onChangeText={(v) => onChange({ pan: v })} placeholder="9-digit PAN" keyboardType="numeric" mono />
      </View>

      <View style={styles.group}>
        <SectionTitle>Location</SectionTitle>
        <View style={styles.segment}>
          {LOCATIONS.map((l) => {
            const on = draft.location === l.id;
            return (
              <Pressable
                key={l.id}
                onPress={() => onChange({ location: l.id })}
                style={[styles.segmentItem, { backgroundColor: on ? theme.selectedSurface : theme.surface, borderColor: on ? theme.selectedBorder : theme.border }]}
              >
                <Text style={[styles.segmentLabel, { color: on ? theme.selectedText : theme.textPrimary }]}>{l.label}</Text>
                <Text style={[styles.segmentNote, { color: on ? theme.selectedTextMuted : theme.textSecondary }]}>{l.note}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.group}>
        <SectionTitle>Reports to</SectionTitle>
        <ChipPicker accent options={managerOptions} value={draft.reportsTo} onSelect={(id) => onChange({ reportsTo: id })} />
        <Text style={[styles.hint, { color: theme.textSecondary }]}>Who this person answers to on the org structure.</Text>
      </View>

      <Pressable
        onPress={() => onChange({ productionWorker: !draft.productionWorker })}
        style={[styles.toggleCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
      >
        <View style={styles.toggleTextWrap}>
          <Text style={[styles.toggleTitle, { color: theme.textPrimary }]}>Production worker</Text>
          <Text style={[styles.toggleHint, { color: theme.textSecondary }]}>
            Includes this salary in the auto labour cost for Order P&amp;L
          </Text>
        </View>
        <Switch value={draft.productionWorker} onValueChange={() => onChange({ productionWorker: !draft.productionWorker })} />
      </Pressable>

      <Pressable
        onPress={() => onChange({ active: !draft.active })}
        style={[styles.toggleCard, { backgroundColor: theme.surface, borderColor: draft.active ? theme.border : theme.danger }]}
      >
        <View style={styles.toggleTextWrap}>
          <Text style={[styles.toggleTitle, { color: theme.textPrimary }]}>{draft.active ? 'Active · on payroll' : 'Inactive · excluded from runs'}</Text>
          <Text style={[styles.toggleHint, { color: theme.textSecondary }]}>
            {draft.active ? 'Appears in the open August run' : 'Records and past slips stay accessible'}
          </Text>
        </View>
        <Switch value={draft.active} onValueChange={() => onChange({ active: !draft.active })} />
      </Pressable>

      <View style={[styles.card, { backgroundColor: theme.surface, boxShadow: theme.shadows.card }]}>
        <View style={styles.cardHeader}>
          <Text style={[styles.cardHeaderLabel, { color: theme.textSecondary }]}>Work schedule</Text>
          <Icon name="clock" size={15} color={theme.textSecondary} />
        </View>
        <Text style={[styles.hint, { color: theme.textSecondary }]}>Drives the late-arrival auto-flag in Attendance.</Text>

        <View style={styles.rowGroup}>
          <Field
            label="Start time"
            value={draft.scheduleStart}
            onChangeText={(v) => onChange({ scheduleStart: v })}
            placeholder="09:00"
            mono
            invalid={!timeValid(draft.scheduleStart)}
          />
          <Field
            label="End time"
            value={draft.scheduleEnd}
            onChangeText={(v) => onChange({ scheduleEnd: v })}
            placeholder="17:00"
            mono
            invalid={!timeValid(draft.scheduleEnd)}
          />
        </View>
        {!timesOk ? <Text style={[styles.fieldHint, { color: theme.dangerWashText }]}>Use 24-hour HH:MM, e.g. 09:30.</Text> : null}

        <View style={styles.group}>
          <Text style={[styles.smallLabel, { color: theme.textSecondary }]}>Working days</Text>
          <View style={styles.dayRow}>
            {DAY_NAMES.map((d) => {
              const on = draft.scheduleWorkingDays.includes(d);
              return (
                <Pressable
                  key={d}
                  // Rebuilt from DAY_NAMES so the saved array stays Sun→Sat.
                  onPress={() =>
                    onChange({ scheduleWorkingDays: DAY_NAMES.filter((n) => (n === d ? !on : draft.scheduleWorkingDays.includes(n))) })
                  }
                  style={[styles.dayChip, { backgroundColor: on ? theme.accentWash : theme.surfaceRaised, borderColor: on ? theme.accent : theme.border }]}
                >
                  <Text style={[styles.dayLabel, { color: on ? theme.accentWashText : theme.textSecondary }]}>{d}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.hint, { color: theme.textSecondary }]}>
            Unselected days are weekly offs — excluded from working days and rostered hours.
          </Text>
        </View>

        <View style={[styles.exceptionDivider, { borderTopColor: theme.border }]} />
        <Text style={[styles.smallLabel, { color: theme.textSecondary }]}>
          Day exceptions <Text style={[styles.hint, { color: theme.textSecondary }]}>— different hours on one day</Text>
        </Text>
        {overrideDays.map((day) => (
          <View key={day} style={styles.rowGroup}>
            <View style={styles.overrideDay}>
              <Text style={[styles.overrideDayLabel, { color: theme.textPrimary }]}>{day}</Text>
            </View>
            <Field
              label="Start"
              value={draft.scheduleOverrides[day]?.start ?? ''}
              onChangeText={(v) => patchOverride(day, { start: v })}
              placeholder={draft.scheduleStart || '09:00'}
              mono
              invalid={!timeValid(draft.scheduleOverrides[day]?.start ?? '')}
            />
            <Field
              label="End"
              value={draft.scheduleOverrides[day]?.end ?? ''}
              onChangeText={(v) => patchOverride(day, { end: v })}
              placeholder={draft.scheduleEnd || '17:00'}
              mono
              invalid={!timeValid(draft.scheduleOverrides[day]?.end ?? '')}
            />
            <Pressable onPress={() => removeOverride(day)} hitSlop={6} style={[styles.overrideRemove, { borderColor: theme.border }]}>
              <Icon name="x" size={14} color={theme.dangerWashText} />
            </Pressable>
          </View>
        ))}
        {freeDay ? (
          <Pressable
            onPress={() => patchOverride(freeDay, { start: draft.scheduleStart, end: draft.scheduleEnd })}
            style={[styles.addOverride, { borderColor: theme.border }]}
          >
            <Icon name="plus" size={14} color={theme.accentDeep} />
            <Text style={[styles.addOverrideLabel, { color: theme.accentDeep }]}>Add exception</Text>
          </Pressable>
        ) : (
          <Text style={[styles.hint, { color: theme.textSecondary }]}>Every working day already has an exception.</Text>
        )}
      </View>

      {mode === 'edit' ? (
        <View style={styles.editActions}>
          <Pressable onPress={onViewSlip} style={[styles.actionButton, { borderColor: theme.border, backgroundColor: theme.surface }]}>
            <Icon name="file-text" size={16} color={theme.textPrimary} />
            <Text style={[styles.actionLabel, { color: theme.textPrimary }]}>View latest salary slip</Text>
          </Pressable>
          {onDelete ? (
            <Pressable
              onPress={handleDelete}
              style={[styles.actionButton, { borderColor: theme.danger, backgroundColor: theme.dangerWash }]}
            >
              <Icon name={confirmDelete ? 'alert-triangle' : 'trash-2'} size={16} color={theme.dangerWashText} />
              <Text style={[styles.actionLabel, { color: theme.dangerWashText }]}>
                {confirmDelete ? 'Tap again to deactivate' : 'Deactivate · revoke login'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={styles.footer}>
        {dirty ? (
          <Animated.View style={[barStyle, styles.saveBar, { backgroundColor: theme.warningWash, borderColor: theme.warning }]}>
            <Icon name="alert-circle" size={16} color={theme.warningWashText} />
            <View style={styles.saveBarText}>
              <Text style={[styles.saveBarTitle, { color: theme.warningWashText }]}>Unsaved changes</Text>
              <Text style={[styles.saveBarNote, { color: theme.warningWashText }]}>
                {changeCount} {changeCount === 1 ? 'edit' : 'edits'} · nothing is live until you save
              </Text>
            </View>
            <Pressable onPress={onDiscard} hitSlop={6} style={[styles.discardButton, { borderColor: theme.warning }]}>
              <Text style={[styles.discardLabel, { color: theme.warningWashText }]}>Discard</Text>
            </Pressable>
          </Animated.View>
        ) : (
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryText, { color: theme.textSecondary }]} numberOfLines={1}>
              {saveHint}
            </Text>
            <Text style={[styles.summaryCode, tabularNums, { color: theme.textSecondary }]}>{saveCode}</Text>
          </View>
        )}
        <Pressable onPress={onSave} disabled={!canSave} style={[styles.saveButton, { backgroundColor: canSave ? theme.accent : theme.draftWash }]}>
          <Text style={[styles.saveLabel, { color: canSave ? theme.accentText : theme.draftWashText }]}>{mode === 'edit' ? 'Save changes' : 'Add employee'}</Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  subtitle: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.11 * 10, textTransform: 'uppercase', marginTop: -12 },
  group: { gap: 8 },
  flex1: { flex: 1 },
  sectionTitle: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.11 * 10, textTransform: 'uppercase' },
  smallLabel: { fontSize: 12.5 },
  hint: { fontFamily: fontFamily.mono, fontSize: 10.5, lineHeight: 10.5 * 1.5 },
  fieldHint: { fontFamily: fontFamily.mono, fontSize: 10.5 },

  chipRow: { gap: 7, paddingTop: 2 },
  chip: { height: 34, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chipLabel: { fontFamily: fontFamily.semibold, fontSize: 12.5 },

  card: { borderRadius: radii.lg, padding: 15, gap: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardHeaderLabel: { flex: 1, fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.11 * 10, textTransform: 'uppercase' },
  acctInput: { height: 48, paddingHorizontal: 14, borderRadius: 13, borderWidth: 1, fontFamily: fontFamily.mono, fontSize: 15, letterSpacing: 0.06 * 15 },
  acctHint: { fontFamily: fontFamily.mono, fontSize: 10.5 },
  rowGroup: { flexDirection: 'row', gap: 10 },
  smallInput: { height: 48, paddingHorizontal: 14, borderRadius: 13, borderWidth: 1, fontSize: 14.5 },

  segment: { flexDirection: 'row', gap: 10 },
  segmentItem: { flex: 1, height: 58, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  segmentLabel: { fontSize: 14.5, fontWeight: '600' },
  segmentNote: { fontFamily: fontFamily.mono, fontSize: 10 },

  toggleCard: { minHeight: 66, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  toggleTextWrap: { flex: 1, gap: 3, minWidth: 0 },
  toggleTitle: { fontSize: 14.5, fontWeight: '600' },
  toggleHint: { fontFamily: fontFamily.mono, fontSize: 10.5, lineHeight: 10.5 * 1.4 },

  dayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dayChip: { height: 32, paddingHorizontal: 11, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dayLabel: { fontFamily: fontFamily.semibold, fontSize: 12 },
  exceptionDivider: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 2 },
  overrideDay: { width: 44, justifyContent: 'flex-end', paddingBottom: 14 },
  overrideDayLabel: { fontFamily: fontFamily.semibold, fontSize: 13 },
  overrideRemove: { width: 34, height: 34, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end', marginBottom: 7 },
  addOverride: { height: 42, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  addOverrideLabel: { fontFamily: fontFamily.semibold, fontSize: 13 },

  editActions: { gap: 8 },
  actionButton: { height: 48, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  actionLabel: { fontSize: 14, fontWeight: '600' },

  footer: { gap: 10 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  summaryText: { flex: 1, fontSize: 13 },
  summaryCode: { fontSize: 11, flexShrink: 0 },

  dirtyPill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1 },
  dirtyDot: { width: 6, height: 6, borderRadius: 3 },
  dirtyPillLabel: { fontFamily: fontFamily.mono, fontSize: 10.5 },

  saveBar: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13, borderRadius: 14, borderWidth: 1 },
  saveBarText: { flex: 1, gap: 2, minWidth: 0 },
  saveBarTitle: { fontSize: 13.5, fontWeight: '600' },
  saveBarNote: { fontFamily: fontFamily.mono, fontSize: 10.5 },
  discardButton: { height: 32, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  discardLabel: { fontFamily: fontFamily.semibold, fontSize: 12.5 },

  saveButton: { height: 54, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  saveLabel: { fontSize: 16, fontWeight: '600' },
});
