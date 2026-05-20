import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  sanitizeCalendarRedirectPath,
  createCalendarOAuthState,
  verifyCalendarOAuthState,
  sealCalendarRefreshToken,
  openCalendarRefreshToken,
  getCalendarAuthFailure,
} from './calendar-oauth';

test('sanitizeCalendarRedirectPath keeps safe in-app paths and rejects unsafe redirects', () => {
  assert.equal(sanitizeCalendarRedirectPath('/shiftly/calendar?connected=1'), '/shiftly/calendar?connected=1');
  assert.equal(sanitizeCalendarRedirectPath('https://evil.example/phish'), '/shiftly/calendar');
  assert.equal(sanitizeCalendarRedirectPath('/calendar'), '/shiftly/calendar');
});

test('createCalendarOAuthState and verifyCalendarOAuthState round-trip and detect tampering', () => {
  const state = createCalendarOAuthState({
    userId: 'user-123',
    redirectPath: '/shiftly/calendar?from=oauth',
    secret: 'test-secret',
    now: new Date('2026-05-20T00:00:00.000Z'),
  });

  assert.deepEqual(
    verifyCalendarOAuthState(state, {
      secret: 'test-secret',
      now: new Date('2026-05-20T00:05:00.000Z'),
    }),
    {
      userId: 'user-123',
      redirectPath: '/shiftly/calendar?from=oauth',
    }
  );

  assert.equal(
    verifyCalendarOAuthState(`${state}tampered`, {
      secret: 'test-secret',
      now: new Date('2026-05-20T00:05:00.000Z'),
    }),
    null
  );

  assert.equal(
    verifyCalendarOAuthState(state, {
      secret: 'test-secret',
      now: new Date('2026-05-20T00:16:00.000Z'),
    }),
    null
  );
});

test('sealCalendarRefreshToken hides the token and openCalendarRefreshToken restores it', () => {
  const sealed = sealCalendarRefreshToken('refresh-token-123', 'test-secret');

  assert.notEqual(sealed, 'refresh-token-123');
  assert.equal(openCalendarRefreshToken(sealed, 'test-secret'), 'refresh-token-123');
  assert.equal(openCalendarRefreshToken(sealed, 'different-secret'), null);
});

test('getCalendarAuthFailure returns safe reconnect guidance for expired Google credentials', () => {
  assert.deepEqual(
    getCalendarAuthFailure({
      code: 401,
      message: 'invalid_grant',
      errors: [{ message: 'invalid_grant' }],
    }),
    {
      status: 401,
      message: 'Google Calendar connection expired or was revoked. Reconnect Google Calendar and try again.',
      shouldClearStoredToken: true,
    }
  );
});
