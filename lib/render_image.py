#!/usr/bin/env python3
import sys
import os
import json
import subprocess
import re
from datetime import datetime, timedelta
from PIL import Image, ImageDraw, ImageFont, ImageChops

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

def make_basketball(panel_w=32, panel_h=34):
    noto_font_path = "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf"
    if os.path.exists(noto_font_path):
        try:
            # Native strike size for NotoColorEmoji bitmap font is 109
            font = ImageFont.truetype(noto_font_path, 109)
            img = Image.new("RGBA", (140, 140), (0, 0, 0, 0))
            draw = ImageDraw.Draw(img)
            draw.text((0, 0), "🏀", font=font, embedded_color=True)
            bbox = img.getbbox()
            if bbox:
                cropped = img.crop(bbox)
                target_size = min(panel_w - 4, panel_h - 4)
                cropped.thumbnail((target_size, target_size), Image.Resampling.LANCZOS)
                final = Image.new("RGBA", (panel_w, panel_h), (0, 0, 0, 0))
                x = (panel_w - cropped.width) // 2
                y = (panel_h - cropped.height) // 2
                final.paste(cropped, (x, y), cropped)
                return final
        except Exception:
            pass

    scale = 4
    sw = panel_w * scale
    sh = panel_h * scale
    pad_x = 2 * scale
    d = sw - 2 * pad_x
    cx = sw / 2
    cy = sh / 2
    r = d / 2

    ball_color = (255, 130, 0, 255)  # #FF8200
    line_color = (28, 28, 28, 255)
    line_w = int(2.4 * scale)

    # Base ball image
    ball = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
    b_draw = ImageDraw.Draw(ball)
    b_draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=ball_color)

    # Details layer
    details = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
    d_draw = ImageDraw.Draw(details)

    # Vertical seam
    d_draw.line([(cx, cy - r), (cx, cy + r)], fill=line_color, width=line_w)

    # Horizontal seam
    d_draw.line([(cx - r, cy), (cx + r, cy)], fill=line_color, width=line_w)

    # Left and right arc seams
    seam_offset = 0.48
    R = r * 1.3
    X = R + r * seam_offset
    d_draw.arc([cx - X - R, cy - R, cx - X + R, cy + R], start=-60, end=60, fill=line_color, width=line_w)
    d_draw.arc([cx + X - R, cy - R, cx + X + R, cy + R], start=180-60, end=180+60, fill=line_color, width=line_w)

    # Clip details to ball circle by masking with circle
    mask = Image.new('L', (sw, sh), 0)
    m_draw = ImageDraw.Draw(mask)
    m_draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    
    # Apply mask to details alpha
    d_r, d_g, d_b, d_a = details.split()
    d_a = ImageChops.multiply(d_a, mask)
    details.putalpha(d_a)

    # Composite details onto ball
    res = Image.alpha_composite(ball, details)

    # Outer border outline
    r_draw = ImageDraw.Draw(res)
    r_draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=line_color, width=line_w)

    return res.resize((panel_w, panel_h), Image.Resampling.LANCZOS)

