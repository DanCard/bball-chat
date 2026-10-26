import { getAccessToken } from './auth.js';

const BASKETBALL_EMOJI = '🏀';
const QUESTION_EMOJI = '❓';

// Regular expression to identify game call announcements
const GAME_CALL_REGEX = /(?:call for|game call|pickup|run at|hoops at|bball at)/i;

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
  const url = `https://chat.googleapis.com/v1/${spaceId}/messages?pageSize=15&orderBy=createTime%20desc`;

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

    for (const r of reactions) {
      const unicode = r.emoji?.unicode;
      if (unicode === BASKETBALL_EMOJI || unicode === '\u{1F3C0}') {
        bballCount += r.reactionCount || 0;
      } else if (unicode === QUESTION_EMOJI || unicode === '\u{2753}') {
        questionCount += r.reactionCount || 0;
      }
    }

    const isMatch = GAME_CALL_REGEX.test(text) || bballCount > 0;
    if (isMatch) {
      const isToday = checkIfToday(text, msg.createTime);
      return {
        message_id: msg.name,
        text: text.trim(),
        sender: msg.sender?.displayName || 'Unknown',
        create_time: msg.createTime,
        basketball_count: bballCount,
        question_count: questionCount,
        is_today: isToday
      };
    }
  }

  return null;
}
