/**
 * Best-effort SRT to WebVTT converter.
 *
 * This is intentionally bare-bones: it handles the common SRT shape (cue index,
 * timing line, text block) and preserves only `<b>`, `<i>`, and `<u>` tags.
 * Other markup is escaped so it renders as plain text in WebVTT clients.
 */

const SRT_TIME_RE = /^\s*(\d+[\d:.,]*)\s*-->\s*(\d+[\d:.,]*)/;

function stripBom(text: string) {
  if (text.charCodeAt(0) === 0xfeff) return text.slice(1);
  return text;
}

function normalizeLineEndings(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function parseTimePart(time: string) {
  const cleaned = time.replace(/,/g, ".").trim();
  const parts = cleaned.split(":");
  if (parts.length === 2) {
    parts.unshift("00");
  } else if (parts.length < 2) {
    return null;
  }
  const [hours, minutes, secondsMs] = parts;
  const [seconds, milliseconds = "000"] = secondsMs.split(".");
  const paddedMs = milliseconds.padEnd(3, "0").slice(0, 3);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${paddedMs}`;
}

function parseTimingLine(line: string) {
  const match = SRT_TIME_RE.exec(line);
  if (!match) return null;
  const start = parseTimePart(match[1]);
  const end = parseTimePart(match[2]);
  if (!start || !end) return null;
  return { start, end, settings: line.slice(match[0].length).trim() };
}

function sanitizeCueText(text: string) {
  // WebVTT does not support <font> tags, so strip them and keep the inner text.
  // Then escape HTML metacharacters and restore the simple formatting tags
  // that WebVTT does support.
  return text
    .replace(/<font[^>]*>/gi, "")
    .replace(/<\/font>/gi, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/&lt;(\/?)(b|i|u)&gt;/gi, "<$1$2>");
}

export function convertSrtToVtt(srtText: string) {
  const lines = normalizeLineEndings(stripBom(srtText)).split("\n");
  let output = "WEBVTT\n\n";
  let index = 0;

  while (index < lines.length) {
    const trimmed = lines[index].trim();
    if (trimmed === "" || /^\d+$/.test(trimmed)) {
      index++;
      continue;
    }

    const timing = parseTimingLine(lines[index]);
    if (!timing) {
      index++;
      continue;
    }

    index++;
    const cueLines: string[] = [];
    while (index < lines.length && lines[index].trim() !== "") {
      cueLines.push(lines[index]);
      index++;
    }

    if (cueLines.length === 0) {
      index++;
      continue;
    }

    const cueText = sanitizeCueText(cueLines.join("\n"));
    const settings = timing.settings ? ` ${timing.settings}` : "";
    output += `${timing.start} --> ${timing.end}${settings}\n${cueText}\n\n`;
    index++;
  }

  return output;
}
