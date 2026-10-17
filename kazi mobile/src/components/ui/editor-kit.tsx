import { useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/theme/theme-provider';
import { fontFamily, radii } from '@/theme';

import { BottomSheet } from './bottom-sheet';
import { Icon, type IconName } from './icon';
import { Spinner } from './spinner';

/**
 * The form pieces every record editor in the app is built from.
 *
 * They all want the same shapes: a labelled input, a row of choices, an image
 * slot, and one sheet that will not let go of an unsaved draft. Keeping them
 * here means a fabric, a tech pack and a customer cannot drift into looking
 * like three different apps.
 *
 * Everything takes `editable`: whoever holds the module's grant edits, and
 * everyone else reads the same layout with the inputs inert, rather than being
 * shown a second, lesser screen.
 */

// ------------------------------------------------------------------ headings

export function EditorTitle({ title, meta }: { title: string; meta?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.titleWrap}>
      <Text style={[styles.title, { color: theme.textPrimary }]}>{title}</Text>
      {meta ? <Text style={[styles.titleMeta, { color: theme.textSecondary }]}>{meta}</Text> : null}
    </View>
  );
}

export function EditorSection({ label, action, children }: { label: string; action?: React.ReactNode; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>{label}</Text>
        {action}
      </View>
      {children}
    </View>
  );
}

/** A small text button — "+ Add point", "Remove". */
export function GhostAction({ label, icon, onPress, tone = 'accent' }: { label: string; icon?: IconName; onPress: () => void; tone?: 'accent' | 'danger' }) {
  const theme = useTheme();
  const color = tone === 'danger' ? theme.dangerWashText : theme.link;
  return (
    <Pressable onPress={onPress} hitSlop={8} style={styles.ghostAction}>
      {icon ? <Icon name={icon} size={13} color={color} /> : null}
      <Text style={[styles.ghostActionLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

/** Side-by-side fields. Two is what fits a phone; anything more wraps illegibly. */
export function FieldRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.fieldRow}>{children}</View>;
}

// -------------------------------------------------------------------- inputs

export interface FieldProps {
  label?: string;
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  editable?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  /** Grows to `lines` rows and keeps the return key — for a spec or a note. */
  multiline?: boolean;
  lines?: number;
  /** Fills its row, for use inside `FieldRow`. */
  flex?: boolean;
  /** Marks the label with an asterisk and paints the border when empty. */
  required?: boolean;
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  editable = true,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  multiline = false,
  lines = 3,
  flex = false,
  required = false,
}: FieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const missing = required && value.trim() === '';

  return (
    <View style={[styles.field, flex && styles.flex1]}>
      {label ? (
        <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
          {label}
          {required ? ' *' : ''}
        </Text>
      ) : null}
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        editable={editable}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.input,
          multiline && { height: undefined, minHeight: 22 * lines + 24, paddingTop: 12, paddingBottom: 12 },
          {
            backgroundColor: editable ? theme.surface : theme.draftWash,
            color: theme.textPrimary,
            borderColor: focused ? theme.accent : missing ? theme.danger : theme.border,
          },
        ]}
      />
    </View>
  );
}

// ------------------------------------------------------------------- choices

export interface ChoiceProps {
  label?: string;
  options: readonly string[];
  value: string;
  /** Retapping the chosen option clears it — the reference's market toggle. */
  onChange: (value: string) => void;
  editable?: boolean;
  hint?: string;
  /** Renders each chip capitalised without changing the stored value. */
  capitalize?: boolean;
}

