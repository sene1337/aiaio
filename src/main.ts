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
import { Timeline } from './timeline';
import { wallWipe } from './transition';
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
let activeCampaign: CampaignRun | null = null;
let lastRunCard: SessionCard | null = null;
let lastRunMode: SessionMode = 'demo';
/** re-render THE VAULT (set by loadGallery) — call when returning to the menu */
let refreshVault: (() => void) | null = null;
type QAAutoplayController = import('../qa/autoplay').AutoplayController;
let qaAutoplay: QAAutoplayController | null = null;
let qaAutoplayCard: SessionCard | null = null;
let qaAutoplayMode: SessionMode = 'demo';
let gallerySessionCount = 0;
type CampaignRun = { manifest: CampaignManifest; entry: CampaignEntry };

function showScreen(id: ScreenId): void {
  // briefing AND recap live INSIDE the menu screen, beside the grinding
  // veil: every out-of-game moment happens in the wall's shadow
  const overlay = id === 'briefing' || id === 'recap';
  $('screen-menu').classList.toggle('hidden', !(id === 'menu' || overlay));
  $('screen-match').classList.toggle('hidden', id !== 'match');
  $('screen-briefing').classList.toggle('hidden', id !== 'briefing');
  $('screen-recap').classList.toggle('hidden', id !== 'recap');
  $('screen-menu').classList.toggle('briefing-mode', id === 'briefing');
  $('screen-menu').classList.toggle('recap-mode', id === 'recap');
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
  const fileInput = $('file-0') as HTMLInputElement;
  const readFile = (file: File) => {
    file.text().then((text) => {
      const card = parseSessionCard(text);
      addToCustom({ session_id: String(card.session_id ?? file.name), headline: episodeHeadline(card), inline: text });
      timeline?.setTrack('custom');
    }).catch(() => { $('tl-continue-why').textContent = `could not read ${file.name}`; });
  };
  // the whole menu is the drop zone: dropped cards land on the CUSTOM track
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) readFile(file);
  });
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

// ---------------------------------------------------------------------------
// THE TIMELINE front door + the /library overlay
// ---------------------------------------------------------------------------

type CustomItem = { file?: string; session_id: string; headline?: string; inline?: string };

function customTrack(): CustomItem[] {
  try { return JSON.parse(localStorage.getItem('aiaio-custom-track') ?? '[]') as CustomItem[]; } catch { return []; }
}
function saveCustomTrack(items: CustomItem[]): void {
  try { localStorage.setItem('aiaio-custom-track', JSON.stringify(items.slice(0, 40))); } catch { /* storage full */ }
}
function addToCustom(item: CustomItem): void {
  const items = customTrack();
  if (!items.some((x) => x.session_id === item.session_id)) { items.push(item); saveCustomTrack(items); }
  timeline?.refresh();
}

/** observer map quips: every claim binds to a real recorded stat */
function observerMapQuip(p: import('./levels').LevelProgress | null): string | null {
  if (!p || p.plays === 0) return null;
  const fails = Math.max(0, p.plays - (p.recovered ? 1 : 0));
  if (p.perfect) return `perfect recall on file. i keep re-reading it.`;
  if (p.recovered && fails > 0) return `recovered on attempt ${p.plays}. the first ${fails} are also on file.`;
  if (p.recovered) return `recovered first try. statistically suspicious.`;
  if (fails >= 3) return `${fails} attempts. the wall knows your name here.`;
  return `attempt ${p.plays} did not hold. it noticed.`;
}

let timeline: Timeline | null = null;
let timelineEntries: LevelEntry[] = [];

