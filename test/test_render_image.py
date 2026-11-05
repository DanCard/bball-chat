"""Tests for the Python panel renderer's game-expiry logic.

Run with: python3 -m unittest discover -s test   (also part of `npm test`)
"""
import os
import sys
import unittest
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
import render_image  # noqa: E402

TZ = datetime.now().astimezone().tzinfo


def at(month, day, hour, minute=0):
    return datetime(2026, month, day, hour, minute, tzinfo=TZ)


class IsGameExpiredTest(unittest.TestCase):
    def test_expiry_is_two_hours(self):
        self.assertEqual(render_image.GAME_EXPIRY_HOURS, 2)

    def test_range_call_expires_two_hours_after_end(self):
        call = {'text': 'Game call for Mon, Nov 2, 1145a-115p @GARfield',
                'create_time': at(11, 1, 18).isoformat()}
        self.assertFalse(render_image.is_game_expired(call, at(11, 2, 12, 30)))  # ongoing
        self.assertFalse(render_image.is_game_expired(call, at(11, 2, 15, 14)))  # 1h59m past end
        self.assertTrue(render_image.is_game_expired(call, at(11, 2, 15, 16)))   # 2h01m past end

    def test_tomorrow_is_relative_to_post_time(self):
        # Posted Wed Nov 4 evening for "tomorrow" (Thu Nov 5); noon game ends 1pm
        call = {'text': 'GAME CALL Tomorrow Thursday at Garfield at noon',
                'create_time': at(11, 4, 18).isoformat()}
        self.assertFalse(render_image.is_game_expired(call, at(11, 4, 20)))      # day before
        self.assertFalse(render_image.is_game_expired(call, at(11, 5, 12)))      # game day
        self.assertFalse(render_image.is_game_expired(call, at(11, 5, 14, 59)))  # 1h59m past end
        self.assertTrue(render_image.is_game_expired(call, at(11, 5, 15, 1)))    # 2h01m past end

    def test_today_is_relative_to_post_time(self):
        call = {'text': 'call for run today 5-7pm at MAT1',
                'create_time': at(11, 3, 9).isoformat()}
        self.assertFalse(render_image.is_game_expired(call, at(11, 3, 18)))
        self.assertTrue(render_image.is_game_expired(call, at(11, 4, 10)))       # next day


if __name__ == '__main__':
    unittest.main()
