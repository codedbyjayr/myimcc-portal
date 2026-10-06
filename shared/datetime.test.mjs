// Unit tests for shared/datetime.js - Asia/Manila handling.
// Run: node shared/datetime.test.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = readFileSync(new URL('./datetime.js', import.meta.url), 'utf8');

let passed = 0;
const failures = [];

function eq(actual, expected, label) {
  if (actual === expected) { passed++; return; }
  failures.push(`${label}\n      expected: ${JSON.stringify(expected)}\n      actual:   ${JSON.stringify(actual)}`);
}

function ok(value, label) {
  if (value) { passed++; return; }
  failures.push(`${label}\n      expected truthy, got ${JSON.stringify(value)}`);
}

const sandbox = { console, Intl, Date, Math, JSON, String, Number, Object };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(SRC, sandbox);
const T = sandbox.SCHOOLTIME;

// ── Zone offset ──────────────────────────────────────────────────────
eq(T.SCHOOL_TIME_ZONE, 'Asia/Manila', 'zone constant');

// Manila is UTC+8 all year. Checked in winter and summer, and across the
// years either side of the current date, so a DST assumption would fail here.
eq(T.zoneOffsetMs(new Date('2026-01-15T00:00:00Z')), 8 * 3600000, 'offset in January');
eq(T.zoneOffsetMs(new Date('2026-07-15T00:00:00Z')), 8 * 3600000, 'offset in July');
eq(T.zoneOffsetMs(new Date('2025-07-15T00:00:00Z')), 8 * 3600000, 'offset in 2025');
eq(T.zoneOffsetMs(new Date('2027-01-15T00:00:00Z')), 8 * 3600000, 'offset in 2027');

// A zone that genuinely does observe DST, to prove the function reads the
// zone rather than returning a constant.
eq(T.zoneOffsetMs(new Date('2026-01-15T00:00:00Z'), 'America/New_York'), -5 * 3600000, 'New York winter is UTC-5');
eq(T.zoneOffsetMs(new Date('2026-07-15T00:00:00Z'), 'America/New_York'), -4 * 3600000, 'New York summer is UTC-4');

// ── Local wall clock to instant ──────────────────────────────────────
// A 9:00 AM Manila class is 01:00 UTC. This is the assertion that matters:
// getting this backwards shifts every appointment by eight hours.
eq(T.schoolLocalToIso('2026-06-15', '09:00'), '2026-06-15T01:00:00.000Z', '9am Manila is 1am UTC');
eq(T.schoolLocalToIso('2026-06-15', '00:00'), '2026-06-14T16:00:00.000Z', 'midnight Manila is 4pm UTC the day before');
eq(T.schoolLocalToIso('2026-06-15', '23:59'), '2026-06-15T15:59:00.000Z', '23:59 Manila is 15:59 UTC');

// Crossing midnight in both directions, where off-by-one-day errors surface.
eq(T.schoolLocalToIso('2026-01-01', '08:00'), '2026-01-01T00:00:00.000Z', 'New Year morning, no day shift');
eq(T.schoolLocalToIso('2026-12-31', '08:00'), '2026-12-31T00:00:00.000Z', 'New Year Eve morning stays on the same UTC date');
// The day that does shift is early morning local, which is the previous UTC day.
eq(T.schoolLocalToIso('2026-01-01', '07:00'), '2025-12-31T23:00:00.000Z', '7am on Jan 1 is still Dec 31 in UTC');

// Round trip: instant -> zone parts -> same wall clock.
(function roundTrip() {
  const iso = T.schoolLocalToIso('2026-09-16', '14:30');
  const parts = T.zonedParts(new Date(iso));
  const wall = [
    String(parts.year).padStart(4, '0'),
    String(parts.month).padStart(2, '0'),
    String(parts.day).padStart(2, '0')
  ].join('-');
  eq(wall, '2026-09-16', 'round trip keeps the local date');
  eq(parts.hour + ':' + String(parts.minute).padStart(2, '0'), '14:30', 'round trip keeps the local time');
})();

