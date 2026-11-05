import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isGameExpired, getGameEndDate, getGameExpiresAt, isGameToday } from '../lib/game_time.js';
import { formatGenmonXml } from '../lib/format.js';

describe('Game Time & Expiration (> 2 hours past)', () => {
  it('correctly parses game end dates for various time formats', () => {
    // 1145a-115p on Nov 2, 2026
    const call1 = {
      text: 'Game call for Mon, Nov 2, 1145a-115p @GARfield',
      create_time: '2026-11-02T02:00:00Z'
    };
    const end1 = getGameEndDate(call1);
    assert.equal(end1.getMonth(), 10); // November (0-indexed)
    assert.equal(end1.getDate(), 2);
    assert.equal(end1.getHours(), 13);
    assert.equal(end1.getMinutes(), 15);

    // 1130a-130p on Oct 30, 2026
    const call2 = {
      text: 'Game call for Fri, Oct 30, 1130a-130p @PSB',
      create_time: '2026-10-28T20:00:00Z'
    };
    const end2 = getGameEndDate(call2);
    assert.equal(end2.getMonth(), 9); // October
    assert.equal(end2.getDate(), 30);
    assert.equal(end2.getHours(), 13);
    assert.equal(end2.getMinutes(), 30);

    // 5-7pm on Wed Jun 10
    const call3 = {
      text: 'call for run today 5-7pm at MAT1',
      create_time: '2026-06-10T12:00:00Z'
    };
    const refDate = new Date(2026, 5, 10, 12, 0, 0); // Jun 10 2026
    const end3 = getGameEndDate(call3, refDate);
    assert.equal(end3.getHours(), 19);
    assert.equal(end3.getMinutes(), 0);

    // Noon call
    const callNoon = {
      text: 'Game call for Friday at noon @GARfield',
      create_time: '2026-11-06T10:00:00Z'
    };
    const endNoon = getGameEndDate(callNoon);
    assert.equal(endNoon.getHours(), 13);
    assert.equal(endNoon.getMinutes(), 0);
  });

  it('marks a game as active while ongoing and within 2 hours after game end', () => {
    const call = {
      text: 'Game call for Mon, Nov 2, 1145a-115p @GARfield',
      create_time: '2026-11-02T02:00:00Z'
    };

    // Nov 2 at 12:30 PM (game ongoing)
    const tOngoing = new Date(2026, 10, 2, 12, 30, 0);
    assert.equal(isGameExpired(call, tOngoing), false, 'Ongoing game should not be past');

    // Nov 2 at 2:00 PM (45 min after game end 1:15 PM)
    const t45mPast = new Date(2026, 10, 2, 14, 0, 0);
    assert.equal(isGameExpired(call, t45mPast), false, '45 min past end should not be expired');

    // Nov 2 at 3:14 PM (1 hour 59 min after game end 1:15 PM)
    const t1h59mPast = new Date(2026, 10, 2, 15, 14, 0);
    assert.equal(isGameExpired(call, t1h59mPast), false, '1h 59m past end should not be expired');
  });

  it('marks a game as expired once more than 2 hours have elapsed past game time', () => {
    const call = {
      text: 'Game call for Mon, Nov 2, 1145a-115p @GARfield',
      create_time: '2026-11-02T02:00:00Z'
    };

    // Nov 2 at 3:16 PM (2 hours 1 min after game end 1:15 PM)
    const t2h1mPast = new Date(2026, 10, 2, 15, 16, 0);
    assert.equal(isGameExpired(call, t2h1mPast), true, '2h 1m past end must be expired');

    // Nov 2 at 8:00 PM (evening)
    const tEvening = new Date(2026, 10, 2, 20, 0, 0);
    assert.equal(isGameExpired(call, tEvening), true, 'Evening time must be expired');

    // Next day Nov 3
    const tNextDay = new Date(2026, 10, 3, 10, 0, 0);
    assert.equal(isGameExpired(call, tNextDay), true, 'Next day must be expired');
  });

  it('marks past days (e.g. Oct 30 on Nov 2) as expired', () => {
    const moffettCall = {
      text: 'Game call for Fri, Oct 30, 1130a-130p @PSB ... partly cloudy',
      create_time: '2026-10-28T20:11:28Z'
    };
    const nowNov2 = new Date(2026, 10, 2, 10, 0, 0);
    assert.equal(isGameExpired(moffettCall, nowNov2), true, 'Call from Oct 30 on Nov 2 must be expired');
  });
});

