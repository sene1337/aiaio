// Memory Map — deterministic campaign ordering over the player's real session
// history. It only groups and describes recorded dates, outcomes, and metrics.

import type { LevelEntry, LevelProgress } from './levels';

export interface MemoryChapter {
  index: number;
  label: string;
  entries: LevelEntry[];
}

export interface MemoryEra {
  index: number;
  label: string;
  chapters: MemoryChapter[];
}

export interface JourneyRecommendation {
  entry: LevelEntry;
  reason: string;
}

export interface MemoryMap {
  eras: MemoryEra[];
  recommendation: JourneyRecommendation | null;
}

export type ProgressFor = (sessionId: string) => LevelProgress | null;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const MAX_CHAPTER_SIZE = 5;
const ERA_GAP_DAYS = 14;

/** Scanner dates win; old indexes can fall back to their recorded mtime. */
export function sessionDate(entry: LevelEntry): string | null {
  if (typeof entry.when === 'string' && DATE_RE.test(entry.when)) return entry.when;
  if (typeof entry.mtime === 'number' && Number.isFinite(entry.mtime)) {
    return new Date(entry.mtime).toISOString().slice(0, 10);
  }
  return null;
}

function compareChronological(a: LevelEntry, b: LevelEntry): number {
  const aDate = sessionDate(a) ?? '9999-12-31';
  const bDate = sessionDate(b) ?? '9999-12-31';
  return aDate.localeCompare(bDate) || a.session_id.localeCompare(b.session_id);
}

function daysBetween(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  return Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS);
}

function recovered(progress: LevelProgress | null): boolean {
  // v2.4 progress stored ranks only. A/S are the only historical records that
  // prove real task engagement under the former rules.
  return progress?.recovered ?? (progress?.rank === 'S' || progress?.rank === 'A');
}

function perfect(progress: LevelProgress | null): boolean {
  return progress?.perfect ?? progress?.rank === 'S';
}

function chapterLabel(entries: LevelEntry[]): string {
  const start = sessionDate(entries[0]);
  const end = sessionDate(entries[entries.length - 1]);
  if (!start) return 'undated local records';
  return start === end ? start : `${start} → ${end ?? start}`;
}

function buildChapters(entries: LevelEntry[]): MemoryChapter[] {
  const chapters: MemoryChapter[] = [];
  for (let start = 0; start < entries.length;) {
    const remaining = entries.length - start;
    // Keep normal chapters to 3–5 sessions. Sparse factual eras can remain
    // shorter rather than borrowing a session across a real date gap.
    const size = remaining <= MAX_CHAPTER_SIZE ? remaining
      : remaining === MAX_CHAPTER_SIZE + 1 ? 3
        : remaining === MAX_CHAPTER_SIZE + 2 ? 4
          : MAX_CHAPTER_SIZE;
    const chapterEntries = entries.slice(start, start + size);
    chapters.push({ index: chapters.length + 1, label: chapterLabel(chapterEntries), entries: chapterEntries });
    start += size;
  }
  return chapters;
}

function buildEras(entries: LevelEntry[]): MemoryEra[] {
  const eraEntries: LevelEntry[][] = [];
  let current: LevelEntry[] = [];
  for (const entry of entries) {
    const previous = current[current.length - 1];
    if (current.length > 0 && daysBetween(sessionDate(previous), sessionDate(entry)) >= ERA_GAP_DAYS) {
      eraEntries.push(current);
      current = [];
    }
    current.push(entry);
  }
  if (current.length > 0) eraEntries.push(current);
  return eraEntries.map((entriesForEra, index) => ({
    index: index + 1,
    label: chapterLabel(entriesForEra),
    chapters: buildChapters(entriesForEra),
  }));
}

/** The opening map shows one factual frontier chapter per era, not every record. */
export function focusedChapter(era: MemoryEra, progressFor: ProgressFor): MemoryChapter {
  for (const chapter of era.chapters) {
    if (chapter.entries.some((entry) => !recovered(progressFor(entry.session_id)))) return chapter;
  }
  for (const chapter of era.chapters) {
    if (chapter.entries.some((entry) => !perfect(progressFor(entry.session_id)))) return chapter;
  }
  return era.chapters[era.chapters.length - 1];
}

function recommend(entries: LevelEntry[], progressFor: ProgressFor): JourneyRecommendation | null {
  if (entries.length === 0) return null;
  const lastRecovered = entries.reduce<number>((latest, entry, index) =>
    recovered(progressFor(entry.session_id)) ? index : latest, -1);
  const next = entries.slice(lastRecovered + 1).find((entry) => !recovered(progressFor(entry.session_id)));
  if (next) {
    const prior = lastRecovered >= 0 ? sessionDate(entries[lastRecovered]) : null;
    return {
      entry: next,
      reason: prior
        ? `first unrecovered session after ${prior}`
        : 'earliest unrecovered session in your recorded history',
    };
  }

  const imperfect = entries.find((entry) => !perfect(progressFor(entry.session_id)));
  if (imperfect) return { entry: imperfect, reason: 'recovered already; a perfect recall remains' };

  const latest = entries[entries.length - 1];
  return { entry: latest, reason: 'most recent recorded session; all current records are recovered' };
}

export function buildMemoryMap(entries: LevelEntry[], progressFor: ProgressFor): MemoryMap {
  const chronological = [...entries].sort(compareChronological);
  return { eras: buildEras(chronological), recommendation: recommend(chronological, progressFor) };
}
