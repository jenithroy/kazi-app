import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import type { AttendanceView } from '@/data/attendance/types';

export interface TabsHeaderProps {
  view: AttendanceView;
  onChange: (v: AttendanceView) => void;
}

export function TabsHeader({ view, onChange }: TabsHeaderProps) {
  const theme = useTheme();

  return (
    <View style={styles.outer}>
      <View style={[styles.segmented, { backgroundColor: theme.draftWash }]}>
        <Pressable
          onPress={() => onChange('mine')}
          style={[styles.segmentButton, { backgroundColor: view === 'mine' ? theme.surface : 'transparent', boxShadow: view === 'mine' ? theme.shadows.card : undefined }]}
        >
          <Text style={[styles.segmentLabel, { color: view === 'mine' ? theme.textPrimary : theme.textSecondary }]}>My attendance</Text>
        </Pressable>
        <Pressable
          onPress={() => onChange('team')}
          style={[styles.segmentButton, styles.teamButton, { backgroundColor: view === 'team' ? theme.surface : 'transparent', boxShadow: view === 'team' ? theme.shadows.card : undefined }]}
        >
          <Text style={[styles.segmentLabel, { color: view === 'team' ? theme.textPrimary : theme.textSecondary }]}>Team</Text>
          <Text style={[styles.adminBadge, { color: view === 'team' ? theme.textPrimary : theme.textSecondary }]}>ADMIN</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // paddingTop separates the segmented control from ScreenHeader's bottom rule —
  // without it the tabs sit flush against the header.
  outer: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12 },
  segmented: { flexDirection: 'row', padding: 4, borderRadius: 14, gap: 4 },
  segmentButton: { flex: 1, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  teamButton: { flexDirection: 'row', gap: 7 },
  segmentLabel: { fontFamily: fontFamily.semibold, fontSize: 13.5 },
  adminBadge: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.08 * 10, opacity: 0.7 },
});
