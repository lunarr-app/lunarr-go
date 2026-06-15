import type { LibrarySource } from "../db/schema";

export function isRemoteLibrarySource(source: LibrarySource): boolean {
  return source !== "local";
}
