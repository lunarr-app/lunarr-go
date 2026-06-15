import type { PageData } from "../$types";
import type { RemoteLibraryFieldValues } from "./RemoteLibraryFields.svelte";

type Library = PageData["libraries"][number];

export function libraryRemoteFieldValues(library: Library): RemoteLibraryFieldValues {
  if (library.source === "sftp") {
    return {
      host: library.sftpConfig?.host ?? "",
      port: library.sftpConfig?.port ?? 22,
      username: library.sftpConfig?.username ?? "",
      walkConcurrency: library.sftpConfig?.walkConcurrency ?? 4,
      operationTimeoutMs: library.sftpConfig?.operationTimeoutMs ?? 30_000,
      root: library.sftpConfig?.root ?? "",
    };
  }

  if (library.source === "webdav") {
    return {
      host: library.webdavConfig?.host ?? "",
      port: library.webdavConfig?.port ?? 443,
      username: library.webdavConfig?.username ?? "",
      walkConcurrency: library.webdavConfig?.walkConcurrency ?? 4,
      operationTimeoutMs: library.webdavConfig?.operationTimeoutMs ?? 30_000,
      root: library.webdavConfig?.root ?? "",
      secure: library.webdavConfig?.secure !== false,
    };
  }

  return {};
}
