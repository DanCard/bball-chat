# Google Chat Pickup Basketball XFCE Panel Widget

A live pickup basketball participant counter for the XFCE desktop panel that monitors Google Chat spaces and aggregates `🏀` emoji RSVP reactions.

Designed specifically for both vertical and horizontal XFCE panels using `xfce4-genmon-plugin`.

---

## Features

* **Multi-Space Aggregation**: Tracks game calls across:
  * **Lunch bball MTV** (rendered in bright electric cyan/blue `#00D2FF`)
  * **Moffett Place Basketball** (rendered in bright amber/orange `#FFA500`)
* **Upright Vertical Panel Support**:
  * Vertical XFCE panels rotate text labels by 90°. `bball-chat` includes a dynamic image generator (`lib/render_image.py` using Pillow) that renders high-contrast, perfectly upright numbers (`0°` rotation) into compact PNGs embedded directly in the Genmon widget.
* **Glanceable Display Modes**:
  * Default (`all`): `🏀 9 8` *(MTV first, Moffett second)*
  * Single site: `bball-genmon mtv` or `bball-genmon moffett` (e.g. for dedicated vertical panel slots)
  * Smart `today_only`: automatically filters to only display games happening today!
* **Click-to-Cycle**: Clicking the panel item can cycle view modes (`All` $\rightarrow$ `Moffett` $\rightarrow$ `MTV` $\rightarrow$ `Today Only` $\rightarrow$ `All`).
* **Rich Hover Tooltip**: Displays organizers, game call snippets, locations, scheduled dates, and individual RSVP counts (`🏀` and `❓`).
* **Ultra-Fast & Non-Blocking**: The panel presenter script (`bin/bball-genmon`) reads from a local cache in `< 3ms` so your desktop panel never stutters or hangs.
* **Autonomous Poller**: Background worker runs every 90s via systemd user timer, automatically refreshing OAuth credentials when needed.

---

## Requirements

* **Node.js** 18+ (uses native `fetch`)
* **Python 3** with `Pillow` (`pip install Pillow` or `sudo apt install python3-pil`) for upright vertical panel rendering
* **XFCE Panel** with `xfce4-genmon-plugin`
* Google Chat API access (uses Google Workspace OAuth tokens)

---

## Quick Start / XFCE Panel Setup

1. **Add Generic Monitor to Panel**:
   * Right-click the XFCE panel $\rightarrow$ **Panel** $\rightarrow$ **Add New Items...**
   * Select **Generic Monitor** (`genmon`) and click **Add**.
2. **Configure Generic Monitor**:
   * Right-click the newly added Generic Monitor item $\rightarrow$ **Properties**.
   * Set **Command** to one of:
     * **Combined**: `/home/dcar/projects/bball-chat/bin/bball-genmon`
     * **Moffett Only** (Orange): `/home/dcar/projects/bball-chat/bin/bball-genmon moffett`
     * **MTV Only** (Bright Blue): `/home/dcar/projects/bball-chat/bin/bball-genmon mtv`
   * Set **Period (s)** to: `15` (or `30`)
   * Uncheck **Label** (or leave empty).

---

## CLI Control (`bball`)

A convenient CLI helper is located at `bin/bball`:

```bash
# View detailed terminal summary of current games and RSVPs
bball status

# Switch display mode
bball moffett     # Show only Moffett Place
bball mtv         # Show only Lunch bball MTV
bball all         # Show both
bball today       # Automatically show only today's game(s)
bball toggle      # Cycle to the next view mode

# Immediate update & shortcuts
bball poll        # Force an immediate poll of Google Chat
bball open mtv    # Open Lunch bball MTV in web browser
bball open moffett# Open Moffett Place in web browser
```

---

## Configuration

Configuration is stored at `~/.config/bball-chat/config.json`:

```json
{
  "mode": "all",
  "separator": "space",
  "show_site_prefix": false,
  "poll_interval": 90
}
```

* `mode`: `"all"`, `"moffett"`, `"mtv"`, or `"today_only"`.
* `separator`: `"space"` (`9 8`) or `"slash"` (`9/8`).
* `show_site_prefix`: `false` (`8`) or `true` (`MP: 8`).

---

## Architecture & Background Service

See [ARCHITECTURE.md](ARCHITECTURE.md) for full system architecture details and Google Chat API integration.

The background polling timer is managed via systemd user units:
* `systemctl --user status bball-poller.timer`
* `systemctl --user start bball-poller.service`
* `journalctl --user -u bball-poller -f`

---

## License

This is free and unencumbered software released into the public domain under [The Unlicense](LICENSE). See [unlicense.org](https://unlicense.org) for details.
