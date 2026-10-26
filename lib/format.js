import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

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
 * Formats status data into XFCE Genmon XML output.
 * @param {object} statusData Cached status data.
 * @param {object} config Configuration object.
 * @param {string} [targetSite] Optional target site: 'mtv' or 'moffett'.
 */
export function formatGenmonXml(statusData, config, targetSite) {
  if (!statusData || !statusData.spaces) {
    return [
      "<txt><span font='Sans Bold 10' foreground='#888888'>🏀 --</span></txt>",
      "<tool>bball-chat: No cached status yet. Polling Google Chat...</tool>",
      `<click>${BBALL_BIN} poll</click>`
    ].join('\n');
  }

  const mtvSpace = statusData.spaces.mtv || {};
  const moffettSpace = statusData.spaces.moffett || {};

  const mtvCall = mtvSpace.active_call;
  const moffettCall = moffettSpace.active_call;

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
    const qCount = mtvCall && mtvCall.question_count > 0 ? ` (${mtvCall.question_count} ❓)` : '';
    const todayMarker = mtvCall && mtvCall.is_today ? ' [TODAY]' : '';
    const toolLines = [
      `=== Lunch bball MTV${todayMarker} ===`,
      mtvCall ? `Call: ${mtvCall.text}` : 'No active game call',
      mtvCall ? `RSVP: ${mtvCount} 🏀${qCount}` : '',
      mtvCall ? `Organizer: ${mtvCall.sender}` : '',
      mtvSpace.url ? `\n[Click to open Lunch bball MTV in Google Chat]` : ''
    ].filter(Boolean).join('\n');

    const clickCmd = mtvSpace.url ? `xdg-open ${mtvSpace.url}` : `${BBALL_BIN} poll`;
    if (orientation === 'upright' && fs.existsSync(WIDGET_MTV)) {
      return [
        `<img>${WIDGET_MTV}</img>`,
        `<tool>${escapeXml(toolLines)}</tool>`
      ].join('\n');
    }
    return [
      `<txt><span font='Sans Bold ${fontSize}' foreground='#00D2FF'>${emojiPrefix}${mtvCount}</span></txt>`,
      `<tool>${escapeXml(toolLines)}</tool>`,
      `<click>${clickCmd}</click>`
    ].join('\n');
  }

  if (targetSite === 'moffett' || targetSite === 'mp') {
    const qCount = moffettCall && moffettCall.question_count > 0 ? ` (${moffettCall.question_count} ❓)` : '';
    const todayMarker = moffettCall && moffettCall.is_today ? ' [TODAY]' : '';
    const toolLines = [
      `=== Moffett Place Basketball${todayMarker} ===`,
      moffettCall ? `Call: ${moffettCall.text}` : 'No active game call',
      moffettCall ? `RSVP: ${moffettCount} 🏀${qCount}` : '',
      moffettCall ? `Organizer: ${moffettCall.sender}` : '',
      moffettSpace.url ? `\n[Click to open Moffett Place in Google Chat]` : ''
    ].filter(Boolean).join('\n');

    const clickCmd = moffettSpace.url ? `xdg-open ${moffettSpace.url}` : `${BBALL_BIN} poll`;
    if (orientation === 'upright' && fs.existsSync(WIDGET_MOFFETT)) {
      return [
        `<img>${WIDGET_MOFFETT}</img>`,
        `<tool>${escapeXml(toolLines)}</tool>`
      ].join('\n');
    }
    return [
      `<txt><span font='Sans Bold ${fontSize}' foreground='${color}'>${emojiPrefix}${moffettCount}</span></txt>`,
      `<tool>${escapeXml(toolLines)}</tool>`,
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

      case 'today_only': {
        const mtvIsToday = mtvCall && mtvCall.is_today;
        const moffettIsToday = moffettCall && moffettCall.is_today;

        if (mtvIsToday && moffettIsToday) {
          displayText = `${emojiLine}${mtvCount}\n${moffettCount}`;
          activeModeLabel = 'Today Only (Both MTV & Moffett)';
        } else if (mtvIsToday) {
          displayText = `${emojiLine}${mtvCount}`;
          activeModeLabel = 'Today Only (MTV)';
        } else if (moffettIsToday) {
          displayText = `${emojiLine}${moffettCount}`;
          activeModeLabel = 'Today Only (Moffett)';
        } else {
          displayText = `${emojiLine}--`;
          activeModeLabel = 'Today Only (No games today)';
        }
        break;
      }

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

      case 'today_only': {
        const mtvIsToday = mtvCall && mtvCall.is_today;
        const moffettIsToday = moffettCall && moffettCall.is_today;

        if (mtvIsToday && moffettIsToday) {
          displayText = `${emojiPrefix}${mtvCount}${sep}${moffettCount}`;
          activeModeLabel = 'Today Only (Both MTV & Moffett)';
        } else if (mtvIsToday) {
          displayText = config.show_site_prefix ? `${emojiPrefix}MTV: ${mtvCount}` : `${emojiPrefix}${mtvCount}`;
          activeModeLabel = 'Today Only (MTV)';
        } else if (moffettIsToday) {
          displayText = config.show_site_prefix ? `${emojiPrefix}MP: ${moffettCount}` : `${emojiPrefix}${moffettCount}`;
          activeModeLabel = 'Today Only (Moffett)';
        } else {
          displayText = `${emojiPrefix}--`;
          activeModeLabel = 'Today Only (No games today)';
        }
        break;
      }

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
    const qCount = mtvCall.question_count > 0 ? ` (${mtvCall.question_count} ❓)` : '';
    toolLines.push(`\n• Lunch bball MTV${todayMarker}:`);
    toolLines.push(`  Call: ${mtvCall.text}`);
    toolLines.push(`  RSVP: ${mtvCall.basketball_count} 🏀${qCount}`);
    toolLines.push(`  Organizer: ${mtvCall.sender}`);
  } else {
    toolLines.push(`\n• Lunch bball MTV: No active game call found`);
  }

  if (moffettCall) {
    const todayMarker = moffettCall.is_today ? ' [TODAY]' : '';
    const qCount = moffettCall.question_count > 0 ? ` (${moffettCall.question_count} ❓)` : '';
    toolLines.push(`\n• Moffett Place Basketball${todayMarker}:`);
    toolLines.push(`  Call: ${moffettCall.text}`);
    toolLines.push(`  RSVP: ${moffettCall.basketball_count} 🏀${qCount}`);
    toolLines.push(`  Organizer: ${moffettCall.sender}`);
  } else {
    toolLines.push(`\n• Moffett Place: No active game call found`);
  }

  if (updatedAt) {
    toolLines.push(`\nLast updated: ${updatedAt.toLocaleTimeString()}`);
  }
  toolLines.push('\n[Click item to cycle view mode]');

  const escapedText = escapeXml(displayText);
  const escapedTool = escapeXml(toolLines.join('\n'));

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
