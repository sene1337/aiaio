// Campaign manifests are presentation overlays. They never replace a raw
// SessionCard: the source card remains the authority for mechanics and facts.

import { hashString } from './rng';

export const CAMPAIGN_SCHEMA_VERSION = 1;

export type CampaignKind = 'opening' | 'personal' | 'fictional' | 'remix';
export type CampaignSelection = 'story' | 'hardest' | 'longest';
export type CampaignPace = 'calm' | 'balanced' | 'intense';
export type CampaignRuleset = 'factual' | 'remix';
export type RemixProfile = 'gentle' | 'balanced' | 'brutal';
export type CampaignWriterStatus = 'baseline' | 'custom';

export interface CampaignRecipe {
  selection: CampaignSelection;
  pace: CampaignPace;
  observerTone?: string;
  ruleset: CampaignRuleset;
  remixProfile?: RemixProfile;
}

export interface CampaignEntry {
  /** File path relative to cards/. Never an absolute source-log path. */
  file: string;
  sourceSessionId: string;
  sourceDigest: string;
  order: number;
  title?: string;
  taskLabel?: string;
  momentText?: string[];
  observerLines?: string[];
}

export interface CampaignManifest {
  schemaVersion: number;
  id: string;
  revision: number;
  kind: CampaignKind;
  createdAt: string;
  sourceCardDigest: string;
  selectedSourceIds: string[];
  recipe: CampaignRecipe;
  writerStatus: CampaignWriterStatus;
  entries: CampaignEntry[];
}

export interface CombatModifiers {
  hostileBudgetMultiplier: number;
  hostileBudgetCap: number;
  hostilePerTypeCap: number;
  enemyDamageMultiplier: number;
  bonusShield: number;
  stabilityHandicap: boolean;
  observerInjectionLimit: number;
}

const FACTUAL_MODIFIERS: CombatModifiers = {
  hostileBudgetMultiplier: 1,
  hostileBudgetCap: 30,
  hostilePerTypeCap: 8,
  enemyDamageMultiplier: 1,
  bonusShield: 0,
  stabilityHandicap: true,
  observerInjectionLimit: 3,
};

export function combatModifiers(recipe?: CampaignRecipe): CombatModifiers {
  if (recipe?.ruleset !== 'remix') return { ...FACTUAL_MODIFIERS };
  switch (recipe.remixProfile ?? 'balanced') {
    case 'gentle':
      return { ...FACTUAL_MODIFIERS, hostileBudgetMultiplier: 0.7, enemyDamageMultiplier: 0.8, bonusShield: 10, observerInjectionLimit: 0 };
    case 'brutal':
      return { ...FACTUAL_MODIFIERS, hostileBudgetMultiplier: 1.5, hostileBudgetCap: 36, hostilePerTypeCap: 10, enemyDamageMultiplier: 1.25, stabilityHandicap: false, observerInjectionLimit: 3 };
    default:
      return { ...FACTUAL_MODIFIERS };
  }
}

/** Stable browser-safe digest for manifest/source matching, not a security hash. */
export function sourceDigest(value: unknown): string {
  return hashString(stableJson(value)).toString(16).padStart(8, '0');
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
}

export function validateManifest(value: unknown): value is CampaignManifest {
  if (!value || typeof value !== 'object') return false;
  const m = value as Partial<CampaignManifest>;
  if (m.schemaVersion !== CAMPAIGN_SCHEMA_VERSION || !m.id || !Number.isInteger(m.revision) ||
      !Array.isArray(m.entries) || !m.recipe || !Array.isArray(m.selectedSourceIds)) return false;
  if (!['opening', 'personal', 'fictional', 'remix'].includes(String(m.kind)) ||
      !['factual', 'remix'].includes(String(m.recipe.ruleset))) return false;
  return m.entries.every((entry, index) => Boolean(entry && entry.file && entry.sourceSessionId && entry.sourceDigest) && entry.order === index + 1);
}

export function campaignProgressKey(manifest: Pick<CampaignManifest, 'id' | 'revision' | 'kind'>): string {
  const suffix = manifest.kind === 'remix' ? 'remix' : manifest.kind === 'fictional' ? 'fictional' : 'campaign';
  return `aiaio-${suffix}-progress:${manifest.id}:r${manifest.revision}`;
}
