#!/usr/bin/env node
/**
 * Checks that the phone judges an arrival exactly as the website does.
 *
 * Both write the day's attendance record, so they have to agree to the minute: the date the memo's rules start (`NEW_RULES_FROM`), the
 * grace, the old rule's cut, and the status, minutes and cut flag for an arrival at every minute of a working day, across the start date
 * and for people with and without hours of their own. The website's rules are `../src/lib/workRules.js`; the phone's are
 * `src/data/attendance/work-rules.ts`.
 *
 *   node scripts/check-work-rules.mjs        (Node 23.6 or newer, which reads TypeScript directly)
 *
 * Exits 1, and prints the first differences, when they have drifted apart. Run it whenever either side's rules change.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

// The website reads the clock of the device it runs on; the office is in Kathmandu, so compare on that clock.
process.env.TZ = 'Asia/Kathmandu';

const here = dirname(fileURLToPath(import.meta.url));
const web = await import(pathToFileURL(resolve(here, '../../src/lib/workRules.js')).href);
const phone = await import(pathToFileURL(resolve(here, '../src/data/attendance/work-rules.ts')).href);

const problems = [];
for (const k of ['NEW_RULES_FROM', 'GRACE_MIN', 'OLD_CUT_AFTER_MIN', 'ABSENCES_PER_DAY_CUT']) {
  if (web[k] !== phone[k]) problems.push(`${k}: website ${web[k]}, phone ${phone[k]}`);
}
if (JSON.stringify(web.DEFAULT_SHIFT) !== JSON.stringify(phone.DEFAULT_SHIFT)) {
  problems.push(`DEFAULT_SHIFT: website ${JSON.stringify(web.DEFAULT_SHIFT)}, phone ${JSON.stringify(phone.DEFAULT_SHIFT)}`);
}

const NEPAL_MS = (5 * 60 + 45) * 60_000;
const startDay = web.NEW_RULES_FROM;
const dayBefore = new Date(Date.parse(`${startDay}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
const dayAfter = new Date(Date.parse(`${startDay}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const shifts = [null, ...['09:00', '10:00', '10:30', '11:00', '12:30'].map((start) => ({ start, end: '18:00' }))];

let arrivals = 0;
for (const day of [dayBefore, startDay, dayAfter]) {
  const [y, m, d] = day.split('-').map(Number);
  for (const shift of shifts) {
    for (let min = 5 * 60; min <= 16 * 60; min += 1) {
      // The instant whose Kathmandu wall clock is `day min`; the phone reads it shifted, the website on this process's clock.
      const at = new Date(Date.UTC(y, m - 1, d, 0, min) - NEPAL_MS);
      const a = web.judgeArrival(shift, at);
      const b = phone.judgeArrival(shift, new Date(at.getTime() + NEPAL_MS));
      arrivals += 1;
      if (a.status !== b.status || a.lateMinutes !== b.lateMinutes || a.lateCutApplied !== b.lateCutApplied) {
        problems.push(`${day} ${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')} shift ${shift?.start ?? 'none'}: website ${JSON.stringify(a)}, phone ${JSON.stringify(b)}`);
      }
    }
  }
}

if (problems.length) {
  console.error(`The phone and the website judge attendance differently (${problems.length} differences):`);
  for (const p of problems.slice(0, 12)) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`The phone and the website agree: the constants, and ${arrivals} arrivals either side of ${startDay}.`);
