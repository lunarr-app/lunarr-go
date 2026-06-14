import { Readable } from "node:stream";
import { getMediaFile } from ".";
import { mediaContentTypeForExtension } from "$lib/playback/content-type";
import type { LibrarySource } from "../db/schema";
import { createLibraryStorage, createLocalStorage, type LibraryStorage } from "../storage";

export type ByteRange = {
  start: number;
  end: number;
};

type StreamableMediaFile = {
  path: string;
  basename: string;
  extension: string;
  source?: LibrarySource;
  config_json?: string | null;
};

export function parseRange(rangeHeader: string | null, size: number): ByteRange | null {
  if (!rangeHeader) return null;
  if (size <= 0) return null;
  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;

  const startText = match[1];
  const endText = match[2];
  if (!startText && !endText) return null;

  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    return {
      start: Math.max(size - suffixLength, 0),
      end: size - 1
    };
  }

  const start = Number(startText);
  const end = endText ? Number(endText) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return null;

  return {
    start,
    end: Math.min(end, size - 1)
  };
}

export function inlineContentDisposition(filename: string) {
  const clean = filename.replace(/[\u0000-\u001f\u007f"\\]/g, "").trim() || "file";
  return `inline; filename="${clean}"`;
}

type PreparedStream = {
  status: number;
  headers: HeadersInit;
  range: ByteRange | null;
  errorBody?: string;
};

async function prepareStream(file: StreamableMediaFile, rangeHeader: string | null, storage: LibraryStorage): Promise<PreparedStream> {
  const info = await storage.statFile(file.path);
  if (!info) {
    return {
      status: 404,
      headers: {},
      range: null,
      errorBody: "Media file is no longer available"
    };
  }
  const size = info.size;
  const contentType = mediaContentTypeForExtension(file.extension);
  const range = parseRange(rangeHeader, size);

  if (rangeHeader && !range) {
    return {
      status: 416,
      headers: {
        "content-range": `bytes */${size}`,
        "accept-ranges": "bytes"
      },
      range: null,
      errorBody: "Range not satisfiable"
    };
  }

  const commonHeaders = {
    "content-type": contentType,
    "accept-ranges": "bytes",
    "content-disposition": inlineContentDisposition(file.basename)
  };

  if (!range) {
    return {
      status: 200,
      headers: {
        ...commonHeaders,
        "content-length": String(size)
      },
      range: null
    };
  }

  return {
    status: 206,
    headers: {
      ...commonHeaders,
      "content-length": String(range.end - range.start + 1),
      "content-range": `bytes ${range.start}-${range.end}/${size}`
    },
    range
  };
}

export async function streamFileResponse(file: StreamableMediaFile, rangeHeader: string | null, storage: LibraryStorage = createLocalStorage()) {
  const prepared = await prepareStream(file, rangeHeader, storage);
  if (prepared.errorBody) {
    await storage.close();
    return new Response(prepared.errorBody, {
      status: prepared.status,
      headers: prepared.headers
    });
  }

  if (!prepared.range) {
    let nodeStream: Readable;
    try {
      nodeStream = await storage.createReadStream(file.path);
    } catch (error) {
      await storage.close();
      throw error;
    }
    return new Response(Readable.toWeb(nodeStream) as unknown as BodyInit, {
      status: prepared.status,
      headers: prepared.headers
    });
  }

  const range = prepared.range;
  let nodeStream: Readable;
  try {
    nodeStream = await storage.createReadStream(file.path, { start: range.start, end: range.end });
  } catch (error) {
    await storage.close();
    throw error;
  }
  return new Response(Readable.toWeb(nodeStream) as unknown as BodyInit, {
    status: prepared.status,
    headers: prepared.headers
  });
}

export async function streamFileHeadResponse(file: StreamableMediaFile, rangeHeader: string | null, storage: LibraryStorage = createLocalStorage()) {
  const prepared = await prepareStream(file, rangeHeader, storage);
  await storage.close();

  return new Response(null, {
    status: prepared.status,
    headers: prepared.headers
  });
}

export async function mediaStreamResponse(fileId: string, userId: string, rangeHeader: string | null) {
  const file = await getMediaFile(fileId, userId);
  if (!file) return new Response("Not found", { status: 404 });
  const storage = await createLibraryStorage(file);
  return streamFileResponse(file, rangeHeader, storage);
}

export async function mediaStreamHeadResponse(fileId: string, userId: string, rangeHeader: string | null) {
  const file = await getMediaFile(fileId, userId);
  if (!file) return new Response(null, { status: 404 });
  const storage = await createLibraryStorage(file);
  return streamFileHeadResponse(file, rangeHeader, storage);
}
