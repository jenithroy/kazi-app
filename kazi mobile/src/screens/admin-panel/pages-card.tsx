import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Icon, type IconName } from '@/components/ui/icon';
import { Switch } from '@/components/ui/switch';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, radii } from '@/theme';
import { LEVELS, type AccessLevel, type SectionRow } from '@/data/admin-panel/types';

import { LevelPicker } from './level-picker';

/** A page reads faster with its own icon beside it than as one of twenty identical labels. */
const SECTION_ICONS: Record<string, IconName> = {
  dashboard: 'grid',
  tasks: 'check-square',
  attendance: 'clock',
  payroll: 'credit-card',
  production: 'layers',
  quality_control: 'shield',
  inventory: 'package',
  library: 'book',
  orders: 'truck',
  purchases: 'shopping-cart',
  sales: 'trending-up',
  customers: 'users',
  billing: 'file-text',
  finance: 'pie-chart',
  accounting: 'book-open',
  budget: 'inbox',
  content: 'calendar',
  employees: 'user',
  marketing: 'send',
  messenger: 'message-circle',
  directors: 'award',
  admin: 'settings',
  changelog: 'git-commit',
  bug_report: 'alert-triangle',
  usage_analytics: 'activity',
};

const PERSONAL_HINT =
  'Marks this page as one that only ever shows a person their own records. It is a note on the page itself, the same for every role — the rule it describes lives in that page’s database policy.';

export interface PagesCardProps {
  sections: SectionRow[];
  query: string;
  onQueryChange: (v: string) => void;
  levelFor: (sectionId: string) => AccessLevel;
  isChanged: (sectionId: string) => boolean;
  personalFor: (section: SectionRow) => boolean;
  isPersonalChanged: (sectionId: string) => boolean;
  onLevel: (sectionId: string, level: AccessLevel) => void;
  onPersonal: ((section: SectionRow, value: boolean) => void) | undefined;
  onSetAll: (level: AccessLevel) => void;
  /** Super admin is on, or the viewer may not administer — either way the switches don't apply. */
  locked: boolean;
  isSuperAdmin: boolean;
  superAdminChanged: boolean;
  canToggleSuperAdmin: boolean;
  onSuperAdmin: (on: boolean) => void;
}

