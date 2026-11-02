import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');
import { getAccessToken } from './auth.js';

const BASKETBALL_EMOJI = '🏀';
const QUESTION_EMOJI = '❓';
const PLUS_EMOJIS = ['➕', '\u{2795}', '\u{FF0B}'];

// Regular expression to identify game call announcements
const GAME_CALL_REGEX = /(?:call for|game call|pickup|run at|hoops at|bball at)/i;

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

/**
 * Checks whether text appears to refer to today's date.
 */
function checkIfToday(text, messageDate) {
  if (!text) return false;
  const lower = text.toLowerCase();
  if (lower.includes('today')) return true;

  const now = new Date();
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const shortDayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  const currentDayName = dayNames[now.getDay()];
  const currentShortDay = shortDayNames[now.getDay()];
  const currentMonth = monthNames[now.getMonth()];
  const currentDayNum = now.getDate();

  // Check day name e.g. "Monday" or "Mon"
  const hasDay = lower.includes(currentDayName) || lower.includes(currentShortDay);
  // Check date number e.g. "Oct 26" or "26th" or "10/26"
  const hasDate = lower.includes(`${currentMonth} ${currentDayNum}`) ||
                  lower.includes(`${currentDayNum}th`) ||
                  lower.includes(`${currentDayNum}st`) ||
                  lower.includes(`${currentDayNum}nd`) ||
                  lower.includes(`${currentDayNum}rd`);

  if (hasDay && hasDate) return true;
  if (hasDate) return true;

  // If posted today and mentions today's day name
  if (messageDate) {
    const msgDate = new Date(messageDate);
    const isPostedToday = msgDate.toDateString() === now.toDateString();
    if (isPostedToday && hasDay) return true;
  }

  return false;
}

/**
 * Fetches recent messages from a Google Chat space and identifies the latest active game call.
 */
export async function getActiveGameCall(spaceId) {
  const token = await getAccessToken();
  let pageToken = '';
  const maxPages = 2;

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

      const isMatch = GAME_CALL_REGEX.test(text) || totalRsvpCount > 0;
      if (isMatch) {
        const isToday = checkIfToday(text, msg.createTime);
        return {
          message_id: msg.name,
          text: text.trim(),
          sender: msg.sender?.displayName || 'Unknown',
          create_time: msg.createTime,
          basketball_count: totalRsvpCount,
          ball_count: bballCount,
          plus_count: plusCount,
          question_count: questionCount,
          is_today: isToday
        };
      }
    }

    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  return null;
}