// A game call that is always "today" and not yet over, whenever the tests run
const TODAY_CALL_TEXT = 'Game call today, 9p-1159p @GARfield';

describe('Popup & List Tooltip Integration (> 2h past filtering)', () => {
  it('does not list an expired game in the Genmon popup tooltip', () => {
    const statusData = {
      updated_at: new Date().toISOString(),
      spaces: {
        mtv: {
          active_call: {
            text: TODAY_CALL_TEXT,
            create_time: new Date().toISOString(),
            basketball_count: 8,
            plus_count: 1,
            question_count: 2,
            attendees: ['Henry Wong', 'Colin Le', 'Ricky Schwartz', 'Jiahao Cao', 'Daniel Cardenas', 'Steven Margarit', 'wesley c', '+1'],
            maybes: ['Henley Kuang', 'Yu Liu'],
            sender: 'wesley c'
          }
        },
        moffett: {
          active_call: {
            text: 'Game call for Fri, Oct 30, 1130a-130p @PSB',
            create_time: '2026-10-28T20:11:28Z',
            basketball_count: 11,
            question_count: 2,
            attendees: ['Kaushik Roy', 'Jeff Kaganovsky'],
            maybes: ['Thomas Pan'],
            sender: 'wesley c'
          }
        }
      }
    };

    const xml = formatGenmonXml(statusData, { mode: 'all', layout: 'stacked' });

    // MTV (today) should be listed
    assert.match(xml, /Lunch bball MTV/);
    assert.match(xml, /RSVP: 8 🏀/);
    assert.match(xml, /Attendees: Henry Wong/);

    // Moffett (Oct 30, > 2h past) MUST NOT be listed with call details, RSVP or attendees
    assert.match(xml, /Moffett Place: No active game call found/);
    assert.doesNotMatch(xml, /Oct 30/);
    assert.doesNotMatch(xml, /RSVP: 11 🏀/);
    assert.doesNotMatch(xml, /Kaushik Roy/);
  });

  it('shows "No active game call" for single-site popup if the game is expired', () => {
    const statusData = {
      updated_at: new Date().toISOString(),
      spaces: {
        moffett: {
          url: 'https://chat.google.com/room/AAAAA-GT-Xc',
          active_call: {
            text: 'Game call for Fri, Oct 30, 1130a-130p @PSB',
            create_time: '2026-10-28T20:11:28Z',
            basketball_count: 11,
            attendees: ['Kaushik Roy']
          }
        }
      }
    };

    const xmlMoffett = formatGenmonXml(statusData, { mode: 'moffett', orientation: 'rotated' }, 'moffett');
    assert.match(xmlMoffett, /No active game call/);
    assert.doesNotMatch(xmlMoffett, /RSVP: 11/);
    assert.doesNotMatch(xmlMoffett, /Kaushik Roy/);
  });
});

