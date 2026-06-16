import type { LibraryKind } from "../db/schema";
import { testSftpConnection, testWebdavConnection } from "../storage";

type CreateLocalLibraryInput = {
  source?: "local";
  name: string;
  kind: LibraryKind;
  path: string;
  watchEnabled?: boolean;
  scanIntervalMinutes?: number | null;
};

type CreateSftpLibraryInput = {
  source: "sftp";
  name: string;
  kind: LibraryKind;
  host: string;
  port: number;
  username: string;
  password: string;
  root: string;
  walkConcurrency?: number;
  operationTimeoutMs?: number;
  watchEnabled?: boolean;
  scanIntervalMinutes?: number | null;
};

type UpdateLocalLibraryInput = {
  source?: "local";
  name: string;
  path: string;
  watchEnabled?: boolean;
  scanIntervalMinutes?: number | null;
};

type UpdateSftpLibraryInput = {
  source: "sftp";
  name: string;
  host: string;
  port: number;
  username: string;
  password?: string;
  root: string;
  walkConcurrency?: number;
  operationTimeoutMs?: number;
  watchEnabled?: boolean;
  scanIntervalMinutes?: number | null;
};

type CreateWebdavLibraryInput = {
  source: "webdav";
  name: string;
  kind: LibraryKind;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  root: string;
  walkConcurrency?: number;
  operationTimeoutMs?: number;
  watchEnabled?: boolean;
  scanIntervalMinutes?: number | null;
};

type UpdateWebdavLibraryInput = {
  source: "webdav";
  name: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password?: string;
  root: string;
  walkConcurrency?: number;
  operationTimeoutMs?: number;
  watchEnabled?: boolean;
  scanIntervalMinutes?: number | null;
};

export type CreateLibraryInput = CreateLocalLibraryInput | CreateSftpLibraryInput | CreateWebdavLibraryInput;
export type UpdateLibraryInput = UpdateLocalLibraryInput | UpdateSftpLibraryInput | UpdateWebdavLibraryInput;
export type CreateLibraryOptions = {
  testSftpConnection?: typeof testSftpConnection;
  testWebdavConnection?: typeof testWebdavConnection;
};

export type {
  CreateLocalLibraryInput,
  CreateSftpLibraryInput,
  CreateWebdavLibraryInput,
  UpdateLocalLibraryInput,
  UpdateSftpLibraryInput,
  UpdateWebdavLibraryInput,
};
