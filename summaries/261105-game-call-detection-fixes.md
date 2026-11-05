# 2026-11-05 — Game call detection fixes

Session recap of fixes to how `bball-chat` decides which message is the game call,
whether it is today, and when it stops being shown.

## 1. "Is Today" was wrong for calls posted the day before — committed `364c74c`

**Symptom:** `bball status` showed `Is Today: No` for
"GAME CALL Tomorrow Thursday at Garfield at noon" on Thursday (posted Wednesday).

**Cause:** `checkIfToday()` in `lib/chat.js` used keyword heuristics. It matched
"thursday" but rejected it because the message wasn't posted today, and it ignored
"Tomorrow".

**Fix:** Replaced it with `isGameToday()` in `lib/game_time.js`, which compares the
parsed game date from `getGameEndDate()` (already resolves "tomorrow" relative to
the post time) with today.

**Test cleanup in the same commit:**
- Two integration tests hardcoded an "active" game on Mon Nov 2 and started failing
  once that date passed. They now use a fixture that is always today and not over
  (`Game call today, 9p-1159p`).
- The CLI integration test used to overwrite the real
  `~/.cache/bball-chat/status.json` (and leave fixture data behind if no cache
  existed). It now runs `bin/bball` under a temporary `HOME`.

## 2. MTV showed 0 for a non-call message

**Symptom:** MTV showed `RSVP Count : 0` for wesley's message
"heads up i'm in SLC for the k8s conference next week so someone else do the game call".

**Cause:** Any message matching keywords like "game call" counted as a candidate,
even with zero reactions.

**Fix (`lib/chat.js`):**
- New `isCallRequest(text)` skips messages asking someone else to post the call
  ("someone else do the game call", "can someone post the call tomorrow?",
  "who can make the call today", …).
- New `isTrackedGameCall(text, totalRsvpCount)` collects the rules: skip cancelled
  calls, skip call requests, and **ignore messages with zero RSVPs** (no 🏀/➕ and
  no "+N" in the text).
- Removed the now-unused `GAME_CALL_REGEX` keyword match.

**Tradeoff:** A newly posted call won't appear until someone reacts to it. Until then
the panel keeps showing the previous game while that game is still current, or
"no active call" once it has expired.

## 3. Old game info shown too long; cutoff changed from 3h to 2h

**Symptom:** The panel still showed MTV `10` at 3:05pm for the noon game. The game is
treated as ending at 1pm, so it was 2h past and still under the 3h cutoff.

**Fix:**
- Expiry is one setting in each language: `GAME_EXPIRY_HOURS = 2` in
  `lib/game_time.js` (CLI, tooltip) and `lib/render_image.py` (panel image).
- Renamed `isGameMoreThan3hPast` → `isGameExpired` (JS: `bin/bball`,
  `lib/format.js`, `lib/chat.js`) and `is_game_more_than_3h_past` →
  `is_game_expired` (Python).
- **Renderer bug fixed:** `lib/render_image.py` worked out "today"/"tomorrow" from the
  current time instead of the post time, so a "tomorrow" call never expired in the
  panel image. It now uses the post time; it also matches `tmrw` like the JS side.

## Tests

| Area | Tests |
|---|---|
| `isGameToday` ("tomorrow" posted day before) | `test/game_time.test.js` |
| `isCallRequest` | `test/cancelled.test.js` |
| `isTrackedGameCall` (zero RSVPs, request, cancelled) | `test/select_call.test.js` |
| JS 2h cutoff (1h59m vs 2h01m) | `test/game_time.test.js` |
| Python renderer: 2h cutoff, "tomorrow"/"today" from post time | `test/test_render_image.py` (new) |

`npm test` now runs both suites: `node --test && python3 -m unittest discover -s test`.
Result: 24 JS + 4 Python tests passing.

The new tests were checked against the old behavior: removing the zero-RSVP check
fails the JS suite, and restoring the old "tomorrow from now" line fails
`test_tomorrow_is_relative_to_post_time`.

## Live verification

- `bin/bball-poller --once && bin/bball status`: MTV showed Steven's game (10 RSVPs,
  `Is Today: YES`) until it expired at 3pm, then "No active game call". Moffett
  shows 8 for Fri Nov 6.
- Panel screenshot after a genmon refresh: cyan `-` (MTV) above amber `8` (Moffett).

## Status

- Item 1: committed in `364c74c`.
- Items 2 and 3, their tests and this recap: committed together in
  "Ignore zero-RSVP and call-request messages; expire games 2h after end".
