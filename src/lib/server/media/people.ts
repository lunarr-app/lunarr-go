import { sql } from "kysely";
import { getDb } from "../db";
import { tmdbImageUrl } from "$lib/media/images";
import { accessibleLibrarySql, catalogPageInfo, MOVIE_PAGE_SIZE, normalizePage } from "./catalog";
import { publicMovieSummary, summarizeMovieProgress } from "./progress";
import { publicShowSummary } from "./shows";

export const PERSON_FILMOGRAPHY_PAGE_SIZE = MOVIE_PAGE_SIZE;

export type PersonFilmographyStats = {
  movieCount: number;
  showCount: number;
  yearMin: number | null;
  yearMax: number | null;
  characters: string[];
};

export type PersonDetailOptions = {
  moviePage?: number;
  showPage?: number;
};

function personMovieCreditsQuery(
  db: Awaited<ReturnType<typeof getDb>>,
  provider: string,
  providerId: string,
  userId: string,
) {
  return db
    .selectFrom("media_item_credit")
    .innerJoin("media_item", "media_item.id", "media_item_credit.media_item_id")
    .innerJoin("media_file", "media_file.media_item_id", "media_item.id")
    .select([
      "media_item.id",
      "media_item.title",
      "media_item.sort_title",
      "media_item.year",
      "media_item.poster_path",
      "media_item.release_date",
      "media_item.popularity",
      "media_item.vote_average",
      "media_item_credit.character_name as character",
      sql<number>`count(distinct media_file.id)`.as("file_count"),
      sql<string | null>`max(media_file.created_at)`.as("latest_file_created_at"),
    ])
    .where("media_item.kind", "=", "movie")
    .where("media_item_credit.credit_type", "=", "cast")
    .where("media_item_credit.provider", "=", provider)
    .where("media_item_credit.provider_id", "=", providerId)
    .where(accessibleLibrarySql(userId))
    .groupBy("media_item.id")
    .groupBy("media_item_credit.character_name")
    .orderBy("media_item.release_date", "desc")
    .orderBy("media_item.sort_title", "asc");
}

function personShowCreditsQuery(
  db: Awaited<ReturnType<typeof getDb>>,
  provider: string,
  providerId: string,
  userId: string,
) {
  return db
    .selectFrom("media_item_credit")
    .innerJoin("media_item as show", "show.id", "media_item_credit.media_item_id")
    .innerJoin("media_item as season", "season.parent_id", "show.id")
    .innerJoin("media_item as episode", "episode.parent_id", "season.id")
    .innerJoin("media_file", "media_file.media_item_id", "episode.id")
    .select([
      "show.id",
      "show.title",
      "show.sort_title",
      "show.year",
      "show.poster_path",
      "show.backdrop_path",
      "show.release_date",
      "show.status",
      "show.popularity",
      "show.vote_average",
      "media_item_credit.character_name as character",
      sql<number>`count(distinct episode.id)`.as("episode_count"),
      sql<number>`count(distinct season.id)`.as("season_count"),
      sql<string | null>`max(media_file.created_at)`.as("latest_file_created_at"),
      sql<string | null>`max(episode.release_date)`.as("latest_episode_release_date"),
    ])
    .where("show.kind", "=", "show")
    .where("season.kind", "=", "season")
    .where("episode.kind", "=", "episode")
    .where("media_item_credit.credit_type", "=", "cast")
    .where("media_item_credit.provider", "=", provider)
    .where("media_item_credit.provider_id", "=", providerId)
    .where(accessibleLibrarySql(userId))
    .groupBy("show.id")
    .groupBy("media_item_credit.character_name")
    .orderBy(sql<string | null>`max(episode.release_date)`, "desc")
    .orderBy("show.sort_title", "asc");
}

async function countPersonMovieCredits(
  db: Awaited<ReturnType<typeof getDb>>,
  provider: string,
  providerId: string,
  userId: string,
) {
  const grouped = personMovieCreditsQuery(db, provider, providerId, userId);
  const row = await db
    .selectFrom(grouped.as("credits"))
    .select(sql<number>`count(*)`.as("total"))
    .executeTakeFirst();
  return Number(row?.total ?? 0);
}

