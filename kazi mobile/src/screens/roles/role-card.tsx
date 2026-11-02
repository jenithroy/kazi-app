import { StyleSheet, Text, View } from 'react-native';

import { Avatar, tintFromSeed } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { dutiesFor } from '@/data/roles/content';
import { chipLetters, countLabel, dutyNote, locationOf } from '@/data/roles/rules';
import type { Position, StaffPerson } from '@/data/roles/types';
import { initialsOf } from '@/data/usage/format';
import { fontFamily } from '@/theme';
import { useTheme } from '@/theme/theme-provider';

import { DutyRow } from './duty-row';

const WHERE: Record<string, string> = { uk: 'UK', nepal: 'Nepal' };

interface Props {
  role: Position;
  holders: StaffPerson[];
  directoryVisible: boolean;
  myId: string | undefined;
}

/**
 * The open role: its name and where it sits, who holds it, and what it is expected to log (each duty with a way to the page where
 * it is done). The website's card, in the same order and with the same words: a role with nothing written up says so, one that
 * logs nothing by design says that, and a directory this position may not read says the people are not shown.
 */
export function RoleCard({ role, holders, directoryVisible, myId }: Props) {
  const theme = useTheme();
  const duties = dutiesFor(role);
  const note = dutyNote(duties);
  const where = directoryVisible ? WHERE[locationOf(holders) ?? ''] : null;
  const mine = holders.some((p) => p.id === myId);

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <View style={[styles.mark, { backgroundColor: theme.accentWash }]}>
          <Text style={[styles.markText, { color: theme.accentWashText }]}>{chipLetters(role.label)}</Text>
        </View>
        <View style={styles.headText}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>{role.label}</Text>
          <View style={styles.tags}>
            {where ? <Tag text={where} /> : null}
            {directoryVisible ? <Tag text={countLabel(holders.length)} /> : null}
            {mine ? <Tag text="Your role" good /> : null}
          </View>
        </View>
      </View>

      {role.description ? <Text style={[styles.description, { color: theme.textSecondary }]}>{role.description}</Text> : null}

      <View style={styles.section}>
        <SectionHead label="People" count={directoryVisible ? holders.length : null} />
        {!directoryVisible ? (
          <Text style={[styles.note, { color: theme.textSecondary }]}>Who holds this role is not shown to your position.</Text>
        ) : holders.length === 0 ? (
          <Text style={[styles.note, { color: theme.textSecondary }]}>No one currently in this role.</Text>
        ) : (
          <View style={styles.people}>
            {holders.map((p) => (
              <View key={p.id} style={styles.person}>
                <Avatar initials={initialsOf(p.name)} size="sm" tint={tintFromSeed(p.id)} />
                <View style={styles.personText}>
                  <View style={styles.nameRow}>
                    <Text style={[styles.personName, { color: theme.textPrimary }]} numberOfLines={1}>
                      {p.name}
                    </Text>
                    {p.id === myId ? <Tag text="You" good /> : null}
                  </View>
                  {p.email ? (
                    <Text style={[styles.email, { color: theme.textSecondary }]} numberOfLines={1}>
                      {p.email}
                    </Text>
                  ) : null}
                </View>
                {p.hours ? <Text style={[styles.hours, { color: theme.textSecondary }]}>{p.hours}</Text> : null}
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <SectionHead label="What this role logs" count={duties && duties.length > 0 ? duties.length : null} />
        {note ? (
          <View style={styles.noteRow}>
            <Icon name={duties === undefined ? 'info' : 'users'} size={18} color={theme.textSecondary} />
            <Text style={[styles.note, styles.noteText, { color: theme.textSecondary }]}>{note}</Text>
          </View>
        ) : (
          (duties ?? []).map((d, i) => <DutyRow key={d.what} duty={d} first={i === 0} />)
        )}
      </View>
    </Card>
  );
}

function SectionHead({ label, count }: { label: string; count: number | null }) {
  const theme = useTheme();
  return (
    <View style={styles.sectionHead}>
      <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>{label}</Text>
      {count != null ? <Text style={[styles.sectionCount, { color: theme.textSecondary }]}>{count}</Text> : null}
    </View>
  );
}

function Tag({ text, good = false }: { text: string; good?: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.tag, { backgroundColor: good ? theme.accentWash : theme.segmentSurface, borderColor: good ? 'transparent' : theme.border }]}>
      <Text style={[styles.tagText, { color: good ? theme.accentWashText : theme.textSecondary }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 18, gap: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mark: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  markText: { fontFamily: fontFamily.semibold, fontSize: 15 },
  headText: { flex: 1, gap: 6 },
  title: { fontFamily: fontFamily.semibold, fontSize: 19, letterSpacing: -0.02 * 19 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
  tagText: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.06 * 10, textTransform: 'uppercase' },
  description: { fontFamily: fontFamily.regular, fontSize: 13.5, lineHeight: 13.5 * 1.5 },
  section: { gap: 4 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  sectionLabel: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.12 * 10, textTransform: 'uppercase' },
  sectionCount: { fontFamily: fontFamily.mono, fontSize: 10 },
  note: { fontFamily: fontFamily.regular, fontSize: 13.5, lineHeight: 13.5 * 1.5 },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingTop: 2 },
  noteText: { flex: 1 },
  people: { gap: 12, paddingTop: 4 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  personText: { flex: 1, gap: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  personName: { fontFamily: fontFamily.medium, fontSize: 14, flexShrink: 1 },
  email: { fontFamily: fontFamily.regular, fontSize: 12 },
  hours: { fontFamily: fontFamily.mono, fontSize: 11 },
});
