// Bootstrap for SESSION RUN: menu (card drop + scanned-session gallery),
// briefing, the run loop, keyboard input, recap.

import { Run, RunInput } from './run';
import { UI, escapeHtml } from './ui';
import {
  SessionCard, parseSessionCard, loadoutFromCard, randomCard,
  SESSION_CARD_SCHEMA, SessionMode,
} from './session';
import { qa } from './telemetry';
import { audio, audioMixer } from './audio';
import { music } from './music';
import { observer } from './observer';
import { startLogoLoop } from './logo';
import {
  LevelEntry, difficulty, tierOf, TIERS, getProgress, isCleared,
  isPerfect, isSurvived, campaignOutcome, computeRank, recordResult, CampaignOutcome,
  getCampaignProgress, isCampaignOrderUnlocked, recordCampaignResult,
} from './levels';
import { CampaignEntry, CampaignManifest, sourceDigest, validateManifest } from './campaign';
import { doneUnits, progressFrac, totalUnits } from './tasks';
import { buildMemoryMap, focusedChapter, MemoryChapter } from './history';
import { episodeHeadline } from './episode-summary.js';

type ScreenId = 'menu' | 'briefing' | 'match' | 'recap';

const $ = (id: string) => document.getElementById(id)!;

let run: Run | null = null;
let ui: UI;
let loadedCard: SessionCard | null = null;
let runCounter = 0;
let recapShown = false;
let progressRecorded = false;
type RankInfo = {
  rank: 'S' | 'A' | 'B' | 'C' | 'D';
  newBest: boolean;
  rankUp: boolean;
  prevBest: number | null;
  outcome: CampaignOutcome;
  campaignRecorded: boolean;
};
let lastRankInfo: RankInfo | null = null;
/** re-render THE VAULT (set by loadGallery) — call when returning to the menu */
let refreshVault: (() => void) | null = null;
type QAAutoplayController = import('../qa/autoplay').AutoplayController;
let qaAutoplay: QAAutoplayController | null = null;
let qaAutoplayCard: SessionCard | null = null;
let qaAutoplayMode: SessionMode = 'demo';
let gallerySessionCount = 0;
type CampaignRun = { manifest: CampaignManifest; entry: CampaignEntry };

function showScreen(id: ScreenId): void {
  for (const s of ['menu', 'briefing', 'match', 'recap']) {
    $(`screen-${s}`).classList.toggle('hidden', s !== id);
  }
}

// ---------------------------------------------------------------------------
// card loading: drag-drop, file picker, and the scanned-session gallery
// ---------------------------------------------------------------------------

function setCard(card: SessionCard, sourceName: string): void {
  loadedCard = card;
  const status = $('card-status-0');
  status.classList.add('loaded');
  const errs = (card.errors ?? []).reduce((s, e) => s + (e.count ?? 1), 0);
  status.textContent = `✔ ${sourceName}: "${card.session_id ?? '?'}", ${errs} errors, ` +
    `${card.tasks?.length ?? 0} tasks, stability ${card.stability_score ?? 'n/a'}`;
  // the hero panel is the menu's focal point: what you picked, why it matters
  const hero = document.getElementById('hero-episode');
  if (hero) {
    const kicker = hero.querySelector('.hero-kicker');
    const headline = hero.querySelector('.hero-headline');
    const facts = hero.querySelector('.hero-facts');
    if (kicker) kicker.textContent = 'SELECTED EPISODE';
    if (headline) {
      headline.textContent = episodeHeadline(card);
      headline.classList.remove('dim');
    }
    if (facts) {
      facts.textContent = [
        card.when, card.harness,
        `${card.tasks?.length ?? 0} tasks`, `${errs} errors`,
        card.goal ? `goal: ${card.goal.slice(0, 90)}` : '',
      ].filter(Boolean).join(' · ');
    }
  }
}

function wireCardSlot(): void {
  const drop = $('drop-0');
  const fileInput = $('file-0') as HTMLInputElement;
  const readFile = (file: File) => {
    file.text()
      .then((text) => setCard(parseSessionCard(text), file.name))
      .catch((err) => {
        const status = $('card-status-0');
        status.classList.remove('loaded');
        status.textContent = `✕ could not read card: ${err instanceof Error ? err.message : String(err)}`;
      });
  };
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragover'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('dragover');
    const file = e.dataTransfer?.files?.[0];
    if (file) readFile(file);
  });
  drop.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id !== 'pick-0') fileInput.click();
  });
  $('pick-0').addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) readFile(file);
    fileInput.value = '';
  });
}

/**
 * Persona pack: authored Observer commentary at public/packs/observer.json,
 * usually written by the player's own agent (see AGENTS.md). Optional; a 404
 * means the built-in personality flies solo.
 */
async function loadPersonaPack(): Promise<void> {
  try {
    const res = await fetch('./packs/observer.json');
    if (!res.ok) return;
    if (observer.loadPack(await res.json())) {
      console.info(`[aiaio] observer persona pack loaded: ${observer.packName}`);
    }
  } catch { /* no pack, no problem */ }
}

