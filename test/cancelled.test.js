import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isCancelled, isCallRequest } from '../lib/chat.js';

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

describe('Game Call Request Detection', () => {
  it('detects requests for someone else to post the call', () => {
    assert.equal(isCallRequest("heads up i'm in SLC for the k8s conference next week so someone else do the game call"), true);
    assert.equal(isCallRequest('Can someone post the call tomorrow?'), true);
    assert.equal(isCallRequest('anyone want to do the game call for Friday?'), true);
    assert.equal(isCallRequest('who can make the call today'), true);
  });

  it('does not flag actual game calls', () => {
    assert.equal(isCallRequest('Game call for Fri, Nov 6 1130a-130p @PSB'), false);
    assert.equal(isCallRequest('GAME CALL Tomorrow Thursday at Garfield at noon'), false);
    assert.equal(isCallRequest('call for run today 5-7pm at MAT1'), false);
  });
});
