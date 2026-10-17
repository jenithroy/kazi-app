import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { TextField } from '@/components/ui/text-field';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import type { Person, PersonId } from '@/data/chat/types';

import { ActionRow } from './action-row';
import { PeoplePicker } from './people-picker';

export interface NewChatSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Everyone on staff but you — already resolved by the caller from the live directory. */
  people: Person[];
  onStartDm: (personId: PersonId) => void;
  onCreateGroup: (name: string, memberIds: PersonId[]) => void;
  /** False when this person's position has no "create groups" grant; the row is then shown as refused, not hidden. */
  canCreateGroup: boolean;
  busy: boolean;
  error?: string | null;
}

type Mode = 'pick' | 'group';

/**
 * Two modes in one sheet: pick a person to message, or gather several into a
 * new group. The caller remounts it on each open (see its `key`), so this
 * state starts clean without an effect resetting it mid-exit-animation.
 */
export function NewChatSheet({
  visible,
  onClose,
  people,
  onStartDm,
  onCreateGroup,
  canCreateGroup,
  busy,
  error,
}: NewChatSheetProps) {
  const theme = useTheme();
  const [mode, setMode] = useState<Mode>('pick');
  const [groupName, setGroupName] = useState('');
  const [picked, setPicked] = useState<PersonId[]>([]);

  const toggle = (id: PersonId) => setPicked((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));

  // The name field scrolls away above a long staff list, so a Create held back
  // by an empty name has to be able to send you back to it.
  const scrollRef = useRef<ScrollView | null>(null);
  const nameRef = useRef<TextInput | null>(null);

  const trimmedName = groupName.trim();
  // A "group" of one is just a dm, so the second member is what unlocks Create.
  const enoughPeople = picked.length >= 2;
  const canCreate = trimmedName.length > 0 && enoughPeople;
  /** The one condition still holding Create back — what the button says, and what a press acts on. */
  const missing = enoughPeople ? (trimmedName ? null : 'name') : 'people';

  function focusName() {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    nameRef.current?.focus();
  }

  const createLabel = busy
    ? 'Creating…'
    : missing === 'people'
      ? picked.length === 1
        ? 'Pick 1 more'
        : 'Pick 2 people'
      : missing === 'name'
        ? 'Name your group'
        : `Create · ${picked.length}`;

  /**
   * Create floats over the list rather than sitting under it.
   *
   * The staff roster is longer than the sheet, so a footer button lands below
   * the last person: you tick the four people you want, then have to scroll
   * past everyone you did not pick to reach the action. Pinned bottom-right it
   * is under the thumb that has been doing the ticking, and it carries the
   * count so the button itself says what it is about to make.
   */
  const createAction =
    mode === 'group' ? (
      <Animated.View entering={FadeInDown.duration(180)} exiting={FadeOutDown.duration(120)}>
        <Pressable
          onPress={() => {
            if (busy) return;
            if (canCreate) onCreateGroup(trimmedName, picked);
            // Greyed out but not inert: the only thing left to do is name it,
            // so the press does the going-back-up for you.
            else if (missing === 'name') focusName();
          }}
          // Only truly refused while the list itself is what is unfinished —
          // and that list is the thing already under the thumb.
          disabled={busy || missing === 'people'}
          accessibilityLabel={canCreate ? `Create ${trimmedName} with ${picked.length} people` : createLabel}
          style={({ pressed }) => [
            styles.fab,
            {
              backgroundColor: canCreate ? theme.accent : theme.surface,
              borderColor: canCreate ? theme.accent : theme.border,
              // Dims on press whenever the press does something — creating, or going up to the name.
              opacity: pressed && missing !== 'people' ? 0.85 : 1,
              boxShadow: theme.shadows.floating,
            },
          ]}
        >
          {busy ? (
            <ActivityIndicator size="small" color={canCreate ? theme.accentText : theme.textSecondary} />
          ) : (
            <Icon
              name={missing === 'name' ? 'arrow-up' : 'check'}
              size={18}
              color={canCreate ? theme.accentText : theme.textSecondary}
            />
          )}
          <Text style={[styles.fabLabel, { color: canCreate ? theme.accentText : theme.textSecondary }]}>
            {createLabel}
          </Text>
        </Pressable>
      </Animated.View>
    ) : null;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={mode === 'pick' ? 'New message' : 'New group'}
      maxHeight={680}
      scrollRef={scrollRef}
      overlay={createAction}
    >
      {mode === 'pick' ? (
        // Shown either way. A position that cannot start groups is told so
        // here rather than being left to wonder where the option went — and
        // the database would refuse the write regardless.
        <ActionRow
          icon="users"
          label="New group"
          detail={canCreateGroup ? 'Pick two or more people' : 'Your role can’t start groups'}
          onPress={() => canCreateGroup && setMode('group')}
        />
      ) : (
        <>
          <TextField
            label="Group name"
            inputRef={nameRef}
            value={groupName}
            onChangeText={setGroupName}
            placeholder="e.g. Line 4 leads"
            autoCapitalize="sentences"
          />
          <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>
            Members · {picked.length} selected
          </Text>
        </>
      )}

      <PeoplePicker
        people={people}
        mode={mode === 'pick' ? 'select' : 'check'}
        picked={picked}
        onPress={(id) => (mode === 'pick' ? onStartDm(id) : toggle(id))}
        emptyNote="No colleagues on the staff list yet"
      />

      {error ? <Text style={[styles.error, { color: theme.dangerWashText }]}>{error}</Text> : null}

      {mode === 'group' ? (
        <View style={styles.footer}>
          <Button label="Back to people" variant="ghost" fullWidth onPress={() => setMode('pick')} />
          {/* Clears the floating action, which would otherwise sit on top of
              the last row of the list. */}
          <View style={styles.fabClearance} />
        </View>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.12 * 10,
    textTransform: 'uppercase',
    marginBottom: -8,
  },
  error: {
    fontFamily: fontFamily.mono,
    fontSize: 11,
    lineHeight: 11 * 1.5,
  },
  footer: {
    gap: 8,
  },
  // The floating action is 52 tall and sits 22 above the sheet's safe-area
  // padding, so the scroll has to end at least that far up or the last row
  // finishes underneath it.
  fabClearance: {
    height: 60,
  },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 52,
    paddingHorizontal: 20,
    borderRadius: 18,
    borderWidth: 1,
  },
  fabLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: 15,
  },
});
