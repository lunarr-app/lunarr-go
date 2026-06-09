#!/usr/bin/env node
import { existsSync } from "node:fs";
import path from "node:path";
import LibsqlDatabase from "libsql";
import { loadDotenv } from "./env.mjs";

const TMDB_SEARCH_URL = "https://api.themoviedb.org/3/search/movie";
const TMDB_MOVIE_URL = "https://api.themoviedb.org/3/movie";
const PUBLIC_TMDB_ACCESS_TOKEN =
  "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIzYzM0NTExNGUxNmZiNjM2NWFiMmQxZjA5Y2I5MjlhNyIsIm5iZiI6MTcyNzYwNzQ4OS43NzEwMDYsInN1YiI6IjVlMzVhMzdmNzZlZWNmMDAxNThmNjliZSIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.R3I6onOpLTybIMa0kRXWMz2fWIKFN0GNlsbQ2oHrUzE";

export function dataDirForEnv(env = process.env) {
  return env.LUNARR_DATA_DIR?.trim() || ".lunarr";
}

export function readSavedTmdbCredentials({ cwd = process.cwd(), env = process.env } = {}) {
  const dbFile = path.resolve(cwd, dataDirForEnv(env), "lunarr.db");
  if (!existsSync(dbFile)) {
    return {};
  }

  let db;
  try {
    db = new LibsqlDatabase(dbFile);
    const rows = db
      .prepare("select key, value from app_setting where key in (?, ?)")
      .all("tmdb_access_token", "tmdb_api_key");

    return Object.fromEntries(rows.map((row) => [row.key, String(row.value ?? "")]));
  } catch {
    return {};
  } finally {
    db?.close();
  }
}

export function resolveTmdbCredentials({ saved = {}, env = process.env } = {}) {
  const token = saved.tmdb_access_token || "";
  const apiKey = saved.tmdb_api_key || "";

  return {
    token: token || (apiKey ? "" : PUBLIC_TMDB_ACCESS_TOKEN),
    apiKey
  };
}

function requestInit(credentials) {
  const headers = {
    accept: "application/json"
  };

  if (!credentials.apiKey && credentials.token) {
    headers.authorization = `Bearer ${credentials.token}`;
  }

  return { headers };
}

async function tmdbJson(url, credentials, fetcher) {
  if (!credentials.token && credentials.apiKey) {
    url.searchParams.set("api_key", credentials.apiKey);
  }

  const response = await fetcher(url, requestInit(credentials));
  if (!response.ok) {
    throw new Error(`TMDb request failed with ${response.status}`);
  }

  return response.json();
}

export async function verifyTmdb({
  cwd = process.cwd(),
  env = process.env,
  fetcher = fetch
} = {}) {
  loadDotenv({ cwd, env });
  const saved = readSavedTmdbCredentials({ cwd, env });
  const credentials = resolveTmdbCredentials({ saved, env });

  if (!credentials.token && !credentials.apiKey) {
    return {
      ok: false,
      message: "TMDb credentials are missing. Save credentials in Settings."
    };
  }

  const searchUrl = new URL(TMDB_SEARCH_URL);
  searchUrl.searchParams.set("query", "The Matrix");
  searchUrl.searchParams.set("year", "1999");
  searchUrl.searchParams.set("primary_release_year", "1999");
  searchUrl.searchParams.set("include_adult", "false");
  const search = await tmdbJson(searchUrl, credentials, fetcher);
  const match = Array.isArray(search.results) ? search.results.find((item) => item?.id) : undefined;
  if (!match) {
    return {
      ok: false,
      message: "TMDb returned no movie search result for The Matrix (1999)."
    };
  }

  const detailUrl = new URL(`${TMDB_MOVIE_URL}/${match.id}`);
  const detail = await tmdbJson(detailUrl, credentials, fetcher);
  if (!detail?.poster_path) {
    return {
      ok: false,
      message: `TMDb returned ${detail?.title ?? "a movie"} but no poster path.`
    };
  }

  return {
    ok: true,
    message: `TMDb returned ${detail.title ?? match.title ?? "The Matrix"} with poster ${detail.poster_path}.`,
    title: detail.title ?? match.title ?? null,
    posterPath: detail.poster_path
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  try {
    const result = await verifyTmdb();
    console.log(result.message);
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
