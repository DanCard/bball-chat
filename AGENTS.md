# AGENTS.md

This file provides guidance for agentic coding assistants working in this repository.

## 1. Project Overview & Architecture

`bball-chat` is a live pickup basketball participant counter for the XFCE desktop panel. It monitors Google Chat spaces for pickup game call messages and aggregates `🏀` emoji reaction RSVP counts.

The architecture follows a decoupled **producer-consumer** design:

1. **Background Poller (Producer)**:
   * [`bin/bball-poller`](bin/bball-poller) queries the Google Chat REST API and writes game calls/RSVP counts atomically to `~/.cache/bball-chat/status.json`.
   * Triggered autonomously via systemd user timer ([`systemd/bball-poller.timer`](systemd/bball-poller.timer)) every 90 seconds.
   * Invokes [`lib/render_image.py`](lib/render_image.py) to regenerate pre-rendered panel images.

2. **Image Renderer**:
   * [`lib/render_image.py`](lib/render_image.py) uses Python and Pillow to render upright (`0°` rotation), high-contrast numbers into compact PNGs. This solves the vertical XFCE panel limitation where Pango text labels rotate by 90°.

3. **Panel Presenter (Consumer)**:
   * [`bin/bball-genmon`](bin/bball-genmon) is invoked by `xfce4-genmon-plugin` (every 15–180s).
   * It reads the local cache in `< 3ms` and outputs Genmon XML containing the image path (`<img>`), rich tooltip (`<tool>`), and click actions (`<click>`).
   * **Rule**: Never make network requests or blocking operations inside the presenter script.

4. **CLI Controller**:
   * [`bin/bball`](bin/bball) provides user commands to check status, cycle view modes (`all` -> `moffett` -> `mtv` -> `today` -> `all`), and trigger immediate polls.

---

## 2. Essential Commands

### CLI Status & Controls
```bash
bin/bball status              # View current active game calls and RSVP counts
bin/bball toggle              # Cycle view mode
bin/bball today               # Switch to smart 'today only' filter
bin/bball all                 # Switch to combined view (MTV top, Moffett bottom)
bin/bball mtv                 # Switch to MTV-only view
bin/bball moffett             # Switch to Moffett-only view
bin/bball poll                # Trigger an immediate background poll
```

### Direct Poller & Renderer
```bash
# Run one-shot poller (fetches from Google Chat API and regenerates images)
bin/bball-poller --once

# Regenerate widget PNG images directly from cached status.json
python3 lib/render_image.py

# Test Genmon XML output
bin/bball-genmon
bin/bball-genmon mtv
bin/bball-genmon moffett
```

### Systemd User Service & Timer
```bash
systemctl --user status bball-poller.timer    # Check background timer status
systemctl --user status bball-poller.service  # Check last poll run status
journalctl --user -u bball-poller.service -e # View poller logs
systemctl --user restart bball-poller.timer   # Restart the poller timer
```

---

## 3. Verification & UI Testing

### Panel Location & Environment
* **Panel**: Vertical panel on left screen edge (`32px` wide, full screen height `2160px` at 4K).
* **Genmon Plugin ID**: `plugin-19` (at the bottom-left corner of the panel).

### Forcing Immediate Genmon Refresh
Genmon polls periodically (e.g., every 180s). To force an immediate refresh after updating images or scripts without restarting the panel:
```bash
gdbus call --session --dest org.xfce.Panel --object-path /org/xfce/Panel --method org.xfce.Panel.PluginEvent "genmon-19" "refresh" "<true>"
```

### Visual Verification via Screenshots
Never assume rendering looks correct without inspecting the visual output. Capture the bottom-left panel region:
```bash
DISPLAY=:0.0 import -window root -crop 120x450+0+1710 /tmp/panel_crop.png
```
Inspect `/tmp/panel_crop.png` to verify alignment, font size, margins, and colors.

---

## 4. Layout & Rendering Rules

* **Panel Canvas Width**: The panel width is fixed to **32px**.
* **Color Coding**:
  * **MTV**: Cyan/Blue (`#00D2FF`)
  * **Moffett Place**: Amber/Orange (`#FFA500`)
* **Dynamic Font Sizing in [`lib/render_image.py`](lib/render_image.py)**:
  * **Single digits (`0`–`9` or `-`)**: Render at **26pt** bold (`DejaVuSans-Bold.ttf`). Centered with ~7px margins on each side.
  * **Double digits (`10+`)**: Render at **19pt** bold to prevent horizontal clipping within the 32px canvas.
  * **Stacked Canvas (`draw_stacked`)**: `panel_w=32`, `panel_h=54` (two `27px` cells). Exact bounding-box centering per cell.
  * **Single Number Canvas (`draw_single_num`)**: `panel_w=32`, `panel_h=34`.

---

## 5. Configuration & State Paths

* User configuration: `~/.config/bball-chat/config.json`
* Status cache: `~/.cache/bball-chat/status.json`
* Pre-rendered widget images:
  * Combined / Active: `~/.cache/bball-chat/widget.png`
  * MTV dedicated: `~/.cache/bball-chat/widget_mtv.png`
  * Moffett dedicated: `~/.cache/bball-chat/widget_moffett.png`

---

## 6. Working Rules for Agents

1. **Verify visually on the live panel**: Use screenshots (`import -window root -crop ...`) to verify widget rendering rather than code inspection alone.
2. **Never commit unprompted**: Do not execute `git commit` unless explicitly instructed by the user. When asked to commit, provide a detailed commit message with summary and verification.
3. **Preserve low presenter latency**: Keep [`bin/bball-genmon`](bin/bball-genmon) non-blocking and under 10ms execution time. All network access belongs in [`bin/bball-poller`](bin/bball-poller).
4. **Preserve user config**: Do not wipe or overwrite user settings in `~/.config/bball-chat/config.json` during testing.