/** Gallery of cards produced by `npm run scan` (public/cards/index.json). */
async function loadGallery(): Promise<void> {
  const box = $('gallery');
  try {
    const res = await fetch('./cards/index.json');
    if (!res.ok) throw new Error('none');
    const index: Array<{ file: string; session_id: string; errors: number; enemies?: number; tasks: number; stability: number | null }> = await res.json();
    if (!Array.isArray(index) || index.length === 0) throw new Error('empty');
    const entries = index as LevelEntry[];
    gallerySessionCount = entries.filter((entry) => entry.harness !== 'fictional').length;
    const PER_FOLDER = 24;
    const openTiers = new Set<number>();
    let view: 'journey' | 'library' = 'journey';
    let libraryFilter = '';

    const entryGoal = (entry: LevelEntry): string => typeof entry.goal === 'string' && entry.goal
      ? entry.goal : 'session goal not indexed yet';
    const entryHeadline = (entry: LevelEntry): string => typeof entry.headline === 'string' && entry.headline
      ? entry.headline : episodeHeadline(entry);
    const entryMeta = (entry: LevelEntry): string => {
      const p = getProgress(entry.session_id);
      const diff = difficulty(entry);
      const dateAndHarness = [entry.when, entry.harness].filter(Boolean).join(' · ');
      const rank = p ? ` · ★${p.rank}` : '';
      return `${dateAndHarness ? dateAndHarness + ' · ' : ''}${entry.tasks} task${entry.tasks === 1 ? '' : 's'} · ${entry.errors} errors · diff ${diff}${rank}`;
    };
    const entryGlyph = (entry: LevelEntry): string => {
      const p = getProgress(entry.session_id);
      return isPerfect(p) ? '✦' : isCleared(p) ? '☒' : isSurvived(p) ? '◉' : '☐';
    };
    const loadEntry = async (entry: LevelEntry): Promise<void> => {
      try {
        const cardRes = await fetch(`./cards/${entry.file}`);
        setCard(parseSessionCard(await cardRes.text()), entry.file);
      } catch {
        $('card-status-0').textContent = `✕ could not load ${entry.file}`;
      }
    };
    const makeEntryButton = (entry: LevelEntry, extra = ''): HTMLButtonElement => {
      const btn = document.createElement('button');
      btn.className = 'cmd level';
      btn.title = [entryHeadline(entry), entry.goal, entryMeta(entry)].filter(Boolean).join('\n');
      btn.innerHTML = `<span class="caret">❯</span><span class="cmd-name">${entryGlyph(entry)} ${escapeHtml(entryHeadline(entry))}</span>` +
        `<span class="cmd-desc">${escapeHtml(entryMeta(entry))}${extra}</span>`;
      btn.addEventListener('click', () => { void loadEntry(entry); });
      return btn;
    };

    // Indexes created before v2.6.0 lack goals. Hydrate only the bounded
    // opening map from same-origin card files; new scans carry this inline.
    const map = buildMemoryMap(entries, getProgress);
    const mapEntries = new Set<LevelEntry>();
    map.recommendation && mapEntries.add(map.recommendation.entry);
    for (const era of map.eras.slice(0, 4)) {
      for (const entry of focusedChapter(era, getProgress).entries) mapEntries.add(entry);
    }
    await Promise.all([...mapEntries].filter((entry) => !entry.goal || !entry.headline).map(async (entry) => {
      try {
        const card = parseSessionCard(await (await fetch(`./cards/${entry.file}`)).text());
        entry.goal ??= card.goal ?? card.tasks?.[0]?.name;
        entry.headline ??= episodeHeadline(card);
      } catch { /* retained index entry may no longer have a local file */ }
    }));

    const renderTabs = (): void => {
      const tabs = document.createElement('div');
      tabs.className = 'gallery-tabs';
      for (const tab of ['journey', 'library'] as const) {
        const btn = document.createElement('button');
        btn.className = `linkish gallery-tab${view === tab ? ' active' : ''}`;
        btn.textContent = tab === 'journey' ? 'MEMORY MAP' : 'LIBRARY';
        btn.addEventListener('click', () => { view = tab; render(); });
        tabs.appendChild(btn);
      }
      box.appendChild(tabs);
    };

    const renderJourneyChapter = (chapter: MemoryChapter): void => {
      const section = document.createElement('section');
      section.className = 'memory-chapter';
      section.innerHTML = `<div class="memory-chapter-head"><span>CHAPTER ${chapter.index}</span><span class="dim">${escapeHtml(chapter.label)} · ${chapter.entries.length} recorded session${chapter.entries.length === 1 ? '' : 's'}</span></div>`;
      for (const entry of chapter.entries) section.appendChild(makeEntryButton(entry));
      box.appendChild(section);
    };

    const renderJourney = (): void => {
      const recoveredTotal = entries.filter((entry) => isCleared(getProgress(entry.session_id))).length;
      const head = document.createElement('div');
      head.className = 'memory-map-head';
      head.innerHTML = `<div>THE MEMORY MAP</div><div class="dim">${entries.length} recorded sessions · ${recoveredTotal} recovered · chronological and local</div>`;
      box.appendChild(head);
      if (map.recommendation) {
        const current = document.createElement('section');
        current.className = 'journey-current';
        current.innerHTML = `<div class="journey-kicker">▶ CONTINUE JOURNEY</div><div class="journey-reason">${escapeHtml(map.recommendation.reason)}</div>`;
        current.appendChild(makeEntryButton(map.recommendation.entry));
        box.appendChild(current);
      }
      for (const era of map.eras.slice(0, 4)) {
        const eraEntries = era.chapters.flatMap((chapter) => chapter.entries);
        const eraHead = document.createElement('div');
        eraHead.className = 'memory-era-head';
        eraHead.innerHTML = `<span>ERA ${era.index}</span><span class="dim">${escapeHtml(era.label)} · ${eraEntries.length} recorded session${eraEntries.length === 1 ? '' : 's'}</span>`;
        box.appendChild(eraHead);
        renderJourneyChapter(focusedChapter(era, getProgress));
      }
      if (map.eras.length > 4) {
        const more = document.createElement('div');
        more.className = 'hint';
        more.textContent = `${map.eras.length - 4} earlier/later eras remain in the Library.`;
        box.appendChild(more);
      }
    };

    const renderLibrary = (): void => {
      const q = libraryFilter.trim().toLowerCase();
      const buckets: LevelEntry[][] = TIERS.map(() => []);
      for (const entry of entries) {
        if (q && !`${entryGoal(entry)} ${entry.session_id} ${entry.harness ?? ''} ${entry.when ?? ''}`.toLowerCase().includes(q)) continue;
        buckets[tierOf(difficulty(entry)).index].push(entry);
      }
      buckets.forEach((bucket) => bucket.sort((a, b) => {
        const aRecovered = isCleared(getProgress(a.session_id)) ? 0 : 1;
        const bRecovered = isCleared(getProgress(b.session_id)) ? 0 : 1;
        return aRecovered - bRecovered || (a.mtime ?? 0) - (b.mtime ?? 0);
      }));

      const head = document.createElement('div');
      head.className = 'hint';
      head.style.textAlign = 'left';
      head.textContent = `LIBRARY · ${entries.length} sessions · every record is playable (type to filter):`;
      box.appendChild(head);
      const input = document.createElement('input');
      input.id = 'gallery-filter';
      input.setAttribute('aria-label', 'Filter sessions by goal, harness, or date');
      input.placeholder = 'filter by goal, harness (openclaw/hermes/claude), or date…';
      input.value = libraryFilter;
      input.addEventListener('input', () => { libraryFilter = input.value; render(); });
      box.appendChild(input);

      if (openTiers.size === 0) openTiers.add(0);
      for (const tier of TIERS) {
        const bucket = buckets[tier.index];
        if (bucket.length === 0 && !q) continue;
        const isOpen = openTiers.has(tier.index) || !!q;
        const folder = document.createElement('button');
        folder.className = 'cmd folder';
        folder.innerHTML = `<span class="caret">${isOpen ? '▾' : '▸'}</span><span class="cmd-name">${escapeHtml(tier.name)}/</span>` +
          `<span class="cmd-desc">${bucket.length} sessions · ${bucket.filter((entry) => isCleared(getProgress(entry.session_id))).length} recovered</span>`;
        folder.addEventListener('click', () => {
          if (openTiers.has(tier.index)) openTiers.delete(tier.index); else openTiers.add(tier.index);
          render();
        });
        box.appendChild(folder);
        if (!isOpen) continue;
        for (const entry of bucket.slice(0, PER_FOLDER)) box.appendChild(makeEntryButton(entry));
        if (bucket.length > PER_FOLDER) {
          const more = document.createElement('div');
          more.className = 'hint';
          more.style.textAlign = 'left';
          more.textContent = `  …${bucket.length - PER_FOLDER} more in this tier. filter to find them`;
          box.appendChild(more);
        }
      }
      if (q) {
        const refocus = document.getElementById('gallery-filter') as HTMLInputElement;
        refocus.focus(); refocus.setSelectionRange(libraryFilter.length, libraryFilter.length);
      }
    };

    const render = (): void => {
      box.innerHTML = '';
      renderTabs();
      if (view === 'journey') renderJourney(); else renderLibrary();
    };
    refreshVault = () => render();
    render();
  } catch {
    box.innerHTML = '<div class="hint" style="text-align:left">no scanned sessions. run <b>npm run scan</b> to auto-build cards from your OpenClaw / Claude Code / Hermes sessions, or drop a card above. vault still empty? <b>npm run doctor</b> explains why, or hand the whole thing to your agent (AGENTS.md is the playbook).</div>';
  }
}