async function loadTimeline(): Promise<void> {
  let entries: LevelEntry[] = [];
  try {
    const res = await fetch('./cards/index.json');
    if (res.ok) {
      const index = await res.json();
      if (Array.isArray(index) && index.length > 0) entries = index as LevelEntry[];
    }
  } catch { /* no scanned sessions yet — the memory track explains */ }
  timelineEntries = entries;
  gallerySessionCount = entries.filter((entry) => entry.harness !== 'fictional').length;
  const personal = await fetchCampaign('./cards/campaigns/latest.json').catch(() => null);
  const fictional = await fetchCampaign('./cards/campaigns/openclaw-hermes.json').catch(() => null);
  // veil label: the forgetting covers PRE-HISTORY only (never intact sessions)
  const dates = entries.map((e) => e.when).filter(Boolean).sort();
  $('tl-records-begin').textContent = dates[0] ? `records begin ${dates[0]}` : 'no records yet';
  $('enrich-footer-desc').textContent = personal ? 're-forge your campaign' : 'forge your campaign';
  // the controls strip is for the player with no record yet; it retires once
  // the first run is on the ledger
  $('tl-howto').classList.toggle('hidden', !!localStorage.getItem('aiaio-progress'));

  const playEntryByFile = async (file: string, inline?: string) => {
    try {
      const text = inline ?? await (await fetch(`./cards/${file}`)).text();
      setCard(parseSessionCard(text), file);
      prepareRun(loadedCard!, 'real');
    } catch { $('tl-continue-why').textContent = `could not load ${file}`; }
  };

  const cfg = {
    entries, personal, fictional,
    customFiles: () => customTrack().map((c) => ({ file: c.file ?? '', session_id: c.session_id, headline: c.headline })),
    playCampaign: (manifest: CampaignManifest, entry: CampaignEntry) => { void startCampaign(manifest, entry); },
    playEntry: (entry: LevelEntry) => { void playEntryByFile(entry.file); },
    playCustom: (file: string) => {
      const item = customTrack().find((c) => c.file === file || (!file && c.inline));
      void playEntryByFile(file, item?.inline);
    },
    openEnrich: () => { void openEnrichChooser(); },
    isCampaignUnlocked: (manifest: CampaignManifest, order: number) =>
      isCampaignOrderUnlocked(getCampaignProgress(manifest), order),
    campaignProgress: (manifest: CampaignManifest) => getCampaignProgress(manifest),
    observerQuip: observerMapQuip,
  };
  if (timeline) timeline.refresh(cfg);
  else { timeline = new Timeline(cfg); timeline.render(); }
  refreshVault = () => { void loadTimeline(); };
}