describe('CLI List Output (> 2h past filtering)', () => {
  it('excludes games > 2h past from CLI status and attendees output', async () => {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const fs = await import('node:fs');
    const path = await import('node:path');
    const os = await import('node:os');
    const execFileAsync = promisify(execFile);

    const bballBin = new URL('../bin/bball', import.meta.url).pathname;
    // Run against a throwaway HOME so the real ~/.cache and ~/.config are never touched
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'bball-test-'));
    const cacheFile = path.join(tmpHome, '.cache', 'bball-chat', 'status.json');
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    const execOpts = { env: { ...process.env, HOME: tmpHome } };

    try {
      // Write mock fixture: MTV active today, Moffett expired (Oct 30)
      const mockStatus = {
        updated_at: new Date().toISOString(),
        spaces: {
          mtv: {
            active_call: {
              text: TODAY_CALL_TEXT,
              create_time: new Date().toISOString(),
              basketball_count: 8,
              plus_count: 1,
              question_count: 2,
              attendees: ['Henry Wong', 'Colin Le', 'Ricky Schwartz', 'Jiahao Cao', 'Daniel Cardenas', 'Steven Margarit', 'wesley c', '+1'],
              maybes: ['Henley Kuang', 'Yu Liu'],
              sender: 'wesley c'
            }
          },
          moffett: {
            active_call: {
              text: 'Game call for Fri, Oct 30, 1130a-130p @PSB',
              create_time: '2026-10-28T20:11:28Z',
              basketball_count: 11,
              question_count: 2,
              attendees: ['Kaushik Roy', 'Jeff Kaganovsky'],
              maybes: ['Thomas Pan'],
              sender: 'wesley c'
            }
          }
        }
      };
      fs.writeFileSync(cacheFile, JSON.stringify(mockStatus, null, 2), 'utf8');

      // Test 'bball status'
      const { stdout: statusOut } = await execFileAsync(process.execPath, [bballBin, 'status'], execOpts);
      // MTV (today) is active
      assert.match(statusOut, /1\. Lunch bball MTV:/);
      assert.match(statusOut, /RSVP Count : 8 🏀/);
      assert.match(statusOut, /Henry Wong/);

      // Moffett (Oct 30) is expired and must show 'No active game call.'
      assert.match(statusOut, /2\. Moffett Place Basketball:\s+No active game call\./);
      assert.doesNotMatch(statusOut, /Oct 30/);
      assert.doesNotMatch(statusOut, /Kaushik Roy/);

      // Test 'bball attendees'
      const { stdout: attOut } = await execFileAsync(process.execPath, [bballBin, 'attendees'], execOpts);
      assert.match(attOut, /• Lunch bball MTV:/);
      assert.match(attOut, /• Moffett Place Basketball:\s+No active game call\./);
      assert.doesNotMatch(attOut, /Kaushik Roy/);
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true });
    }
  });
});

describe('isGameToday', () => {
  const call = {
    text: 'GAME CALL Tomorrow Thursday at Garfield at noon',
    create_time: new Date(2026, 10, 4, 18, 0).toISOString() // posted Wed Nov 4
  };
  it('treats a "tomorrow" call posted yesterday as today', () => {
    assert.equal(isGameToday(call, new Date(2026, 10, 5, 9, 0)), true);
  });
  it('is not today on the day it was posted', () => {
    assert.equal(isGameToday(call, new Date(2026, 10, 4, 20, 0)), false);
  });
});

describe('expires_at (shared expiry timestamp)', () => {
  const call = {
    text: 'GAME CALL Tomorrow Thursday at Garfield at noon',
    create_time: new Date(2026, 10, 4, 18, 0).toISOString() // posted Wed Nov 4
  };

  it('is 2 hours after the game end (noon game ends 1pm -> 3pm)', () => {
    assert.equal(getGameExpiresAt(call).getTime(), new Date(2026, 10, 5, 15, 0).getTime());
  });

  it('isGameExpired uses the stored expires_at over the message text', () => {
    // Text alone would say expired on Nov 6; a stored expires_at wins
    const stored = { ...call, expires_at: new Date(2026, 10, 7, 0, 0).toISOString() };
    assert.equal(isGameExpired(stored, new Date(2026, 10, 6, 12, 0)), false);
    assert.equal(isGameExpired(call, new Date(2026, 10, 6, 12, 0)), true);
  });

  it('isGameExpired treats an invalid expires_at as expired', () => {
    assert.equal(isGameExpired({ expires_at: 'garbage' }, new Date(2026, 10, 5, 12, 0)), true);
  });
});
