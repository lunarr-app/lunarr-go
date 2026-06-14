type OpenApiDocument = Record<string, unknown>;

const stringSchema = { type: "string" };
const nullableStringSchema = { type: ["string", "null"] };
const nullableNumberSchema = { type: ["number", "null"] };
const nullableIntegerSchema = { type: ["integer", "null"] };

const errorResponse = {
  description: "Request failed.",
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/ErrorResponse" },
    },
  },
};

const okResponse = {
  description: "Operation completed.",
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/OkResponse" },
    },
  },
};

const jsonResponse = (schema: Record<string, unknown>, description = "Successful response.") => ({
  description,
  content: {
    "application/json": {
      schema,
    },
  },
});

const objectSchema = (description: string) => ({
  type: "object",
  description,
  additionalProperties: true,
});

const pathIdParameter = (name = "id", description = "Resource identifier.") => ({
  name,
  in: "path",
  required: true,
  description,
  schema: stringSchema,
});

const searchParameter = {
  name: "search",
  in: "query",
  required: false,
  description: "Case-insensitive title search.",
  schema: stringSchema,
};

const commonErrors = {
  "401": errorResponse,
  "403": errorResponse,
  "404": errorResponse,
};

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Lunarr API",
    version: "0.2.3",
    description: "HTTP API used by Lunarr web and mobile clients.",
  },
  servers: [{ url: "/" }],
  tags: [
    { name: "Account" },
    { name: "Catalog" },
    { name: "Playback" },
    { name: "Media" },
  ],
  security: [{ sessionCookie: [] }, { apiKey: [] }],
  paths: {
    "/api/me": {
      get: {
        tags: ["Account"],
        summary: "Get the signed-in user and playback policy.",
        operationId: "getCurrentUser",
        responses: {
          "200": jsonResponse({ $ref: "#/components/schemas/MeResponse" }),
          "401": errorResponse,
        },
      },
    },
    "/api/continue": {
      get: {
        tags: ["Catalog"],
        summary: "List resumable movies and episodes.",
        operationId: "getContinueWatching",
        responses: {
          "200": jsonResponse({ $ref: "#/components/schemas/ContinueWatchingResponse" }),
          "401": errorResponse,
        },
      },
    },
    "/api/movies": {
      get: {
        tags: ["Catalog"],
        summary: "Browse movie rails and paged movie results.",
        operationId: "getMovies",
        parameters: [
          searchParameter,
          {
            name: "status",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["all", "watched", "unwatched"] },
          },
          {
            name: "sort",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["title", "recent", "year_desc", "rating", "release_date"] },
          },
          {
            name: "page",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        responses: {
          "200": jsonResponse({ $ref: "#/components/schemas/MovieRowsResponse" }),
          "401": errorResponse,
        },
      },
    },
    "/api/movies/{id}": {
      get: {
        tags: ["Catalog"],
        summary: "Get movie details.",
        operationId: "getMovie",
        parameters: [pathIdParameter()],
        responses: {
          "200": jsonResponse(objectSchema("Movie detail payload.")),
          ...commonErrors,
        },
      },
    },
    "/api/movies/{id}/watched": {
      post: {
        tags: ["Catalog"],
        summary: "Mark or unmark a movie as watched.",
        operationId: "setMovieWatched",
        parameters: [pathIdParameter()],
        requestBody: { $ref: "#/components/requestBodies/WatchedRequest" },
        responses: {
          "200": okResponse,
          ...commonErrors,
        },
      },
    },
    "/api/shows": {
      get: {
        tags: ["Catalog"],
        summary: "Browse shows, next-up episodes, and show rails.",
        operationId: "getShows",
        parameters: [
          searchParameter,
          {
            name: "sort",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["title", "recent", "latest", "popular"] },
          },
        ],
        responses: {
          "200": jsonResponse({ $ref: "#/components/schemas/ShowRowsResponse" }),
          "401": errorResponse,
        },
      },
    },
    "/api/shows/{id}": {
      get: {
        tags: ["Catalog"],
        summary: "Get show details.",
        operationId: "getShow",
        parameters: [pathIdParameter()],
        responses: {
          "200": jsonResponse(objectSchema("Show detail payload.")),
          ...commonErrors,
        },
      },
    },
    "/api/shows/{id}/seasons/{seasonId}/watched": {
      post: {
        tags: ["Catalog"],
        summary: "Mark or unmark a season as watched.",
        operationId: "setSeasonWatched",
        parameters: [
          pathIdParameter("id", "Show identifier."),
          pathIdParameter("seasonId", "Season identifier."),
        ],
        requestBody: { $ref: "#/components/requestBodies/SeasonWatchedRequest" },
        responses: {
          "200": okResponse,
          ...commonErrors,
        },
      },
    },
    "/api/episodes/{id}": {
      get: {
        tags: ["Catalog"],
        summary: "Get episode details.",
        operationId: "getEpisode",
        parameters: [pathIdParameter()],
        responses: {
          "200": jsonResponse(objectSchema("Episode detail payload.")),
          ...commonErrors,
        },
      },
    },
    "/api/episodes/{id}/watched": {
      post: {
        tags: ["Catalog"],
        summary: "Mark or unmark an episode as watched.",
        operationId: "setEpisodeWatched",
        parameters: [pathIdParameter()],
        requestBody: { $ref: "#/components/requestBodies/WatchedRequest" },
        responses: {
          "200": okResponse,
          ...commonErrors,
        },
      },
    },
    "/api/playback/{id}": {
      get: {
        tags: ["Playback"],
        summary: "Prepare playback data for a media item.",
        operationId: "getPlayback",
        parameters: [
          pathIdParameter(),
          { name: "file", in: "query", required: false, schema: stringSchema },
          { name: "target", in: "query", required: false, schema: { type: "string", enum: ["web", "cast", "airplay"] } },
          { name: "transcode", in: "query", required: false, schema: { type: "boolean" } },
        ],
        responses: {
          "200": jsonResponse(objectSchema("Signed playback payload.")),
          ...commonErrors,
          "409": errorResponse,
          "500": errorResponse,
        },
      },
      post: {
        tags: ["Playback"],
        summary: "Save playback progress.",
        operationId: "savePlaybackProgress",
        parameters: [pathIdParameter()],
        requestBody: { $ref: "#/components/requestBodies/PlaybackProgressRequest" },
        responses: {
          "200": okResponse,
          "400": errorResponse,
          "401": errorResponse,
        },
      },
    },
    "/api/playback-sessions/{sessionId}/heartbeat": {
      post: {
        tags: ["Playback"],
        summary: "Keep a transcoding playback session alive.",
        operationId: "heartbeatPlaybackSession",
        parameters: [pathIdParameter("sessionId", "Playback session identifier.")],
        responses: {
          "204": { description: "Playback session heartbeat accepted." },
          "401": errorResponse,
          "409": errorResponse,
        },
      },
    },
    "/api/playback-sessions/{sessionId}/cancel": {
      post: {
        tags: ["Playback"],
        summary: "Cancel a playback session owned by the caller.",
        operationId: "cancelPlaybackSession",
        parameters: [pathIdParameter("sessionId", "Playback session identifier.")],
        responses: {
          "200": jsonResponse({ $ref: "#/components/schemas/PlaybackSessionCancelResponse" }),
          ...commonErrors,
        },
      },
    },
    "/media/files/{id}/stream": {
      get: {
        tags: ["Media"],
        summary: "Stream an original media file.",
        operationId: "streamMediaFile",
        parameters: [pathIdParameter()],
        responses: {
          "200": { description: "Media byte stream." },
          "206": { description: "Partial media byte stream." },
          ...commonErrors,
        },
      },
      head: {
        tags: ["Media"],
        summary: "Get original media stream headers.",
        operationId: "headMediaFile",
        parameters: [pathIdParameter()],
        responses: {
          "200": { description: "Media headers." },
          "206": { description: "Partial media headers." },
          ...commonErrors,
        },
      },
    },
    "/media/playback-sessions/{sessionId}/master.m3u8": {
      get: {
        tags: ["Media"],
        summary: "Get an HLS playlist for a playback session.",
        operationId: "getPlaybackSessionPlaylist",
        parameters: [pathIdParameter("sessionId", "Playback session identifier.")],
        responses: {
          "200": { description: "HLS playlist." },
          "401": errorResponse,
          "404": errorResponse,
          "409": errorResponse,
        },
      },
    },
    "/media/playback-sessions/{sessionId}/segments/{segment}": {
      get: {
        tags: ["Media"],
        summary: "Get an HLS media segment.",
        operationId: "getPlaybackSessionSegment",
        parameters: [
          pathIdParameter("sessionId", "Playback session identifier."),
          pathIdParameter("segment", "Segment filename."),
        ],
        responses: {
          "200": { description: "HLS media segment." },
          "401": errorResponse,
          "404": errorResponse,
          "409": errorResponse,
        },
      },
    },
    "/media/subtitles/{id}": {
      get: {
        tags: ["Media"],
        summary: "Get a subtitle file.",
        operationId: "getSubtitle",
        parameters: [pathIdParameter()],
        responses: {
          "200": { description: "Subtitle file." },
          ...commonErrors,
        },
      },
    },
  },
  components: {
    securitySchemes: {
      sessionCookie: {
        type: "apiKey",
        in: "cookie",
        name: "better-auth.session_token",
        description: "Browser session cookie issued by Better Auth.",
      },
      apiKey: {
        type: "apiKey",
        in: "header",
        name: "X-API-Key",
        description: "Lunarr API key created from the profile API key screen.",
      },
    },
    requestBodies: {
      WatchedRequest: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/WatchedRequest" },
          },
        },
      },
      SeasonWatchedRequest: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/SeasonWatchedRequest" },
          },
        },
      },
      PlaybackProgressRequest: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/PlaybackProgressRequest" },
          },
        },
      },
    },
    schemas: {
      ErrorResponse: {
        type: "object",
        required: ["error"],
        properties: { error: stringSchema },
      },
      OkResponse: {
        type: "object",
        required: ["ok"],
        properties: { ok: { type: "boolean" } },
      },
      User: {
        type: "object",
        required: ["id", "name", "email", "role"],
        properties: {
          id: stringSchema,
          name: stringSchema,
          email: stringSchema,
          role: { type: "string", enum: ["admin", "user"] },
        },
      },
      MeResponse: {
        type: "object",
        required: ["user", "transcodePolicy"],
        properties: {
          user: { $ref: "#/components/schemas/User" },
          transcodePolicy: objectSchema("Effective transcoding policy for the caller."),
        },
      },
      MovieSummary: {
        type: "object",
        required: ["id", "title", "year", "posterUrl", "releaseDate", "fileCount", "resumeFileId", "progressSeconds", "durationSeconds", "completed"],
        properties: {
          id: stringSchema,
          title: stringSchema,
          year: nullableIntegerSchema,
          posterUrl: nullableStringSchema,
          releaseDate: nullableStringSchema,
          popularity: nullableNumberSchema,
          voteAverage: nullableNumberSchema,
          fileCount: { type: "integer", minimum: 0 },
          resumeFileId: nullableStringSchema,
          progressSeconds: { type: "number", minimum: 0 },
          durationSeconds: nullableNumberSchema,
          completed: { type: "boolean" },
        },
      },
      EpisodeSummary: {
        type: "object",
        required: ["id", "title", "showId", "showTitle", "seasonId", "seasonTitle", "seasonNumber", "episodeNumber", "fileCount", "fileId", "progressSeconds", "durationSeconds", "completed"],
        properties: {
          id: stringSchema,
          title: stringSchema,
          showId: stringSchema,
          showTitle: stringSchema,
          seasonId: stringSchema,
          seasonTitle: stringSchema,
          seasonNumber: nullableIntegerSchema,
          episodeNumber: nullableIntegerSchema,
          releaseDate: nullableStringSchema,
          runtimeSeconds: nullableNumberSchema,
          stillUrl: nullableStringSchema,
          showPosterUrl: nullableStringSchema,
          fileCount: { type: "integer", minimum: 0 },
          fileId: nullableStringSchema,
          progressSeconds: { type: "number", minimum: 0 },
          durationSeconds: nullableNumberSchema,
          completed: { type: "boolean" },
        },
      },
      ShowSummary: {
        type: "object",
        required: ["id", "title", "year", "posterUrl", "backdropUrl", "releaseDate", "status", "episodeCount", "seasonCount"],
        properties: {
          id: stringSchema,
          title: stringSchema,
          year: nullableIntegerSchema,
          posterUrl: nullableStringSchema,
          backdropUrl: nullableStringSchema,
          releaseDate: nullableStringSchema,
          status: nullableStringSchema,
          popularity: nullableNumberSchema,
          voteAverage: nullableNumberSchema,
          episodeCount: { type: "integer", minimum: 0 },
          seasonCount: { type: "integer", minimum: 0 },
          latestFileCreatedAt: nullableStringSchema,
          latestEpisodeReleaseDate: nullableStringSchema,
          character: nullableStringSchema,
        },
      },
      MovieRowsResponse: {
        type: "object",
        required: ["continueWatching", "all", "recent", "latest", "popular"],
        properties: {
          continueWatching: { type: "array", items: { $ref: "#/components/schemas/MovieSummary" } },
          all: { type: "array", items: { $ref: "#/components/schemas/MovieSummary" } },
          recent: { type: "array", items: { $ref: "#/components/schemas/MovieSummary" } },
          latest: { type: "array", items: { $ref: "#/components/schemas/MovieSummary" } },
          popular: { type: "array", items: { $ref: "#/components/schemas/MovieSummary" } },
          pagination: objectSchema("Movie pagination metadata."),
        },
      },
      ContinueWatchingResponse: {
        type: "object",
        required: ["movies", "episodes", "nextUp"],
        properties: {
          movies: { type: "array", items: { $ref: "#/components/schemas/MovieSummary" } },
          episodes: { type: "array", items: { $ref: "#/components/schemas/EpisodeSummary" } },
          nextUp: { type: "array", items: { $ref: "#/components/schemas/EpisodeSummary" } },
        },
      },
      ShowRowsResponse: {
        type: "object",
        required: ["continueWatching", "nextUp", "recentlyAiredShows", "popularShows", "allShows"],
        properties: {
          continueWatching: { type: "array", items: { $ref: "#/components/schemas/EpisodeSummary" } },
          nextUp: { type: "array", items: { $ref: "#/components/schemas/EpisodeSummary" } },
          recentlyAiredShows: { type: "array", items: { $ref: "#/components/schemas/ShowSummary" } },
          popularShows: { type: "array", items: { $ref: "#/components/schemas/ShowSummary" } },
          allShows: { type: "array", items: { $ref: "#/components/schemas/ShowSummary" } },
        },
      },
      WatchedRequest: {
        type: "object",
        required: ["mediaFileId", "completed"],
        properties: {
          mediaFileId: stringSchema,
          completed: { type: "boolean" },
        },
      },
      SeasonWatchedRequest: {
        type: "object",
        required: ["completed"],
        properties: {
          completed: { type: "boolean" },
        },
      },
      PlaybackProgressRequest: {
        type: "object",
        required: ["mediaFileId", "positionSeconds", "durationSeconds", "completed"],
        properties: {
          mediaFileId: stringSchema,
          positionSeconds: { type: "number", minimum: 0 },
          durationSeconds: nullableNumberSchema,
          completed: { type: "boolean" },
        },
      },
      PlaybackSessionCancelResponse: {
        type: "object",
        required: ["ok", "status"],
        properties: {
          ok: { type: "boolean" },
          status: { type: "string" },
        },
      },
    },
  },
} satisfies OpenApiDocument;

