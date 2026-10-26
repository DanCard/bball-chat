import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CONFIG_DIR = path.join(os.homedir(), '.config', 'bball-chat');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const CACHE_DIR = path.join(os.homedir(), '.cache', 'bball-chat');
const STATUS_FILE = path.join(CACHE_DIR, 'status.json');

const DEFAULT_CONFIG = {
  // Font size for panel display (default 20 for 4K / vertical panel)
  font_size: 20,
  // Layout style: "stacked" (upright lines: 🏀 / MTV / Moffett) or "rotated" (sideways: 🏀 MTV Moffett)
  layout: 'stacked',
  // Orientation: "upright" (horizontal numbers via dynamic image) or "rotated" (sideways text)
  orientation: 'upright',
  // Show basketball emoji on panel
  show_emoji: false,
  // View mode: "all" (MTV + Moffett), "moffett", "mtv", or "today_only"
  mode: 'all',
  // Format separator between numbers when mode is "all": "space" ("🏀 8 6") or "slash" ("🏀 8/6")
  separator: 'space',
  // Show prefix indicator in single site mode (e.g., true -> "🏀 MP: 6", false -> "🏀 6")
  show_site_prefix: false,
  // Poll interval in seconds for background poller
  poll_interval: 90,
  // Configured spaces
  spaces: [
    {
      key: 'mtv',
      id: 'spaces/AAAAyHXxedc',
      name: 'Lunch bball MTV',
      short_name: 'MTV',
      url: 'https://chat.google.com/room/AAAAyHXxedc'
    },
    {
      key: 'moffett',
      id: 'spaces/AAAAA-GT-Xc',
      name: 'Moffett Place Basketball',
      short_name: 'MP',
      url: 'https://chat.google.com/room/AAAAA-GT-Xc'
    }
  ]
};

export function getConfig() {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    if (!fs.existsSync(CONFIG_FILE)) {
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
      return DEFAULT_CONFIG;
    }
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch (err) {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(updates) {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  const current = getConfig();
  const next = { ...current, ...updates };
  const tmpFile = `${CONFIG_FILE}.tmp.${Date.now()}`;
  fs.writeFileSync(tmpFile, JSON.stringify(next, null, 2), 'utf8');
  fs.renameSync(tmpFile, CONFIG_FILE);
  return next;
}

export function getStatus() {
  try {
    if (!fs.existsSync(STATUS_FILE)) {
      return null;
    }
    const raw = fs.readFileSync(STATUS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveStatus(statusData) {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
  const tmpFile = `${STATUS_FILE}.tmp.${Date.now()}`;
  fs.writeFileSync(tmpFile, JSON.stringify(statusData, null, 2), 'utf8');
  fs.renameSync(tmpFile, STATUS_FILE);
}

export { CONFIG_DIR, CONFIG_FILE, CACHE_DIR, STATUS_FILE };
