import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { isDirector } from '@/auth/permissions';
import { RiseIn } from '@/components/ui/rise-in';
import type { MyMonth, PunchSummary } from '@/data/attendance/types';
import { useTheme } from '@/theme/theme-provider';
import type { GeofenceEval } from '@/lib/geo';

import { ClockCard } from './clock-card';
import { DayDetailSheet } from './day-detail';
import { MonthCalendar } from './month-calendar';
import { MonthlySummary } from './monthly-summary';
import { WeeklyHours } from './weekly-hours';
import type { GeoState } from './use-geo-clock-in';

export interface MineViewProps {
  clockedIn: boolean;
  inTime: string;
  outTime: string | null;
  elapsedSeconds: number;
  onToggleClock: () => void;
  onRaiseCorrection: () => void;
  geoState: GeoState;
  geo: GeofenceEval | null;
  lastPunch?: PunchSummary;
  onOpenSettings?: () => void;
  /** The signed-in user's live month; undefined while the live read is in flight. */
  month: MyMonth | undefined;
}

export function MineView({
  clockedIn,
  inTime,
  outTime,
  elapsedSeconds,
  onToggleClock,
  onRaiseCorrection,
  geoState,
  geo,
  lastPunch,
  onOpenSettings,
  month,
}: MineViewProps) {
  const theme = useTheme();
  const { profile } = useAuth();
  const director = isDirector(profile);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const openDetail = openDay ? (month?.details[openDay] ?? null) : null;

  return (
    <RiseIn viewKey="mine">
      <View style={styles.wrap}>
        {!director ? (
          <ClockCard
            clockedIn={clockedIn}
            inTime={inTime}
            outTime={outTime}
            elapsedSeconds={elapsedSeconds}
            onToggle={onToggleClock}
            geoState={geoState}
            geo={geo}
            lastPunch={lastPunch}
            onOpenSettings={onOpenSettings}
          />
        ) : null}
        {month ? (
          <>
            <MonthCalendar
              monthLabel={month.monthLabel}
              monthISOStart={month.monthISOStart}
              monthISOEnd={month.monthISOEnd}
              workingDays={month.workingDays}
              days={month.days}
              onSelectDay={setOpenDay}
            />
            {!director ? (
              <>
                <WeeklyHours weeks={month.weeks} openPunchDays={month.summary.openPunchDays} />
                <MonthlySummary summary={month.summary} onRaiseCorrection={onRaiseCorrection} />
              </>
            ) : null}
          </>
        ) : (
          <View style={styles.pending}>
            <ActivityIndicator color={theme.accent} />
          </View>
        )}

        <DayDetailSheet visible={openDetail !== null} detail={openDetail} onClose={() => setOpenDay(null)} />
      </View>
    </RiseIn>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  pending: { paddingVertical: 48, alignItems: 'center' },
});