export function PagesCard({
  sections,
  query,
  onQueryChange,
  levelFor,
  isChanged,
  personalFor,
  isPersonalChanged,
  onLevel,
  onPersonal,
  onSetAll,
  locked,
  isSuperAdmin,
  superAdminChanged,
  canToggleSuperAdmin,
  onSuperAdmin,
}: PagesCardProps) {
  const theme = useTheme();

  const q = query.trim().toLowerCase();
  const rows = q ? sections.filter((s) => `${s.label} ${s.id}`.toLowerCase().includes(q)) : sections;
  const showSuperRow = !q || 'super admin'.includes(q);

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Page access</Text>
        <View style={[styles.filter, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Icon name="search" size={13} color={theme.textSecondary} />
          <TextInput
            value={query}
            onChangeText={onQueryChange}
            placeholder="Filter pages"
            placeholderTextColor={theme.textSecondary}
            style={[styles.filterInput, { color: theme.textPrimary, fontFamily: fontFamily.regular }]}
          />
        </View>
      </View>

      {!locked ? (
        <View style={styles.bulkRow}>
          <Text style={[styles.bulkLabel, { color: theme.textSecondary }]}>Set all</Text>
          {LEVELS.map((l) => (
            <Pressable
              key={l.key}
              onPress={() => onSetAll(l.key)}
              style={({ pressed }) => [
                styles.bulkButton,
                { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Text style={[styles.bulkButtonLabel, { color: theme.textPrimary }]}>{l.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={[styles.card, { backgroundColor: theme.surface, boxShadow: theme.shadows.card }]}>
        {rows.length === 0 && !showSuperRow ? (
          <Text style={[styles.empty, { color: theme.textSecondary }]}>No page matches that.</Text>
        ) : null}

        {rows.map((s, i) => {
          const level = levelFor(s.id);
          const changed = isChanged(s.id);
          const personal = personalFor(s);
          const personalChanged = isPersonalChanged(s.id);

          return (
            <View
              key={s.id}
              style={[
                styles.row,
                i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border } : null,
                changed ? { backgroundColor: theme.accentWash } : null,
              ]}
            >
              <Icon name={SECTION_ICONS[s.id] ?? 'square'} size={15} color={theme.textSecondary} />
              <View style={styles.rowText}>
                <Text style={[styles.rowLabel, { color: theme.textPrimary }]} numberOfLines={1}>
                  {s.label}
                </Text>
                {onPersonal ? (
                  <Pressable
                    onPress={() => onPersonal(s, !personal)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: personal }}
                    accessibilityHint={PERSONAL_HINT}
                    style={[
                      styles.personal,
                      {
                        backgroundColor: personal ? theme.draftWash : 'transparent',
                        borderColor: personalChanged ? theme.accent : personal ? theme.draftWash : theme.border,
                      },
                    ]}
                  >
                    <Text style={[styles.personalLabel, { color: personal ? theme.draftWashText : theme.textSecondary }]}>
                      own records only
                    </Text>
                  </Pressable>
                ) : personal ? (
                  <View style={[styles.personal, { backgroundColor: theme.draftWash, borderColor: theme.draftWash }]}>
                    <Text style={[styles.personalLabel, { color: theme.draftWashText }]}>own records only</Text>
                  </View>
                ) : null}
              </View>
              <LevelPicker value={level} onChange={(lv) => onLevel(s.id, lv)} disabled={locked} />
            </View>
          );
        })}

        {/* Last row, and the only one that isn't a page: the whole matrix above
            stops applying while this is on. */}
        {showSuperRow ? (
          <View
            style={[
              styles.superRow,
              rows.length > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border } : null,
              {
                backgroundColor: superAdminChanged
                  ? theme.accentWash
                  : isSuperAdmin
                    ? theme.warningWash
                    : theme.surfaceRaised,
              },
            ]}
          >
            <Icon name="lock" size={15} color={isSuperAdmin ? theme.warningWashText : theme.textSecondary} />
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>Super admin</Text>
              <Text style={[styles.superNote, { color: theme.textSecondary }]}>
                Full access to every page and finance tab, permanently — the switches above stop applying, and nothing
                can reduce it while this is on.
              </Text>
            </View>
            {canToggleSuperAdmin ? (
              <Switch value={isSuperAdmin} onValueChange={() => onSuperAdmin(!isSuperAdmin)} />
            ) : (
              <Text style={[styles.superState, { color: theme.textSecondary }]}>{isSuperAdmin ? 'on' : 'off'}</Text>
            )}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 2 },
  title: { fontFamily: fontFamily.semibold, fontSize: 15, letterSpacing: -0.01 * 15 },
  filter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 36,
    paddingHorizontal: 11,
    borderRadius: 12,
    borderWidth: 1,
  },
  filterInput: { flex: 1, fontSize: 13, padding: 0 },
  bulkRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 2 },
  bulkLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.1 * 10,
    textTransform: 'uppercase',
    marginRight: 2,
  },
  bulkButton: {
    height: 30,
    paddingHorizontal: 13,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulkButtonLabel: { fontFamily: fontFamily.semibold, fontSize: 12 },
  card: { borderRadius: radii.lg, overflow: 'hidden' },
  empty: { fontFamily: fontFamily.mono, fontSize: 11, padding: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 13 },
  rowText: { flex: 1, gap: 5, minWidth: 0, alignItems: 'flex-start' },
  rowLabel: { fontFamily: fontFamily.semibold, fontSize: 14 },
  personal: {
    height: 20,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personalLabel: { fontFamily: fontFamily.mono, fontSize: 9 },
  superRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 13 },
  superNote: { fontFamily: fontFamily.mono, fontSize: 10, lineHeight: 10 * 1.55 },
  superState: { fontFamily: fontFamily.mono, fontSize: 11 },
});
