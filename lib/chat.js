import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getAccessToken } from './auth.js';
import { isGameExpired, getGameEndDate, isGameToday } from './game_time.js';

const BASKETBALL_EMOJI = '🏀';
const QUESTION_EMOJI = '❓';
const PLUS_EMOJIS = ['➕', '\u{2795}', '\u{FF0B}'];

const MEMBERS_CACHE_FILE = path.join(os.homedir(), '.cache', 'bball-chat', 'members.json');

function loadMemberCache() {
  try {
    if (fs.existsSync(MEMBERS_CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(MEMBERS_CACHE_FILE, 'utf8'));
    }
  } catch {}
  return {};
}

function saveMemberCache(cache) {
  try {
    fs.mkdirSync(path.dirname(MEMBERS_CACHE_FILE), { recursive: true });
    fs.writeFileSync(MEMBERS_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
  } catch {}
}

/**
 * Fetches the specific reactions and participant names for a game call.
 */
async function fetchReactionAttendees(spaceId, messageId, token, textPlusCount = 0) {
  const memberCache = loadMemberCache();
  let cacheModified = false;

  try {
    const res = await fetch(`https://chat.googleapis.com/v1/${messageId}/reactions`, {
      headers: { Authorization: 'Bearer ' + token }
    });
    if (!res.ok) return { attendees: [], maybes: [] };

    const data = await res.json();
    const reactions = data.reactions || [];

    const userIds = [...new Set(reactions.map(r => r.user?.name?.replace('users/', '')).filter(Boolean))];
    const missingIds = userIds.filter(id => !memberCache[id]);

    if (missingIds.length > 0) {
      await Promise.all(missingIds.map(async (uid) => {
        try {
          const mRes = await fetch(`https://chat.googleapis.com/v1/${spaceId}/members/${uid}`, {
            headers: { Authorization: 'Bearer ' + token }
          });
          if (mRes.ok) {
            const mData = await mRes.json();
            if (mData.member?.displayName) {
              memberCache[uid] = mData.member.displayName;
              cacheModified = true;
            }
          }
        } catch {}
      }));
    }

    if (cacheModified) {
      saveMemberCache(memberCache);
    }

    const attendees = [];
    const maybes = [];
    let plusReactionCount = 0;

    for (const r of reactions) {
      const uid = r.user?.name?.replace('users/', '');
      const name = memberCache[uid] || uid || 'Unknown';
      const u = r.emoji?.unicode;

      if (u === BASKETBALL_EMOJI || u === '\u{1F3C0}') {
        if (!attendees.includes(name)) attendees.push(name);
      } else if (u === QUESTION_EMOJI || u === '\u{2753}') {
        if (!maybes.includes(name)) maybes.push(name);
      } else if (PLUS_EMOJIS.includes(u)) {
        plusReactionCount++;
        attendees.push(`+1 (guest via ${name})`);
      }
    }

    if (textPlusCount > plusReactionCount) {
      const diff = textPlusCount - plusReactionCount;
      for (let i = 0; i < diff; i++) {
        attendees.push('+1 (outside attendee)');
      }
    }

    return { attendees, maybes };
  } catch (err) {
    console.error('Error fetching reaction attendees:', err);
    return { attendees: [], maybes: [] };
  }
}

/**
 * Checks whether a message indicates that the game call has been cancelled.
 */
export function isCancelled(text) {
  if (!text) return false;
  // Bracketed/tagged markers like [Cancelled], [Canceled], (Cancelled), *Cancelled*
  if (/[\(\[\*]\s*cancel(?:led|ed|ing)?\s*[\)\]\*]/i.test(text)) return true;
  // Leading cancel phrases like "Cancelled:", "Cancelled -", "Canceling call"
  if (/^\s*cancel(?:led|ed|ing)\b/i.test(text)) return true;
  // Specific cancellation phrases anywhere in the text
  if (/\b(?:game\s+call\s+cancel(?:led|ed)|canceling\s+call|cancel(?:led|ed)?\s+the\s+game|game\s+(?:is\s+)?cancel(?:led|ed))\b/i.test(text)) return true;
  return false;
}

/**
 * Checks whether a message is asking someone else to post the game call,
 * e.g. "someone else do the game call" or "can someone post the call tomorrow?".
 */
export function isCallRequest(text) {
  if (!text) return false;
  return /\b(?:some(?:one|body)|any(?:one|body)|who)(?:\s+else)?\s+(?:(?:can|could|want(?:s)?\s+to|wanna|willing\s+to|pl(?:ease|s)|mind)\s+)?(?:do|post|make|send|run|handle|take|cover)(?:ing)?\s+(?:the\s+|a\s+|tomorrow'?s\s+|today'?s\s+)?(?:game\s+)?call/i.test(text);
}

/**
 * Decides whether a message should be tracked as a game call.
 * Skips cancelled calls, requests for someone else to post the call, and
 * messages with no RSVPs (zero 🏀/➕ reactions and no "+N" in the text).
 */
export function isTrackedGameCall(text, totalRsvpCount) {
  if (isCancelled(text) || isCallRequest(text)) return false;
  return totalRsvpCount > 0;
}

/**
 * Extracts "+N" participant count from game call announcement text.
 * E.g., "+1 so far", "+2 also", "bringing my kid as a +1".
 * Ignores temperatures (+18C, +65F) and phone numbers (+1 650...).
 */
function extractTextPlusCount(text) {
  if (!text) return 0;
  const regex = /(?:^|[^\w])\+\s*(\d{1,2})\b(?!\s*(?:[cCfF]|degrees?)\b)(?!\s*[\(-]?\d{3})/g;
  let count = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const n = parseInt(match[1], 10);
    if (n > 0 && n <= 10) {
      count += n;
    }
  }
  return count;
}

// Only consider game calls posted within this window
const CANDIDATE_MAX_AGE_MS = 7 * 24 * 3600 * 1000;

/**
 * Picks which game call to follow among candidates (ordered newest-first).
 * Follows the soonest game that has not yet ended (e.g. today's game over a
 * call already posted for tomorrow); falls back to the most recent call.
 */
export function selectGameCall(candidates, now = new Date()) {
  if (!candidates || candidates.length === 0) return null;
  let best = null;
  for (const c of candidates) {
    if (!c.gameEnd || c.gameEnd.getTime() <= now.getTime()) continue;
    if (!best || c.gameEnd.getTime() < best.gameEnd.getTime()) best = c;
  }
  return best || candidates[0];
}

/**
 * Fetches recent messages from a Google Chat space and identifies the active game call.
 */
export async function getActiveGameCall(spaceId) {
  const token = await getAccessToken();
  let pageToken = '';
  const maxPages = 2;
  const now = new Date();
  const candidates = [];

  pages:
  for (let page = 0; page < maxPages; page++) {
    const pageParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
    const url = `https://chat.googleapis.com/v1/${spaceId}/messages?pageSize=60&orderBy=createTime%20desc${pageParam}`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to fetch messages for ${spaceId} (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const messages = data.messages || [];

    for (const msg of messages) {
      // Stop once messages are too old to be relevant (but always keep at least one candidate)
      const created = new Date(msg.createTime);
      if (candidates.length > 0 && now.getTime() - created.getTime() > CANDIDATE_MAX_AGE_MS) break pages;

      // Only inspect top-level thread starters (not thread replies)
      if (msg.threadReply === true) continue;

      const text = msg.text || '';
      const reactions = msg.emojiReactionSummaries || [];

      let bballCount = 0;
      let questionCount = 0;
      let plusReactionCount = 0;

      for (const r of reactions) {
        const unicode = r.emoji?.unicode;
        if (unicode === BASKETBALL_EMOJI || unicode === '\u{1F3C0}') {
          bballCount += r.reactionCount || 0;
        } else if (unicode === QUESTION_EMOJI || unicode === '\u{2753}') {
          questionCount += r.reactionCount || 0;
        } else if (PLUS_EMOJIS.includes(unicode)) {
          plusReactionCount += r.reactionCount || 0;
        }
      }

      const textPlusCount = extractTextPlusCount(text);
      // Prevent double-counting if the organizer both reacted with ➕ and noted "+1" in the message body
      const plusCount = Math.max(plusReactionCount, textPlusCount);
      const totalRsvpCount = bballCount + plusCount;

      if (isTrackedGameCall(text, totalRsvpCount)) {
        candidates.push({
          msg, text, textPlusCount, bballCount, plusCount, questionCount, totalRsvpCount,
          gameEnd: getGameEndDate({ text, create_time: msg.createTime }, now)
        });
      }
    }

    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  const chosen = selectGameCall(candidates, now);
  if (!chosen) return null;

  const { msg, text } = chosen;
  const isToday = isGameToday({ text, create_time: msg.createTime }, now);
  const isPast = isGameExpired({ text, create_time: msg.createTime }, now);
  const { attendees, maybes } = await fetchReactionAttendees(spaceId, msg.name, token, chosen.textPlusCount);
  return {
    message_id: msg.name,
    text: text.trim(),
    sender: msg.sender?.displayName || 'Unknown',
    create_time: msg.createTime,
    basketball_count: chosen.totalRsvpCount,
    ball_count: chosen.bballCount,
    plus_count: chosen.plusCount,
    question_count: chosen.questionCount,
    is_today: isToday,
    is_past: isPast,
    attendees,
    maybes
  };
}
