import { startMovieMetadataRefreshJob } from "./metadata/movies";
import { startTvMetadataRefreshJob } from "./metadata/tv";
import { PUBLIC_TMDB_ACCESS_TOKEN, testTmdbConnection, tmdbCredentialsConfigured } from "./metadata/tmdb";
import { startAllLibraryScans } from "./scanner/scan-jobs";
import { deleteSetting, getBooleanSetting, getSetting, setBooleanSetting, setSetting } from "./settings";
import {
  getMetadataRefreshIntervalHours,
  getMetadataStalenessDays,
  normalizeStalenessDays,
  setLastScheduledMetadataRefreshAt,
  setMetadataRefreshIntervalHours,
  setMetadataStalenessDays,
} from "./metadata/settings";
import type { MetadataKind } from "./metadata/settings";
import { syncScheduledMetadataRefresh } from "./metadata/scheduler";
import { getServerStatus } from "./status";
import { cancelActivePlaybackSessions } from "./transcoding/manager";
import { startMediaProbeRefreshJob } from "./transcoding/probe-jobs";
import {
  normalizeHardwareAccelerationMode,
  normalizeTranscodeQualityPreset,
  setHardwareAccelerationMode,
  setHardwareAccelerationRequired,
  setTranscodeQualityPreset,
  setTranscodingEnabled,
  getTranscodePolicy,
} from "./transcoding/policy";
import {
  cleanupConfiguredPlaybackSessionArtifacts,
  formatPlaybackArtifactsCleanupMessage,
  getPlaybackSessionArtifactMaxBytes,
  PLAYBACK_SESSION_ARTIFACT_MAX_BYTES_OPTIONS,
  setPlaybackSessionArtifactMaxBytes,
} from "./transcoding/sessions";
import {
  getEncodeAheadSegmentCount,
  getPlaybackCacheTtlMs,
  setEncodeAheadSegmentCount,
  setPlaybackCacheTtlMs,
} from "./transcoding/cache";
import { APP_VERSION } from "./version";

type InputSource = Record<string, unknown> | FormData;

function valueFrom(input: InputSource, key: string) {
  return input instanceof FormData ? input.get(key) : input[key];
}

function booleanInput(input: InputSource, key: string) {
  const value = valueFrom(input, key);
  return value === true || value === "true" || value === "on";
}

function stringInput(input: InputSource, key: string) {
  return String(valueFrom(input, key) ?? "").trim();
}

function hasInput(input: InputSource, key: string) {
  return valueFrom(input, key) !== null && valueFrom(input, key) !== undefined;
}

export async function getAdminSettingsResponse(userId: string) {
  const savedAccessToken = await getSetting("tmdb_access_token");
  const savedApiKey = await getSetting("tmdb_api_key");
  const fallbackConfigured = Boolean(PUBLIC_TMDB_ACCESS_TOKEN);

  return {
    signupOpen: await getBooleanSetting("signup_open", false),
    tmdbConfigured: Boolean(savedAccessToken || savedApiKey || fallbackConfigured),
    tmdbAccessTokenSaved: Boolean(savedAccessToken),
    tmdbApiKeySaved: Boolean(savedApiKey),
    movieMetadataRefreshIntervalHours: await getMetadataRefreshIntervalHours("movie"),
    tvMetadataRefreshIntervalHours: await getMetadataRefreshIntervalHours("tv"),
    movieMetadataStalenessDays: await getMetadataStalenessDays("movie"),
    tvMetadataStalenessDays: await getMetadataStalenessDays("tv"),
    transcodePolicy: await getTranscodePolicy(userId),
    playbackSessionArtifactMaxBytes: await getPlaybackSessionArtifactMaxBytes(),
    playbackSessionArtifactMaxBytesOptions: PLAYBACK_SESSION_ARTIFACT_MAX_BYTES_OPTIONS,
    encodeAheadSegmentCount: await getEncodeAheadSegmentCount(),
    playbackCacheTtlHours: (await getPlaybackCacheTtlMs()) / (60 * 60 * 1000),
    version: APP_VERSION,
    status: await getServerStatus(),
  };
}

export async function updateRegistrationSettings(input: InputSource) {
  await setBooleanSetting("signup_open", booleanInput(input, "signupOpen"));
}

