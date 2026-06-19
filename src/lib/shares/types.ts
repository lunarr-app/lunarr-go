export type ShareKind = "movie" | "show";

export type CreateSharePayload = {
  kind: ShareKind;
  mediaItemId: string;
  seasonIds?: string[] | null;
  expiresAt?: string;
  expiresInSeconds?: number;
};

export type PublicShareRecord = {
  id: string;
  token: string;
  kind: ShareKind;
  mediaItemId: string;
  seasonIds: string[] | null;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
  active: boolean;
  sharePath: string;
};

export type AdminShareRecord = PublicShareRecord & {
  title: string;
  contentHref: string;
  createdByName: string;
  createdByEmail: string;
};

export type SharePageData =
  | {
      kind: "movie";
      token: string;
      expiresAt: string;
      title: string;
      overview: string | null;
      posterUrl: string | null;
      backdropUrl: string | null;
      runtimeSeconds: number | null;
      releaseDate: string | null;
      movieId: string;
      fileId: string | null;
    }
  | {
      kind: "show";
      token: string;
      expiresAt: string;
      title: string;
      overview: string | null;
      posterUrl: string | null;
      backdropUrl: string | null;
      showId: string;
      seasons: Array<{
        id: string;
        title: string;
        seasonNumber: number | null;
        posterUrl: string | null;
        episodes: Array<{
          id: string;
          title: string;
          overview: string | null;
          seasonNumber: number | null;
          episodeNumber: number | null;
          runtimeSeconds: number | null;
          stillUrl: string | null;
          fileId: string | null;
        }>;
      }>;
    };