def is_game_more_than_3h_past(call, now=None):
    if not call or not isinstance(call, dict):
        return True

    tz = datetime.now().astimezone().tzinfo
    if now is None:
        now = datetime.now(tz)
    elif now.tzinfo is None:
        now = now.replace(tzinfo=tz)

    text = call.get('text', '')
    create_time_str = call.get('create_time', '')
    if not text and not create_time_str:
        return True

    msg_dt = None
    if create_time_str:
        try:
            clean_str = create_time_str.replace('Z', '+00:00')
            msg_dt = datetime.fromisoformat(clean_str).astimezone(tz)
        except Exception:
            pass

    lower = text.lower()
    months = {'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
              'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12}
    days_of_week = {'mon': 0, 'monday': 0, 'tue': 1, 'tues': 1, 'tuesday': 1,
                    'wed': 2, 'wednesday': 2, 'thu': 3, 'thur': 3, 'thurs': 3, 'thursday': 3,
                    'fri': 4, 'friday': 4, 'sat': 5, 'saturday': 5, 'sun': 6, 'sunday': 6}

    game_date = None
    if 'today' in lower:
        game_date = now.date()
    elif 'tomorrow' in lower:
        game_date = now.date() + timedelta(days=1)

    if not game_date:
        m_month = re.search(r'\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b', lower)
        if m_month:
            m_num = months[m_month.group(1)[:3]]
            d_num = int(m_month.group(2))
            year = msg_dt.year if msg_dt else now.year
            game_date = datetime(year, m_num, d_num).date()

    if not game_date:
        m_slash = re.search(r'\b(\d{1,2})/(\d{1,2})\b', lower)
        if m_slash:
            m_num = int(m_slash.group(1))
            d_num = int(m_slash.group(2))
            if 1 <= m_num <= 12 and 1 <= d_num <= 31:
                year = msg_dt.year if msg_dt else now.year
                game_date = datetime(year, m_num, d_num).date()

    if not game_date:
        for dow_name, dow_val in days_of_week.items():
            if re.search(rf'\b{dow_name}\b', lower):
                ref_dt = msg_dt if msg_dt else now
                diff = (dow_val - ref_dt.weekday()) % 7
                game_date = (ref_dt + timedelta(days=diff)).date()
                break

    if not game_date:
        if msg_dt:
            game_date = msg_dt.date()
        else:
            game_date = now.date()

    end_hour = 13
    end_minute = 0
    m_range = re.search(r'-\s*(\d{1,2})(?::(\d{2}))?\s*(a|p|am|pm)?\b', lower)
    if m_range:
        h = int(m_range.group(1))
        m = int(m_range.group(2) or 0)
        meridiem = m_range.group(3) or ''
        if 'p' in meridiem and h < 12:
            h += 12
        elif not meridiem and h < 7:
            h += 12
        end_hour = h
        end_minute = m
    elif 'noon' in lower:
        end_hour = 13
        end_minute = 0
    else:
        m_start = re.search(r'(?:at|@)\s*(\d{1,2})(?::(\d{2}))?\s*(a|p|am|pm)?\b', lower)
        if m_start:
            h = int(m_start.group(1))
            m = int(m_start.group(2) or 0)
            meridiem = m_start.group(3) or ''
            if 'p' in meridiem and h < 12:
                h += 12
            elif not meridiem and h < 7:
                h += 12
            end_hour = h + 1
            end_minute = m

    try:
        game_end_dt = datetime(game_date.year, game_date.month, game_date.day,
                               end_hour, end_minute, tzinfo=tz)
        hours_since_end = (now - game_end_dt).total_seconds() / 3600.0
        return hours_since_end > 3.0
    except Exception:
        return True

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

    mtv_past = is_game_more_than_3h_past(mtv_call)
    moffett_past = is_game_more_than_3h_past(moffett_call)

    # Ball icon for idle/past games
    img_ball = make_basketball(32, 34)

    # Always generate dedicated MTV image (or ball if >3h past)
    if mtv_past:
        save_atomic(img_ball, OUTPUT_MTV)
    else:
        img_mtv = draw_single_num(mtv_count, COLOR_MTV)
        save_atomic(img_mtv, OUTPUT_MTV)

    # Always generate dedicated Moffett image (or ball if >3h past)
    if moffett_past:
        save_atomic(img_ball, OUTPUT_MOFFETT)
    else:
        img_moffett = draw_single_num(moffett_count, COLOR_MOFFETT)
        save_atomic(img_moffett, OUTPUT_MOFFETT)

    # Generate the main widget image based on active mode
    mode = config.get("mode", "all")
    if len(sys.argv) > 1 and sys.argv[1]:
        mode = sys.argv[1].lower()

    if mode == "moffett":
        if moffett_past:
            save_atomic(img_ball, OUTPUT_MAIN)
        else:
            save_atomic(img_moffett, OUTPUT_MAIN)
    elif mode == "mtv":
        if mtv_past:
            save_atomic(img_ball, OUTPUT_MAIN)
        else:
            save_atomic(img_mtv, OUTPUT_MAIN)
    elif mode == "today_only":
        mtv_today = mtv_call.get("is_today", False) and not mtv_past
        moffett_today = moffett_call.get("is_today", False) and not moffett_past
        if moffett_today and not mtv_today:
            save_atomic(img_moffett, OUTPUT_MAIN)
        elif mtv_today and not moffett_today:
            save_atomic(img_mtv, OUTPUT_MAIN)
        elif mtv_today and moffett_today:
            img_stacked = draw_stacked(mtv_count, COLOR_MTV, moffett_count, COLOR_MOFFETT)
            save_atomic(img_stacked, OUTPUT_MAIN)
        else:
            save_atomic(img_ball, OUTPUT_MAIN)
    else:  # "all"
        if mtv_past and moffett_past:
            save_atomic(img_ball, OUTPUT_MAIN)
        elif mtv_past and not moffett_past:
            img_stacked = draw_stacked("-", COLOR_MTV, moffett_count, COLOR_MOFFETT)
            save_atomic(img_stacked, OUTPUT_MAIN)
        elif not mtv_past and moffett_past:
            img_stacked = draw_stacked(mtv_count, COLOR_MTV, "-", COLOR_MOFFETT)
            save_atomic(img_stacked, OUTPUT_MAIN)
        else:
            img_stacked = draw_stacked(mtv_count, COLOR_MTV, moffett_count, COLOR_MOFFETT)
            save_atomic(img_stacked, OUTPUT_MAIN)

    if "--no-refresh" not in sys.argv:
        refresh_panel()

if __name__ == "__main__":
    render()