// Rejects input a time input could not produce, rather than inventing a date.
eq(T.schoolLocalToIso('', '09:00'), null, 'empty date rejected');
eq(T.schoolLocalToIso('2026-06-15', ''), null, 'empty time rejected');
eq(T.schoolLocalToIso('2026-06-15', '9am'), null, 'non-24h time rejected');
eq(T.schoolLocalToIso('2026-06-15', '09:00:00'), null, 'seconds not accepted, keeps one format');
eq(T.schoolLocalToIso('15/06/2026', '09:00'), null, 'non-ISO date rejected');
eq(T.schoolLocalToIso('2026-06-15', '25:00'), null, 'hour out of range rejected');
eq(T.schoolLocalToIso('2026-06-15', '09:70'), null, 'minute out of range rejected');
eq(T.schoolLocalToIso(null, null), null, 'both missing rejected');

// ── Display ──────────────────────────────────────────────────────────
(function display() {
  // Display must not depend on the host zone. Run the check with the process
  // forced to a zone eight hours away from Manila; a toLocaleString() call
  // without an explicit timeZone would drift here.
  const originalTz = process.env.TZ;
  process.env.TZ = 'America/Los_Angeles';
  try {
    const text = T.formatSchoolDateTime('2026-06-15T01:00:00Z');
    ok(text.includes('9:00') || text.includes('09:00'),
      `formatted time shows the Manila wall clock, got ${JSON.stringify(text)}`);
    ok(text.includes('Manila'), 'formatted time is labelled with the zone');
    ok(!text.includes('6:00') && !text.includes('18:00'),
      `formatted time is not the viewer's offset, got ${JSON.stringify(text)}`);
  } finally {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  }
})();

eq(T.formatSchoolDateTime('not a date'), '—', 'invalid input formats as a dash, not "Invalid Date"');
eq(T.formatSchoolDateTime(undefined), '—', 'undefined formats as a dash');
eq(T.formatSchoolDate('2026-06-15T01:00:00Z').length > 0, true, 'date-only format produces text');

// ── Today and now ────────────────────────────────────────────────────
(function todayParts() {
  const today = T.schoolToday();
  ok(/^\d{4}-\d{2}-\d{2}$/.test(today), `schoolToday is ISO shaped, got ${today}`);

  // The date must match the zone, not the host. 16:00 UTC is already the next
  // day in Manila, so a UTC-based "today" would be wrong for eight hours a day.
  const parts = T.schoolNowParts();
  ok(parts.hour >= 0 && parts.hour <= 23, 'hour in range');
  ok(parts.minute >= 0 && parts.minute <= 59, 'minute in range');
  ok(parts.year >= 2024, 'year is plausible');
})();

// ── Relative ─────────────────────────────────────────────────────────
(function relative() {
  // Minutes are shown as minutes below an hour, then rounded to whole hours.
  // 90 min is 1.5 hr, which rounds up rather than truncating, so the wording
  // never promises a shorter wait than the student will actually have.
  eq(T.relativeToNow(new Date(Date.now() + 90 * 60000)), 'in 2 hr', '90 minutes rounds to 2 hours');
  eq(T.relativeToNow(new Date(Date.now() + 45 * 60000)), 'in 45 min', '45 minutes stays in minutes');
  eq(T.relativeToNow(new Date(Date.now() + 2 * 3600000)), 'in 2 hr', 'two hours reads as two hours');

  const past = new Date(Date.now() - 3 * 3600000);
  eq(T.relativeToNow(past), '3 hr ago', 'past reads as ago');

  eq(T.relativeToNow(new Date()), 'now', 'the present reads as now');
  eq(T.relativeToNow('nonsense'), '—', 'invalid relative input is a dash');
})();