/** One-of chips. Anything already saved that is not on the list is shown too. */
export function ChoiceChips({ label, options, value, onChange, editable = true, hint, capitalize = false }: ChoiceProps) {
  const theme = useTheme();
  const shown = value && !options.includes(value) ? [...options, value] : options;

  return (
    <View style={styles.field}>
      {label ? <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{label}</Text> : null}
      <View style={styles.chipWrap}>
        {shown.map((option) => {
          const on = option === value;
          return (
            <Pressable
              key={option}
              disabled={!editable}
              onPress={() => onChange(on ? '' : option)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[
                styles.chip,
                {
                  backgroundColor: on ? theme.selectedSurface : theme.surface,
                  borderColor: on ? theme.selectedBorder : theme.border,
                  opacity: editable ? 1 : 0.75,
                },
              ]}
            >
              <Text style={[styles.chipLabel, capitalize && styles.capitalize, { color: on ? theme.selectedText : theme.textPrimary }]}>
                {option}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {hint ? <Text style={[styles.hint, { color: theme.textSecondary }]}>{hint}</Text> : null}
    </View>
  );
}

/** Many-of chips, in the order the option list gives them. */
export function MultiChips({
  label,
  options,
  values,
  onChange,
  editable = true,
}: {
  label?: string;
  options: readonly string[];
  values: string[];
  onChange: (values: string[]) => void;
  editable?: boolean;
}) {
  const theme = useTheme();

  return (
    <View style={styles.field}>
      {label ? <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{label}</Text> : null}
      <View style={styles.chipWrap}>
        {options.map((option) => {
          const on = values.includes(option);
          return (
            <Pressable
              key={option}
              disabled={!editable}
              onPress={() =>
                onChange(on ? values.filter((v) => v !== option) : options.filter((o) => o === option || values.includes(o)))
              }
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[
                styles.chip,
                styles.chipTight,
                {
                  backgroundColor: on ? theme.selectedSurface : theme.surface,
                  borderColor: on ? theme.selectedBorder : theme.border,
                  opacity: editable ? 1 : 0.75,
                },
              ]}
            >
              <Text style={[styles.chipLabel, { color: on ? theme.selectedText : theme.textPrimary }]}>{option}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// -------------------------------------------------------------------- images

export interface ImageSlotProps {
  label: string;
  url: string;
  /** Portrait for a garment sketch, landscape for a swatch. */
  ratio?: number;
  busy?: boolean;
  editable?: boolean;
  onPick: () => void;
  onRemove: () => void;
  /** Opens it full screen; only offered once there is something to open. */
  onOpen?: () => void;
}

export function ImageSlot({ label, url, ratio = 1.25, busy = false, editable = true, onPick, onRemove, onOpen }: ImageSlotProps) {
  const theme = useTheme();

  return (
    <View style={[styles.field, styles.flex1]}>
      <View style={styles.sectionHead}>
        <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{label}</Text>
        {url && editable ? <GhostAction label="Remove" onPress={onRemove} tone="danger" /> : null}
      </View>
      <Pressable
        // With a picture, tapping looks at it and only the label's Remove /
        // Replace act on it — a mis-tap should never swap someone's sketch.
        onPress={url ? onOpen : editable ? onPick : undefined}
        disabled={busy || (!url && !editable)}
        style={[
          styles.imageSlot,
          { aspectRatio: ratio, backgroundColor: theme.draftWash, borderColor: url ? theme.border : theme.border },
        ]}
      >
        {url ? (
          <Image source={{ uri: url }} style={styles.imageFill} resizeMode="cover" />
        ) : (
          <View style={styles.imageEmpty}>
            <Icon name={busy ? 'upload-cloud' : 'image'} size={18} color={theme.textSecondary} />
            <Text style={[styles.imageHint, { color: theme.textSecondary }]}>
              {busy ? 'Uploading…' : editable ? 'Add photo' : 'None'}
            </Text>
          </View>
        )}
      </Pressable>
      {url && editable ? <GhostAction label="Replace" icon="refresh-cw" onPress={onPick} /> : null}
    </View>
  );
}

/** A strip of extra pages — a tech pack's scanned sheets. */
export function ImageStrip({
  urls,
  editable,
  onOpen,
  onRemove,
}: {
  urls: string[];
  editable: boolean;
  onOpen: (url: string, index: number) => void;
  onRemove: (index: number) => void;
}) {
  const theme = useTheme();
  if (urls.length === 0) return null;

  return (
    <View style={styles.pageStrip}>
      {urls.map((url, index) => (
        <View key={`${url}-${index}`} style={styles.pageThumbWrap}>
          <Pressable onPress={() => onOpen(url, index)}>
            <Image source={{ uri: url }} style={[styles.pageThumb, { borderColor: theme.border }]} resizeMode="cover" />
          </Pressable>
          <View style={[styles.pageNum, { backgroundColor: theme.surfaceInverted }]}>
            <Text style={[styles.pageNumText, { color: theme.onDark.text }]}>{index + 1}</Text>
          </View>
          {editable ? (
            <Pressable onPress={() => onRemove(index)} hitSlop={6} style={[styles.pageX, { backgroundColor: theme.surfaceInverted }]}>
              <Icon name="x" size={11} color={theme.onDark.text} />
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}

// --------------------------------------------------------------- the sheet

export interface EditorSheetProps {
  visible: boolean;
  title: string;
  dirty: boolean;
  saving: boolean;
  /** Blocks the save and says why - the required field is empty. */
  blockedReason?: string;
  /** No edit grant: the record is readable and the only action is leaving. */
  readOnly?: boolean;
  /** The sentence shown in place of the footer while `readOnly`. */
  readOnlyNote?: string;
  saveLabel: string;
  /** The X, the backdrop and Android back, once a dirty draft has let go. */
  onClose: () => void;
  onDiscard: () => void;
  onSave: () => void;
  children: React.ReactNode;
}

/**
 * The shell every record editor sits in - the app's standard sheet, with its
 * grabber and its X, plus the unsaved-changes guard the Employees sheet
 * established:
 *
 *   - the X, the backdrop and Android back are all refused while the draft is
 *     dirty; the sheet scrolls itself to the footer and the save bar shakes, so
 *     the refusal points at the two things that WILL let you leave;
 *   - a pill in the sticky header says how it stands from anywhere in a long
 *     form, and jumps to the footer when tapped.
 *
 * So the only ways out of an edited record are Save and Discard - which is the
 * point - while an untouched one closes the way every other sheet does.
 */
export function EditorSheet({
  visible,
  title,
  dirty,
  saving,
  blockedReason,
  readOnly = false,
  readOnlyNote = 'You can read this record but not change it.',
  saveLabel,
  onClose,
  onDiscard,
  onSave,
  children,
}: EditorSheetProps) {
  const theme = useTheme();
  const scrollRef = useRef<ScrollView | null>(null);
  const shake = useSharedValue(0);

  const nudge = () => {
    shake.value = withSequence(
      withTiming(-6, { duration: 55 }),
      withTiming(6, { duration: 70 }),
      withTiming(-4, { duration: 70 }),
      withTiming(0, { duration: 70 }),
    );
  };
  const barStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  const revealFooter = () => {
    scrollRef.current?.scrollToEnd({ animated: true });
    nudge();
  };

  const blockClose = () => {
    if (!dirty || saving) return false;
    // The sheet scrolls to the end itself; this only has to flash the bar once
    // it has arrived, so the shake is not wasted off-screen.
    setTimeout(nudge, 260);
    return true;
  };

  const canSave = dirty && !blockedReason && !saving;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      blockClose={readOnly ? undefined : blockClose}
      scrollRef={scrollRef}
      title={title}
      maxHeight={720}
      headerAccessory={
        dirty && !readOnly ? (
          <Pressable
            onPress={revealFooter}
            hitSlop={6}
            style={[styles.dirtyPill, { backgroundColor: theme.warningWash, borderColor: theme.warning }]}
          >
            <View style={[styles.dirtyDot, { backgroundColor: theme.warningWashText }]} />
            <Text style={[styles.dirtyPillLabel, { color: theme.warningWashText }]}>Unsaved</Text>
          </Pressable>
        ) : null
      }
    >
      {children}

      {readOnly ? (
        <View style={[styles.readOnlyNote, { backgroundColor: theme.draftWash }]}>
          <Icon name="lock" size={14} color={theme.draftWashText} />
          <Text style={[styles.readOnlyText, { color: theme.draftWashText }]}>{readOnlyNote}</Text>
        </View>
      ) : (
        <View style={styles.footer}>
          {dirty ? (
            <Animated.View style={[barStyle, styles.saveBar, { backgroundColor: theme.warningWash, borderColor: theme.warning }]}>
              <Icon name="alert-circle" size={16} color={theme.warningWashText} />
              <View style={styles.saveBarText}>
                <Text style={[styles.saveBarTitle, { color: theme.warningWashText }]}>Unsaved changes</Text>
                <Text style={[styles.saveBarNote, { color: theme.warningWashText }]}>
                  {blockedReason ?? 'Nothing is live until you save'}
                </Text>
              </View>
              <Pressable onPress={onDiscard} disabled={saving} hitSlop={6} style={[styles.discard, { borderColor: theme.warning }]}>
                <Text style={[styles.discardLabel, { color: theme.warningWashText }]}>Discard</Text>
              </Pressable>
            </Animated.View>
          ) : null}

          <Pressable
            onPress={onSave}
            disabled={!canSave}
            style={[styles.saveButton, { backgroundColor: canSave ? theme.accent : theme.draftWash }]}
          >
            {saving ? (
              <Spinner size={18} color={theme.accentText} />
            ) : (
              <Text style={[styles.saveLabel, { color: canSave ? theme.accentText : theme.draftWashText }]}>{saveLabel}</Text>
            )}
          </Pressable>
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  titleWrap: { gap: 3, paddingBottom: 2 },
  title: { fontFamily: fontFamily.semibold, fontSize: 19, letterSpacing: -0.02 * 19 },
  titleMeta: { fontFamily: fontFamily.mono, fontSize: 10.5, letterSpacing: 0.06 * 10.5 },

  section: { gap: 9 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionLabel: { fontFamily: fontFamily.mono, fontSize: 9.5, letterSpacing: 0.11 * 9.5, textTransform: 'uppercase' },

  ghostAction: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 2 },
  ghostActionLabel: { fontFamily: fontFamily.semibold, fontSize: 12.5 },

  fieldRow: { flexDirection: 'row', gap: 10 },
  field: { gap: 6 },
  flex1: { flex: 1 },
  fieldLabel: { fontFamily: fontFamily.mono, fontSize: 9.5, letterSpacing: 0.11 * 9.5, textTransform: 'uppercase' },
  input: {
    height: 48,
    paddingHorizontal: 14,
    borderRadius: radii.md,
    borderWidth: 1,
    // 16px so iOS never zooms the page on focus.
    fontSize: 16,
    fontFamily: fontFamily.regular,
  },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { height: 34, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, justifyContent: 'center' },
  chipTight: { height: 32, paddingHorizontal: 12 },
  chipLabel: { fontFamily: fontFamily.semibold, fontSize: 12.5 },
  capitalize: { textTransform: 'capitalize' },
  hint: { fontSize: 11.5, lineHeight: 11.5 * 1.45 },

  imageSlot: { width: '100%', borderRadius: 14, borderWidth: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  imageFill: { width: '100%', height: '100%' },
  imageEmpty: { alignItems: 'center', gap: 6 },
  imageHint: { fontFamily: fontFamily.mono, fontSize: 9.5, letterSpacing: 0.08 * 9.5, textTransform: 'uppercase' },

  pageStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  pageThumbWrap: { width: 76 },
  pageThumb: { width: 76, height: 96, borderRadius: 10, borderWidth: 1 },
  pageNum: { position: 'absolute', left: 5, bottom: 5, minWidth: 17, height: 17, paddingHorizontal: 5, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  pageNumText: { fontFamily: fontFamily.mono, fontSize: 9.5 },
  pageX: { position: 'absolute', right: 4, top: 4, width: 20, height: 20, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },

  dirtyPill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1 },
  dirtyDot: { width: 6, height: 6, borderRadius: 3 },
  dirtyPillLabel: { fontFamily: fontFamily.mono, fontSize: 10.5 },

  footer: { gap: 11, paddingTop: 4 },
  saveBar: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13, borderRadius: radii.md, borderWidth: 1 },
  saveBarText: { flex: 1, gap: 2, minWidth: 0 },
  saveBarTitle: { fontSize: 13.5, fontWeight: '600' },
  saveBarNote: { fontFamily: fontFamily.mono, fontSize: 10.5 },
  discard: { height: 36, paddingHorizontal: 13, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  discardLabel: { fontFamily: fontFamily.semibold, fontSize: 13 },
  saveButton: { height: 50, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  saveLabel: { fontFamily: fontFamily.semibold, fontSize: 15 },

  readOnlyNote: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radii.md, padding: 13, marginTop: 4 },
  readOnlyText: { flex: 1, fontSize: 12.5, lineHeight: 12.5 * 1.4 },
});
