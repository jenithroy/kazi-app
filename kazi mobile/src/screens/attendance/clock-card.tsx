import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import { GEOFENCE_RADIUS_M, type GeofenceEval } from '@/lib/geo';
import type { PunchSummary } from '@/data/attendance/types';
import { formatHm } from '@/data/attendance/utils';

import type { GeoState } from './use-geo-clock-in';

export interface ClockCardProps {
  clockedIn: boolean;
  inTime: string;
  outTime: string | null;
  elapsedSeconds: number;
  /** Clock out, or start a GPS-verified clock-in — the parent routes on `clockedIn`. */
  onToggle: () => void;
  /** GPS acquisition state for the pending clock-in (item 26). */
  geoState: GeoState;
  /** Evaluated fix once `geoState === 'ready'`. */
  geo: GeofenceEval | null;
  /** Geofence + late-cut outcome of the current session, shown while clocked in. */
  lastPunch?: PunchSummary;
  /** Open the OS settings so the user can re-enable location (shown when denied/blocked). */
  onOpenSettings?: () => void;
}

function lateLine(p: PunchSummary): string {
  const where = p.distanceToSiteM == null ? 'no GPS logged' : `${p.distanceToSiteM} m from site`;
  const when =
    p.status === 'Present'
      ? 'on time'
      : `${p.lateMinutes} min late${p.lateCutApplied ? ' · cut applied' : ''}`;
  return `${where} · ${when}${p.bypassUsed ? ' · bypassed' : ''}`;
}

function blockedMessage(geoState: GeoState, geo: GeofenceEval | null): string | null {
  if (geoState === 'denied') return "Location is off. Turn it on so we can confirm you're at the workshop.";
  if (geoState === 'blocked') return 'Location access is turned off for Kazi. Re-enable it in Settings to clock in from the workshop.';
  if (geoState === 'error') return "Couldn't get a GPS fix. Move to an open area and try again.";
  if (geoState === 'ready' && geo) {
    if (!geo.withinFence) return `You're ${geo.distanceM} m away — outside the ${GEOFENCE_RADIUS_M} m clock-in zone.`;
    if (!geo.accuracyOk) return `GPS fix is only accurate to ±${geo.accuracyM} m. Find a clearer spot.`;
  }
  return null;
}

export function ClockCard({ clockedIn, inTime, outTime, elapsedSeconds, onToggle, geoState, geo, lastPunch, onOpenSettings }: ClockCardProps) {
  const theme = useTheme();

  const locating = !clockedIn && geoState === 'locating';
  const blocked = !clockedIn ? blockedMessage(geoState, geo) : null;
  const verified = !clockedIn && geoState === 'ready' && geo && geo.withinFence && geo.accuracyOk;

  // A failed geofence has no override — the only recovery is turning location
  // back on, offered when the OS denied/blocked it.
  const showSettings = (geoState === 'denied' || geoState === 'blocked') && !!onOpenSettings;

  let geoCaption: string | null = null;
  if (clockedIn && lastPunch) geoCaption = lateLine(lastPunch);
  else if (locating) geoCaption = 'Checking you’re at the workshop…';
  else if (verified && geo) geoCaption = `${geo.distanceM} m from site · fix ±${geo.accuracyM} m`;

  return (
    <View style={[styles.card, { backgroundColor: theme.surfaceHero, borderColor: theme.surfaceHeroBorder, borderWidth: theme.scheme === 'dark' ? 1 : 0, boxShadow: theme.shadows.raised }]}>
      <View style={styles.hoursRow}>
        <View style={styles.gap6}>
          <Text style={[styles.hoursValue, tabularNums, { color: theme.onHero.text }]}>{formatHm(elapsedSeconds)}</Text>
          <Text style={[styles.hoursCaption, { color: theme.onHero.textMuted }]}>worked today</Text>
        </View>
        <View style={styles.inOutCol}>
          <Text style={[styles.inOutLabel, { color: theme.onHero.textMuted }]}>In</Text>
          <Text style={[styles.inOutValue, tabularNums, { color: theme.onHero.text }]}>{inTime}</Text>
          <Text style={[styles.inOutLabel, styles.outLabelSpacing, { color: theme.onHero.textMuted }]}>Out</Text>
          <Text style={[styles.inOutValue, tabularNums, { color: theme.onHero.text }]}>{outTime ?? '—'}</Text>
        </View>
      </View>

      {geoCaption ? (
        <View style={styles.geoRow}>
          {locating ? <ActivityIndicator size="small" color={theme.onHero.textMuted} /> : null}
          <Text style={[styles.geoCaption, { color: theme.onHero.textMuted }]}>{geoCaption}</Text>
        </View>
      ) : null}

      {blocked ? (
        <View style={[styles.blockedBox, { backgroundColor: theme.onHero.warningWash }]}>
          <Text style={[styles.blockedText, { color: theme.onHero.warningWashText }]}>{blocked}</Text>
          {showSettings ? (
            <View style={styles.blockedActions}>
              <Pressable onPress={onOpenSettings} hitSlop={8}>
                <Text style={[styles.actionLink, { color: theme.onHero.accent }]}>Open Settings</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}

      <Pressable
        onPress={onToggle}
        disabled={locating}
        style={[styles.clockButton, { backgroundColor: clockedIn ? theme.onHero.track : theme.onHero.solid, opacity: locating ? 0.6 : 1 }]}
      >
        <Text style={[styles.clockButtonLabel, { color: clockedIn ? theme.onHero.text : theme.onHero.solidText }]}>
          {clockedIn ? 'Clock Out' : locating ? 'Locating…' : 'Clock In'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 22, padding: 20, gap: 18 },
  hoursRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  gap6: { gap: 6 },
  hoursValue: { fontSize: 44, fontWeight: '600', letterSpacing: -0.03 * 44, lineHeight: 44 },
  hoursCaption: { fontSize: 13 },
  inOutCol: { alignItems: 'flex-end', gap: 4 },
  inOutLabel: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.12 * 10, textTransform: 'uppercase' },
  inOutValue: { fontSize: 17, fontWeight: '600' },
  outLabelSpacing: { paddingTop: 4 },
  geoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  geoCaption: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.12 * 10, textTransform: 'uppercase', flexShrink: 1 },
  blockedBox: { borderRadius: 14, padding: 14, gap: 8 },
  blockedText: { fontSize: 13, lineHeight: 18 },
  blockedActions: { flexDirection: 'row', gap: 18 },
  actionLink: { fontFamily: fontFamily.semibold, fontSize: 13 },
  clockButton: { height: 54, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  clockButtonLabel: { fontFamily: fontFamily.semibold, fontSize: 16 },
});