// ─── Now-clock and time parsing ─────────────────────────────────────────────
// schoolNowClock decides which class a student is sitting in right now, so it
// has to be right regardless of where the browser is. The implementation uses
// Date.UTC + getUTCDay on already-shifted parts, which is pure UTC math and
// cannot be dragged sideways by the host offset. These tests re-assert that
// under several host zones, so a future "simplification" to local getDay()
// fails here instead of highlighting the wrong class for overseas students.
(function nowClock() {
  function manilaWeekdayAndMinutes(date) {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'short'
    });
    const parts = {};
    for (const p of fmt.formatToParts(date)) {
      if (p.type !== 'literal') parts[p.type] = p.value;
    }
    return {
      weekday: parts.weekday,
      minutes: Number(parts.hour) * 60 + Number(parts.minute)
    };
  }

  // Host zones chosen so that UTC midnight lands on a *different* local day for
  // some of them. That is what separates a correct implementation from one that
  // reads the weekday in the browser's own zone: America/New_York and
  // Pacific/Midway put UTC midnight on the previous local day, so swapping
  // getUTCDay() for getDay() changes the answer and must fail here.
  const zones = ['UTC', 'America/New_York', 'Pacific/Kiritimati', 'Pacific/Midway', 'Australia/Sydney'];
  const originalTz = process.env.TZ;

  for (const tz of zones) {
    process.env.TZ = tz;
    const before = Date.now();
    const clock = T.schoolNowClock();
    const after = Date.now();

    // Compare against Intl for the instants either side of the call, so a tick
    // across a minute or day boundary during the test is not a false failure.
    const readings = [before, after].map(t => manilaWeekdayAndMinutes(new Date(t)));
    const accurate = readings.some(
      r => r.weekday === clock.weekday && Math.abs(r.minutes - clock.minutes) <= 1
    );
    ok(
      accurate,
      `clock reads as Manila under TZ=${tz} (got ${clock.weekday} ${clock.minutes}, `
      + `expected ${readings[0].weekday} ${readings[0].minutes})`
    );
    ok(T.WEEKDAY_LABELS.includes(clock.weekday), `weekday is a known day under TZ=${tz}`);
    ok(Number.isInteger(clock.minutes), `minutes is an integer under TZ=${tz}`);
    ok(clock.minutes >= 0 && clock.minutes <= 1439, `minutes in range under TZ=${tz}`);
  }

  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;

  // Exact-value check against Intl, with the instant pinned via a fake Date so
  // the assertion cannot race the wall clock.
  const RealDate = Date;
  const pinned = new RealDate('2026-09-23T01:30:00Z'); // Wed 09:30 in Manila
  class FakeDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(pinned.getTime());
      else super(...args);
    }
    static now() { return pinned.getTime(); }
  }
  const pinnedSandbox = { console, Intl, Date: FakeDate, Math, JSON, String, Number, Object };
  pinnedSandbox.globalThis = pinnedSandbox;
  vm.createContext(pinnedSandbox);
  vm.runInContext(SRC, pinnedSandbox);
  const P = pinnedSandbox.SCHOOLTIME;

  const clock = P.schoolNowClock();
  eq(clock.weekday, 'Wed', 'pinned instant resolves to Wednesday in Manila');
  eq(clock.minutes, 9 * 60 + 30, 'pinned instant resolves to 09:30 in Manila');
  eq(clock.year, 2026, 'pinned instant year');
  eq(clock.month, 9, 'pinned instant month');
  eq(clock.day, 23, 'pinned instant day');
  eq(clock.zone, 'Asia/Manila', 'clock reports the zone it used');

  // Cross-check against Intl rather than only against literals, so the pinned
  // expectations and the implementation cannot drift together.
  const viaIntl = manilaWeekdayAndMinutes(pinned);
  eq(clock.weekday, viaIntl.weekday, 'pinned weekday agrees with an independent Intl computation');
  eq(clock.minutes, viaIntl.minutes, 'pinned minutes agree with an independent Intl computation');

  // Same trick on an instant that is a different calendar day in Manila than in
  // UTC, which is what makes the pinned cases meaningful rather than luck.
  // 2026-09-22 20:00 UTC is 2026-09-23 04:00 Manila, a different day of week.
  const lateUtc = new RealDate('2026-09-22T20:00:00Z');
  class LateFake extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(lateUtc.getTime());
      else super(...args);
    }
    static now() { return lateUtc.getTime(); }
  }
  const lateSandbox = { console, Intl, Date: LateFake, Math, JSON, String, Number, Object };
  lateSandbox.globalThis = lateSandbox;
  vm.createContext(lateSandbox);
  vm.runInContext(SRC, lateSandbox);
  const lateClock = lateSandbox.SCHOOLTIME.schoolNowClock();
  eq(lateClock.weekday, 'Wed', 'UTC Tuesday 20:00 is already Wednesday in Manila');
  eq(lateClock.minutes, 4 * 60, 'UTC Tuesday 20:00 is 04:00 in Manila');
})();

