import { access, readFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { chromium } from "playwright-core";

const root = process.cwd();

const browserCandidates = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/snap/bin/chromium",
].filter(Boolean);

async function fileExists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function resolveBrowserExecutable() {
  for (const candidate of browserCandidates) {
    if (await fileExists(candidate)) return candidate;
  }
  throw new Error(
    "No Chromium-compatible browser found. Set PLAYWRIGHT_CHROMIUM_EXECUTABLE to run the HLS seek browser smoke.",
  );
}

async function compiledSeekModuleDataUrl() {
  const source = await readFile(
    path.join(root, "src/lib/playback/seek.ts"),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      sourceMap: false,
    },
    fileName: "seek.ts",
  });
  return `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`;
}

function assertResult(result) {
  if (!result?.ok) {
    throw new Error(result?.message ?? "Browser HLS seek smoke failed.");
  }
}

const executablePath = await resolveBrowserExecutable();
const seekModuleUrl = await compiledSeekModuleDataUrl();
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});

try {
  const page = await browser.newPage();
  await page.setContent(`<!doctype html><meta charset="utf-8"><video></video>`);
  const result = await page.evaluate(async (moduleUrl) => {
    const seek = await import(moduleUrl);
    const video = document.querySelector("video");
    if (!video) return { ok: false, message: "Video element was not created." };

    let relativeSeconds = 0;
    let seeking = false;
    let paused = false;
    Object.defineProperties(video, {
      currentTime: {
        configurable: true,
        get: () => relativeSeconds,
        set: (value) => {
          relativeSeconds = Number(value);
        },
      },
      seeking: {
        configurable: true,
        get: () => seeking,
      },
      paused: {
        configurable: true,
        get: () => paused,
      },
    });

    const starts = [];
    const states = [];
    const timers = new Map();
    let nextTimerId = 0;
    const controller = seek.createHlsSeekEventController({
      mode: "transcode",
      status: "ready",
      startSeconds: 120,
      streamStartSeconds: 120,
      delayMs: 120,
      reposition(startSeconds) {
        starts.push(startSeconds);
      },
      setTimer(callback) {
        const timerId = ++nextTimerId;
        timers.set(timerId, callback);
        return timerId;
      },
      clearTimer(timerId) {
        timers.delete(timerId);
      },
    });

    video.addEventListener("timeupdate", () => {
      controller.timeUpdate({
        relativeSeconds: video.currentTime,
        seeking: video.seeking,
      });
    });
    video.addEventListener("seeking", () => {
      states.push(controller.seeking({ relativeSeconds: video.currentTime }));
    });
    video.addEventListener("seeked", () => {
      states.push(
        controller.seeked({
          relativeSeconds: video.currentTime,
          paused: video.paused,
        }),
      );
    });

    const emit = (type, nextSeconds, nextSeeking = seeking) => {
      relativeSeconds = nextSeconds;
      seeking = nextSeeking;
      video.dispatchEvent(new Event(type));
    };

    emit("timeupdate", 8, false);
    if (controller.lastPlaybackTime() !== 128) {
      return {
        ok: false,
        message: `Expected stable playback at 128s, got ${controller.lastPlaybackTime()}s.`,
      };
    }

    emit("seeking", 180, true);
    emit("seeked", 220, false);

    if (
      states.length !== 2 ||
      !states.every((state) => state.pendingReposition)
    ) {
      return {
        ok: false,
        message: `Expected both browser seek events to keep a pending reposition, got ${JSON.stringify(states)}.`,
      };
    }
    if (timers.size !== 1) {
      return {
        ok: false,
        message: `Expected rapid browser seek churn to collapse to one timer, got ${timers.size}.`,
      };
    }

    timers.values().next().value();
    if (starts.length !== 1 || starts[0] !== 340) {
      return {
        ok: false,
        message: `Expected browser seek churn to reposition at 340s, got ${JSON.stringify(starts)}.`,
      };
    }
    if (controller.pending()) {
      return {
        ok: false,
        message: "Reposition remained pending after timer fired.",
      };
    }

    const cancelStarts = [];
    const cancelTimers = new Map();
    let cancelTimerId = 0;
    const cancelController = seek.createHlsSeekEventController({
      mode: "remux",
      status: "ready",
      startSeconds: 90,
      streamStartSeconds: 90,
      reposition(startSeconds) {
        cancelStarts.push(startSeconds);
      },
      setTimer(callback) {
        const timerId = ++cancelTimerId;
        cancelTimers.set(timerId, callback);
        return timerId;
      },
      clearTimer(timerId) {
        cancelTimers.delete(timerId);
      },
    });

    cancelController.timeUpdate({ relativeSeconds: 10, seeking: false });
    cancelController.seeking({ relativeSeconds: 80 });
    const cancelDecision = cancelController.seeked({
      relativeSeconds: 14,
      paused: false,
    });
    for (const callback of cancelTimers.values()) callback();

    if (cancelDecision.pendingReposition || cancelStarts.length !== 0) {
      return {
        ok: false,
        message: `Expected near-stable browser seek to cancel reposition, got ${JSON.stringify({ cancelDecision, cancelStarts })}.`,
      };
    }
    if (cancelController.lastPlaybackTime() !== 104) {
      return {
        ok: false,
        message: `Expected cancel scenario stable time at 104s, got ${cancelController.lastPlaybackTime()}s.`,
      };
    }

    return { ok: true };
  }, seekModuleUrl);

  assertResult(result);
  console.log(
    `Browser HLS seek smoke passed with ${path.basename(executablePath)}.`,
  );
} finally {
  await browser.close();
}
