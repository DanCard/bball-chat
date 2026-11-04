const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
};

const DAYS_OF_WEEK = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6
};

/**
 * Parses end time from text. Supports formats like:
 * "-115p", "- 1:30pm", "-7p", "noon", "at 11:45"
 */
function parseEndTime(text) {
  const lower = text.toLowerCase();
  const mRange = lower.match(/-\s*(\d{1,4}(?::\d{2})?)\s*(a|p|am|pm)?\b/);
  if (mRange) {
    const timeStr = mRange[1];
    const meridiem = (mRange[2] || '').toLowerCase();
    let h = 0, m = 0;
    if (timeStr.includes(':')) {
      const parts = timeStr.split(':');
      h = parseInt(parts[0], 10);
      m = parseInt(parts[1], 10);
    } else if (timeStr.length === 3) {
      h = parseInt(timeStr.slice(0, 1), 10);
      m = parseInt(timeStr.slice(1), 10);
    } else if (timeStr.length === 4) {
      h = parseInt(timeStr.slice(0, 2), 10);
      m = parseInt(timeStr.slice(2), 10);
    } else {
      h = parseInt(timeStr, 10);
      m = 0;
    }
    if (meridiem.includes('p') && h < 12) {
      h += 12;
    } else if (!meridiem && h < 7) {
      h += 12;
    }
    return { hour: h, minute: m };
  }

  if (lower.includes('noon')) {
    return { hour: 13, minute: 0 };
  }

  const mStart = lower.match(/(?:at|@)\s*(\d{1,4}(?::\d{2})?)\s*(a|p|am|pm)?\b/);
  if (mStart) {
    const timeStr = mStart[1];
    const meridiem = (mStart[2] || '').toLowerCase();
    let h = 0, m = 0;
    if (timeStr.includes(':')) {
      const parts = timeStr.split(':');
      h = parseInt(parts[0], 10);
      m = parseInt(parts[1], 10);
    } else if (timeStr.length === 3) {
      h = parseInt(timeStr.slice(0, 1), 10);
      m = parseInt(timeStr.slice(1), 10);
    } else if (timeStr.length === 4) {
      h = parseInt(timeStr.slice(0, 2), 10);
      m = parseInt(timeStr.slice(2), 10);
    } else {
      h = parseInt(timeStr, 10);
      m = 0;
    }
    if (meridiem.includes('p') && h < 12) {
      h += 12;
    } else if (!meridiem && h < 7) {
      h += 12;
    }
    return { hour: h + 1, minute: m };
  }

  return { hour: 13, minute: 0 };
}

/**
 * Calculates the scheduled end Date of a game call.
 * @param {object} call Call object with `text` and optional `create_time`.
 * @param {Date} [now] Reference date (default: new Date()).
 * @returns {Date|null}
 */
export function getGameEndDate(call, now = new Date()) {
  if (!call || typeof call !== 'object') return null;

  const text = call.text || '';
  const createTimeStr = call.create_time || '';
  if (!text && !createTimeStr) return null;

  let msgDate = null;
  if (createTimeStr) {
    const d = new Date(createTimeStr);
    if (!isNaN(d.getTime())) msgDate = d;
  }

  const lower = text.toLowerCase();
  const refDate = msgDate || now;

  let gameYear = refDate.getFullYear();
  let gameMonth = refDate.getMonth();
  let gameDay = refDate.getDate();
  let dateFound = false;

  if (lower.includes('today')) {
    gameYear = refDate.getFullYear();
    gameMonth = refDate.getMonth();
    gameDay = refDate.getDate();
    dateFound = true;
  } else if (/\b(?:tomorrow|tmrw)\b/.test(lower)) {
    const tomorrow = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate() + 1);
    gameYear = tomorrow.getFullYear();
    gameMonth = tomorrow.getMonth();
    gameDay = tomorrow.getDate();
    dateFound = true;
  }

  if (!dateFound) {
    const mMonth = lower.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/);
    if (mMonth) {
      const monthKey = mMonth[1].slice(0, 3);
      if (MONTHS[monthKey] !== undefined) {
        gameMonth = MONTHS[monthKey];
        gameDay = parseInt(mMonth[2], 10);
        gameYear = refDate.getFullYear();
        dateFound = true;
      }
    }
  }

  if (!dateFound) {
    const mSlash = lower.match(/\b(\d{1,2})\/(\d{1,2})\b/);
    if (mSlash) {
      const m = parseInt(mSlash[1], 10);
      const d = parseInt(mSlash[2], 10);
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        gameMonth = m - 1;
        gameDay = d;
        gameYear = refDate.getFullYear();
        dateFound = true;
      }
    }
  }

  if (!dateFound) {
    for (const [dowName, targetDow] of Object.entries(DAYS_OF_WEEK)) {
      const regex = new RegExp(`\\b${dowName}\\b`);
      if (regex.test(lower)) {
        const refDow = refDate.getDay();
        const diffDays = (targetDow - refDow + 7) % 7;
        const targetDate = new Date(refDate.getTime() + diffDays * 24 * 3600 * 1000);
        gameYear = targetDate.getFullYear();
        gameMonth = targetDate.getMonth();
        gameDay = targetDate.getDate();
        dateFound = true;
        break;
      }
    }
  }

  const { hour, minute } = parseEndTime(text);
  return new Date(gameYear, gameMonth, gameDay, hour, minute, 0, 0);
}

/**
 * Checks whether a game call is more than 3 hours past its scheduled end time.
 * @param {object} call Call object with `text` and optional `create_time`.
 * @param {Date} [now] Current date/time (defaults to new Date()).
 * @returns {boolean} True if > 3 hours past end time, or if invalid.
 */
export function isGameMoreThan3hPast(call, now = new Date()) {
  if (!call || typeof call !== 'object') return true;
  const gameEnd = getGameEndDate(call, now);
  if (!gameEnd) return true;

  const diffHours = (now.getTime() - gameEnd.getTime()) / (1000 * 60 * 60);
  return diffHours > 3.0;
}
