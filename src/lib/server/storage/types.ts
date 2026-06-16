import type { Readable } from "node:stream";
import type { LibrarySource } from "../db/schema";
import type { StorageFileInfo, StorageWalkEntry } from "./remote";

export type LibraryStorage = {
  source: LibrarySource;
  root?: string;
  statFile(filePath: string): Promise<StorageFileInfo | null>;
  listFiles(directory: string): Promise<StorageFileInfo[] | null>;
  walkFiles(root: string): AsyncGenerator<StorageWalkEntry>;
  createReadStream(
    filePath: string,
    range?: { start: number; end: number },
    options?: { keepOpen?: boolean },
  ): Promise<Readable>;
  operationTimeoutMs?: number;
  close(): Promise<void>;
};

export type SftpLibraryConfig = {
  host: string;
  port: number;
  username: string;
  root: string;
  passwordEncrypted: string;
  walkConcurrency: number;
  operationTimeoutMs: number;
};

export type StoredLibrary = {
  source?: LibrarySource | null;
  config_json: string | null;
};