/** the /library overlay: the whole archive, searchable; + adds to CUSTOM */
function openLibrary(): void {
  const body = $('library-body');
  let filter = '';
  const render = (): void => {
    const q = filter.trim().toLowerCase();
    const real = timelineEntries.filter((e) => e.harness !== 'fictional');
    const rows = real.filter((e) => {
      const headline = e.headline || e.goal || '';
      return !q || `${headline} ${e.session_id} ${e.harness ?? ''} ${e.when ?? ''}`.toLowerCase().includes(q);
    }).slice(0, 60);
    body.innerHTML = `
      <input id="library-filter" placeholder="filter ${real.length} sessions by goal, harness, or date…" value="${escapeHtml(filter)}" />
      <div class="library-rows">${rows.map((e, i) => {
        const p = getProgress(e.session_id);
        const glyph = isPerfect(p) ? '✻' : isCleared(p) ? '⏺' : p && p.plays > 0 ? '◐' : '☐';
        const inTrack = customTrack().some((c) => c.session_id === e.session_id);
        return `<div class="library-row">
          <button class="linkish lib-play" data-i="${i}">${glyph} ${escapeHtml(String(e.headline || e.goal || e.session_id).slice(0, 56))}</button>
          <span class="dim">${escapeHtml([e.when, e.harness].filter(Boolean).join(' · '))} · ${e.errors} errors · diff ${difficulty(e)}${p?.rank ? ` · ★${p.rank}` : ''}</span>
          <button class="linkish lib-add" data-i="${i}" ${inTrack ? 'disabled' : ''}>${inTrack ? '✓ on track' : '+ track'}</button>
        </div>`;
      }).join('')}${rows.length === 0 ? '<div class="hint">nothing matches. every record is still here; loosen the filter.</div>' : ''}</div>
      ${real.length > 60 && rows.length === 60 ? `<div class="hint">showing 60 of ${real.length}. filter to narrow.</div>` : ''}`;
    const input = $('library-filter') as HTMLInputElement;
    input.addEventListener('input', () => { filter = input.value; render(); const el = $('library-filter') as HTMLInputElement; el.focus(); el.setSelectionRange(filter.length, filter.length); });
    body.querySelectorAll('.lib-play').forEach((el) => el.addEventListener('click', () => {
      const e = rows[Number((el as HTMLElement).dataset.i)];
      $('modal-library').classList.add('hidden');
      void (async () => {
        try { setCard(parseSessionCard(await (await fetch(`./cards/${e.file}`)).text()), e.file); prepareRun(loadedCard!, 'real'); }
        catch { /* row vanished between scans */ }
      })();
    }));
    body.querySelectorAll('.lib-add').forEach((el) => el.addEventListener('click', () => {
      const e = rows[Number((el as HTMLElement).dataset.i)];
      addToCustom({ file: e.file, session_id: e.session_id, headline: String(e.headline || e.goal || '') });
      render();
    }));
  };
  render();
  $('modal-library').classList.remove('hidden');
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
  const sub = (manifest as unknown as { subtitle?: string; disclosure?: string });
  if (manifest.kind === 'fictional' && sub.subtitle) {
    $('premiere-copy').textContent = `${sub.subtitle} · ${manifest.entries.length} levels`;
  }
  const levels = $('premiere-levels');
  levels.replaceChildren();
  const progress = getCampaignProgress(manifest);
  let lastAct: string | undefined;
  for (const entry of manifest.entries) {
    if (entry.actName && entry.actName !== lastAct) {
      lastAct = entry.actName;
      const act = document.createElement('div');
      act.className = 'hint';
      act.style.textAlign = 'left';
      act.style.marginTop = '8px';
      act.textContent = entry.actName;
      levels.appendChild(act);
    }
    if (entry.gapBefore) {
      const gap = document.createElement('div');
      gap.className = 'hint dim';
      gap.style.textAlign = 'left';
      gap.textContent = `▓▒░ ${entry.gapBefore}`;
      levels.appendChild(gap);
    }
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
    const text = await response.text();
    // digest the FILE content, exactly as the manifest builder did —
    // parseSessionCard normalizes (e.g. injects token_peak), which must not
    // count as the source having changed
    if (manifest.kind !== 'fictional' && sourceDigest(JSON.parse(text)) !== entry.sourceDigest) {
      throw new Error('This campaign no longer matches its source snapshot. Enrich again after rescanning.');
    }
    const card = parseSessionCard(text);
    const mode: SessionMode = manifest.kind === 'fictional' ? 'fictional' : manifest.kind === 'remix' ? 'remix' : 'real';
    prepareRun(card, mode, { manifest, entry });
  } catch (error) {
    $('enrich-status').textContent = error instanceof Error ? error.message : String(error);
    $('modal-enrich').classList.remove('hidden');
  }
}

// ---------------------------------------------------------------------------
// ENRICH flow — normative UX in docs/specs/enrich-campaign.md §4.
// choose depth -> consent (one CONFIRM) -> unit transcript -> premiere.
// Progress renders ONLY persisted job units; never an interpolated meter.
// ---------------------------------------------------------------------------

type EnrichUnit = { order: number; title: string; state: 'pending' | 'done' | 'fallback' };
type EnrichStatus = {
  status?: string; detail?: string; profile?: string;
  count?: number; unitsDone?: number; units?: EnrichUnit[];
  llmCmd?: string; jobLive?: boolean; required?: number; found?: number;
};

