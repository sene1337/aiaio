import { Run, RunInput } from '../src/run';
import { EXAMPLE_CHAOTIC, parseSessionCard, SessionCard } from '../src/session';

export type AutoplayProfileName = 'compaction' | 'artillery' | 'tactical';

interface AutoplayProfile {
  spawnSubs: boolean;
  weapons: Array<{ until: number; id: string; cadence: number }>;
}

const PROFILES: Record<AutoplayProfileName, AutoplayProfile> = {
  compaction: {
    spawnSubs: true,
    weapons: [
      { until: 10, id: 'timeout_mortar', cadence: 0.8 },
      { until: 18, id: 'context_nuke', cadence: 0.75 },
      { until: 22, id: 'regression_cluster', cadence: 0.65 },
      { until: 26, id: 'recovery_shield', cadence: 1.5 },
      { until: 30, id: 'timeout_mortar', cadence: 0.8 },
    ],
  },
  artillery: {
    spawnSubs: false,
    weapons: [
      { until: 4, id: 'false_positive_laser', cadence: 1.45 },
      { until: 8, id: 'hallucination_missile', cadence: 0.7 },
      { until: 12, id: 'restart_thrash', cadence: 0.8 },
      { until: 16, id: 'regression_cluster', cadence: 0.8 },
      { until: 20, id: 'distraction_barrage', cadence: 1.2 },
      { until: 30, id: 'recovery_shield', cadence: 1.5 },
    ],
  },
  tactical: {
    spawnSubs: false,
    weapons: [
      { until: 4, id: 'timeout_mortar', cadence: 0.8 },
      { until: 8, id: 'hallucination_missile', cadence: 0.7 },
      { until: 12, id: 'false_positive_laser', cadence: 1.45 },
      { until: 16, id: 'restart_thrash', cadence: 0.8 },
      { until: 20, id: 'regression_cluster', cadence: 0.8 },
      { until: 30, id: 'recovery_shield', cadence: 1.5 },
    ],
  },
};

const profileFrom = (value: string | null): AutoplayProfileName =>
  value === 'artillery' || value === 'tactical' ? value : 'compaction';

const safeCardFile = (value: string): boolean =>
  value.length <= 200 && /^[A-Za-z0-9._-]+\.json$/.test(value) && !value.includes('..');

export class AutoplayController {
  private runClock = 0;
  private nextFire = 0;
  private nextJump = 0.8;
  private nextSubagent = 10;
  private retreatUntil = 0;
  private restartWait = 0;

  constructor(readonly profileName: AutoplayProfileName) {}

  reset(): void {
    this.runClock = 0;
    this.nextFire = 0;
    this.nextJump = 0.8;
    this.nextSubagent = 10;
    this.retreatUntil = 0;
    this.restartWait = 0;
  }

  input(run: Run, dt: number): RunInput {
    if (run.over) return { left: false, right: false, work: false, down: false };

    this.runClock += dt;
    const profile = PROFILES[this.profileName];
    const hostiles = run.enemies.filter((enemy) => !enemy.dead && !enemy.def.friendly);
    const nearest = hostiles.reduce((best, enemy) =>
      Math.min(best, Math.abs(enemy.x - run.avatar.x)), Infinity);
    const wallGap = run.avatar.x - run.wallX;

    if (nearest < 135 && wallGap > 420 && this.runClock >= this.retreatUntil) {
      this.retreatUntil = this.runClock + 0.75;
    }
    const retreating = this.runClock < this.retreatUntil;
    if (!retreating) run.avatar.facing = 1;

    if (run.nearPermTerminal && !run.subagentsUnlocked) run.claimPermission();
    if (profile.spawnSubs && run.subagentsUnlocked && run.subagents.length < 2 && this.runClock >= this.nextSubagent) {
      run.spawnSubagent();
      this.nextSubagent += 2.5;
    }

    if (!retreating && nearest > 190) {
      if (run.crateMenu) run.chooseCrateOption(0);
      else if (run.nearCrate) run.installUpdate();
    }

    if (this.runClock >= this.nextJump || nearest < 190) {
      run.jump();
      this.nextJump = this.runClock + 2.6;
    }

    const weaponPhase = profile.weapons.find((phase) => this.runClock < phase.until)
      ?? profile.weapons[profile.weapons.length - 1];
    const weaponIndex = run.weapons.findIndex((slot) => slot.def.id === weaponPhase.id);
    const fallbackIndex = run.weapons.findIndex((slot) => slot.def.id === 'timeout_mortar');
    run.selectWeapon(weaponIndex >= 0 ? weaponIndex : Math.max(0, fallbackIndex));

    if (!retreating && this.runClock >= this.nextFire) {
      run.fire();
      this.nextFire = this.runClock + weaponPhase.cadence;
    }

    const contextPressure = run.ctx.used / (run.ctx.budget * run.ctx.threshold);
    if (this.profileName !== 'compaction' && this.runClock > 20 && contextPressure > 0.82 && run.compactCd <= 0) {
      run.voluntaryCompact();
    }

    const seekingPermission = profile.spawnSubs && !run.subagentsUnlocked && this.runClock < 9;
    const work = !!run.nearStation && nearest > 300 && !seekingPermission && this.runClock % 9 < 4.5;
    const holdRange = nearest < 520 && !seekingPermission;
    const advance = !work && !retreating && (!holdRange || wallGap < 260);
    return { left: retreating, right: advance, work, down: nearest < 120 };
  }

  shouldRestart(run: Run, dt: number): boolean {
    if (!run.over) {
      this.restartWait = 0;
      return false;
    }
    this.restartWait += dt;
    return this.restartWait >= 3.5;
  }
}

export interface LoadedAutoplay {
  card: SessionCard;
  controller: AutoplayController;
  sourceName: string;
}

export async function loadAutoplay(params: URLSearchParams): Promise<LoadedAutoplay> {
  // QA voice tests must be able to return the browser to the same automatic
  // selection a real player gets. This module is dev-only and tree-shaken out
  // of production builds.
  if (params.get('resetVoice') === '1') {
    localStorage.removeItem('aiaio-voice-name');
    localStorage.setItem('aiaio-voice', '1');
  }
  const profileName = profileFrom(params.get('profile'));
  const controller = new AutoplayController(profileName);
  const cardFile = params.get('card');
  if (!cardFile) {
    return { card: EXAMPLE_CHAOTIC, controller, sourceName: 'fictional chaotic QA card' };
  }
  if (!safeCardFile(cardFile)) throw new Error('QA autoplay card must be a .json basename');

  const response = await fetch(`./cards/${encodeURIComponent(cardFile)}`);
  if (!response.ok) throw new Error(`QA autoplay card request failed (${response.status})`);
  return { card: parseSessionCard(await response.text()), controller, sourceName: cardFile };
}
