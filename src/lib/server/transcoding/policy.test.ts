import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDatabaseForTests, migrateDatabase, useDatabaseFileForTests } from "../db";
import {
  getTranscodePolicy,
  normalizeHardwareAccelerationMode,
  normalizePlaybackPreference,
  normalizePreferredAudioLanguage,
  normalizeTranscodeQualityPreset,
  setHardwareAccelerationMode,
  setHardwareAccelerationRequired,
  setUserPreferredAudioLanguage,
  setUserPreferredSubtitleLanguage,
  setTranscodeQualityPreset,
  setTranscodingEnabled,
  setUserPlaybackPreference,
} from "./policy";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-transcode-policy-"));
  await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
  await migrateDatabase();
});

afterEach(async () => {
  await closeDatabaseForTests();
  await rm(tempDir, { recursive: true, force: true });
});

describe("transcode policy", () => {
  test("defaults to enabled software transcoding and auto playback", async () => {
    expect(await getTranscodePolicy("user-1")).toEqual({
      transcodingEnabled: true,
      playbackPreference: "auto",
      preferredAudioLanguage: null,
      preferredSubtitleLanguage: null,
      hardwareAcceleration: "off",
      hardwareAccelerationRequired: false,
      transcodeQualityPreset: "auto",
      transcodeQuality: {
        preset: "auto",
        maxHeight: null,
        softwareCrf: 23,
        hardwareBitrate: "5M",
      },
    });
  });

  test("normalizes invalid stored policy values to safe defaults", () => {
    expect(normalizePlaybackPreference("prefer_transcode")).toBe("prefer_transcode");
    expect(normalizePlaybackPreference("bad")).toBe("auto");
    expect(normalizePreferredAudioLanguage(" ENG ")).toBe("eng");
    expect(normalizePreferredAudioLanguage("")).toBe(null);
    expect(normalizePreferredAudioLanguage(" JPN ")).toBe("jpn");
    expect(normalizeHardwareAccelerationMode("videotoolbox")).toBe("videotoolbox");
    expect(normalizeHardwareAccelerationMode("bad")).toBe("off");
    expect(normalizeTranscodeQualityPreset("720p")).toBe("720p");
    expect(normalizeTranscodeQualityPreset("bad")).toBe("auto");
  });

  test("persists global and per-user transcoding preferences", async () => {
    await setTranscodingEnabled(false);
    await setUserPlaybackPreference("user-1", "prefer_direct");
    await setUserPreferredAudioLanguage("user-1", " JPN ");
    await setUserPreferredSubtitleLanguage("user-1", " ENG ");
    await setHardwareAccelerationMode("videotoolbox");
    await setHardwareAccelerationRequired(true);
    await setTranscodeQualityPreset("720p");
    expect(await getTranscodePolicy("user-1")).toEqual({
      transcodingEnabled: false,
      playbackPreference: "prefer_direct",
      preferredAudioLanguage: "jpn",
      preferredSubtitleLanguage: "eng",
      hardwareAcceleration: "videotoolbox",
      hardwareAccelerationRequired: true,
      transcodeQualityPreset: "720p",
      transcodeQuality: {
        preset: "720p",
        maxHeight: 720,
        softwareCrf: 24,
        hardwareBitrate: "3M",
      },
    });
    expect(await getTranscodePolicy("user-2").then((policy) => policy.playbackPreference)).toBe("auto");
  });

  test("does not require hardware acceleration while hardware mode is off", async () => {
    await setHardwareAccelerationMode("off");
    await setHardwareAccelerationRequired(true);

    expect(await getTranscodePolicy("user-1")).toMatchObject({
      hardwareAcceleration: "off",
      hardwareAccelerationRequired: false,
    });
  });
});
