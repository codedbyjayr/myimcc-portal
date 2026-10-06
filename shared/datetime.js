/* =====================================================================
 * shared/datetime.js - school-local time handling.
 *
 * Iligan Medical Center College is in Asia/Manila (UTC+8, no daylight saving).
 * Two things follow from that, and both are easy to get wrong:
 *
 *  1. A wall-clock time a student types ("9:00 AM") is a *Manila* wall-clock
 *     time. Storing it as a naive timestamp or as free text loses the zone and
 *     cannot be sorted, compared or checked for double-booking.
 *
 *  2. A stored instant must be *displayed* in Manila, not in the browser's
 *     zone. A student or staff member whose laptop is set to another zone --
 *     or set wrong -- would otherwise read a different appointment time than
 *     the one staff confirmed.
 *
 * Everything here goes through Intl with an explicit timeZone, so it does not
 * depend on the machine's locale or zone setting. The offset is computed per
 * instant rather than assumed to be a constant, which keeps this correct if
 * the rules ever change.
 * ===================================================================== */
(function (global) {
  'use strict';

  const SCHOOL_TIME_ZONE = 'Asia/Manila';
  const SCHOOL_TIME_ZONE_LABEL = 'Manila';

  /** Parts of an instant as observed in the school time zone. */
  function zonedParts(date, timeZone) {
    const dtf = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || SCHOOL_TIME_ZONE,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const out = {};
    for (const part of dtf.formatToParts(date)) {
      if (part.type !== 'literal') out[part.type] = part.value;
    }
    return {
      year: Number(out.year),
      month: Number(out.month),
      day: Number(out.day),
      hour: Number(out.hour) % 24,
      minute: Number(out.minute),
      second: Number(out.second)
    };
  }

  /**
   * Offset in milliseconds to add to UTC to get school-local time.
   * Positive for zones ahead of UTC, so Manila yields +8h.
   */
  function zoneOffsetMs(date, timeZone) {
    const p = zonedParts(date, timeZone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    // Compare at whole-second resolution: Intl drops milliseconds, so the
    // raw difference would otherwise include the caller's own ms.
    return asUtc - Math.floor(date.getTime() / 1000) * 1000;
  }

  /**
   * Convert a school-local wall-clock date and time into an absolute instant.
   *
   * @param {string} dateStr  YYYY-MM-DD as shown in a date input
   * @param {string} timeStr  HH:MM, 24-hour, as shown in a time input
   * @returns {string|null}   ISO 8601 UTC instant, or null if unparseable
   */
  function schoolLocalToIso(dateStr, timeStr) {
    if (!dateStr || !timeStr) return null;

    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr).trim());
    const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(String(timeStr).trim());
    if (!dateMatch || !timeMatch) return null;

    const [, y, mo, d] = dateMatch.map(Number);
    const [, h, mi] = timeMatch.map(Number);
    if (h > 23 || mi > 59) return null;

    // First approximation: read the wall clock as if it were UTC.
    const guess = Date.UTC(y, mo - 1, d, h, mi, 0);

    // Then correct by the zone offset *at that moment*. Using the corrected
    // instant matters near a transition, so resolve once more.
    let offset = zoneOffsetMs(new Date(guess));
    const firstPass = new Date(guess - offset);
    offset = zoneOffsetMs(firstPass);

    const result = new Date(guess - offset);
    if (Number.isNaN(result.getTime())) return null;
    return result.toISOString();
  }

  /** Today's date in the school zone, as YYYY-MM-DD. */
  function schoolToday(timeZone) {
    const p = zonedParts(new Date(), timeZone);
    return [
      String(p.year).padStart(4, '0'),
      String(p.month).padStart(2, '0'),
      String(p.day).padStart(2, '0')
    ].join('-');
  }

  /** The current instant, shifted into the school zone, for min/max on inputs. */
  function schoolNowParts(timeZone) {
    return zonedParts(new Date(), timeZone);
  }

  /** Three-letter weekday labels, matching timetable.day_of_week. */
  const WEEKDAY_LABELS = Object.freeze(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);

  /**
   * The current instant as a school-local weekday and minutes since midnight.
   *
   * Used to mark the class a student is sitting in right now. It has to be
   * computed in the school zone: a browser in another country would otherwise
   * highlight the wrong class, or none.
   *
   * The weekday comes from feeding the already-shifted parts to Date.UTC and
   * reading getUTCDay, rather than a second Intl formatToParts call. getUTC*
   * cannot be dragged sideways by the host's own offset, so this stays correct
   * wherever the browser or the test runner happens to be.
   */
  function schoolNowClock(timeZone) {
    const zone = timeZone || SCHOOL_TIME_ZONE;
    const p = zonedParts(new Date(), zone);
    const dayIndex = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
    return {
      weekday: WEEKDAY_LABELS[dayIndex],
      minutes: p.hour * 60 + p.minute,
      year: p.year,
      month: p.month,
      day: p.day,
      zone
    };
  }

  /**
   * Minutes since midnight for a Postgres "HH:MM" or "HH:MM:SS" value, or
   * null if it is not a time. Returns null rather than 0 for junk so callers
   * fail closed and render "no time" instead of midnight.
   */
  function timeToMinutes(value) {
    const match = /^(\d{1,2}):(\d{2})/.exec(String(value == null ? '' : value).trim());
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
  }

  /**
   * Is a timetable slot running at a given clock reading?
   *
   * The clock is passed in rather than read here, so this is pure and can be
   * tested without waiting for a class to actually start. Pass what
   * schoolNowClock() returns.
   *
   * The interval is half-open, [start, end): a 09:00-10:00 class is running at
   * 09:00 and finished at 10:00, so a back-to-back changeover never lights up
   * two rows at once. Note the corollary, which is intended: at minute
   * granularity a class ending 23:59 is not highlighted during 23:59.
   *
   * Returns false for missing or nonsensical times rather than throwing, so a
   * malformed row renders as an ordinary row instead of blanking the table.
   */
  function isSlotNow(slot, clock) {
    if (!slot || !clock) return false;

    const startMin = timeToMinutes(slot.start_time);
    const endMin = timeToMinutes(slot.end_time);
    if (startMin === null || endMin === null) return false;
    if (endMin <= startMin) return false;

    const day = String(slot.day_of_week == null ? '' : slot.day_of_week).trim().toLowerCase();
    if (!day) return false;
    if (day !== String(clock.weekday == null ? '' : clock.weekday).trim().toLowerCase()) return false;

    const minutes = Number(clock.minutes);
    if (!Number.isFinite(minutes)) return false;

    return minutes >= startMin && minutes < endMin;
  }

  /**
   * Format an instant for display, always in the school zone.
   * Never falls back to the browser's locale for the zone.
   */
  function formatSchoolDateTime(value, opts) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';

    const options = opts && typeof opts === 'object' ? opts : {};
    const dtf = new Intl.DateTimeFormat('en-PH', {
      timeZone: options.timeZone || SCHOOL_TIME_ZONE,
      dateStyle: options.dateStyle || 'medium',
      timeStyle: options.timeStyle || 'short'
    });
    return dtf.format(date) + ' ' + SCHOOL_TIME_ZONE_LABEL;
  }

  function formatSchoolDate(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('en-PH', {
      timeZone: SCHOOL_TIME_ZONE,
      dateStyle: 'medium'
    }).format(date);
  }

  function formatSchoolTime(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('en-PH', {
      timeZone: SCHOOL_TIME_ZONE,
      timeStyle: 'short'
    }).format(date);
  }

  /**
   * True when the instant has already passed, judged in school time so the
   * answer does not change with the viewer's clock.
   */
  function isPast(value, timeZone) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return false;
    const nowOffset = zoneOffsetMs(new Date());
    return date.getTime() - nowOffset <= Date.now() - zoneOffsetMs(new Date());
  }

  /** Human distance, e.g. "in 2 days", judged in school time. */
  function relativeToNow(value, timeZone) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';

    // Both sides are floored to the minute in the school zone, so a booking
    // an hour away never reads as "in 0 minutes" because of seconds.
    const target = Math.floor((date.getTime() - zoneOffsetMs(date)) / 60000);
    const now = Math.floor((Date.now() - zoneOffsetMs(new Date())) / 60000);
    const minutes = target - now;

    const abs = Math.abs(minutes);
    if (abs < 1) return 'now';
    if (abs < 60) return minutes > 0 ? `in ${abs} min` : `${abs} min ago`;

    const hours = Math.round(abs / 60);
    if (hours < 24) return minutes > 0 ? `in ${hours} hr` : `${hours} hr ago`;

    const days = Math.round(hours / 24);
    if (days <= 14) return minutes > 0 ? `in ${days} day${days === 1 ? '' : 's'}` : `${days} day${days === 1 ? '' : 's'} ago`;
    return formatSchoolDate(date);
  }

  /**
   * Parse a course schedule string (e.g. "MWF 9:00-10:00 AM" or "TTH 1:00-2:30 PM")
   * into days and start/end minutes from midnight.
   */
  function parseSchedule(scheduleStr) {
    if (!scheduleStr) return null;
    const s = scheduleStr.trim().toUpperCase();
    const match = s.match(/^([A-Z]{1,4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)?\s*[-–]\s*(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (!match) return null;

    const dayStr = match[1];
    let startH = parseInt(match[2], 10);
    const startM = parseInt(match[3], 10);
    let startMeridiem = match[4];
    let endH = parseInt(match[5], 10);
    const endM = parseInt(match[6], 10);
    const endMeridiem = match[7];

    if (!startMeridiem && endMeridiem) {
      startMeridiem = (startH < endH || startH === 12) ? endMeridiem : (endMeridiem === 'PM' ? 'AM' : 'PM');
    }
    if (startMeridiem === 'PM' && startH < 12) startH += 12;
    if (startMeridiem === 'AM' && startH === 12) startH = 0;
    if (endMeridiem === 'PM' && endH < 12) endH += 12;
    if (endMeridiem === 'AM' && endH === 12) endH = 0;

    let days = [];
    if (dayStr === 'TTH' || dayStr === 'TH') days = dayStr === 'TTH' ? ['T', 'TH'] : ['TH'];
    else if (dayStr === 'MWF') days = ['M', 'W', 'F'];
    else if (dayStr === 'MW') days = ['M', 'W'];
    else days = dayStr.split('');

    return { days, startMin: startH * 60 + startM, endMin: endH * 60 + endM };
  }

  function schedulesConflict(a, b) {
    if (!a || !b) return false;
    const sharedDays = a.days.some(d => b.days.includes(d));
    if (!sharedDays) return false;
    return a.startMin < b.endMin && b.startMin < a.endMin;
  }

  const api = {
    SCHOOL_TIME_ZONE,
    SCHOOL_TIME_ZONE_LABEL,
    WEEKDAY_LABELS,
    zonedParts,
    zoneOffsetMs,
    schoolLocalToIso,
    schoolToday,
    schoolNowParts,
    schoolNowClock,
    timeToMinutes,
    isSlotNow,
    formatSchoolDateTime,
    formatSchoolDate,
    formatSchoolTime,
    isPast,
    relativeToNow,
    parseSchedule,
    schedulesConflict
  };

  global.SCHOOLTIME = api;
  global.parseSchedule = parseSchedule;
  global.schedulesConflict = schedulesConflict;
  global.IMCC = Object.assign(global.IMCC || {}, api);
})(typeof window !== 'undefined' ? window : globalThis);
