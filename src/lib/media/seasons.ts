export type SeasonLink = {
  id: string;
  seasonNumber?: number | null;
};

export function showSeasonKey(season: SeasonLink): string {
  if (season.seasonNumber !== null && season.seasonNumber !== undefined) {
    return String(season.seasonNumber);
  }
  return season.id;
}

export function showSeasonHref(showId: string, season: SeasonLink): string {
  return `/shows/${showId}/seasons/${showSeasonKey(season)}`;
}

export function resolveShowSeason<T extends SeasonLink>(seasons: T[], seasonKey: string): T | null {
  const byId = seasons.find((season) => season.id === seasonKey);
  if (byId) return byId;

  if (/^\d+$/.test(seasonKey)) {
    const seasonNumber = Number(seasonKey);
    return seasons.find((season) => season.seasonNumber === seasonNumber) ?? null;
  }

  return null;
}
