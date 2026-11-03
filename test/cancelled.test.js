import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isCancelled } from '../lib/chat.js';

describe('Cancelled Game Call Detection', () => {
  it('detects bracketed cancelled tags', () => {
    assert.equal(isCancelled('[Cancelled] Game call for Tues, Nov 3, 1145a-115p @GARfield'), true);
    assert.equal(isCancelled('[CANCELLED] Pickup today'), true);
    assert.equal(isCancelled('[Canceled] Game call for Wednesday'), true);
    assert.equal(isCancelled('(Cancelled) Game call'), true);
    assert.equal(isCancelled('*Cancelled* Game call'), true);
  });

  it('detects leading cancellation phrases', () => {
    assert.equal(isCancelled('Cancelled: Game call for today'), true);
    assert.equal(isCancelled('Cancelled - Game call for Nov 3'), true);
    assert.equal(isCancelled('Canceling call for today due to rain'), true);
    assert.equal(isCancelled('Cancel the game today because of not enough people.'), true);
  });

  it('detects explicit cancellation phrases in text', () => {
    assert.equal(isCancelled('Game call canceled 😞'), true);
    assert.equal(isCancelled('Game Call Canceled 😞'), true);
    assert.equal(isCancelled('Not looking good canceling call 😞'), true);
    assert.equal(isCancelled('Game is cancelled due to rain'), true);
  });

  it('does not flag active game calls as cancelled', () => {
    assert.equal(isCancelled('Game call for Wed, Nov 4, 1145a-115p @GARfield'), false);
    assert.equal(isCancelled('Call for 5-7pm Monday Nov 2nd Pickup at MAT1'), false);
    assert.equal(isCancelled('Pickup at Garfield today 12pm'), false);
    assert.equal(isCancelled(null), false);
    assert.equal(isCancelled(''), false);
  });
});
