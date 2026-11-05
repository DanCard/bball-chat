import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { selectGameCall, isTrackedGameCall } from '../lib/chat.js';
import { getGameEndDate } from '../lib/game_time.js';

function cand(text, create_time, now) {
  return { text, msg: { createTime: create_time }, gameEnd: getGameEndDate({ text, create_time }, now) };
}

describe('selectGameCall', () => {
  // Newest first, as returned by the Chat API
  const tomorrowText = 'GAME CALL Tomorrow Thursday at Garfield at noon';
  const todayText = 'Game call for Wed, Nov 4, 1145a-115p @GARfield';
  const build = (now) => [
    cand(tomorrowText, '2026-11-04T18:20:32Z', now),
    cand(todayText, '2026-11-02T22:01:34Z', now)
  ];

  it("follows today's game before it ends, even if tomorrow's call is newer", () => {
    const now = new Date(2026, 10, 4, 10, 37);
    assert.equal(selectGameCall(build(now), now).text, todayText);
  });

  it("advances to tomorrow's call once today's game has ended", () => {
    const now = new Date(2026, 10, 4, 13, 30);
    assert.equal(selectGameCall(build(now), now).text, tomorrowText);
  });

  it('resolves "tomorrow" relative to the post date, not the current date', () => {
    const now = new Date(2026, 10, 5, 9, 0); // Thursday morning
    const c = selectGameCall(build(now), now);
    assert.equal(c.text, tomorrowText);
    assert.equal(c.gameEnd.getDate(), 5);
  });

  it('falls back to the most recent call when all games are over', () => {
    const now = new Date(2026, 10, 6, 9, 0);
    assert.equal(selectGameCall(build(now), now).text, tomorrowText);
  });

  it('returns null with no candidates', () => {
    assert.equal(selectGameCall([]), null);
  });
});

describe('isTrackedGameCall', () => {
  it('ignores messages with zero RSVPs, even if they look like a game call', () => {
    assert.equal(isTrackedGameCall('Game call for Fri, Nov 6 1130a-130p @PSB', 0), false);
  });
  it('tracks a game call with RSVPs', () => {
    assert.equal(isTrackedGameCall('Game call for Fri, Nov 6 1130a-130p @PSB', 8), true);
  });
  it('ignores a request for someone else to do the call, even with reactions', () => {
    assert.equal(isTrackedGameCall("heads up i'm in SLC next week so someone else do the game call", 2), false);
  });
  it('ignores cancelled calls, even with reactions', () => {
    assert.equal(isTrackedGameCall('[Cancelled] Game call for Tues, Nov 3, 1145a-115p @GARfield', 5), false);
  });
});