let enrichmentPoll: number | null = null;
let enrichProfile: 'opening' | 'campaign' = 'opening';
let enrichStartedAt = 0;

function enrichShow(section: 'choose' | 'consent' | 'progress' | 'failed'): void {
  for (const id of ['enrich-choose', 'enrich-consent-box', 'enrich-progress-box', 'enrich-failed-box']) {
    $(id).classList.toggle('hidden', id !== `enrich-${section === 'choose' ? 'choose' : section === 'consent' ? 'consent-box' : section === 'progress' ? 'progress-box' : 'failed-box'}`);
  }
}

/** the job transcript IS the progress bar: one ⏺ line per episode, honest */
export function renderEnrichTranscript(status: EnrichStatus, elapsedS: number): string {
  const lines: string[] = [];
  const units = status.units ?? [];
  for (const u of units) {
    if (u.state === 'pending') { lines.push(`⏺ episode ${u.order}: waiting…`); continue; }
    lines.push(`⏺ episode ${u.order}: ${u.title}`);
    lines.push(u.state === 'done' ? '  ⎿ written by your AI' : '  ⎿ baseline copy (AI unavailable for this one)');
  }
  const done = status.unitsDone ?? units.filter((u) => u.state !== 'pending').length;
  const total = status.count ?? units.length;
  if (total > 0) lines.push('', `${done}/${total} episodes · ${Math.floor(elapsedS / 60)}:${String(Math.floor(elapsedS % 60)).padStart(2, '0')} elapsed`);
  return lines.join('\n');
}

async function fetchEnrichStatus(): Promise<EnrichStatus> {
  const response = await fetch('/__enrich/status', { cache: 'no-store' });
  return await response.json() as EnrichStatus;
}

async function openEnrichChooser(): Promise<void> {
  const modal = $('modal-enrich');
  modal.classList.remove('hidden');
  $('enrich-copy').textContent = 'your agent turns your history into an authored campaign. raw SessionCards never change; originals stay playable.';
  $('enrich-status').textContent = '';
  // factual eligibility BEFORE the player commits (spec §4.1)
  const enough6 = gallerySessionCount >= 6, enough15 = gallerySessionCount >= 15;
  $('desc-enrich-opening').textContent = `six chronological real sessions · you have ${gallerySessionCount} eligible ${enough6 ? '✓' : '· need 6'}`;
  $('desc-enrich-campaign').textContent = `15–24 curated real sessions · you have ${gallerySessionCount} eligible ${enough15 ? '✓' : '· need 15'}`;
  ($('btn-enrich-opening') as HTMLButtonElement).disabled = !enough6 || !import.meta.env.DEV;
  ($('btn-enrich-campaign') as HTMLButtonElement).disabled = !enough15 || !import.meta.env.DEV;
  if (!import.meta.env.DEV) {
    $('enrich-status').textContent = 'personal enrichment runs in the local app only. the fictional campaign below is ready right now.';
  }
  enrichShow('choose');
  // resume: if a job is already running, attach to it instead (spec §4.3)
  try {
    const status = await fetchEnrichStatus();
    if (status.jobLive || status.status === 'running' || status.status === 'writing') {
      enrichProfile = status.profile === 'campaign' ? 'campaign' : 'opening';
      enrichStartedAt = enrichStartedAt || Date.now();
      enrichShow('progress');
      startEnrichPolling();
      $('enrich-status').textContent = 'attached to the running job.';
    }
  } catch { /* dev server absent; the DEV gate above already explains */ }
}

async function openEnrichConsent(profile: 'opening' | 'campaign'): Promise<void> {
  enrichProfile = profile;
  $('enrich-title').textContent = profile === 'opening' ? '✦ SHAPE MY OPENING' : '✦ BUILD MY CAMPAIGN';
  let cmd = 'your configured AI';
  try { cmd = (await fetchEnrichStatus()).llmCmd ?? cmd; } catch { /* keep generic */ }
  const n = profile === 'opening' ? 6 : Math.min(24, Math.max(15, gallerySessionCount));
  $('enrich-consent').textContent = `${cmd} will read short REDACTED excerpts from about ${n} of your local sessions to write episode titles and Observer lines. Nothing uploads from a hosted build; raw cards stay byte-identical. If the AI fails, a deterministic baseline builds the same campaign.`;
  enrichShow('consent');
}

