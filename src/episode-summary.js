// Compact, factual episode labels for the Memory Map. This is deliberately a
// selector and condenser, not a story generator: every word comes from the
// recorded card's goal, task, or moment.

export const EPISODE_TITLE_LIMIT = 64;

const FILLER_WORDS = new Set([
  'a', 'an', 'and', 'are', 'can', 'could', 'for', 'from', 'how', 'i', 'in',
  'is', 'it', 'my', 'of', 'on', 'or', 'please', 'the', 'this', 'to', 'we',
  'with', 'would', 'you', 'your',
]);

function cleanText(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\s+/g, ' ')
    .replace(/^(?:user\s+(?:question|request|ask)|(?:session\s+)?(?:goal|task|mission))\s*:\s*/i, '')
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .trim();
}

/**
 * Keep an actual phrase where possible. If a raw prompt has no natural break,
 * reduce it to its first meaningful words rather than showing a CSS-clipped
 * fragment or inventing a new description.
 */
export function compactEpisodeText(value, limit = EPISODE_TITLE_LIMIT) {
  const text = cleanText(value);
  if (text.length <= limit) return text;

  const prefix = text.slice(0, limit + 1);
  const punctuation = Math.max(prefix.lastIndexOf('. '), prefix.lastIndexOf('; '), prefix.lastIndexOf(': '));
  if (punctuation >= Math.floor(limit * 0.45)) return prefix.slice(0, punctuation + 1).trim();

  const meaningful = text.split(/\s+/)
    .filter((word) => !FILLER_WORDS.has(word.replace(/[^\p{L}\p{N}_-]/gu, '').toLowerCase()));
  const words = (meaningful.length >= 3 ? meaningful : text.split(/\s+/));
  let compact = '';
  for (const word of words) {
    const next = compact ? `${compact} ${word}` : word;
    if (next.length > limit) break;
    compact = next;
    if (compact.split(/\s+/).length >= 8) break;
  }
  return compact.replace(/[,:;\-–—]+$/u, '').trim();
}

function headlineMoment(moments) {
  if (!Array.isArray(moments)) return null;
  let selected = null;
  let selectedAt = -Infinity;
  for (let index = 0; index < moments.length; index++) {
    const moment = moments[index];
    if (!moment || (moment.kind !== 'win' && moment.kind !== 'frustration')) continue;
    if (!cleanText(moment.text)) continue;
    const at = Number.isFinite(moment.at) ? moment.at : index;
    if (!selected || at >= selectedAt) {
      selected = moment;
      selectedAt = at;
    }
  }
  return selected;
}

/** Choose the final recorded high-signal moment, then an actual task, then the mission. */
export function episodeHeadline(card) {
  const moment = headlineMoment(card?.moments);
  if (moment) {
    const prefix = moment.kind === 'frustration' ? 'FACEPALM: ' : 'BREAKTHROUGH: ';
    return `${prefix}${compactEpisodeText(moment.text, EPISODE_TITLE_LIMIT - prefix.length)}`;
  }

  const tasks = Array.isArray(card?.tasks) ? card.tasks : [];
  const completed = tasks.find((task) => task?.completed && cleanText(task.name));
  const task = completed ?? tasks.find((candidate) => cleanText(candidate?.name));
  if (task) return compactEpisodeText(task.name);

  return compactEpisodeText(card?.goal) || 'Recorded session';
}
