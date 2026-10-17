import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { isDirectorPosition } from '@/auth/permissions';
import { Avatar } from '@/components/ui/avatar';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Icon, type IconName } from '@/components/ui/icon';
import { useToast } from '@/components/toast/toast-provider';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import type { Person } from '@/data/chat/types';

import { ActionRow } from './action-row';

export interface ContactSheetProps {
  /** The other person in this dm; null closes the sheet. */
  person: Person | null;
  muted: boolean;
  onClose: () => void;
  onToggleMute: () => void;
  onDeleteThread: () => void;
}

interface Detail {
  icon: IconName;
  label: string;
  value: string;
  /** Where a tap goes, if anywhere. Without one the row still copies. */
  href?: string;
}

/** `On shift · since 08:12` reads better here split in two than as one mono line. */
function shiftLines(person: Person): { headline: string; detail: string } {
  if (!person.onShiftSince) return { headline: 'Not clocked in', detail: 'No open punch today' };
  const d = new Date(person.onShiftSince);
  const clock = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const mins = Math.max(0, Math.round((Date.now() - person.onShiftSince) / 60_000));
  const worked = mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
  return { headline: 'On shift', detail: `Clocked in ${clock} · ${worked} so far` };
}

/**
 * The person behind a dm: who they are, how else to reach them, and whether
 * they are actually in the building right now.
 *
 * Reached by tapping the identity in the thread header, which until now did
 * nothing — the name and job title were on screen and there was no way to get
 * at the phone number underneath them.
 *
 * Everything here comes from `fs_employees`, where `phone` sits behind the
 * same RLS mask as salary and bank details. A row for a value nobody may see
 * is simply absent rather than shown empty, so the sheet does not advertise
 * information it cannot produce.
 */
export function ContactSheet({ person, muted, onClose, onToggleMute, onDeleteThread }: ContactSheetProps) {
  const theme = useTheme();
  const toast = useToast();

  const shift = person ? shiftLines(person) : null;

  const candidates: (Detail | null)[] = person
    ? [
        person.phone ? { icon: 'phone', label: 'Phone', value: person.phone, href: `tel:${person.phone}` } : null,
        person.email ? { icon: 'mail', label: 'Email', value: person.email, href: `mailto:${person.email}` } : null,
        person.department ? { icon: 'briefcase', label: 'Department', value: person.department } : null,
        person.location ? { icon: 'map-pin', label: 'Location', value: person.location } : null,
      ]
    : [];
  const details = candidates.filter((d): d is Detail => d !== null);

  const open = async (detail: Detail) => {
    if (!detail.href) {
      await Clipboard.setStringAsync(detail.value);
      toast.show({ message: `${detail.label} copied`, tone: 'ok' });
      return;
    }
    try {
      await Linking.openURL(detail.href);
    } catch {
      // A tablet with no dialer is a normal thing on a shop floor; falling back
      // to the clipboard means the number is still usable.
      await Clipboard.setStringAsync(detail.value);
      toast.show({ message: `Nothing can open that — ${detail.label.toLowerCase()} copied instead`, tone: 'warn' });
    }
  };

  return (
    <BottomSheet visible={!!person} onClose={onClose} title="Contact info" maxHeight={640}>
      {person && shift ? (
        <>
          <View style={[styles.identity, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Avatar initials={person.initials} tint={person.avatarTint} size="lg" online={person.online} />
            <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={1}>
              {person.name}
            </Text>
            <Text style={[styles.role, { color: theme.textSecondary }]} numberOfLines={1}>
              {person.role}
            </Text>
            {!isDirectorPosition(person.positionId) ? (
              <>
                <View
                  style={[
                    styles.shiftPill,
                    {
                      backgroundColor: person.online ? theme.accentWash : theme.surfaceRaised,
                      borderColor: person.online ? theme.accent : theme.border,
                    },
                  ]}
                >
                  <View style={[styles.dot, { backgroundColor: person.online ? theme.accent : theme.draftDot }]} />
                  <Text style={[styles.shiftText, { color: person.online ? theme.accentWashText : theme.textSecondary }]}>
                    {shift.headline}
                  </Text>
                </View>
                <Text style={[styles.shiftDetail, { color: theme.textSecondary }]}>{shift.detail}</Text>
              </>
            ) : null}
          </View>

          {details.length > 0 ? (
            <View style={styles.details}>
              {details.map((detail) => (
                <Pressable
                  key={detail.label}
                  onPress={() => void open(detail)}
                  style={({ pressed }) => [
                    styles.detailRow,
                    { backgroundColor: pressed ? theme.background : theme.surface, borderColor: theme.border },
                  ]}
                >
                  <Icon name={detail.icon} size={16} color={theme.textSecondary} />
                  <View style={styles.detailText}>
                    <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>{detail.label}</Text>
                    <Text style={[styles.detailValue, { color: theme.textPrimary }]} numberOfLines={1}>
                      {detail.value}
                    </Text>
                  </View>
                  <Icon name={detail.href ? 'external-link' : 'copy'} size={15} color={theme.textSecondary} />
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={[styles.locked, { color: theme.textSecondary }]}>
              Contact details for this person are not visible to your role.
            </Text>
          )}

          <View style={styles.actions}>
            <ActionRow
              icon={muted ? 'bell' : 'bell-off'}
              label={muted ? 'Unmute this chat' : 'Mute this chat'}
              detail={muted ? 'Notifications come back on' : 'No notifications from this thread'}
              onPress={onToggleMute}
            />
            <ActionRow
              icon="trash-2"
              label="Delete this chat"
              detail="Clears it from your list only"
              destructive
              onPress={onDeleteThread}
            />
          </View>
        </>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  identity: {
    alignItems: 'center',
    gap: 8,
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  name: {
    fontFamily: fontFamily.semibold,
    fontSize: 19,
    letterSpacing: -0.015 * 19,
    marginTop: 4,
  },
  role: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.1 * 10,
    textTransform: 'uppercase',
  },
  shiftPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 5,
    paddingHorizontal: 11,
    marginTop: 4,
  },
  dot: { width: 6, height: 6, borderRadius: 99 },
  shiftText: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.1 * 10,
    textTransform: 'uppercase',
  },
  shiftDetail: { fontSize: 12.5 },
  details: { gap: 8 },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 15,
    borderWidth: 1,
    paddingVertical: 11,
    paddingHorizontal: 13,
  },
  detailText: { flex: 1, gap: 2, minWidth: 0 },
  detailLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 9.5,
    letterSpacing: 0.1 * 9.5,
    textTransform: 'uppercase',
  },
  detailValue: { fontSize: 14.5 },
  locked: {
    fontFamily: fontFamily.mono,
    fontSize: 10.5,
    lineHeight: 10.5 * 1.6,
  },
  actions: { gap: 2 },
});