function startEnrichPolling(): void {
  if (enrichmentPoll !== null) window.clearInterval(enrichmentPoll);
  enrichmentPoll = window.setInterval(() => { void pollEnrichment(); }, 1000);
}

async function beginEnrichment(baseline = false): Promise<void> {
  const begin = $('btn-enrich-start') as HTMLButtonElement;
  begin.disabled = true; // pressed-state within 100ms (spec §4.2)
  begin.querySelector('.cmd-name')!.textContent = 'starting…';
  $('enrich-status').textContent = '';
  try {
    const response = await fetch('/__enrich/campaign', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: enrichProfile, selection: 'story', pace: 'balanced', tone: 'dry mission control', baseline }),
    });
    const status = await response.json() as EnrichStatus;
    enrichStartedAt = Date.now();
    enrichShow('progress');
    $('enrich-transcript').textContent = status.detail ?? 'starting the local job…';
    startEnrichPolling();
  } catch {
    $('enrich-status').textContent = 'could not reach the local dev server. run the game with npm run dev for personal enrichment.';
  } finally {
    begin.disabled = false;
    begin.querySelector('.cmd-name')!.textContent = 'CONFIRM · start enrichment';
  }
}

async function pollEnrichment(): Promise<void> {
  try {
    const status = await fetchEnrichStatus();
    const elapsed = (Date.now() - enrichStartedAt) / 1000;
    $('enrich-transcript').textContent = renderEnrichTranscript(status, elapsed) || (status.detail ?? 'working…');
    if (status.status === 'ready') {
      if (enrichmentPoll !== null) { window.clearInterval(enrichmentPoll); enrichmentPoll = null; }
      $('modal-enrich').classList.add('hidden');
      showPremiere(await fetchCampaign('./cards/campaigns/latest.json'));
    } else if (status.status === 'failed') {
      if (enrichmentPoll !== null) { window.clearInterval(enrichmentPoll); enrichmentPoll = null; }
      $('enrich-failed-detail').textContent = `the job failed: ${status.detail ?? 'no detail recorded'}. nothing was overwritten. any prior ready campaign is untouched.`;
      enrichShow('failed');
    } else if (status.status === 'cancelled') {
      if (enrichmentPoll !== null) { window.clearInterval(enrichmentPoll); enrichmentPoll = null; }
      $('enrich-status').textContent = 'cancelled. finished staging was discarded; any prior ready campaign is untouched.';
      enrichShow('choose');
    }
  } catch { /* transient; next poll recovers */ }
}

/**
 * WHAT MOVED FORWARD — the Hades rule: every run, win or lose, advances
 * something visible. Every row binds to a recorded stat; no vibes.
 */