export async function updateMetadataSettings(input: InputSource) {
  const accessToken = stringInput(input, "tmdbAccessToken");
  const apiKey = stringInput(input, "tmdbApiKey");

  function numberInputOrNull(key: string) {
    if (!hasInput(input, key)) return null;
    const raw = stringInput(input, key);
    if (!raw) return null;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const movieIntervalHoursInput = numberInputOrNull("movieMetadataRefreshIntervalHours");
  const tvIntervalHoursInput = numberInputOrNull("tvMetadataRefreshIntervalHours");
  const movieStalenessDaysInput = numberInputOrNull("movieMetadataStalenessDays");
  const tvStalenessDaysInput = numberInputOrNull("tvMetadataStalenessDays");

  if (booleanInput(input, "clearTmdbAccessToken")) await deleteSetting("tmdb_access_token");
  if (booleanInput(input, "clearTmdbApiKey")) await deleteSetting("tmdb_api_key");
  if (accessToken) await setSetting("tmdb_access_token", accessToken);
  if (apiKey) await setSetting("tmdb_api_key", apiKey);

  async function updateMetadataInterval(kind: MetadataKind, hoursInput: number | null) {
    if (hoursInput === null) return;
    const previous = await getMetadataRefreshIntervalHours(kind);
    await setMetadataRefreshIntervalHours(kind, hoursInput);
    if ((await getMetadataRefreshIntervalHours(kind)) !== previous) {
      await setLastScheduledMetadataRefreshAt(kind, "");
    }
  }

  async function updateMetadataStaleness(kind: MetadataKind, daysInput: number | null) {
    if (daysInput === null) return;
    const normalized = normalizeStalenessDays(daysInput);
    await setMetadataStalenessDays(kind, normalized);
  }

  await Promise.all([
    updateMetadataInterval("movie", movieIntervalHoursInput),
    updateMetadataInterval("tv", tvIntervalHoursInput),
    updateMetadataStaleness("movie", movieStalenessDaysInput),
    updateMetadataStaleness("tv", tvStalenessDaysInput),
  ]);

  await syncScheduledMetadataRefresh();
}

export async function updateTranscodingSettings(input: InputSource) {
  const transcodingEnabled = booleanInput(input, "transcodingEnabled");
  const hardwareAcceleration = normalizeHardwareAccelerationMode(stringInput(input, "hardwareAcceleration"));
  const transcodeQualityPreset = normalizeTranscodeQualityPreset(stringInput(input, "transcodeQualityPreset"));

  await setTranscodingEnabled(transcodingEnabled);
  if (!transcodingEnabled) await cancelActivePlaybackSessions();
  await setHardwareAccelerationMode(hardwareAcceleration);
  await setHardwareAccelerationRequired(
    hardwareAcceleration !== "off" && booleanInput(input, "hardwareAccelerationRequired"),
  );
  await setTranscodeQualityPreset(transcodeQualityPreset);
  if (hasInput(input, "playbackSessionArtifactMaxBytes")) {
    await setPlaybackSessionArtifactMaxBytes(stringInput(input, "playbackSessionArtifactMaxBytes"));
  }
  if (hasInput(input, "encodeAheadSegmentCount")) {
    const parsed = Number.parseInt(stringInput(input, "encodeAheadSegmentCount"), 10);
    if (Number.isFinite(parsed) && parsed > 0) await setEncodeAheadSegmentCount(parsed);
  }
  if (hasInput(input, "playbackCacheTtlHours")) {
    const parsed = Number.parseFloat(stringInput(input, "playbackCacheTtlHours"));
    if (Number.isFinite(parsed) && parsed > 0) await setPlaybackCacheTtlMs(Math.round(parsed * 60 * 60 * 1000));
  }
}

export async function runSettingsAction(action: string) {
  if (action === "scanAll") {
    const result = await startAllLibraryScans();
    if (result.libraries === 0) throw new Error("No libraries are configured.");
    return result;
  }

  if (action === "refreshMovieMetadata") {
    if (!(await tmdbCredentialsConfigured())) throw new Error("TMDb credentials are not configured.");
    return startMovieMetadataRefreshJob();
  }

  if (action === "refreshTvMetadata") {
    if (!(await tmdbCredentialsConfigured())) throw new Error("TMDb credentials are not configured.");
    return startTvMetadataRefreshJob();
  }

  if (action === "repairMediaProbes") {
    return startMediaProbeRefreshJob();
  }

  if (action === "testTmdb") {
    return testTmdbConnection();
  }

  if (action === "cleanupPlaybackArtifacts") {
    const result = await cleanupConfiguredPlaybackSessionArtifacts(undefined, { forceIdleCache: true });
    return {
      ...result,
      message: formatPlaybackArtifactsCleanupMessage(result),
    };
  }

  throw new Error("Unknown settings action.");
}
