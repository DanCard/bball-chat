import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { selectGameCall } from '../lib/chat.js';
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
