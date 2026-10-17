import {
  setCalendarPreference,
  useCalendarPreference,
  type DateCalendar,
} from '@/lib/calendar-preference';
import { Segmented, type SegmentedOption } from '@/components/ui/segmented';

import { SettingRow } from './setting-row';

const OPTIONS: SegmentedOption<DateCalendar>[] = [
  { value: 'bs', label: 'Bikram Sambat' },
  { value: 'ad', label: 'Gregorian' },
];

/**
 * Which calendar the app leads with — in pickers, and on every date it prints.
 * The other calendar stays visible next to it, so a Gregorian reader can still
 * quote the B.S. date the paperwork is filed under. The inline toggle on a date
 * field writes the same preference.
 */
export function CalendarCard() {
  const calendar = useCalendarPreference();

  return (
    <SettingRow
      label="Date entry"
      meta={
        calendar === 'bs'
          ? 'Dates lead in Bikram Sambat, with A.D. alongside · always stored as A.D.'
          : 'Dates lead in Gregorian, with B.S. alongside · always stored as A.D.'
      }
    >
      <Segmented options={OPTIONS} value={calendar} onChange={setCalendarPreference} fill />
    </SettingRow>
  );
}