// ---------------------------------------------------------------------------
// run setup
// ---------------------------------------------------------------------------

async function fetchCampaign(path: string): Promise<CampaignManifest> {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error('Campaign is not ready yet.');
  const manifest: unknown = await response.json();
  if (!validateManifest(manifest)) throw new Error('Campaign manifest is malformed and was not loaded.');
  return manifest;
}

function showPremiere(manifest: CampaignManifest): void {
  const modal = $('modal-premiere');
  const first = manifest.entries[0];
  const mode = manifest.kind === 'fictional' ? 'FICTIONAL PUBLIC CAMPAIGN'
    : manifest.kind === 'remix' ? `REMIX · ${manifest.recipe.remixProfile?.toUpperCase() ?? 'BALANCED'}`
      : 'FACTUAL LOCAL CAMPAIGN';
  $('premiere-title').textContent = manifest.kind === 'fictional' ? 'THE OPENCLAW + HERMES CAMPAIGN' : `${manifest.kind === 'opening' ? 'MY OPENING' : 'MY CAMPAIGN'}`;
  $('premiere-copy').textContent = `${mode} · ${manifest.entries.length} levels · ${manifest.writerStatus === 'custom' ? 'authored presentation ready' : 'baseline presentation ready'}`;
  $('premiere-first').textContent = `01 · ${first.title ?? first.sourceSessionId}`;
  $('btn-premiere-begin').onclick = () => { modal.classList.add('hidden'); void startCampaign(manifest, first); };
  const levels = $('premiere-levels');
  levels.replaceChildren();
  const progress = getCampaignProgress(manifest);
  for (const entry of manifest.entries) {
    const button = document.createElement('button');
    const unlocked = isCampaignOrderUnlocked(progress, entry.order);
    button.className = `cmd${unlocked ? '' : ' disabled'}`;
    button.disabled = !unlocked;
    button.innerHTML = `<span class="caret">${unlocked ? '❯' : '·'}</span><span class="cmd-name">${String(entry.order).padStart(2, '0')} · ${escapeHtml(entry.title ?? entry.sourceSessionId)}</span><span class="cmd-desc">${unlocked ? 'play level' : 'clear the previous level to unlock'}</span>`;
    if (unlocked) button.addEventListener('click', () => { modal.classList.add('hidden'); void startCampaign(manifest, entry); });
    levels.appendChild(button);
  }
  modal.classList.remove('hidden');
}