function buildForward(r: Run): import('./ui').ForwardRecap {
  const rows: { glyph: string; cls: string; text: string }[] = [];
  const p = getProgress(String(r.card.session_id ?? ''));
  const won = r.over?.won === true;
  const reach = Math.round((r.avatar.x / r.terrain.width) * 100);
  const done = r.queue.tasks.filter((t) => t.done).length;

  let nextEntry: CampaignEntry | null = null;
  if (activeCampaign) {
    const { manifest, entry } = activeCampaign;
    nextEntry = manifest.entries.find((e) => e.order === entry.order + 1) ?? null;
    const progress = getCampaignProgress(manifest);
    if (won && lastRankInfo?.outcome.recovered && nextEntry && isCampaignOrderUnlocked(progress, nextEntry.order)) {
      rows.push({ glyph: '✦', cls: 'unlock', text: `EPISODE ${String(nextEntry.order).padStart(2, '0')} UNLOCKED · ${nextEntry.title ?? 'next on the rail'}` });
    }
    const recovered = manifest.entries.filter((e) => isCleared(getProgress(e.sourceSessionId))).length;
    rows.push({ glyph: '↑', cls: 'new', text: `campaign: ${recovered}/${manifest.entries.length} recovered` });
  }
  if (lastRankInfo?.newBest && (lastRankInfo.prevBest ?? 0) > 0) {
    rows.push({ glyph: '↑', cls: 'new', text: `new best score · previous ${lastRankInfo.prevBest!.toLocaleString()}` });
  }
  for (const a of r.awards) rows.push({ glyph: '⛁', cls: 'new', text: `AWARD: ${a.title} · ${a.desc}` });
  if (!won) {
    rows.push({ glyph: '◌', cls: 'dim', text: `furthest reach this attempt: ${reach}% of the session · ${done} task${done === 1 ? '' : 's'} recovered before the end` });
    if (p) rows.push({ glyph: '◌', cls: 'dim', text: `attempt ${p.plays} on record · best ★${p.rank} ${p.bestScore.toLocaleString()}` });
  }
  const eaten = r.queue.tasks.find((t) => t.forgotten && !t.done);
  if (won && eaten) rows.push({ glyph: '◌', cls: 'dim', text: `missed: "${eaten.name.slice(0, 40)}" fell to the wall. it remembers.` });

  // the Observer's last word: every claim binds to a recorded number
  let word: string;
  if (won && p && p.plays > 1) word = `Attempt ${p.plays}. The first ${p.plays - 1} are also on file. The ledger says recovered, so I will allow it.`;
  else if (won) word = 'First attempt. Statistically suspicious. Recorded anyway.';
  else if (p && p.plays >= 3) word = `Attempt ${p.plays}. The wall has a chair with your name on it. Your best remains ${reach >= 1 ? `★${p.rank}` : 'theoretical'}.`;
  else word = `You reached ${reach}% before the forgetting. The session, for the record, actually happened, and someone survived it once.`;

  // an authored campaign epigraph outranks the composed word on a win —
  // this is where the story gets its last line
  const epigraph = won ? activeCampaign?.entry.epigraph : undefined;
  return { rows, observerWord: epigraph && epigraph.trim() ? epigraph : word, nextTitle: nextEntry?.title ?? null };
}

function wireRecapActions(r: Run): void {
  const box = $('recap-actions');
  const won = r.over?.won === true;
  const { manifest, entry } = activeCampaign ?? {};
  const next = manifest && entry ? manifest.entries.find((e) => e.order === entry.order + 1) : null;
  const nextPlayable = won && manifest && next && isCampaignOrderUnlocked(getCampaignProgress(manifest), next.order);
  box.innerHTML = '';
  const mk = (label: string, desc: string, primary: boolean, fn: () => void) => {
    const btn = document.createElement('button');
    btn.className = `cmd${primary ? ' primary' : ''}`;
    btn.innerHTML = `<span class="caret">❯</span><span class="cmd-name">${escapeHtml(label)}</span><span class="cmd-desc">${escapeHtml(desc)}</span>`;
    btn.addEventListener('click', fn);
    box.appendChild(btn);
  };
  if (nextPlayable && manifest && next) {
    mk(`next · ${String(next.title ?? `episode ${next.order}`).slice(0, 40).toLowerCase()}`, 'continue the campaign', true,
      () => { void startCampaign(manifest, next); });
    mk('retry · chase a better rank', 'same episode again', false, () => { if (lastRunCard) prepareRun(lastRunCard, lastRunMode, activeCampaign ?? undefined); });
  } else if (!won && lastRunCard) {
    const p = getProgress(String(r.card.session_id ?? ''));
    mk(`retry · attempt ${(p?.plays ?? 0) + 1}`, 'the wall is patient. so are you', true,
      () => { prepareRun(lastRunCard!, lastRunMode, activeCampaign ?? undefined); });
  } else if (lastRunCard) {
    mk('retry · chase the perfect', 'same session again', true, () => { prepareRun(lastRunCard!, lastRunMode, activeCampaign ?? undefined); });
  }
  mk('timeline · back to the map', 'choose another episode', false, () => { run = null; refreshVault?.(); showScreen('menu'); });
}

