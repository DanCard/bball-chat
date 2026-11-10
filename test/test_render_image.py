"""Tests for the Python panel renderer's expiry check.

The renderer no longer parses game dates: it compares the current time with the
`expires_at` timestamp the JS poller stores in status.json (see lib/game_time.js,
whose date/time rules are tested in test/game_time.test.js).

Run with: python3 -m unittest discover -s test   (also part of `npm test`)
"""
import os
import sys
import unittest
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
import render_image  # noqa: E402

# 3pm Pacific (PST) on Thu Nov 5, written the way JS toISOString() does
EXPIRES_AT = '2026-11-05T23:00:00.000Z'


def utc(hour, minute=0):
    return datetime(2026, 11, 5, hour, minute, tzinfo=timezone.utc)


class IsGameExpiredTest(unittest.TestCase):
    def test_not_expired_before_expires_at(self):
        call = {'basketball_count': 10, 'expires_at': EXPIRES_AT}
        self.assertFalse(render_image.is_game_expired(call, utc(22, 59)))

    def test_expired_after_expires_at(self):
        call = {'basketball_count': 10, 'expires_at': EXPIRES_AT}
        self.assertTrue(render_image.is_game_expired(call, utc(23, 1)))

    def test_compares_across_time_zones(self):
        from datetime import timedelta
        pacific = timezone(timedelta(hours=-8))
        call = {'expires_at': EXPIRES_AT}
        self.assertFalse(render_image.is_game_expired(call, datetime(2026, 11, 5, 14, 59, tzinfo=pacific)))
        self.assertTrue(render_image.is_game_expired(call, datetime(2026, 11, 5, 15, 1, tzinfo=pacific)))

    def test_missing_or_bad_expires_at_is_expired(self):
        self.assertTrue(render_image.is_game_expired({}))
        self.assertTrue(render_image.is_game_expired(None))
        self.assertTrue(render_image.is_game_expired({'basketball_count': 5}))
        self.assertTrue(render_image.is_game_expired({'expires_at': 'not a date'}))

    def test_renderer_no_longer_parses_dates(self):
        # Date rules live only in lib/game_time.js
        self.assertFalse(hasattr(render_image, 'GAME_EXPIRY_HOURS'))


class AuthErrorTest(unittest.TestCase):
    def test_no_error(self):
        status = {'spaces': {'mtv': {'active_call': None}, 'moffett': {}}}
        self.assertFalse(render_image.has_auth_error(status))

    def test_any_space_with_auth_error(self):
        status = {'spaces': {'mtv': {'auth_error': True}, 'moffett': {}}}
        self.assertTrue(render_image.has_auth_error(status))

    def test_non_auth_error_is_ignored(self):
        status = {'spaces': {'mtv': {'error': 'ENOTFOUND', 'auth_error': False}}}
        self.assertFalse(render_image.has_auth_error(status))

    def test_empty_status(self):
        self.assertFalse(render_image.has_auth_error({}))
        self.assertFalse(render_image.has_auth_error(None))


if __name__ == '__main__':
    unittest.main()