async function startCampaign(manifest: CampaignManifest, entry: CampaignEntry): Promise<void> {
  const progress = getCampaignProgress(manifest);
  if (!isCampaignOrderUnlocked(progress, entry.order)) {
    $('enrich-status').textContent = `Level ${entry.order} unlocks after you clear level ${entry.order - 1}.`;
    $('modal-enrich').classList.remove('hidden');
    return;
  }
  try {
    const response = await fetch(`./cards/${entry.file}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('The campaign source card is unavailable.');
    const card = parseSessionCard(await response.text());
    if (manifest.kind !== 'fictional' && sourceDigest(card) !== entry.sourceDigest) {
      throw new Error('This campaign no longer matches its source snapshot. Enrich again after rescanning.');
    }
    const mode: SessionMode = manifest.kind === 'fictional' ? 'fictional' : manifest.kind === 'remix' ? 'remix' : 'real';
    prepareRun(card, mode, { manifest, entry });
  } catch (error) {
    $('enrich-status').textContent = error instanceof Error ? error.message : String(error);
    $('modal-enrich').classList.remove('hidden');
  }
}

function openEnrichment(profile: 'opening' | 'campaign'): void {
  const modal = $('modal-enrich');
  const need = profile === 'opening' ? 6 : 15;
  $('enrich-title').textContent = profile === 'opening' ? 'SHAPE MY OPENING' : 'BUILD MY CAMPAIGN';
  $('enrich-copy').textContent = profile === 'opening'
    ? 'Creates six chronological real-session levels. Your raw SessionCards stay unchanged.'
    : 'Creates a curated 15–24-level campaign. Your raw SessionCards stay unchanged.';
  $('enrich-consent').textContent = `This sends redacted session excerpts from ${need} or more local cards to your configured AI for campaign presentation. It never uploads them in a hosted build.`;
  $('enrich-status').textContent = gallerySessionCount < need
    ? `You need ${need} eligible sessions; ${gallerySessionCount} are currently available. Library play remains available — try the public campaign meanwhile.`
    : 'Review the notice, then begin the local job.';
  const begin = $('btn-enrich-start') as HTMLButtonElement;
  begin.disabled = gallerySessionCount < need || !import.meta.env.DEV;
  begin.onclick = () => { void beginEnrichment(profile); };
  modal.classList.remove('hidden');
}

let enrichmentPoll: number | null = null;

async function beginEnrichment(profile: 'opening' | 'campaign'): Promise<void> {
  if (!import.meta.env.DEV) { $('enrich-status').textContent = 'Personal enrichment is local-dev only. The public campaign is ready to play.'; return; }
  $('enrich-status').textContent = 'Starting local campaign enrichment…';
  try {
    const response = await fetch('/__enrich/campaign', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile, selection: 'story', pace: 'balanced', tone: 'dry mission control' }),
    });
    const status = await response.json() as { status?: string; detail?: string };
    $('enrich-status').textContent = status.detail ?? 'Enrichment started.';
    if (enrichmentPoll !== null) window.clearInterval(enrichmentPoll);
    enrichmentPoll = window.setInterval(() => { void pollEnrichment(); }, 1200);
  } catch { $('enrich-status').textContent = 'Could not start the local enrichment job.'; }
}

async function pollEnrichment(): Promise<void> {
  try {
    const response = await fetch('/__enrich/status', { cache: 'no-store' });
    const status = await response.json() as { status?: string; detail?: string };
    $('enrich-status').textContent = status.detail ?? String(status.status ?? 'working');
    if (status.status === 'ready') {
      if (enrichmentPoll !== null) { window.clearInterval(enrichmentPoll); enrichmentPoll = null; }
      $('modal-enrich').classList.add('hidden');
      showPremiere(await fetchCampaign('./cards/campaigns/latest.json'));
    }
    if (status.status === 'failed' || status.status === 'cancelled') {
      if (enrichmentPoll !== null) { window.clearInterval(enrichmentPoll); enrichmentPoll = null; }
    }
  } catch { /* the next poll can recover after Vite reloads */ }
}

function prepareRun(card: SessionCard, mode: SessionMode, campaign?: CampaignRun): void {
  runCounter++;
  const name = card.session_id ? `agent:${String(card.session_id).slice(0, 14)}` : 'AGENT-01';
  let loadout = loadoutFromCard(card, name, { mode });
  // Campaign task labels are display copy only. Counts, timeline positions,
  // completion, and the untouched SessionCard remain source-derived.
  if (campaign?.entry.taskLabel && loadout.tasks.length > 0) {
    loadout = { ...loadout, tasks: loadout.tasks.map((task, index) => index === 0 ? { ...task, name: campaign.entry.taskLabel! } : task) };
  }
  // campaign context for the briefing: computed difficulty + any existing rank
  const entryLike: LevelEntry = {
    file: '', session_id: String(card.session_id ?? 'unknown'),
    errors: (card.errors ?? []).reduce((s, e) => s + (e.count ?? 1), 0),
    tasks: card.tasks?.length ?? 0, stability: card.stability_score ?? null,
    messages: card.message_count ?? 120,
    token_peak: card.token_peak ?? null, compactions: card.compaction_events ?? 0,
    work: (card.tasks ?? []).reduce((s, t) => s + (t.work_units ?? 2), 0),
  };
  const diff = difficulty(entryLike);
  const prevProgress = getProgress(entryLike.session_id);

  run = new Run({ loadout, card, name, campaignEntry: campaign?.entry, campaignRecipe: campaign?.manifest.recipe });
  (window as any).__aiaio = run; // debug/testing handle
  recapShown = false;
  progressRecorded = false;
  lastRankInfo = null;
  qa.startRun(String(card.session_id ?? 'unknown'), loadout.cardSummary.fromCard);
  observer.bindSink((line) => run?.pushLog(line));
  observer.onRunStart({
    goal: run.goal,
    sessionId: String(card.session_id ?? 'unknown'),
    topError: loadout.cardSummary.topErrorCategory,
    tasksTotal: loadout.tasks.length,
    stability: loadout.stability,
  });
  run.emit = (type, data = {}) => {
    qa.event(type, data);
    ui.fx(type, data);
    routeAudio(type, data);
    observer.onEvent(type, data);
    // grade + persist synchronously the moment the run ends — no frame loop,
    // no banner gates, no way to lose it by quitting fast
    if ((type === 'win' || type === 'death') && run && !progressRecorded) {
      progressRecorded = true;
      const isRealRun = mode === 'real';
      const outcome = campaignOutcome(
        type === 'win',
        isRealRun ? totalUnits(run.queue) : 0,
        isRealRun ? doneUnits(run.queue) : 0,
        isRealRun ? run.queue.tasks.filter((task) => task.done).length : 0,
      );
      const rank = computeRank(outcome, progressFrac(run.queue));
      const rec = isRealRun
        ? recordResult(run.loadout.cardSummary.sessionId, rank, Number(data.score) || 0, outcome)
        : { newBest: false, rankUp: false, prev: null };
      if (campaign) recordCampaignResult(campaign.manifest, campaign.entry.order, type === 'win', Number(data.score) || 0);
      lastRankInfo = {
        rank, newBest: rec.newBest, rankUp: rec.rankUp, prevBest: rec.prev?.bestScore ?? null,
        outcome, campaignRecorded: isRealRun,
      };
      qa.event('rank', { rank, score: Number(data.score) || 0, newBest: rec.newBest, ...outcome });
    }
  };
  const prevStatus = !prevProgress ? null
    : isPerfect(prevProgress) ? `perfect recall · best ${prevProgress.bestScore.toLocaleString()}`
      : isCleared(prevProgress) ? `recovered · best ${prevProgress.bestScore.toLocaleString()}`
        : isSurvived(prevProgress) ? `survived · best ${prevProgress.bestScore.toLocaleString()}`
          : `attempted · best ${prevProgress.bestScore.toLocaleString()}`;
  ui.buildBriefing(loadout, card, name, {
    diff, tierName: tierOf(diff).name,
    prevRank: prevStatus,
    mode,
  });
  showScreen('briefing');

  // Campaign copy is authored during explicit enrichment. Starting a run never
  // invokes an agent; the built-in roast remains the no-network fallback.
  const meta = {
    sessionId: String(card.session_id ?? 'unknown'),
    harness: card.harness ?? null,
    when: card.when ?? null,
    goal: card.goal ?? loadout.tasks[0]?.name ?? null,
    topError: loadout.cardSummary.topErrorCategory,
    topErrorCount: loadout.cardSummary.topErrorCount,
    compactions: loadout.cardSummary.compactionEvents,
    tasksTotal: Math.max(loadout.cardSummary.tasksTotal, loadout.tasks.length),
    tasksCompleted: loadout.cardSummary.tasksCompleted,
    stability: loadout.stability,
  };
  const composed = observer.briefingRoast(meta);
  ui.setBriefingRoast(composed, 'composed');
  const thisRun = run;
  let spoken = false;
  const speakIfCurrent = (lines: string[]) => {
    if (spoken || run !== thisRun || $('screen-briefing').classList.contains('hidden')) return;
    spoken = true;
    observer.speakRoast(lines);
  };
  observer.setSessionPack([]);
  window.setTimeout(() => speakIfCurrent(composed), 6000);
}

function routeAudio(type: string, data: Record<string, unknown>): void {
  const worldX = Number(data.x);
  const pan = run && Number.isFinite(worldX)
    ? Math.max(-0.9, Math.min(0.9, (worldX - run.avatar.x) / 420)) : 0;
  switch (type) {
    case 'fire': {
      const w = String(data.weapon ?? '');
      if (w === 'debug_zap') audio.zap(pan);
      else if (w === 'false_positive_laser') audio.laser(pan);
      else audio.fire(w === 'context_nuke' || w === 'timeout_mortar' || w === 'regression_cluster', pan);
      break;
    }
    case 'explosion': audio.explode(Number(data.radius) || 20, pan); break;
    case 'kill': data.by === 'sub' ? audio.subKill(pan) : audio.kill(data.direct === true, pan); break;
    case 'damage': audio.hurt(); break;
    case 'threat_warning': audio.threatWarning(String(data.kind ?? ''), pan); break;
    case 'compaction': audio.compaction(); break;
    case 'work_tick': audio.taskTick(); break;
    case 'task_done': audio.taskDone(); break;
    case 'task_eaten': audio.taskEaten(); break;
    case 'update_install': audio.update(data.netBuff === true); break;
    case 'model_upgrade': audio.win(false); break;
    case 'subagent_spawn': audio.subagentSpawn(pan); break;
    case 'subagent_corrupted': audio.subagentCorrupted(pan); break;
    case 'subagent_eaten': audio.subagentDied(pan); break;
    case 'subagent_died': audio.subagentDied(pan); break;
    case 'perm_granted': audio.permissionGranted(); break;
    case 'shield_absorb': audio.shieldAbsorb(); break;
    case 'near_miss': audio.nearMiss(pan); break;
    case 'voluntary_compact': audio.update(true); break;
    case 'crate_choice': audio.select(); break;
    case 'pickup': audio.pickup(); break;
    case 'weapon_select': audio.select(); break;
    case 'death': audio.death(); break;
    case 'win': audio.win(data.perfect === true); break;
  }
}

// ---------------------------------------------------------------------------
// input
// ---------------------------------------------------------------------------

const held = new Set<string>();

function currentInput(): RunInput {
  return {
    left: held.has('ArrowLeft') || held.has('a') || held.has('A'),
    right: held.has('ArrowRight') || held.has('d') || held.has('D'),
    work: held.has('w') || held.has('W'),
    down: held.has('ArrowDown'),
  };
}

async function startDevQA(): Promise<void> {
  if (!import.meta.env.DEV) return;
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('qa');
  if (mode !== 'autoplay' && mode !== 'manual') return;
  try {
    const { loadAutoplay } = await import('../qa/autoplay');
    const loaded = await loadAutoplay(params);
    qaAutoplayCard = loaded.card;
    qaAutoplayMode = params.get('card') ? 'real' : 'demo';
    setCard(loaded.card, loaded.sourceName);
    prepareRun(loaded.card, qaAutoplayMode);
    if (mode === 'autoplay') {
      qaAutoplay = loaded.controller;
      qaAutoplay.reset();
      showScreen('match');
    }
  } catch (err) {
    console.error(`[aiaio] QA ${mode} failed:`, err);
  }
}

const FEATURE_KEYS: Record<string, string> = {
  ' ': 'fire', 'ArrowUp': 'jump', 'ArrowLeft': 'move', 'ArrowRight': 'move',
  'a': 'move', 'd': 'move', 'w': 'work', 'u': 'update', '[': 'weapon_cycle', ']': 'weapon_cycle',
};

function wireKeyboard(): void {
  window.addEventListener('keydown', (e) => {
    // typing in an input (gallery filter) must never trigger game shortcuts
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    held.add(e.key);
    audio.ensure(); // first gesture unlocks the AudioContext
    music.ensure();
    if (e.key === 'm' || e.key === 'M') {
      const muted = audio.toggleMute();
      music.setMuted(muted);
      qa.event('mute_toggle', { muted });
      return;
    }
    if ((e.key === 'v' || e.key === 'V') && e.shiftKey) {
      const name = observer.cycleVoice();
      run?.pushLog(`☏ observer voice → ${name}`);
      qa.event('voice_cycle', { name });
      return;
    }
    if (e.key === 'v' || e.key === 'V') {
      const on = observer.toggleVoice();
      run?.pushLog(`☏ observer voice ${on ? 'on' : 'off. the judgment continues in text'}`);
      qa.event('voice_toggle', { on });
      return;
    }
    if (!run || run.over || $('screen-match').classList.contains('hidden')) return;
    const k = e.key;
    const feature = FEATURE_KEYS[k.toLowerCase()] ?? FEATURE_KEYS[k];
    if (feature) qa.firstUseOf(feature);
    if (/^[1-9]$/.test(k)) qa.firstUseOf('weapon_number');
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(k)) e.preventDefault();
    switch (k) {
      case ' ': run.fire(); break;
      case 'ArrowUp': run.jump(); break;
      case 'u': case 'U': run.installUpdate(); break;
      case 's': case 'S': run.spawnSubagent(); qa.firstUseOf('subagent'); break;
      case 'c': case 'C': run.voluntaryCompact(); qa.firstUseOf('voluntary_compact'); break;
      case '[': run.cycleWeapon(-1); break;
      case ']': run.cycleWeapon(1); break;
      default:
        if (/^[1-9]$/.test(k)) {
          // numbers drive the crate menu when one is open, weapons otherwise
          if (run.crateMenu) run.chooseCrateOption(parseInt(k, 10) - 1);
          else run.selectWeapon(parseInt(k, 10) - 1);
        }
    }
  });
  window.addEventListener('click', () => audio.ensure());
  window.addEventListener('keyup', (e) => held.delete(e.key));
  window.addEventListener('blur', () => held.clear());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') held.clear(); // no stuck keys (L-2)
  });
}

// ---------------------------------------------------------------------------
// frame loop
// ---------------------------------------------------------------------------

let lastT = 0;
let snapshotAccum = 0;

let crashShown = false;

function frame(t: number): void {
  try {
    frameBody(t);
  } catch (err) {
    // one bad frame must never kill the game forever (H-1)
    console.error('[aiaio] frame error:', err);
    if (!crashShown && run) {
      crashShown = true;
      try {
        run.pushBanner({
          kind: 'compaction', ttl: 6,
          title: '☠ SEGFAULT (recovered)',
          lines: ['a frame crashed and was skipped. if this repeats, reload', String(err).slice(0, 90)],
        });
      } catch { /* even the banner failed; the loop survives anyway */ }
    }
  } finally {
    requestAnimationFrame(frame);
  }
}

function frameBody(t: number): void {
  const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
  lastT = t;
  if (run && !$('screen-match').classList.contains('hidden')) {
    run.step(dt, import.meta.env.DEV && qaAutoplay ? qaAutoplay.input(run, dt) : currentInput());
    ui.render(run, dt);
    // QA snapshot every 2s: position, vitals, wall gap — the learning-curve data
    snapshotAccum += dt;
    if (snapshotAccum >= 2 && !run.over) {
      snapshotAccum = 0;
      qa.event('snapshot', {
        x: Math.round(run.avatar.x), pct: Math.round((run.avatar.x / run.terrain.width) * 100),
        hp: Math.round(run.avatar.hp), shield: Math.round(run.avatar.shield),
        ctx: run.ctx.used, wallGap: Math.round(run.avatar.x - run.wallX),
        working: run.working, weapon: run.weapons[run.selected].def.id,
      });
    }
    // wall proximity heartbeat (self rate-limited)
    const wallGapNow = run.avatar.x - run.wallX;
    if (!run.over && wallGapNow < 300) audio.wallHeartbeat(1 - Math.max(0, wallGapNow) / 300);
    // observer's ambient judgment
    observer.tick(dt, run.over ? null : {
      wallGap: run.avatar.x - run.wallX,
      tasksRemain: run.queue.tasks.some((t) => !t.done && !t.forgotten),
      zapThink: run.zapThink,
    });
    // music tension: wall gap + context pressure + inside-the-forgetting
    const gap = run.avatar.x - run.wallX;
    const gapT = Math.max(0, Math.min(1, 1 - gap / 800));
    const ctxT = Math.min(1, run.ctx.used / (run.ctx.budget * run.ctx.threshold));
    music.tension = run.over ? 0.15 : Math.min(1, gapT * 0.75 + ctxT * 0.35);
    music.inside = !run.over && run.insideWall;
    if (run.over && !recapShown && !run.bannerActive) {
      recapShown = true;
      const r = run;
      window.setTimeout(() => {
        if (run === r && r.over) {
          ui.buildRecap(r, lastRankInfo ?? undefined);
          showScreen('recap');
        }
      }, 1500);
    }
  }
  if (import.meta.env.DEV && qaAutoplay && run && qaAutoplayCard && qaAutoplay.shouldRestart(run, dt)) {
    qaAutoplay.reset();
    prepareRun(qaAutoplayCard, qaAutoplayMode);
    showScreen('match');
  }
  // (re-scheduling happens in frame()'s finally — guaranteed even on throw)
}

// ---------------------------------------------------------------------------
// wire it up
// ---------------------------------------------------------------------------

function main(): void {
  // honest gate for touch-only devices: the beta needs a keyboard (M-5)
  const touchOnly = window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(pointer: fine)').matches;
  if (touchOnly) {
    document.body.innerHTML = `
      <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px;text-align:center;background:#0f0f0e;color:#dedad2;font-family:ui-monospace,Menlo,monospace">
        <div style="color:#d97757;font-size:28px;letter-spacing:0.2em">AIAIO</div>
        <div style="max-width:420px;font-size:14px;line-height:1.7">this beta needs a <b>desktop + keyboard</b>.
        it's a game about replaying your agent sessions, and the controls are all keys.</div>
        <div style="color:#8f8b82;font-size:12px;max-width:420px;line-height:1.7">bookmark it for your laptop:
        clone the repo, <code>npm run scan</code> your own sessions, and play your actual history.</div>
      </div>`;
    return;
  }

  ui = new UI();
  (window as any).__ui = ui; // debug/testing handle
  (window as any).__observer = observer;
  observer.bindCaptionSink((speaker, text, active) => ui.setCaption(speaker, text, active));
  observer.bindSpeechState((active) => audio.setSpeechActive(active));
  const logoEl = document.querySelector('.ascii-logo');
  if (logoEl) startLogoLoop(logoEl as HTMLElement);
  wireCardSlot();
  wireKeyboard();
  loadGallery();
  loadPersonaPack();

  $('btn-run').addEventListener('click', () => {
    prepareRun(loadedCard ?? randomCard(`random-session-${runCounter + 1}`), loadedCard ? 'real' : 'random');
  });
  // ENRICH UX is being rebuilt per docs/specs/enrich-campaign.md (Stage B);
  // gate the entry point until the honest flow ships so players never hit
  // the known-broken chooser
  const ENRICH_UI_READY = false;
  if (!ENRICH_UI_READY) $('btn-enrich').classList.add('hidden');
  $('btn-enrich').addEventListener('click', () => {
    $('enrich-title').textContent = 'ENRICH YOUR HISTORY';
    $('enrich-copy').textContent = 'Choose a focused opening or a curated campaign.';
    $('enrich-consent').textContent = 'The configured local AI receives only redacted local SessionCard excerpts after you explicitly begin.';
    $('enrich-status').textContent = 'Choose a campaign shape.';
    const begin = $('btn-enrich-start') as HTMLButtonElement;
    begin.disabled = true;
    $('modal-enrich').classList.remove('hidden');
  });
  $('btn-enrich-opening').addEventListener('click', () => openEnrichment('opening'));
  $('btn-enrich-campaign').addEventListener('click', () => openEnrichment('campaign'));
  $('btn-enrich-cancel').addEventListener('click', () => {
    if (enrichmentPoll !== null && import.meta.env.DEV) {
      void fetch('/__enrich/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      window.clearInterval(enrichmentPoll); enrichmentPoll = null;
    }
    $('modal-enrich').classList.add('hidden');
  });
  $('btn-openclaw').addEventListener('click', () => {
    void fetchCampaign('./cards/campaigns/openclaw-hermes.json').then(showPremiere).catch((error) => {
      $('enrich-title').textContent = 'PUBLIC CAMPAIGN';
      $('enrich-status').textContent = error instanceof Error ? error.message : String(error);
      $('modal-enrich').classList.remove('hidden');
    });
  });
  $('btn-premiere-close').addEventListener('click', () => $('modal-premiere').classList.add('hidden'));

  $('btn-start-match').addEventListener('click', () => {
    if (!run) return;
    showScreen('match');
  });
  $('btn-back-menu').addEventListener('click', () => { run = null; refreshVault?.(); showScreen('menu'); });
  $('btn-again').addEventListener('click', () => { run = null; refreshVault?.(); showScreen('menu'); });

  $('schema-pre').textContent = SESSION_CARD_SCHEMA;
  $('btn-schema').addEventListener('click', () => $('modal-schema').classList.remove('hidden'));

  // /settings: the mix, captions, motion, and the rude subagent
  const wireSettings = () => {
    const modal = $('modal-settings');
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    const buses = ['music', 'sfx', 'ui'] as const;
    const sync = () => {
      for (const b of buses) {
        const slider = $(`set-vol-${b}`) as HTMLInputElement;
        slider.value = String(Math.round(audioMixer.userLevel(b) * 100));
        $(`val-vol-${b}`).textContent = pct(audioMixer.userLevel(b));
      }
      ($('set-mono') as HTMLInputElement).checked = audioMixer.isMono();
      ($('set-captions') as HTMLInputElement).checked = localStorage.getItem('aiaio-captions') !== '0';
      ($('set-reduced-fx') as HTMLInputElement).checked = localStorage.getItem('aiaio-reduced-fx') === '1';
      ($('set-swears') as HTMLInputElement).checked = observer.swearsOn;
    };
    $('btn-settings').addEventListener('click', () => { audioMixer.ensure(); sync(); modal.classList.remove('hidden'); });
    $('btn-close-settings').addEventListener('click', () => modal.classList.add('hidden'));
    for (const b of buses) {
      $(`set-vol-${b}`).addEventListener('input', (e) => {
        const v = Number((e.target as HTMLInputElement).value) / 100;
        audioMixer.setUserLevel(b, v);
        $(`val-vol-${b}`).textContent = pct(v);
        audio.select(); // audible preview on the bus you're adjusting
      });
    }
    $('set-mono').addEventListener('change', (e) => audioMixer.setMono((e.target as HTMLInputElement).checked));
    $('set-captions').addEventListener('change', (e) => localStorage.setItem('aiaio-captions', (e.target as HTMLInputElement).checked ? '1' : '0'));
    $('set-reduced-fx').addEventListener('change', (e) => {
      const on = (e.target as HTMLInputElement).checked;
      localStorage.setItem('aiaio-reduced-fx', on ? '1' : '0');
      if (ui) ui.reducedFx = on;
    });
    $('set-swears').addEventListener('change', (e) => observer.setSwears((e.target as HTMLInputElement).checked));
  };
  wireSettings();
  $('btn-close-schema').addEventListener('click', () => $('modal-schema').classList.add('hidden'));
  $('btn-copy-schema').addEventListener('click', () => {
    navigator.clipboard?.writeText(SESSION_CARD_SCHEMA).catch(() => { /* text is selectable */ });
  });
  $('modal-schema').addEventListener('click', (e) => {
    if (e.target === $('modal-schema')) $('modal-schema').classList.add('hidden');
  });

  // don't lose the tail of a play session when the tab closes
  window.addEventListener('pagehide', () => qa.flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') qa.flush();
  });

  showScreen('menu');
  requestAnimationFrame(frame);
  if (import.meta.env.DEV) void startDevQA();
}

main();