async function countPersonShowCredits(
  db: Awaited<ReturnType<typeof getDb>>,
  provider: string,
  providerId: string,
  userId: string,
) {
  const grouped = personShowCreditsQuery(db, provider, providerId, userId);
  const row = await db
    .selectFrom(grouped.as("credits"))
    .select(sql<number>`count(*)`.as("total"))
    .executeTakeFirst();
  return Number(row?.total ?? 0);
}

async function fetchPersonFilmographyStats(
  db: Awaited<ReturnType<typeof getDb>>,
  provider: string,
  providerId: string,
  userId: string,
): Promise<PersonFilmographyStats> {
  const [movieCount, showCount, movieYears, showYears, movieCharacters, showCharacters] = await Promise.all([
    countPersonMovieCredits(db, provider, providerId, userId),
    countPersonShowCredits(db, provider, providerId, userId),
    personMovieCreditsQuery(db, provider, providerId, userId).clearSelect().select("media_item.year as year").execute(),
    personShowCreditsQuery(db, provider, providerId, userId).clearSelect().select("show.year as year").execute(),
    personMovieCreditsQuery(db, provider, providerId, userId)
      .clearSelect()
      .select("media_item_credit.character_name as character")
      .execute(),
    personShowCreditsQuery(db, provider, providerId, userId)
      .clearSelect()
      .select("media_item_credit.character_name as character")
      .execute(),
  ]);

  const years = [...movieYears, ...showYears]
    .map((row) => row.year)
    .filter((year): year is number => typeof year === "number");
  const characters = [...movieCharacters, ...showCharacters]
    .map((row) => row.character)
    .filter((character): character is string => Boolean(character));

  return {
    movieCount,
    showCount,
    yearMin: years.length > 0 ? Math.min(...years) : null,
    yearMax: years.length > 0 ? Math.max(...years) : null,
    characters: [...new Set(characters)].slice(0, 6),
  };
}

export async function getPersonDetail(
  provider: string,
  providerId: string,
  userId: string,
  options: PersonDetailOptions = {},
) {
  const db = await getDb();
  const person = await db
    .selectFrom("media_item_credit")
    .select(["provider", "provider_id", "name", "original_name", "profile_path"])
    .where("provider", "=", provider)
    .where("provider_id", "=", providerId)
    .orderBy("profile_path", "desc")
    .executeTakeFirst();

  if (!person) return null;

  const moviePageInput = normalizePage(options.moviePage);
  const showPageInput = normalizePage(options.showPage);

  const stats = await fetchPersonFilmographyStats(db, provider, providerId, userId);
  const moviePage = catalogPageInfo(moviePageInput, PERSON_FILMOGRAPHY_PAGE_SIZE, stats.movieCount);
  const showPage = catalogPageInfo(showPageInput, PERSON_FILMOGRAPHY_PAGE_SIZE, stats.showCount);
  const movieOffset = (moviePage.page - 1) * moviePage.pageSize;
  const showOffset = (showPage.page - 1) * showPage.pageSize;

  const [rows, showRows] = await Promise.all([
    personMovieCreditsQuery(db, provider, providerId, userId).limit(moviePage.pageSize).offset(movieOffset).execute(),
    personShowCreditsQuery(db, provider, providerId, userId).limit(showPage.pageSize).offset(showOffset).execute(),
  ]);

  const movieIds = rows.map((movie) => movie.id);
  const progressRows =
    movieIds.length === 0
      ? []
      : await db
          .selectFrom("watch_progress")
          .select(["media_item_id", "media_file_id", "position_seconds", "duration_seconds", "completed", "updated_at"])
          .where("user_id", "=", userId)
          .where("media_item_id", "in", movieIds)
          .orderBy("updated_at", "desc")
          .execute();
  const progress = summarizeMovieProgress(progressRows);

  return {
    person: {
      provider: person.provider,
      providerId: person.provider_id,
      name: person.name,
      originalName: person.original_name,
      profileUrl: tmdbImageUrl(person.profile_path, "w342"),
    },
    stats,
    movies: rows.map((movie) => publicMovieSummary(movie, progress)),
    shows: showRows.map((show) => ({
      ...publicShowSummary(show),
      character: show.character,
    })),
    moviePage,
    showPage,
  };
}