function scalarYaml(value: unknown) {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function yamlKey(key: string) {
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : JSON.stringify(key);
}

function yamlLines(value: unknown, indent = 0): string[] {
  const prefix = " ".repeat(indent);
  const scalar = scalarYaml(value);
  if (scalar !== null) return [`${prefix}${scalar}`];

  if (Array.isArray(value)) {
    if (value.length === 0) return [`${prefix}[]`];
    return value.flatMap((item) => {
      const itemScalar = scalarYaml(item);
      if (itemScalar !== null) return [`${prefix}- ${itemScalar}`];
      return [`${prefix}-`, ...yamlLines(item, indent + 2)];
    });
  }

  if (typeof value === "object" && value) {
    const entries = Object.entries(value);
    if (entries.length === 0) return [`${prefix}{}`];
    return entries.flatMap(([key, item]) => {
      const itemScalar = scalarYaml(item);
      if (itemScalar !== null) return [`${prefix}${yamlKey(key)}: ${itemScalar}`];
      return [`${prefix}${yamlKey(key)}:`, ...yamlLines(item, indent + 2)];
    });
  }

  return [`${prefix}${JSON.stringify(value)}`];
}

export function openApiYaml(document: OpenApiDocument = openApiDocument) {
  return `${yamlLines(document).join("\n")}\n`;
}
