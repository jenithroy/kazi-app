import { useEffect, useState } from 'react';

import { useAuth } from '@/auth/auth-context';
import { useToast } from '@/components/toast/toast-provider';
import { useClockStatus, useToggleClock } from '@/data/attendance/hooks';
import { MY_NAME } from '@/data/attendance/mock';

import { ClockCard } from '@/screens/attendance/clock-card';
import { useGeoClockIn } from '@/screens/attendance/use-geo-clock-in';

/**
 * Self-contained clock in / out card for the dashboard — same `ClockCard` and
 * GPS-geofenced wiring as the Attendance "Mine" view, so people who punch a
 * clock can do it without leaving the home screen. Only mounted by the "My day"
 * dashboard variant (employee / nepal_staff) — admins never see it.
 */
export function DashboardClockInCard() {
  const toast = useToast();
  const { profile } = useAuth();
  const staffName = profile?.name ?? MY_NAME;

  const { data: clockStatus } = useClockStatus();
  const toggleClock = useToggleClock();
  const geoClock = useGeoClockIn();

  const [elapsed, setElapsed] = useState(0);

  // Re-seed from the server on first load and on any session change (a
  // clock-out made on another device / the web, or a fresh clock-in). Done
  // during render, not from an effect, so the ticker never shows a stale second.
  const session = `${clockStatus?.clockedIn}|${clockStatus?.inTime}|${clockStatus?.outTime}`;
  const [seededFrom, setSeededFrom] = useState(session);
  if (seededFrom !== session) {
    setSeededFrom(session);
    if (clockStatus) setElapsed(clockStatus.elapsedSeconds);
  }

  useEffect(() => {
    if (!clockStatus?.clockedIn) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [clockStatus?.clockedIn]);

  if (!clockStatus) return null;

  // GPS geofenced clock-in — take a fix, verify against WORK_SITE, then punch.
  const finishClockIn = async (coords: { lat: number; lng: number; accuracyM: number } | null) => {
    const next = await toggleClock.mutateAsync({ elapsedSeconds: elapsed, staffName, coords, bypassUsed: false });
    geoClock.reset();
    const p = next.lastPunch;
    if (!p) return;
    if (p.status === 'Late') {
      toast.show({
        message: `Clocked in · ${p.lateMinutes} min late${p.lateCutApplied ? ' · salary cut applied' : ''}`,
        tone: p.lateCutApplied ? 'warn' : 'ok',
      });
    } else {
      toast.show({ message: 'Clocked in · at the workshop, on time', tone: 'ok' });
    }
  };

  const handleToggleClock = async () => {
    if (clockStatus.clockedIn) {
      await toggleClock.mutateAsync({ elapsedSeconds: elapsed, staffName, coords: null, bypassUsed: false });
      geoClock.reset();
      return;
    }
    const res = await geoClock.locate();
    if (res.ok && res.coords) {
      await finishClockIn(res.coords);
    }
    // otherwise the clock card shows the blocked banner — clock-in needs a valid on-site fix
  };

  return (
    <ClockCard
      clockedIn={clockStatus.clockedIn}
      inTime={clockStatus.inTime}
      outTime={clockStatus.outTime}
      elapsedSeconds={elapsed}
      onToggle={handleToggleClock}
      geoState={geoClock.state}
      geo={geoClock.geo}
      lastPunch={clockStatus.lastPunch}
      onOpenSettings={geoClock.openSettings}
    />
  );
}
