import { startMovieMetadataRefreshJob } from "./metadata/movies";
import { startTvMetadataRefreshJob } from "./metadata/tv";
import { testTmdbConnection, tmdbCredentialsConfigured } from "./metadata/tmdb";
import { startAllLibraryScans } from "./scanner";
import { deleteSetting, setBooleanSetting, setSetting } from "./settings";
import { cancelActivePlaybackSessions } from "./transcoding/manager";
import { startMediaProbeRefreshJob } from "./transcoding/probe-jobs";
import {
  normalizeHardwareAccelerationMode,
  normalizeTranscodeQualityPreset,
  setHardwareAccelerationMode,
  setHardwareAccelerationRequired,
  setTranscodeQualityPreset,
  setTranscodingEnabled,
} from "./transcoding/policy";
import {
  cleanupConfiguredPlaybackSessionArtifacts,
  formatPlaybackArtifactsCleanupMessage,
  setPlaybackSessionArtifactMaxBytes,
} from "./transcoding/sessions";
import { setEncodeAheadSegmentCount, setPlaybackCacheTtlMs } from "./transcoding/cache";

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

export async function updateRegistrationSettings(input: InputSource) {
  await setBooleanSetting("signup_open", booleanInput(input, "signupOpen"));
}

export async function updateMetadataSettings(input: InputSource) {
  const accessToken = stringInput(input, "tmdbAccessToken");
  const apiKey = stringInput(input, "tmdbApiKey");

  if (booleanInput(input, "clearTmdbAccessToken")) await deleteSetting("tmdb_access_token");
  if (booleanInput(input, "clearTmdbApiKey")) await deleteSetting("tmdb_api_key");
  if (accessToken) await setSetting("tmdb_access_token", accessToken);
  if (apiKey) await setSetting("tmdb_api_key", apiKey);
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
