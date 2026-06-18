import { sql } from "kysely";
import { getDb } from "../db";
import { TV_SHOW_CREATOR_JOBS } from "../metadata/show-creators";

type SimilarPersonKey = { provider: string; provider_id: string };

function providerPairsWhereSql(pairs: SimilarPersonKey[]) {
  if (pairs.length === 0) return sql<boolean>`0`;
  const conditions = pairs.map(
    (pair) => sql<boolean>`(provider = ${pair.provider} and provider_id = ${pair.provider_id})`,
  );
  return sql<boolean>`(${sql.join(conditions, sql` or `)})`;
}

function uniqueStrings(values: { name: string }[]) {
  return [...new Set(values.map((row) => row.name).filter((name) => name.trim().length > 0))];
}

function uniquePersonPairs(values: SimilarPersonKey[]) {
  const seen = new Set<string>();
  const out: SimilarPersonKey[] = [];
  for (const value of values) {
    const key = `${value.provider}::${value.provider_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

type SimilaritySeeds = {
  genres: string[];
  keywords: string[];
  people: SimilarPersonKey[];
};

type CrewSeedFilter = { job: string; limit: number } | { jobs: readonly string[]; limit: number };

export const MOVIE_SIMILARITY_CREW = { job: "Director", limit: 3 } as const satisfies CrewSeedFilter;
export const SHOW_SIMILARITY_CREW = { jobs: TV_SHOW_CREATOR_JOBS, limit: 4 } as const satisfies CrewSeedFilter;

export async function fetchSimilaritySeeds(mediaItemId: string, crew: CrewSeedFilter): Promise<SimilaritySeeds> {
  const db = await getDb();
  const crewQuery = db
    .selectFrom("media_item_credit")
    .select(["provider", "provider_id"])
    .where("media_item_id", "=", mediaItemId)
    .where("credit_type", "=", "crew")
    .orderBy("credit_order", "asc");

  const [genres, keywords, castPairs, crewPairs] = await Promise.all([
    db.selectFrom("media_item_genre").select(["name"]).where("media_item_id", "=", mediaItemId).execute(),
    db
      .selectFrom("media_item_keyword")
      .select(["name"])
      .where("media_item_id", "=", mediaItemId)
      .orderBy("name", "asc")
      .limit(12)
      .execute(),
    db
      .selectFrom("media_item_credit")
      .select(["provider", "provider_id"])
      .where("media_item_id", "=", mediaItemId)
      .where("credit_type", "=", "cast")
      .orderBy("credit_order", "asc")
      .limit(8)
      .execute(),
    ("job" in crew
      ? crewQuery.where("job", "=", crew.job).limit(crew.limit)
      : crewQuery.where("job", "in", [...crew.jobs]).limit(crew.limit)
    ).execute(),
  ]);

  return {
    genres: uniqueStrings(genres),
    keywords: uniqueStrings(keywords),
    people: uniquePersonPairs([...castPairs, ...crewPairs]),
  };
}

export function buildSimilarityScoreSubquery(
  db: Awaited<ReturnType<typeof getDb>>,
  mediaItemId: string,
  seeds: SimilaritySeeds,
) {
  const { genres: seedGenres, keywords: seedKeywords, people: seedPeople } = seeds;

  return db
    .selectFrom(
      db
        .selectFrom("media_item_genre")
        .select(["media_item_id", sql<number>`3`.as("score")])
        .$if(seedGenres.length > 0, (qb) => qb.where("name", "in", seedGenres))
        .$if(seedGenres.length === 0, (qb) => qb.where(sql<boolean>`0`))
        .unionAll(
          db
            .selectFrom("media_item_keyword")
            .select(["media_item_id", sql<number>`2`.as("score")])
            .$if(seedKeywords.length > 0, (qb) => qb.where("name", "in", seedKeywords))
            .$if(seedKeywords.length === 0, (qb) => qb.where(sql<boolean>`0`)),
        )
        .unionAll(
          db
            .selectFrom("media_item_credit")
            .select(["media_item_id", sql<number>`1`.as("score")])
            .$if(seedPeople.length > 0, (qb) => qb.where(providerPairsWhereSql(seedPeople)))
            .$if(seedPeople.length === 0, (qb) => qb.where(sql<boolean>`0`)),
        )
        .as("match_rows"),
    )
    .select(["media_item_id", sql<number>`sum(score)`.as("score")])
    .where("media_item_id", "!=", mediaItemId)
    .groupBy("media_item_id")
    .as("similar_scores");
}

export const RECOMMENDATION_SEED_LIMIT = 3;
const RECOMMENDATION_SEED_WEIGHTS = [3, 2, 1] as const;

export async function aggregateWeightedSimilarityScores(
  db: Awaited<ReturnType<typeof getDb>>,
  seedIds: string[],
  crew: CrewSeedFilter,
) {
  const scores = new Map<string, number>();
  for (let index = 0; index < seedIds.length; index++) {
    const seedId = seedIds[index];
    if (!seedId) continue;
    const weight = RECOMMENDATION_SEED_WEIGHTS[index] ?? 1;
    const seeds = await fetchSimilaritySeeds(seedId, crew);
    if (seeds.genres.length === 0 && seeds.keywords.length === 0 && seeds.people.length === 0) {
      continue;
    }
    const scoreSubquery = buildSimilarityScoreSubquery(db, seedId, seeds);
    const rows = await db.selectFrom(scoreSubquery).select(["media_item_id", "score"]).execute();
    for (const row of rows) {
      scores.set(row.media_item_id, (scores.get(row.media_item_id) ?? 0) + Number(row.score) * weight);
    }
  }
  return scores;
}

export function rankIdsByScore(scores: Map<string, number>, excludeIds: ReadonlySet<string>, limit?: number) {
  const ranked = [...scores.entries()]
    .filter(([id, score]) => score > 0 && !excludeIds.has(id))
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([id]) => id);
  return limit === undefined ? ranked : ranked.slice(0, limit);
}

export async function collapseSimilarityScoresToShows(
  db: Awaited<ReturnType<typeof getDb>>,
  scores: Map<string, number>,
) {
  const mediaIds = [...scores.keys()];
  if (mediaIds.length === 0) return new Map<string, number>();

  const items = await db
    .selectFrom("media_item")
    .select(["id", "kind", "parent_id"])
    .where("id", "in", mediaIds)
    .execute();

  const episodeIds = items.filter((item) => item.kind === "episode").map((item) => item.id);
  const episodeShowIds =
    episodeIds.length === 0
      ? new Map<string, string>()
      : new Map(
          (
            await db
              .selectFrom("media_item as episode")
              .innerJoin("media_item as season", "season.id", "episode.parent_id")
              .select(["episode.id as episode_id", "season.parent_id as show_id"])
              .where("episode.id", "in", episodeIds)
              .where("season.kind", "=", "season")
              .execute()
          ).map((row) => [row.episode_id, row.show_id]),
        );

  const showScores = new Map<string, number>();
  for (const item of items) {
    const score = scores.get(item.id) ?? 0;
    if (score <= 0) continue;

    const showId =
      item.kind === "show"
        ? item.id
        : item.kind === "season"
          ? item.parent_id
          : item.kind === "episode"
            ? episodeShowIds.get(item.id)
            : null;
    if (!showId) continue;

    showScores.set(showId, Math.max(showScores.get(showId) ?? 0, score));
  }

  return showScores;
}
