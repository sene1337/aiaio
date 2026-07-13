export interface EpisodeTaskInput {
  name?: string;
  completed?: boolean;
  at?: number;
}

export interface EpisodeMomentInput {
  text?: string;
  kind?: string;
  at?: number;
}

export interface EpisodeSummaryInput {
  goal?: string;
  tasks?: EpisodeTaskInput[] | number;
  moments?: EpisodeMomentInput[];
}

export const EPISODE_TITLE_LIMIT: number;
export function compactEpisodeText(value: unknown, limit?: number): string;
export function episodeHeadline(card: EpisodeSummaryInput | null | undefined): string;