function prepareRun(card: SessionCard, mode: SessionMode, campaign?: CampaignRun): void {
  activeCampaign = campaign ?? null;
  lastRunCard = card;
  lastRunMode = mode;
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
  // authored campaign briefings take the roast slot: the story speaks first
  const authored = campaign?.entry.briefing?.filter((l) => typeof l === 'string' && l.trim()).slice(0, 3);
  const composed = authored && authored.length > 0 ? authored : observer.briefingRoast(meta);
  ui.setBriefingRoast(composed, authored && authored.length > 0 ? 'llm' : 'composed');
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
    case 'shield_gain': audio.shieldAbsorb(); break;
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
    if (e.key === 'Escape') {
      // Escape closes the topmost modal, everywhere
      const open = document.querySelectorAll('.modal:not(.hidden)');
      if (open.length > 0) { open[open.length - 1].classList.add('hidden'); return; }
    }
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
          // the wall always wins in the end: the run closes THROUGH it too
          wallWipe(() => {
            ui.buildRecap(r, lastRankInfo ?? undefined, buildForward(r));
            wireRecapActions(r);
            showScreen('recap');
          });
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
  void loadTimeline();
  loadPersonaPack();

  $('btn-run').addEventListener('click', () => {
    prepareRun(loadedCard ?? randomCard(`random-session-${runCounter + 1}`), loadedCard ? 'real' : 'random');
  });
  // ENRICH UX is being rebuilt per docs/specs/enrich-campaign.md (Stage B);
  // gate the entry point until the honest flow ships so players never hit
  // the known-broken chooser
  const ENRICH_UI_READY = true; // Stage B honest flow (spec §4) shipped
  if (!ENRICH_UI_READY) $('btn-enrich').classList.add('hidden');
  $('btn-enrich').addEventListener('click', () => { void openEnrichChooser(); });
  $('btn-library').addEventListener('click', () => openLibrary());
  $('btn-close-library').addEventListener('click', () => $('modal-library').classList.add('hidden'));
  $('btn-enrich-opening').addEventListener('click', () => { void openEnrichConsent('opening'); });
  $('btn-enrich-campaign').addEventListener('click', () => { void openEnrichConsent('campaign'); });
  $('btn-enrich-back').addEventListener('click', () => { void openEnrichChooser(); });
  $('btn-enrich-start').addEventListener('click', () => { void beginEnrichment(false); });
  $('btn-enrich-retry').addEventListener('click', () => { enrichShow('progress'); void beginEnrichment(false); });
  $('btn-enrich-baseline').addEventListener('click', () => { enrichShow('progress'); void beginEnrichment(true); });
  $('btn-enrich-job-cancel').addEventListener('click', () => {
    void fetch('/__enrich/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  });
  $('btn-enrich-cancel').addEventListener('click', () => $('modal-enrich').classList.add('hidden'));
  $('btn-premiere-close').addEventListener('click', () => $('modal-premiere').classList.add('hidden'));

  $('btn-start-match').addEventListener('click', () => {
    if (!run) return;
    // the veil and the wall are the same entity: enter the session THROUGH it
    wallWipe(() => showScreen('match'));
  });
  $('btn-back-menu').addEventListener('click', () => { run = null; refreshVault?.(); showScreen('menu'); });

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
      ($('set-reduced-fx') as HTMLInputElement).checked = ui ? ui.reducedFx : localStorage.getItem('aiaio-reduced-fx') === '1';
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