(function timeParsing() {
  eq(T.timeToMinutes('09:00'), 540, 'HH:MM parses');
  eq(T.timeToMinutes('09:00:00'), 540, 'HH:MM:SS parses to the same minutes');
  eq(T.timeToMinutes('9:30'), 570, 'single-digit hour parses');
  eq(T.timeToMinutes('00:00'), 0, 'midnight is zero');
  eq(T.timeToMinutes('23:59'), 1439, 'last minute of the day');
  eq(T.timeToMinutes('  08:15  '), 495, 'surrounding whitespace is tolerated');

  // These must be null, not 0. Coercing junk to midnight would mark a class
  // as running at 12:00 AM.
  eq(T.timeToMinutes('24:00'), null, 'hour 24 is rejected');
  eq(T.timeToMinutes('09:60'), null, 'minute 60 is rejected');
  eq(T.timeToMinutes(''), null, 'empty string is null');
  eq(T.timeToMinutes(null), null, 'null is null');
  eq(T.timeToMinutes(undefined), null, 'undefined is null');
  eq(T.timeToMinutes('nonsense'), null, 'prose is null');
  eq(T.timeToMinutes('09'), null, 'hours with no minutes is null');
})();

(function slotHighlight() {
  // Mon 09:45 Manila. The clock is injected, so none of this depends on when
  // the suite happens to run.
  const clock = { weekday: 'Mon', minutes: 9 * 60 + 45 };
  const slot = (day, start, end) => ({ day_of_week: day, start_time: start, end_time: end });

  eq(T.isSlotNow(slot('Mon', '09:00:00', '10:00:00'), clock), true, 'class in progress is now');
  eq(T.isSlotNow(slot('Tue', '09:00:00', '10:00:00'), clock), false, 'a different day is not now');
  eq(T.isSlotNow(slot('Mon', '10:00:00', '11:00:00'), clock), false, 'a later class has not started');
  eq(T.isSlotNow(slot('Mon', '08:00:00', '09:00:00'), clock), false, 'a finished class is not now');

  // The two boundary cases, which are the whole reason for a half-open range.
  eq(T.isSlotNow(slot('Mon', '09:45:00', '10:30:00'), clock), true, 'start minute is inclusive');
  eq(T.isSlotNow(slot('Mon', '08:00:00', '09:45:00'), clock), false, 'end minute is exclusive');

  // A back-to-back changeover must light exactly one row, never two.
  const changeover = { weekday: 'Mon', minutes: 10 * 60 };
  eq(T.isSlotNow(slot('Mon', '09:00:00', '10:00:00'), changeover), false, 'changeover: earlier class is over');
  eq(T.isSlotNow(slot('Mon', '10:00:00', '11:00:00'), changeover), true, 'changeover: later class has begun');

  // Day labels are matched leniently, because the column is free text.
  eq(T.isSlotNow(slot('mon', '09:00:00', '10:00:00'), clock), true, 'lowercase day still matches');
  eq(T.isSlotNow(slot(' Mon ', '09:00:00', '10:00:00'), clock), true, 'padded day still matches');

  // Malformed rows must render as ordinary rows, not throw or false-alarm.
  eq(T.isSlotNow(slot('Mon', null, '10:00:00'), clock), false, 'missing start is not now');
  eq(T.isSlotNow(slot('Mon', '09:00:00', null), clock), false, 'missing end is not now');
  eq(T.isSlotNow(slot('Mon', 'junk', '10:00:00'), clock), false, 'unparseable start is not now');
  eq(T.isSlotNow(slot('Mon', '10:00:00', '09:00:00'), clock), false, 'inverted interval is not now');
  eq(T.isSlotNow(slot('Mon', '09:00:00', '09:00:00'), clock), false, 'zero-length interval is not now');
  eq(T.isSlotNow(slot('', '09:00:00', '10:00:00'), clock), false, 'blank day is not now');
  eq(T.isSlotNow(null, clock), false, 'null slot is not now');
  eq(T.isSlotNow(slot('Mon', '09:00:00', '10:00:00'), null), false, 'null clock is not now');
  eq(T.isSlotNow(slot('Mon', '09:00:00', '10:00:00'), { weekday: 'Mon', minutes: NaN }), false, 'NaN minutes is not now');

  // Day edges. 23:59 is the last minute a day can express, and the exclusive
  // end means a class ending then is already over during that minute.
  eq(T.isSlotNow(slot('Mon', '00:00:00', '00:30:00'), { weekday: 'Mon', minutes: 0 }), true, 'midnight class runs at 00:00');
  eq(T.isSlotNow(slot('Mon', '23:30:00', '23:59:00'), { weekday: 'Mon', minutes: 1438 }), true, 'class runs at 23:58');
  eq(T.isSlotNow(slot('Mon', '23:30:00', '23:59:00'), { weekday: 'Mon', minutes: 1439 }), false, 'class is over at its exclusive 23:59 end');
})();

