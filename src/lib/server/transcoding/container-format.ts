export type NodeAvInputFormat = "matroska" | "mp4" | "webm" | "avi" | "mpegts";

export function detectContainerFromMagic(head: Buffer): string | null {
  if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) {
    const preview = head.toString("utf8", 0, Math.min(head.length, 64));
    if (preview.includes("webm")) return "webm";
    return "matroska";
  }

  if (head.length >= 8 && head.subarray(4, 8).toString("ascii") === "ftyp") {
    return "mp4";
  }

  if (
    head.length >= 12 &&
    head.subarray(0, 4).toString("ascii") === "RIFF" &&
    head.subarray(8, 12).toString("ascii") === "AVI "
  ) {
    return "avi";
  }

  if (head.length > 188 && head[0] === 0x47 && head[188] === 0x47) {
    return "mpegts";
  }

  return null;
}

function normalizeToken(value: string) {
  return value.trim().toLowerCase().replace(/^\./, "");
}

function containerToNodeAvFormat(container: string | null | undefined): NodeAvInputFormat | null {
  if (!container) return null;

  const tokens = container
    .split(",")
    .map((part) => normalizeToken(part))
    .filter(Boolean);

  if (tokens.some((token) => token === "matroska" || token === "mkv")) return "matroska";
  if (tokens.some((token) => token === "webm")) return "webm";
  if (tokens.some((token) => token === "mp4" || token === "m4v" || token === "mov")) return "mp4";
  if (tokens.includes("avi")) return "avi";
  if (tokens.some((token) => token === "mpegts" || token === "ts")) return "mpegts";

  return null;
}

function extensionToNodeAvFormat(extension: string | null | undefined): NodeAvInputFormat | null {
  if (!extension) return null;
  return containerToNodeAvFormat(normalizeToken(extension));
}

export function resolveNodeAvInputFormat(input: {
  sniffedContainer?: string | null;
  container?: string | null;
  extension?: string | null;
}): NodeAvInputFormat | null {
  return (
    containerToNodeAvFormat(input.sniffedContainer) ??
    containerToNodeAvFormat(input.container) ??
    extensionToNodeAvFormat(input.extension)
  );
}

export function nodeAvInputFormat(file: { container: string | null; extension: string | null }) {
  return resolveNodeAvInputFormat({
    container: file.container,
    extension: file.extension,
  });
}

export function remoteContainerSniffNeeded(file: {
  duration_seconds: number | null;
  video_codec: string | null;
  container: string | null;
  extension: string;
}) {
  if (file.duration_seconds === null || file.video_codec === null) return true;

  const fromContainer = containerToNodeAvFormat(file.container);
  const fromExtension = extensionToNodeAvFormat(file.extension);
  return Boolean(fromContainer && fromExtension && fromContainer !== fromExtension);
}
