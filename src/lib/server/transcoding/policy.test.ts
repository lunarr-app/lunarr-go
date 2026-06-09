import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  closeDatabaseForTests,
  migrateDatabase,
  useDatabaseFileForTests,
} from "../db";
import {
  getTranscodePolicy,
  normalizeHardwareAccelerationMode,
  normalizePlaybackPreference,
  setHardwareAccelerationMode,
  setHardwareAccelerationRequired,
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
      hardwareAcceleration: "off",
      hardwareAccelerationRequired: false,
    });
  });

  test("normalizes invalid stored policy values to safe defaults", () => {
    expect(normalizePlaybackPreference("prefer_transcode")).toBe(
      "prefer_transcode",
    );
    expect(normalizePlaybackPreference("bad")).toBe("auto");
    expect(normalizeHardwareAccelerationMode("videotoolbox")).toBe(
      "videotoolbox",
    );
    expect(normalizeHardwareAccelerationMode("bad")).toBe("off");
  });

  test("persists global and per-user transcoding preferences", async () => {
    await setTranscodingEnabled(false);
    await setUserPlaybackPreference("user-1", "prefer_direct");
    await setHardwareAccelerationMode("videotoolbox");
    await setHardwareAccelerationRequired(true);
    expect(await getTranscodePolicy("user-1")).toEqual({
      transcodingEnabled: false,
      playbackPreference: "prefer_direct",
      hardwareAcceleration: "videotoolbox",
      hardwareAccelerationRequired: true,
    });
    expect(
      await getTranscodePolicy("user-2").then(
        (policy) => policy.playbackPreference,
      ),
    ).toBe("auto");
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
