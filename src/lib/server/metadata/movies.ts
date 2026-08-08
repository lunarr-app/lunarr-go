import { sql } from "kysely";
import { getDb } from "../db";
import { createId } from "../id";
import { nowIso } from "../time";
import { lookupMovieMetadataFromPath, type MovieMetadataMatcher } from "./matching";
import { createMetadataRefreshJob, runMetadataRefreshJob } from "./metadata-jobs";
import { movieLookupCandidates } from "./movie-lookup";
import {
  emptyMovieMetadataValues,
  moveMediaShares,
  moveWatchlistEntries,
  moveWatchProgressForFiles,
  movieMetadataValues,
  syncMediaMetadataRelations,
} from "./store";
import { matchMovieMetadata, matchMovieMetadataById, type MatchedMovieMetadata } from "./tmdb";

export type MovieMetadataByIdMatcher = (tmdbId: number) => Promise<MatchedMovieMetadata | null>;

export type RefreshMetadataOptions = {
  metadataMatcher?: MovieMetadataMatcher;
  metadataByIdMatcher?: MovieMetadataByIdMatcher;
  stalenessDays?: number;
};

export type RefreshMovieMetadataResult =
  | { status: "matched"; mediaItemId: string }
  | { status: "unmatched"; mediaItemId: string }
  | { status: "missing"; mediaItemId: null };

function sortTitle(title: string) {
  return title.replace(/^(the|a|an)\s+/i, "").toLowerCase();
}

async function moveWatchProgress(oldMediaItemId: string, newMediaItemId: string) {
  if (oldMediaItemId === newMediaItemId) return;
  const db = await getDb();
  const fileRows = await db.selectFrom("media_file").select("id").where("media_item_id", "=", oldMediaItemId).execute();
  await moveWatchProgressForFiles(
    db,
    fileRows.map((file) => file.id),
    oldMediaItemId,
    newMediaItemId,
  );
}

export async function applyMatchedMovieMetadata(
  mediaItemId: string,
  metadata: MatchedMovieMetadata,
  options: { manualMatch?: boolean } = {},
): Promise<string> {
  const db = await getDb();
  const now = nowIso();
  const values = {
    ...movieMetadataValues(metadata, now),
    sort_title: sortTitle(metadata.title),
    ...(options.manualMatch ? { manual_match: 1 } : {}),
  };

  const existingProviderItem = await db
    .selectFrom("media_item")
    .select(["id"])
    .where("kind", "=", "movie")
    .where("provider", "=", metadata.provider)
    .where("provider_id", "=", metadata.providerId)
    .where("id", "!=", mediaItemId)
    .executeTakeFirst();

  if (existingProviderItem) {
    await db.updateTable("media_item").set(values).where("id", "=", existingProviderItem.id).execute();
    await syncMediaMetadataRelations(db, existingProviderItem.id, metadata);
    await moveWatchProgress(mediaItemId, existingProviderItem.id);
    await db
      .updateTable("media_file")
      .set({ media_item_id: existingProviderItem.id, updated_at: now })
      .where("media_item_id", "=", mediaItemId)
      .execute();
    await db
      .updateTable("subtitle_track")
      .set({ media_item_id: existingProviderItem.id, updated_at: now })
      .where("media_item_id", "=", mediaItemId)
      .execute();
    await moveWatchlistEntries(db, mediaItemId, existingProviderItem.id);
    await moveMediaShares(db, mediaItemId, existingProviderItem.id);
    await db.deleteFrom("media_item").where("id", "=", mediaItemId).execute();
    return existingProviderItem.id;
  }

  await db.updateTable("media_item").set(values).where("id", "=", mediaItemId).execute();
  await syncMediaMetadataRelations(db, mediaItemId, metadata);
  return mediaItemId;
}

export type RematchMovieItemFilesResult =
  { status: "matched"; mediaItemId: string } | { status: "unmatched"; mediaItemId: string | null };

async function createLocalMovieItem(title: string, year: number | null, now: string) {
  const db = await getDb();
  const id = createId();
  await db
    .insertInto("media_item")
    .values({
      id,
      kind: "movie",
      title,
      sort_title: sortTitle(title),
      year,
      release_date: year ? `${year}-01-01` : null,
      ...emptyMovieMetadataValues(),
      parent_id: null,
      created_at: now,
      updated_at: now,
    })
    .execute();
  return id;
}

async function findLocalMovieItem(title: string, year: number | null, excludeItemId?: string) {
  const db = await getDb();
  let query = db
    .selectFrom("media_item")
    .select("id")
    .where("kind", "=", "movie")
    .where("provider", "is", null)
    .where("title", "=", title)
    .where((eb) => (year === null ? eb("year", "is", null) : eb("year", "=", year)));
  if (excludeItemId) query = query.where("id", "!=", excludeItemId);
  const item = await query.executeTakeFirst();
  return item?.id ?? null;
}

