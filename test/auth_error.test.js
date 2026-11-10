import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isAuthError } from '../lib/auth.js';

describe('isAuthError', () => {
  it('flags a 401 from the Chat API', () => {
    assert.equal(isAuthError(new Error('Failed to fetch messages for spaces/X (401): {"status": "UNAUTHENTICATED"}')), true);
  });
  it('flags a revoked refresh token', () => {
    assert.equal(isAuthError(new Error('Token refresh failed with status 400: {"error":"invalid_grant"}')), true);
  });
  it('flags missing credentials', () => {
    assert.equal(isAuthError(new Error('No main-account token found in keyring (gemini-cli-workspace-oauth) or /x')), true);
  });
  it('ignores network and server errors', () => {
    assert.equal(isAuthError(new Error('getaddrinfo ENOTFOUND chat.googleapis.com')), false);
    assert.equal(isAuthError(new Error('Failed to fetch messages for spaces/X (503): Service Unavailable')), false);
  });
});
