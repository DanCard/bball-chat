#!/usr/bin/env python3
import sys
import os
import json
import subprocess
import re
from PIL import Image, ImageDraw, ImageFont

CACHE_DIR = os.path.expanduser("~/.cache/bball-chat")
CONFIG_DIR = os.path.expanduser("~/.config/bball-chat")
STATUS_FILE = os.path.join(CACHE_DIR, "status.json")
CONFIG_FILE = os.path.join(CONFIG_DIR, "config.json")

OUTPUT_MAIN = os.path.join(CACHE_DIR, "widget.png")
OUTPUT_MTV = os.path.join(CACHE_DIR, "widget_mtv.png")
OUTPUT_MOFFETT = os.path.join(CACHE_DIR, "widget_moffett.png")

FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

# Distinguishable colors
COLOR_MTV = "#00D2FF"      # Vibrant bright cyan/blue
COLOR_MOFFETT = "#FFA500"  # Warm amber/orange

def draw_single_num(num_str, color, panel_w=32, panel_h=34, font_size=None):
    img = Image.new("RGBA", (panel_w, panel_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    if font_size is None:
        font_size = 26 if len(num_str) <= 1 else 19
    font = ImageFont.truetype(FONT_PATH, font_size)
    bbox = font.getbbox(num_str)
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    x = (panel_w - w) // 2 - bbox[0]
    y = (panel_h - h) // 2 - bbox[1]
    draw.text((x, y), num_str, font=font, fill=color)
    return img

def draw_stacked(top_str, top_color, bot_str, bot_color, panel_w=32, panel_h=54, font_size=None):
    img = Image.new("RGBA", (panel_w, panel_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cell_h = panel_h // 2

    def resolve_size(s):
        if font_size is not None:
            return font_size
        return 26 if len(s) <= 1 else 19

    top_size = resolve_size(top_str)
    bot_size = resolve_size(bot_str)

    # Top number centered in top half
    font_top = ImageFont.truetype(FONT_PATH, top_size)
    b1 = font_top.getbbox(top_str)
    w1 = b1[2] - b1[0]
    h1 = b1[3] - b1[1]
    x1 = (panel_w - w1) // 2 - b1[0]
    y1 = (cell_h - h1) // 2 - b1[1]
    draw.text((x1, y1), top_str, font=font_top, fill=top_color)

    # Bottom number centered in bottom half
    font_bot = ImageFont.truetype(FONT_PATH, bot_size)
    b2 = font_bot.getbbox(bot_str)
    w2 = b2[2] - b2[0]
    h2 = b2[3] - b2[1]
    x2 = (panel_w - w2) // 2 - b2[0]
    y2 = cell_h + (cell_h - h2) // 2 - b2[1]
    draw.text((x2, y2), bot_str, font=font_bot, fill=bot_color)
    return img

def save_atomic(img, out_path):
    tmp = f"{out_path}.tmp"
    img.save(tmp, "PNG")
    os.replace(tmp, out_path)

def refresh_panel():
    """Trigger an immediate refresh of the genmon panel plugin via DBus."""
    plugin_id = "19"
    try:
        out = subprocess.check_output(
            ["xfconf-query", "-c", "xfce4-panel", "-p", "/plugins", "-lv"],
            text=True, stderr=subprocess.DEVNULL, timeout=1
        )
        for line in out.splitlines():
            m = re.search(r"/plugins/plugin-(\d+)/command\s+.*bball-genmon", line)
            if m:
                plugin_id = m.group(1)
                break
    except Exception:
        pass

    try:
        subprocess.run(
            [
                "gdbus", "call", "--session", "--dest", "org.xfce.Panel",
                "--object-path", "/org/xfce/Panel",
                "--method", "org.xfce.Panel.PluginEvent",
                f"genmon-{plugin_id}", "refresh", "<true>"
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=1
        )
    except Exception:
        pass

def render():
    os.makedirs(CACHE_DIR, exist_ok=True)
    
    config = {}
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE) as f:
                config = json.load(f)
        except Exception:
            pass

    status = {}
    if os.path.exists(STATUS_FILE):
        try:
            with open(STATUS_FILE) as f:
                status = json.load(f)
        except Exception:
            pass

    spaces = status.get("spaces", {})
    mtv_call = spaces.get("mtv", {}).get("active_call") or {}
    moffett_call = spaces.get("moffett", {}).get("active_call") or {}

    mtv_count = str(mtv_call.get("basketball_count", "-"))
    moffett_count = str(moffett_call.get("basketball_count", "-"))

    # Always generate dedicated MTV image in bright blue
    img_mtv = draw_single_num(mtv_count, COLOR_MTV)
    save_atomic(img_mtv, OUTPUT_MTV)

    # Always generate dedicated Moffett image in amber/orange
    img_moffett = draw_single_num(moffett_count, COLOR_MOFFETT)
    save_atomic(img_moffett, OUTPUT_MOFFETT)

    # Generate the main widget image based on active mode
    mode = config.get("mode", "all")
    if len(sys.argv) > 1 and sys.argv[1]:
        mode = sys.argv[1].lower()

    if mode == "moffett":
        save_atomic(img_moffett, OUTPUT_MAIN)
    elif mode == "mtv":
        save_atomic(img_mtv, OUTPUT_MAIN)
    elif mode == "today_only":
        mtv_today = mtv_call.get("is_today", False)
        moffett_today = moffett_call.get("is_today", False)
        if moffett_today and not mtv_today:
            save_atomic(img_moffett, OUTPUT_MAIN)
        elif mtv_today and not moffett_today:
            save_atomic(img_mtv, OUTPUT_MAIN)
        else:
            img_stacked = draw_stacked(mtv_count, COLOR_MTV, moffett_count, COLOR_MOFFETT)
            save_atomic(img_stacked, OUTPUT_MAIN)
    else:  # "all"
        img_stacked = draw_stacked(mtv_count, COLOR_MTV, moffett_count, COLOR_MOFFETT)
        save_atomic(img_stacked, OUTPUT_MAIN)

    if "--no-refresh" not in sys.argv:
        refresh_panel()

if __name__ == "__main__":
    render()
