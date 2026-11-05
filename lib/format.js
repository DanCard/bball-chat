import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { isGameExpired } from './game_time.js';

const BBALL_BIN = path.join(os.homedir(), 'projects', 'bball-chat', 'bin', 'bball');
const WIDGET_IMAGE = path.join(os.homedir(), '.cache', 'bball-chat', 'widget.png');
const WIDGET_MTV = path.join(os.homedir(), '.cache', 'bball-chat', 'widget_mtv.png');
const WIDGET_MOFFETT = path.join(os.homedir(), '.cache', 'bball-chat', 'widget_moffett.png');

/**
 * Escapes characters for Pango / XML.
 */
function escapeXml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Wraps tooltip text with Pango markup font size if provided.
 */
function formatTooltip(text, fontSize) {
  const escaped = escapeXml(text);
  if (!fontSize) return escaped;
  return `<span font='${fontSize}'>${escaped}</span>`;
}

/**
 * Formats status data into XFCE Genmon XML output.
 * @param {object} statusData Cached status data.
 * @param {object} config Configuration object.
 * @param {string} [targetSite] Optional target site: 'mtv' or 'moffett'.
 */
export function formatGenmonXml(statusData, config, targetSite) {
  const tooltipFontSize = config.tooltip_font_size || 18;

  if (!statusData || !statusData.spaces) {
    return [
      "<txt><span font='Sans Bold 10' foreground='#888888'>🏀 --</span></txt>",
      `<tool>${formatTooltip("bball-chat: No cached status yet. Polling Google Chat...", tooltipFontSize)}</tool>`,
      `<click>${BBALL_BIN} poll</click>`
    ].join('\n');
  }

  const now = new Date();
  const mtvSpace = statusData.spaces.mtv || {};
  const moffettSpace = statusData.spaces.moffett || {};

  const rawMtvCall = mtvSpace.active_call;
  const rawMoffettCall = moffettSpace.active_call;

  const mtvCall = (rawMtvCall && !isGameExpired(rawMtvCall, now)) ? rawMtvCall : null;
  const moffettCall = (rawMoffettCall && !isGameExpired(rawMoffettCall, now)) ? rawMoffettCall : null;

  const mtvCount = mtvCall ? mtvCall.basketball_count : '-';
  const moffettCount = moffettCall ? moffettCall.basketball_count : '-';

  const fontSize = config.font_size || 20;
  const showEmoji = Boolean(config.show_emoji);
  const emojiPrefix = showEmoji ? '🏀 ' : '';
  const emojiLine = showEmoji ? '🏀\n' : '';
  const updatedAt = statusData.updated_at ? new Date(statusData.updated_at) : null;
  const isStale = updatedAt && (Date.now() - updatedAt.getTime() > 1000 * 60 * 30);
  const color = isStale ? '#888888' : '#FFA500';

  const orientation = config.orientation || 'upright';

  // If a specific target site is requested (Scenario A: two separate genmon items)
  if (targetSite === 'mtv') {
    const plusNote = mtvCall && mtvCall.plus_count > 0 ? ` (+${mtvCall.plus_count})` : '';
    const qCount = mtvCall && mtvCall.question_count > 0 ? ` (${mtvCall.question_count} ❓)` : '';
    const todayMarker = mtvCall && mtvCall.is_today ? ' [TODAY]' : '';
    const attList = mtvCall && mtvCall.attendees && mtvCall.attendees.length > 0 ? `Attendees: ${mtvCall.attendees.join(', ')}` : '';
    const maybeList = mtvCall && mtvCall.maybes && mtvCall.maybes.length > 0 ? `Maybes: ${mtvCall.maybes.join(', ')}` : '';
    const toolLines = [
      `=== Lunch bball MTV${todayMarker} ===`,
      mtvCall ? `Call: ${mtvCall.text}` : 'No active game call',
      mtvCall ? `RSVP: ${mtvCount} 🏀${plusNote}${qCount}` : '',
      attList,
      maybeList,
      mtvCall ? `Organizer: ${mtvCall.sender}` : '',
      mtvSpace.url ? `\n[Click to open Lunch bball MTV in Google Chat]` : ''
    ].filter(Boolean).join('\n');

    const clickCmd = mtvSpace.url ? `xdg-open ${mtvSpace.url}` : `${BBALL_BIN} poll`;
    if (orientation === 'upright' && fs.existsSync(WIDGET_MTV)) {
      return [
        `<img>${WIDGET_MTV}</img>`,
        `<tool>${formatTooltip(toolLines, tooltipFontSize)}</tool>`
      ].join('\n');
    }
    return [
      `<txt><span font='Sans Bold ${fontSize}' foreground='#00D2FF'>${emojiPrefix}${mtvCount}</span></txt>`,
      `<tool>${formatTooltip(toolLines, tooltipFontSize)}</tool>`,
      `<click>${clickCmd}</click>`
    ].join('\n');
  }

  if (targetSite === 'moffett' || targetSite === 'mp') {
    const plusNote = moffettCall && moffettCall.plus_count > 0 ? ` (+${moffettCall.plus_count})` : '';
    const qCount = moffettCall && moffettCall.question_count > 0 ? ` (${moffettCall.question_count} ❓)` : '';
    const todayMarker = moffettCall && moffettCall.is_today ? ' [TODAY]' : '';
    const attList = moffettCall && moffettCall.attendees && moffettCall.attendees.length > 0 ? `Attendees: ${moffettCall.attendees.join(', ')}` : '';
    const maybeList = moffettCall && moffettCall.maybes && moffettCall.maybes.length > 0 ? `Maybes: ${moffettCall.maybes.join(', ')}` : '';
    const toolLines = [
      `=== Moffett Place Basketball${todayMarker} ===`,
      moffettCall ? `Call: ${moffettCall.text}` : 'No active game call',
      moffettCall ? `RSVP: ${moffettCount} 🏀${plusNote}${qCount}` : '',
      attList,
      maybeList,
      moffettCall ? `Organizer: ${moffettCall.sender}` : '',
      moffettSpace.url ? `\n[Click to open Moffett Place in Google Chat]` : ''
    ].filter(Boolean).join('\n');

    const clickCmd = moffettSpace.url ? `xdg-open ${moffettSpace.url}` : `${BBALL_BIN} poll`;
    if (orientation === 'upright' && fs.existsSync(WIDGET_MOFFETT)) {
      return [
        `<img>${WIDGET_MOFFETT}</img>`,
        `<tool>${formatTooltip(toolLines, tooltipFontSize)}</tool>`
      ].join('\n');
    }
    return [
      `<txt><span font='Sans Bold ${fontSize}' foreground='${color}'>${emojiPrefix}${moffettCount}</span></txt>`,
      `<tool>${formatTooltip(toolLines, tooltipFontSize)}</tool>`,
      `<click>${clickCmd}</click>`
    ].join('\n');
  }

  const mode = config.mode || 'all';
  const layout = config.layout || 'stacked';
  const sep = config.separator === 'slash' ? '/' : ' ';
  let displayText = '';
  let activeModeLabel = '';

  if (layout === 'stacked') {
    switch (mode) {
      case 'mtv':
        displayText = `${emojiLine}${mtvCount}`;
        activeModeLabel = 'MTV Only';
        break;

      case 'moffett':
        displayText = `${emojiLine}${moffettCount}`;
        activeModeLabel = 'Moffett Place Only';
        break;

      case 'all':
      default:
        // MTV first, Moffett second
        displayText = `${emojiLine}${mtvCount}\n${moffettCount}`;
        activeModeLabel = 'All Sites (MTV 1st, Moffett 2nd)';
        break;
    }
  } else {
    // Rotated (single line sideways)
    switch (mode) {
      case 'mtv':
        displayText = config.show_site_prefix ? `${emojiPrefix}MTV: ${mtvCount}` : `${emojiPrefix}${mtvCount}`;
        activeModeLabel = 'MTV Only';
        break;

      case 'moffett':
        displayText = config.show_site_prefix ? `${emojiPrefix}MP: ${moffettCount}` : `${emojiPrefix}${moffettCount}`;
        activeModeLabel = 'Moffett Place Only';
        break;

      case 'all':
      default:
        // First number MTV, second number Moffett
        displayText = `${emojiPrefix}${mtvCount}${sep}${moffettCount}`;
        activeModeLabel = 'All Sites (MTV 1st, Moffett 2nd)';
        break;
    }
  }

  // Build multi-line tooltip
  const toolLines = [];
  toolLines.push(`=== Pickup Basketball (${activeModeLabel}) ===`);

  if (mtvCall) {
    const todayMarker = mtvCall.is_today ? ' [TODAY]' : '';
    const plusNote = mtvCall.plus_count > 0 ? ` (+${mtvCall.plus_count})` : '';
    const qCount = mtvCall.question_count > 0 ? ` (${mtvCall.question_count} ❓)` : '';
    toolLines.push(`\n• Lunch bball MTV${todayMarker}:`);
    toolLines.push(`  Call: ${mtvCall.text}`);
    toolLines.push(`  RSVP: ${mtvCall.basketball_count} 🏀${plusNote}${qCount}`);
    if (mtvCall.attendees && mtvCall.attendees.length > 0) {
      toolLines.push(`  Attendees: ${mtvCall.attendees.join(', ')}`);
    }
    if (mtvCall.maybes && mtvCall.maybes.length > 0) {
      toolLines.push(`  Maybes: ${mtvCall.maybes.join(', ')}`);
    }
    toolLines.push(`  Organizer: ${mtvCall.sender}`);
  } else {
    toolLines.push(`\n• Lunch bball MTV: No active game call found`);
  }

  if (moffettCall) {
    const todayMarker = moffettCall.is_today ? ' [TODAY]' : '';
    const plusNote = moffettCall.plus_count > 0 ? ` (+${moffettCall.plus_count})` : '';
    const qCount = moffettCall.question_count > 0 ? ` (${moffettCall.question_count} ❓)` : '';
    toolLines.push(`\n• Moffett Place Basketball${todayMarker}:`);
    toolLines.push(`  Call: ${moffettCall.text}`);
    toolLines.push(`  RSVP: ${moffettCall.basketball_count} 🏀${plusNote}${qCount}`);
    if (moffettCall.attendees && moffettCall.attendees.length > 0) {
      toolLines.push(`  Attendees: ${moffettCall.attendees.join(', ')}`);
    }
    if (moffettCall.maybes && moffettCall.maybes.length > 0) {
      toolLines.push(`  Maybes: ${moffettCall.maybes.join(', ')}`);
    }
    toolLines.push(`  Organizer: ${moffettCall.sender}`);
  } else {
    toolLines.push(`\n• Moffett Place: No active game call found`);
  }

  if (updatedAt) {
    toolLines.push(`\nLast updated: ${updatedAt.toLocaleTimeString()}`);
  }
  toolLines.push('\n[Click item to cycle view mode]');

  const escapedText = escapeXml(displayText);
  const escapedTool = formatTooltip(toolLines.join('\n'), tooltipFontSize);

  if (orientation === 'upright' && fs.existsSync(WIDGET_IMAGE)) {
    return [
      `<img>${WIDGET_IMAGE}</img>`,
      `<tool>${escapedTool}</tool>`,
      `<click>${BBALL_BIN} toggle</click>`
    ].join('\n');
  }

  return [
    `<txt><span font='Sans Bold ${fontSize}' foreground='${color}'>${escapedText}</span></txt>`,
    `<tool>${escapedTool}</tool>`,
    `<click>${BBALL_BIN} toggle</click>`
  ].join('\n');
}