async function findOrCreateProviderMovieItem(metadata: MatchedMovieMetadata, now: string, excludeItemId?: string) {
  const db = await getDb();
  let query = db
    .selectFrom("media_item")
    .select("id")
    .where("kind", "=", "movie")
    .where("provider", "=", metadata.provider)
    .where("provider_id", "=", metadata.providerId);
  if (excludeItemId) query = query.where("id", "!=", excludeItemId);
  const existing = await query.executeTakeFirst();
  if (existing) return existing.id;
  const id = createId();
  await db
    .insertInto("media_item")
    .values({
      id,
      ...movieMetadataValues(metadata, now),
      kind: "movie",
      sort_title: sortTitle(metadata.title),
      parent_id: null,
      created_at: now,
    })
    .execute();
  await syncMediaMetadataRelations(db, id, metadata);
  return id;
}

async function applyMovieMetadataToItem(mediaItemId: string, metadata: MatchedMovieMetadata) {
  const db = await getDb();
  const values = {
    ...movieMetadataValues(metadata, nowIso()),
    sort_title: sortTitle(metadata.title),
  };
  await db.updateTable("media_item").set(values).where("id", "=", mediaItemId).execute();
  await syncMediaMetadataRelations(db, mediaItemId, metadata);
  return mediaItemId;
}

async function moveMediaFilesToItem(mediaFileIds: string[], fromItemId: string, toItemId: string, now: string) {
  const db = await getDb();
  await db
    .updateTable("media_file")
    .set({ media_item_id: toItemId, updated_at: now })
    .where("id", "in", mediaFileIds)
    .execute();
  await db
    .updateTable("subtitle_track")
    .set({ media_item_id: toItemId, updated_at: now })
    .where("media_file_id", "in", mediaFileIds)
    .execute();
  await moveWatchProgressForFiles(db, mediaFileIds, fromItemId, toItemId);
}

export async function rematchMovieItemFiles(
  mediaItemId: string,
  options: RefreshMetadataOptions = {},
): Promise<RematchMovieItemFilesResult> {
  const db = await getDb();
  const now = nowIso();
  const files = await db
    .selectFrom("media_item")
    .innerJoin("media_file", "media_file.media_item_id", "media_item.id")
    .innerJoin("library", "library.id", "media_file.library_id")
    .select([
      "media_file.id as file_id",
      "media_file.basename as basename",
      "media_file.path as path",
      "media_file.duration_seconds as duration_seconds",
      "library.path as library_path",
      "media_item.provider as provider",
      "media_item.provider_id as provider_id",
    ])
    .where("media_item.id", "=", mediaItemId)
    .where("media_item.kind", "=", "movie")
    .orderBy("media_file.basename", "asc")
    .execute();

  if (files.length === 0) return { status: "unmatched", mediaItemId };

  const metadataMatcher = options.metadataMatcher ?? matchMovieMetadata;
  const groups: Array<{ metadata: MatchedMovieMetadata; fileIds: string[] }> = [];
  const groupIndex = new Map<string, number>();
  const unmatched: Array<{ fileId: string; path: string | null; basename: string; libraryPath: string | null }> = [];

  for (const file of files) {
    const lookup = await lookupMovieMetadataFromPath(file.path ?? file.basename ?? "", {
      libraryRoot: file.library_path,
      fileRuntimeSeconds: file.duration_seconds,
      matcher: metadataMatcher,
    });
    const metadata = lookup?.metadata ?? null;
    if (!metadata) {
      unmatched.push({
        fileId: file.file_id,
        path: file.path,
        basename: file.basename,
        libraryPath: file.library_path,
      });
      continue;
    }
    const key = `${metadata.provider}:${metadata.providerId}`;
    const existingIndex = groupIndex.get(key);
    if (existingIndex === undefined) {
      groupIndex.set(key, groups.length);
      groups.push({ metadata, fileIds: [file.file_id] });
    } else {
      groups[existingIndex].fileIds.push(file.file_id);
    }
  }

  const movedToIds = new Set<string>();
  const localItemsByKey = new Map<string, string>();

  const originalProviderIndex = groups.findIndex(
    (group) => group.metadata.provider === files[0].provider && group.metadata.providerId === files[0].provider_id,
  );
  if (originalProviderIndex > 0) {
    const [group] = groups.splice(originalProviderIndex, 1);
    groups.unshift(group);
  }

  for (const file of unmatched) {
    const candidates = movieLookupCandidates(file.path ?? file.basename ?? "", undefined, {
      libraryRoot: file.libraryPath,
    });
    const parsed = candidates[0] ?? { title: file.basename, year: null };
    const localKey = `${parsed.title}:${parsed.year ?? ""}`;
    let localItemId = localItemsByKey.get(localKey) ?? null;
    if (!localItemId) {
      localItemId =
        (await findLocalMovieItem(parsed.title, parsed.year, mediaItemId)) ??
        (await createLocalMovieItem(parsed.title, parsed.year, now));
      localItemsByKey.set(localKey, localItemId);
    }
    await moveMediaFilesToItem([file.fileId], mediaItemId, localItemId, now);
    movedToIds.add(localItemId);
  }

  for (const group of groups.slice(1)) {
    const targetId = await findOrCreateProviderMovieItem(group.metadata, now, mediaItemId);
    await applyMovieMetadataToItem(targetId, group.metadata);
    await moveMediaFilesToItem(group.fileIds, mediaItemId, targetId, now);
    movedToIds.add(targetId);
  }

  if (groups.length === 0) {
    const firstTarget = movedToIds.values().next().value;
    if (firstTarget) {
      await moveWatchlistEntries(db, mediaItemId, firstTarget);
      await moveMediaShares(db, mediaItemId, firstTarget);
    }
    await db.deleteFrom("media_item").where("id", "=", mediaItemId).execute();
    return { status: "unmatched", mediaItemId: null };
  }

  const finalMediaItemId = await applyMatchedMovieMetadata(mediaItemId, groups[0].metadata);
  return {
    status: "matched",
    mediaItemId: finalMediaItemId,
  };
}