(() => {
  // parseSchedule & schedulesConflict
  eq(T.parseSchedule(null), null, 'null schedule is null');
  eq(T.parseSchedule(''), null, 'empty schedule is null');
  eq(T.parseSchedule('invalid text'), null, 'invalid schedule is null');

  const mwf = T.parseSchedule('MWF 9:00-10:00 AM');
  eq(mwf.days.join(','), 'M,W,F', 'MWF parsed to M,W,F');
  eq(mwf.startMin, 9 * 60, 'MWF start at 540 min');
  eq(mwf.endMin, 10 * 60, 'MWF end at 600 min');

  const tth = T.parseSchedule('TTH 1:00-2:30 PM');
  eq(tth.days.join(','), 'T,TH', 'TTH parsed to T,TH');
  eq(tth.startMin, 13 * 60, 'TTH start at 13:00 (780 min)');
  eq(tth.endMin, 14 * 60 + 30, 'TTH end at 14:30 (870 min)');

  const overlapMwf = T.parseSchedule('MWF 9:30-10:30 AM');
  eq(T.schedulesConflict(mwf, overlapMwf), true, 'overlapping MWF schedules conflict');
  eq(T.schedulesConflict(mwf, tth), false, 'MWF and TTH do not conflict');

  const adjacentMwf = T.parseSchedule('MWF 10:00-11:00 AM');
  eq(T.schedulesConflict(mwf, adjacentMwf), false, 'back-to-back schedules do not conflict');
})();

console.log(`\nschool datetime (Asia/Manila): ${passed} passed, ${failures.length} failed\n`);
if (failures.length) {
  for (const f of failures) console.error('  FAIL ' + f + '\n');
  process.exit(1);
}