export async function refreshMovieMetadataResult(
  mediaItemId: string,
  options: RefreshMetadataOptions = {},
): Promise<RefreshMovieMetadataResult> {
  const db = await getDb();
  const movie = await db
    .selectFrom("media_item")
    .innerJoin("media_file", "media_file.media_item_id", "media_item.id")
    .innerJoin("library", "library.id", "media_file.library_id")
    .select([
      "media_item.id",
      "media_item.title",
      "media_item.year",
      "media_item.provider",
      "media_item.provider_id",
      "media_item.manual_match",
      "media_file.basename as basename",
      "media_file.path as path",
      "media_file.duration_seconds as duration_seconds",
      "library.path as library_path",
    ])
    .where("media_item.id", "=", mediaItemId)
    .where("media_item.kind", "=", "movie")
    .orderBy("media_file.basename", "asc")
    .executeTakeFirst();

  if (!movie) return { status: "missing", mediaItemId: null };

  let metadata: MatchedMovieMetadata | null = null;

  if (movie.manual_match && movie.provider === "tmdb" && movie.provider_id) {
    const metadataByIdMatcher = options.metadataByIdMatcher ?? matchMovieMetadataById;
    metadata = await metadataByIdMatcher(Number(movie.provider_id));
  } else {
    const metadataMatcher = options.metadataMatcher ?? matchMovieMetadata;
    const lookup =
      (await lookupMovieMetadataFromPath(movie.path ?? movie.basename ?? "", {
        libraryRoot: movie.library_path,
        fileRuntimeSeconds: movie.duration_seconds,
        fallback: {
          title: movie.title,
          year: movie.year,
        },
        matcher: metadataMatcher,
      })) ?? null;
    metadata = lookup?.metadata ?? null;
  }

  if (!metadata) return { status: "unmatched", mediaItemId };

  const finalMediaItemId = await applyMatchedMovieMetadata(mediaItemId, metadata);
  return { status: "matched", mediaItemId: finalMediaItemId };
}

export async function runMovieMetadataRefreshJob(jobId: string, options: RefreshMetadataOptions = {}) {
  return runMetadataRefreshJob(jobId, {
    jobKind: "movie_metadata_refresh",
    stalenessDays: options.stalenessDays,
    fetchItems: async (stalenessDays) => {
      const db = await getDb();
      const moviesQuery = db
        .selectFrom("media_item")
        .innerJoin("media_file", "media_file.media_item_id", "media_item.id")
        .select(["media_item.id", "media_item.title", "media_item.sort_title", "media_item.updated_at"])
        .where("media_item.kind", "=", "movie")
        .groupBy("media_item.id")
        .orderBy("media_item.sort_title", "asc");
      const movies =
        stalenessDays && stalenessDays > 0
          ? await moviesQuery
              .where(sql<boolean>`media_item.updated_at < datetime('now', '-' || ${stalenessDays} || ' days')`)
              .execute()
          : await moviesQuery.execute();
      return movies.map((movie) => ({ id: movie.id, label: movie.title || movie.id }));
    },
    processItem: async (movieId) => {
      const result = await refreshMovieMetadataResult(movieId, options);
      return result.status === "matched"
        ? { updated: true, removed: result.mediaItemId !== movieId ? 1 : 0 }
        : { updated: false };
    },
    errorLabel: "movie metadata refresh",
  });
}

export async function startMovieMetadataRefreshJob(options: RefreshMetadataOptions = {}) {
  const job = await createMetadataRefreshJob("movie_metadata_refresh", "null");
  if (!job.existing) void runMovieMetadataRefreshJob(job.id, options);
  return job;
}
