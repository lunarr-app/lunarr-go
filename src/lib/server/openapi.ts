import { APP_VERSION } from "./version";
import { CLIENT_PLAYBACK_CAPABILITY_KEYS, PLAYBACK_TARGETS } from "$lib/playback/capabilities";

function playbackCapabilityParameters() {
  return CLIENT_PLAYBACK_CAPABILITY_KEYS.map((name) => ({
    name,
    in: "query" as const,
    required: false,
    schema: { type: "boolean" },
    description: `Client reports support for ${name}. Used for web, cast, and airplay targets.`,
  }));
}

function playbackTargetParameter() {
  return {
    name: "target",
    in: "query" as const,
    required: false,
    schema: { type: "string", enum: [...PLAYBACK_TARGETS] },
    description:
      "Playback client profile. Omit for web. Use cast or airplay for remote receivers and native for VLC or other local decoders.",
  };
}

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

const acceptedResponse = (schema: Record<string, unknown>, description = "Operation accepted.") =>
  jsonResponse(schema, description);
const textResponse = (description: string, contentType: string) => ({
  description,
  content: {
    [contentType]: {
      schema: { type: "string" },
    },
  },
});
const binaryResponse = (description: string, contentType = "application/octet-stream") => ({
  description,
  content: {
    [contentType]: {
      schema: { type: "string", format: "binary" },
    },
  },
});
const optionsResponse = {
  description: "CORS preflight accepted.",
  headers: {
    "Access-Control-Allow-Origin": { schema: stringSchema },
    "Access-Control-Allow-Methods": { schema: stringSchema },
    "Access-Control-Allow-Headers": { schema: stringSchema },
  },
};
const headErrors = {
  "401": { description: "Unauthorized." },
  "403": { description: "Forbidden." },
  "404": { description: "Not found." },
  "409": { description: "Conflict." },
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

const pageParameter = {
  name: "page",
  in: "query",
  required: false,
  description: "1-based page number.",
  schema: { type: "integer", minimum: 1 },
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
    version: APP_VERSION,
    description: "HTTP API for Lunarr catalog, playback, and administration.",
  },
  servers: [{ url: "/" }],
  tags: [
    { name: "Account" },
    { name: "Catalog" },
    { name: "Playback" },
    { name: "Media" },
    { name: "Admin" },
    { name: "Shares" },
    { name: "Docs" },
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
    "/api/api-keys": {
      get: {
        tags: ["Account"],
        summary: "List personal API keys for the signed-in user.",
        operationId: "listApiKeys",
        responses: {
          "200": jsonResponse({
            $ref: "#/components/schemas/ApiKeyListResponse",
          }),
          "401": errorResponse,
        },
      },
      post: {
        tags: ["Account"],
        summary: "Create a personal API key.",
        operationId: "createApiKey",
        requestBody: { $ref: "#/components/requestBodies/CreateApiKeyRequest" },
        responses: {
          "201": jsonResponse({ $ref: "#/components/schemas/CreateApiKeyResponse" }, "API key created."),
          "400": errorResponse,
          "401": errorResponse,
        },
      },
    },
    "/api/api-keys/{id}": {
      delete: {
        tags: ["Account"],
        summary: "Revoke a personal API key.",
        operationId: "revokeApiKey",
        parameters: [pathIdParameter()],
        responses: {
          "200": okResponse,
          "401": errorResponse,
          "404": errorResponse,
        },
      },
    },
    "/api/profile/playback-preference": {
      put: {
        tags: ["Account"],
        summary: "Update playback preference and language preferences.",
        operationId: "updatePlaybackPreference",
        requestBody: {
          $ref: "#/components/requestBodies/PlaybackPreferenceRequest",
        },
        responses: {
          "200": okResponse,
          "400": errorResponse,
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
          "200": jsonResponse({
            $ref: "#/components/schemas/ContinueWatchingResponse",
          }),
          "401": errorResponse,
        },
      },
    },
    "/api/movies/discover": {
      get: {
        tags: ["Catalog"],
        summary: "Paginated personalized movie recommendations from recent watch history.",
        description:
          "Ranks accessible unwatched movies by shared genres, keywords, cast, and directors with the caller's recent watches. Scoring: genres +3, keywords +2, people +1 per seed; up to three recent seeds weighted 3/2/1.",
        operationId: "getDiscoverMovies",
        parameters: [pageParameter],
        responses: {
          "200": jsonResponse({
            $ref: "#/components/schemas/DiscoverMoviesResponse",
          }),
          "401": errorResponse,
        },
      },
    },
    "/api/movies": {
      get: {
        tags: ["Catalog"],
        summary: "Browse movie rails and paged movie results.",
        description:
          "Without `rail`, returns every browse rail in one response for home screens. Pass `rail` to fetch a single rail and avoid over-fetching on mobile clients.",
        operationId: "getMovies",
        parameters: [
          searchParameter,
          {
            name: "rail",
            in: "query",
            required: false,
            schema: {
              type: "string",
              enum: ["continueWatching", "all", "recent", "latest", "popular"],
            },
            description:
              "When set, returns only the requested rail. `all` also returns `allPage`. Omit for the full bundled response.",
          },
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
            schema: {
              type: "string",
              enum: ["title", "recent", "year_desc", "rating", "release_date"],
            },
          },
          {
            name: "page",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        responses: {
          "200": jsonResponse({
            oneOf: [
              { $ref: "#/components/schemas/MovieRowsResponse" },
              { $ref: "#/components/schemas/MovieBrowseRailResponse" },
            ],
          }),
          "400": errorResponse,
          "401": errorResponse,
        },
      },
    },
    "/api/movies/{id}": {
      get: {
        tags: ["Catalog"],
        summary: "Get full movie details.",
        description:
          "Returns the complete movie payload including cast. Mobile and third-party clients should prefer GET /api/movies/{id}/overview and GET /api/movies/{id}/credits for smaller lazy-loaded responses.",
        operationId: "getMovie",
        parameters: [pathIdParameter()],
        responses: {
          "200": jsonResponse({
            $ref: "#/components/schemas/MovieFullResponse",
          }),
          ...commonErrors,
        },
      },
    },
    "/api/movies/{id}/overview": {
      get: {
        tags: ["Catalog"],
        summary: "Get movie metadata, files, and progress without cast.",
        operationId: "getMovieOverview",
        parameters: [pathIdParameter()],
        responses: {
          "200": jsonResponse({
            $ref: "#/components/schemas/MovieOverviewResponse",
          }),
          ...commonErrors,
        },
      },
    },
    "/api/movies/{id}/credits": {
      get: {
        tags: ["Catalog"],
        summary: "Get cast, directors, and writers for a movie.",
        description: "Lazy-load people credits for the movie landing screen.",
        operationId: "getMovieCredits",
        parameters: [pathIdParameter()],
        responses: {
          "200": jsonResponse({
            $ref: "#/components/schemas/MovieCreditsResponse",
          }),
          ...commonErrors,
        },
      },
    },
    "/api/movies/{id}/similar": {
      get: {
        tags: ["Catalog"],
        summary: "List movies similar to a title in the caller's accessible library.",
        operationId: "getSimilarMovies",
        parameters: [pathIdParameter(), pageParameter],
        responses: {
          "200": jsonResponse({
            $ref: "#/components/schemas/SimilarMoviesResponse",
          }),
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
    "/api/movies/{id}/metadata/refresh": {
      post: {
        tags: ["Catalog"],
        summary: "Refresh metadata for a single movie.",
        operationId: "refreshMovieMetadata",
        parameters: [pathIdParameter()],
        responses: {
          "200": jsonResponse({
            $ref: "#/components/schemas/MetadataRefreshResponse",
          }),
          "400": errorResponse,
          "401": errorResponse,
          "403": errorResponse,
          "404": errorResponse,
        },
      },
    },
    "/api/shows": {
      get: {
        tags: ["Catalog"],
        summary: "Browse show rails and paged show results.",
        description:
          "Without `rail`, returns every browse rail in one response for home screens. Pass `rail` to fetch a single rail and avoid over-fetching on mobile clients.",
        operationId: "getShows",
        parameters: [
          searchParameter,
          {
            name: "rail",
            in: "query",
            required: false,
            schema: {
              type: "string",
              enum: ["continueWatching", "nextUp", "all", "recent", "latest", "popular"],
            },
            description:
              "When set, returns only the requested rail. Episode rails return `EpisodeSummary` items; show rails return `ShowSummary` items. `all` also returns `allPage`.",
          },
          {
            name: "sort",
            in: "query",
            required: false,
            schema: {
              type: "string",
              enum: ["title", "recent", "latest", "popular"],
            },
          },
          {
            name: "page",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        responses: {
          "200": jsonResponse({
            oneOf: [
              { $ref: "#/components/schemas/ShowRowsResponse" },
              { $ref: "#/components/schemas/ShowBrowseRailResponse" },
            ],
          }),
          "400": errorResponse,
          "401": errorResponse,
        },
      },
    },
    "/api/shows/discover": {
      get: {
        tags: ["Catalog"],
        summary: "Paginated personalized show recommendations from recent episode watch history.",
        description:
          "Ranks accessible unwatched shows by shared genres, keywords, cast, and creators with the caller's recent episode watches. Scoring: genres +3, keywords +2, people +1 per seed; up to three recent show seeds weighted 3/2/1.",
        operationId: "getDiscoverShows",
        parameters: [pageParameter],
        responses: {
          "200": jsonResponse({
            $ref: "#/components/schemas/DiscoverShowsResponse",
          }),
          "401": errorResponse,
        },
      },
    },
    "/api/people/{provider}/{id}": {
      get: {
        tags: ["Catalog"],
        summary: "Get cast/person details and related local titles.",
        operationId: "getPerson",
        parameters: [
          pathIdParameter("provider", "Metadata provider."),
          pathIdParameter("id", "Provider person identifier."),
          {
            name: "moviesPage",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1 },
            description: "Page number for the person's movie credits.",
          },
          {
            name: "showsPage",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1 },
            description: "Page number for the person's TV credits.",
          },
        ],
        responses: {
          "200": jsonResponse({
            $ref: "#/components/schemas/PersonDetailResponse",
          }),
          "401": errorResponse,
          "404": errorResponse,
        },
      },
    },
    "/api/jobs": {
      get: {
        tags: ["Admin"],
        summary: "List scan jobs, playback sessions, and job summaries.",
        description:
          "Returns the latest scan jobs and playback sessions with summary counts. Scan error details are loaded separately from GET /api/jobs/{id}/errors.",
        operationId: "getJobs",
        responses: {
          "200": jsonResponse({ $ref: "#/components/schemas/JobsResponse" }),
          "401": errorResponse,
          "403": errorResponse,
        },
      },
    },
    "/api/jobs/{id}/cancel": {
      post: {
        tags: ["Admin"],
        summary: "Cancel a queued or running scan job.",
        operationId: "cancelJob",
        parameters: [pathIdParameter()],
        responses: {
          "200": okResponse,
          "400": errorResponse,
          "401": errorResponse,
          "403": errorResponse,
          "404": errorResponse,
        },
      },
    },
    "/api/jobs/{id}/errors": {
      get: {
        tags: ["Admin"],
        summary: "List recent scan errors for a job.",
        description:
          "Returns the newest scan errors for the given scan job, up to 100 rows. Job rows from GET /api/jobs include errors_count for the total recorded during the run.",
        operationId: "getJobErrors",
        parameters: [pathIdParameter()],
        responses: {
          "200": jsonResponse({ $ref: "#/components/schemas/JobErrorsResponse" }),
          "401": errorResponse,
          "403": errorResponse,
        },
      },
    },
    "/api/libraries": {
      get: {
        tags: ["Admin"],
        summary: "List configured libraries and library sharing users.",
        operationId: "getLibraries",
        responses: {
          "200": jsonResponse({
            $ref: "#/components/schemas/LibrariesResponse",
          }),
          "401": errorResponse,
          "403": errorResponse,
        },
      },
      post: {
        tags: ["Admin"],
        summary: "Create a library.",
        operationId: "createLibrary",
        requestBody: { $ref: "#/components/requestBodies/LibraryInput" },
        responses: {
          "201": jsonResponse({ $ref: "#/components/schemas/LibraryResponse" }, "Library created."),
          "400": errorResponse,
          "401": errorResponse,
          "403": errorResponse,
        },
      },
    },
    "/api/libraries/{id}": {
      get: {
        tags: ["Admin"],
        summary: "Get a configured library.",
        operationId: "getLibrary",
        parameters: [pathIdParameter()],
        responses: {
          "200": jsonResponse({ $ref: "#/components/schemas/LibraryResponse" }),
          "401": errorResponse,
          "403": errorResponse,
          "404": errorResponse,
        },
      },
      patch: {
        tags: ["Admin"],
        summary: "Update a configured library.",
        operationId: "updateLibrary",
        parameters: [pathIdParameter()],
        requestBody: { $ref: "#/components/requestBodies/LibraryInput" },
        responses: {
          "200": jsonResponse({ $ref: "#/components/schemas/LibraryResponse" }),
          "400": errorResponse,
          "401": errorResponse,
          "403": errorResponse,
        },
      },
      delete: {
        tags: ["Admin"],
        summary: "Delete a configured library.",
        operationId: "deleteLibrary",
        parameters: [pathIdParameter()],
        responses: {
          "200": okResponse,
          "400": errorResponse,
          "401": errorResponse,
          "403": errorResponse,
        },
      },
    },
    "/api/libraries/{id}/access": {
      put: {
        tags: ["Admin"],
        summary: "Update library sharing access.",
        operationId: "updateLibraryAccess",
        parameters: [pathIdParameter()],
        requestBody: {
          $ref: "#/components/requestBodies/LibraryAccessRequest",
        },
        responses: {
          "200": okResponse,
          "400": errorResponse,
          "401": errorResponse,
          "403": errorResponse,
        },
      },
    },
    "/api/libraries/{id}/scan": {
      post: {
        tags: ["Admin"],
        summary: "Start a scan for a configured library.",
        operationId: "startLibraryScan",
        parameters: [pathIdParameter()],
        responses: {
          "202": acceptedResponse(
            { $ref: "#/components/schemas/ScanStartResponse" },
            "Scan started or already active.",
          ),
          "400": errorResponse,
          "401": errorResponse,
          "403": errorResponse,
        },
      },
    },
    "/api/users": {
      get: {
        tags: ["Admin"],
        summary: "List registered users.",
        operationId: "getUsers",
        responses: {
          "200": jsonResponse({ $ref: "#/components/schemas/UsersResponse" }),
          "401": errorResponse,
          "403": errorResponse,
        },
      },
      post: {
        tags: ["Admin"],
        summary: "Create a user account.",
        operationId: "createUser",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateUserRequest" },
            },
          },
        },
        responses: {
          "201": jsonResponse({ $ref: "#/components/schemas/UserResponse" }),
          "400": errorResponse,
          "401": errorResponse,
          "403": errorResponse,
        },
      },
    },
    "/api/users/{id}": {
      patch: {
        tags: ["Admin"],
        summary: "Update a user's role.",
        operationId: "updateUserRole",
        parameters: [pathIdParameter("id", "User identifier.")],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateUserRoleRequest" },
            },
          },
        },
        responses: {
          "200": jsonResponse({ $ref: "#/components/schemas/UserResponse" }),
          "400": errorResponse,
          "401": errorResponse,
          "403": errorResponse,
          "404": errorResponse,
        },
      },
      delete: {
        tags: ["Admin"],
        summary: "Delete a user account.",
        operationId: "deleteUser",
        parameters: [pathIdParameter("id", "User identifier.")],
        responses: {
          "200": okResponse,
          "400": errorResponse,
          "401": errorResponse,
          "403": errorResponse,
          "404": errorResponse,
        },
      },
    },
    "/api/shares": {
      get: {
        tags: ["Admin"],
        summary: "List guest share links for a movie or show.",
        operationId: "listMediaShares",
        parameters: [
          {
            name: "mediaItemId",
            in: "query",
            required: true,
            schema: stringSchema,
            description: "Movie or show identifier.",
          },
        ],
        responses: {
          "200": jsonResponse(objectSchema("Share list payload.")),
          "400": errorResponse,
          "401": errorResponse,
          "403": errorResponse,
        },
      },
      post: {
        tags: ["Admin"],
        summary: "Create a guest share link.",
        operationId: "createMediaShare",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: objectSchema("Create share request."),
            },
          },
        },
        responses: {
          "201": jsonResponse(objectSchema("Created share payload."), "Share created."),
          "400": errorResponse,
          "401": errorResponse,
          "403": errorResponse,
        },
      },
    },
    "/api/shares/{id}": {
      delete: {
        tags: ["Admin"],
        summary: "Revoke a guest share link.",
        operationId: "revokeMediaShare",
        parameters: [pathIdParameter("id", "Share identifier.")],
        responses: {
          "200": jsonResponse(objectSchema("Revoked share payload.")),
          "400": errorResponse,
          "401": errorResponse,
          "403": errorResponse,
          "404": errorResponse,
        },
      },
    },
    "/api/shows/{id}": {
      get: {
        tags: ["Catalog"],
        summary: "Get full show details with every season and episode.",
        description:
          "Returns the complete show tree. Mobile and third-party clients should prefer GET /api/shows/{id}/overview and GET /api/shows/{id}/seasons/{seasonId} for smaller payloads.",
        operationId: "getShow",
        parameters: [pathIdParameter()],
        responses: {
          "200": jsonResponse({
            $ref: "#/components/schemas/ShowFullResponse",
          }),
          ...commonErrors,
        },
      },
    },
    "/api/shows/{id}/overview": {
      get: {
        tags: ["Catalog"],
        summary: "Get show metadata and season list without episode details.",
        operationId: "getShowOverview",
        parameters: [pathIdParameter()],
        responses: {
          "200": jsonResponse({
            $ref: "#/components/schemas/ShowOverviewResponse",
          }),
          ...commonErrors,
        },
      },
    },
    "/api/shows/{id}/credits": {
      get: {
        tags: ["Catalog"],
        summary: "Get cast and creators for a show.",
        description:
          "Lazy-load people credits for the show landing screen. Mirrors TMDb aggregate credits split into cast and show creators.",
        operationId: "getShowCredits",
        parameters: [pathIdParameter()],
        responses: {
          "200": jsonResponse({
            $ref: "#/components/schemas/ShowCreditsResponse",
          }),
          ...commonErrors,
        },
      },
    },
    "/api/shows/{id}/similar": {
      get: {
        tags: ["Catalog"],
        summary: "List shows similar to a title in the caller's accessible library.",
        operationId: "getSimilarShows",
        parameters: [pathIdParameter(), pageParameter],
        responses: {
          "200": jsonResponse({
            $ref: "#/components/schemas/SimilarShowsResponse",
          }),
          ...commonErrors,
        },
      },
    },
    "/api/shows/{id}/metadata/refresh": {
      post: {
        tags: ["Catalog"],
        summary: "Refresh metadata for a single TV show.",
        operationId: "refreshTvShowMetadata",
        parameters: [pathIdParameter()],
        responses: {
          "200": jsonResponse({
            $ref: "#/components/schemas/MetadataRefreshResponse",
          }),
          "400": errorResponse,
          "401": errorResponse,
          "403": errorResponse,
          "404": errorResponse,
        },
      },
    },
    "/api/shows/{id}/seasons/{seasonId}/watched": {
      post: {
        tags: ["Catalog"],
        summary: "Mark or unmark a season as watched.",
        operationId: "setSeasonWatched",
        parameters: [pathIdParameter("id", "Show identifier."), pathIdParameter("seasonId", "Season identifier.")],
        requestBody: {
          $ref: "#/components/requestBodies/SeasonWatchedRequest",
        },
        responses: {
          "200": okResponse,
          ...commonErrors,
        },
      },
    },
    "/api/shows/{id}/seasons/{seasonId}": {
      get: {
        tags: ["Catalog"],
        summary: "Get one season with episodes and watch progress.",
        description:
          "seasonId accepts the season UUID or season number (for example 1). Returns a lightweight season tab list for navigation.",
        operationId: "getShowSeason",
        parameters: [
          pathIdParameter("id", "Show identifier."),
          pathIdParameter("seasonId", "Season UUID or season number."),
        ],
        responses: {
          "200": jsonResponse({
            $ref: "#/components/schemas/ShowSeasonDetailResponse",
          }),
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
          "200": jsonResponse({
            $ref: "#/components/schemas/EpisodeDetailResponse",
          }),
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
        description:
          "Returns playback mode, subtitle tracks, and a signed stream URL when ready. Cast, AirPlay, and native clients receive absolute URLs with an 8-hour remoteToken.",
        operationId: "getPlayback",
        parameters: [
          pathIdParameter(),
          {
            name: "file",
            in: "query",
            required: false,
            schema: stringSchema,
            description: "Specific media file id when the item has multiple files.",
          },
          {
            name: "start",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 0 },
            description: "Resume position in seconds.",
          },
          playbackTargetParameter(),
          {
            name: "transcode",
            in: "query",
            required: false,
            schema: { type: "boolean" },
            description: "Force temporary HLS even when direct play is available.",
          },
          ...playbackCapabilityParameters(),
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
        requestBody: {
          $ref: "#/components/requestBodies/PlaybackProgressRequest",
        },
        responses: {
          "200": okResponse,
          "400": errorResponse,
          "401": errorResponse,
        },
      },
    },
    "/api/share/{token}": {
      get: {
        tags: ["Shares"],
        summary: "Get public guest share page data.",
        operationId: "getGuestShare",
        security: [],
        parameters: [
          {
            name: "token",
            in: "path",
            required: true,
            schema: stringSchema,
            description: "Opaque guest share token.",
          },
        ],
        responses: {
          "200": jsonResponse(objectSchema("Guest share page payload.")),
          "404": errorResponse,
          "429": errorResponse,
        },
      },
    },
    "/api/share/{token}/seasons/{seasonId}": {
      get: {
        tags: ["Shares"],
        summary: "Get playable episodes for one shared show season.",
        operationId: "getGuestShareSeason",
        security: [],
        parameters: [
          {
            name: "token",
            in: "path",
            required: true,
            schema: stringSchema,
            description: "Opaque guest share token.",
          },
          {
            name: "seasonId",
            in: "path",
            required: true,
            schema: stringSchema,
            description: "Season UUID or season number.",
          },
        ],
        responses: {
          "200": jsonResponse(objectSchema("Guest share season payload with playable episodes.")),
          "404": errorResponse,
          "429": errorResponse,
        },
      },
    },
    "/api/share/{token}/playback/{mediaItemId}": {
      get: {
        tags: ["Shares"],
        summary: "Prepare guest playback for a shared movie or episode.",
        operationId: "getGuestSharePlayback",
        security: [],
        parameters: [
          {
            name: "token",
            in: "path",
            required: true,
            schema: stringSchema,
          },
          pathIdParameter("mediaItemId", "Movie or episode identifier."),
          {
            name: "file",
            in: "query",
            required: false,
            schema: stringSchema,
          },
          playbackTargetParameter(),
          ...playbackCapabilityParameters(),
        ],
        responses: {
          "200": jsonResponse(objectSchema("Signed guest playback payload.")),
          "403": errorResponse,
          "404": errorResponse,
          "409": errorResponse,
          "429": errorResponse,
          "500": errorResponse,
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
          "200": jsonResponse({
            $ref: "#/components/schemas/PlaybackSessionCancelResponse",
          }),
          ...commonErrors,
        },
      },
    },
    "/api/playback-sessions/{sessionId}/admin-cancel": {
      post: {
        tags: ["Admin"],
        summary: "Cancel any active playback session as an admin.",
        operationId: "adminCancelPlaybackSession",
        parameters: [pathIdParameter("sessionId", "Playback session identifier.")],
        responses: {
          "200": okResponse,
          "400": errorResponse,
          "401": errorResponse,
          "403": errorResponse,
          "404": errorResponse,
        },
      },
    },
    "/api/settings": {
      get: {
        tags: ["Admin"],
        summary: "Get server settings and status.",
        operationId: "getSettings",
        responses: {
          "200": jsonResponse({
            $ref: "#/components/schemas/SettingsResponse",
          }),
          "401": errorResponse,
          "403": errorResponse,
        },
      },
    },
    "/api/settings/registration": {
      put: {
        tags: ["Admin"],
        summary: "Update registration settings.",
        operationId: "updateRegistrationSettings",
        requestBody: {
          $ref: "#/components/requestBodies/RegistrationSettingsRequest",
        },
        responses: {
          "200": okResponse,
          "400": errorResponse,
          "401": errorResponse,
          "403": errorResponse,
        },
      },
    },
    "/api/settings/metadata": {
      put: {
        tags: ["Admin"],
        summary: "Update metadata provider settings.",
        operationId: "updateMetadataSettings",
        requestBody: {
          $ref: "#/components/requestBodies/MetadataSettingsRequest",
        },
        responses: {
          "200": okResponse,
          "400": errorResponse,
          "401": errorResponse,
          "403": errorResponse,
        },
      },
    },
    "/api/settings/transcoding": {
      put: {
        tags: ["Admin"],
        summary: "Update transcoding settings.",
        operationId: "updateTranscodingSettings",
        requestBody: {
          $ref: "#/components/requestBodies/TranscodingSettingsRequest",
        },
        responses: {
          "200": okResponse,
          "400": errorResponse,
          "401": errorResponse,
          "403": errorResponse,
        },
      },
    },
    "/api/settings/actions": {
      post: {
        tags: ["Admin"],
        summary: "Run a settings maintenance action.",
        description:
          "Job-starting actions return 202. Synchronous actions (`testTmdb`, `cleanupPlaybackArtifacts`) return 200.",
        operationId: "runSettingsAction",
        requestBody: {
          $ref: "#/components/requestBodies/SettingsActionRequest",
        },
        responses: {
          "200": jsonResponse({
            $ref: "#/components/schemas/SettingsActionResponse",
          }),
          "202": acceptedResponse({
            $ref: "#/components/schemas/SettingsActionResponse",
          }),
          "400": errorResponse,
          "401": errorResponse,
          "403": errorResponse,
        },
      },
    },
    "/api/openapi.json": {
      get: {
        tags: ["Docs"],
        summary: "Get the OpenAPI document as JSON.",
        operationId: "getOpenApiJson",
        security: [],
        responses: {
          "200": jsonResponse(objectSchema("OpenAPI 3.1 document.")),
        },
      },
    },
    "/api/openapi.yaml": {
      get: {
        tags: ["Docs"],
        summary: "Get the OpenAPI document as YAML.",
        operationId: "getOpenApiYaml",
        security: [],
        responses: {
          "200": textResponse("OpenAPI 3.1 document.", "application/yaml"),
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
          "200": binaryResponse("Media byte stream."),
          "206": binaryResponse("Partial media byte stream."),
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
          ...headErrors,
        },
      },
      options: {
        tags: ["Media"],
        summary: "CORS preflight for original media streams.",
        operationId: "optionsMediaFile",
        parameters: [pathIdParameter()],
        responses: {
          "204": optionsResponse,
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
          "200": textResponse("HLS playlist.", "application/vnd.apple.mpegurl"),
          "401": errorResponse,
          "404": errorResponse,
          "409": errorResponse,
        },
      },
      head: {
        tags: ["Media"],
        summary: "Get HLS playlist headers.",
        operationId: "headPlaybackSessionPlaylist",
        parameters: [pathIdParameter("sessionId", "Playback session identifier.")],
        responses: {
          "200": { description: "HLS playlist headers." },
          "401": headErrors["401"],
          "404": headErrors["404"],
          "409": headErrors["409"],
        },
      },
      options: {
        tags: ["Media"],
        summary: "CORS preflight for HLS playlists.",
        operationId: "optionsPlaybackSessionPlaylist",
        parameters: [pathIdParameter("sessionId", "Playback session identifier.")],
        responses: {
          "204": optionsResponse,
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
          "200": binaryResponse("HLS media segment."),
          "401": errorResponse,
          "404": errorResponse,
          "409": errorResponse,
        },
      },
      head: {
        tags: ["Media"],
        summary: "Get HLS media segment headers.",
        operationId: "headPlaybackSessionSegment",
        parameters: [
          pathIdParameter("sessionId", "Playback session identifier."),
          pathIdParameter("segment", "Segment filename."),
        ],
        responses: {
          "200": { description: "HLS media segment headers." },
          "401": headErrors["401"],
          "404": headErrors["404"],
          "409": headErrors["409"],
        },
      },
      options: {
        tags: ["Media"],
        summary: "CORS preflight for HLS media segments.",
        operationId: "optionsPlaybackSessionSegment",
        parameters: [
          pathIdParameter("sessionId", "Playback session identifier."),
          pathIdParameter("segment", "Segment filename."),
        ],
        responses: {
          "204": optionsResponse,
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
          "200": textResponse("Subtitle file.", "text/vtt"),
          ...commonErrors,
        },
      },
      head: {
        tags: ["Media"],
        summary: "Get subtitle file headers.",
        operationId: "headSubtitle",
        parameters: [pathIdParameter()],
        responses: {
          "200": { description: "Subtitle headers." },
          ...headErrors,
        },
      },
      options: {
        tags: ["Media"],
        summary: "CORS preflight for subtitle files.",
        operationId: "optionsSubtitle",
        parameters: [pathIdParameter()],
        responses: {
          "204": optionsResponse,
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
      CreateApiKeyRequest: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/CreateApiKeyRequest" },
          },
        },
      },
      PlaybackPreferenceRequest: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/PlaybackPreferenceRequest" },
          },
        },
      },
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
      LibraryInput: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/LibraryInput" },
          },
        },
      },
      LibraryAccessRequest: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/LibraryAccessRequest" },
          },
        },
      },
      RegistrationSettingsRequest: {
        required: true,
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/RegistrationSettingsRequest",
            },
          },
        },
      },
      MetadataSettingsRequest: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/MetadataSettingsRequest" },
          },
        },
      },
      TranscodingSettingsRequest: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/TranscodingSettingsRequest" },
          },
        },
      },
      SettingsActionRequest: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/SettingsActionRequest" },
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
      ManagedUser: {
        type: "object",
        required: ["id", "name", "email", "role", "banned", "createdAt", "updatedAt"],
        properties: {
          id: stringSchema,
          name: stringSchema,
          email: stringSchema,
          role: { type: "string", enum: ["admin", "user"] },
          banned: { type: "boolean" },
          createdAt: stringSchema,
          updatedAt: stringSchema,
        },
      },
      UsersResponse: {
        type: "object",
        required: ["users"],
        properties: {
          users: {
            type: "array",
            items: { $ref: "#/components/schemas/ManagedUser" },
          },
        },
      },
      UserResponse: {
        type: "object",
        required: ["user"],
        properties: {
          user: { $ref: "#/components/schemas/ManagedUser" },
        },
      },
      UpdateUserRoleRequest: {
        type: "object",
        required: ["role"],
        properties: {
          role: { type: "string", enum: ["admin", "user"] },
        },
      },
      CreateUserRequest: {
        type: "object",
        required: ["name", "email", "password"],
        properties: {
          name: stringSchema,
          email: stringSchema,
          password: stringSchema,
          role: { type: "string", enum: ["admin", "user"] },
        },
      },
      ApiKeySummary: {
        type: "object",
        required: ["id", "name", "tokenPrefix", "lastUsedAt", "expiresAt", "createdAt", "updatedAt"],
        properties: {
          id: stringSchema,
          name: stringSchema,
          tokenPrefix: stringSchema,
          lastUsedAt: nullableStringSchema,
          expiresAt: nullableStringSchema,
          createdAt: stringSchema,
          updatedAt: stringSchema,
        },
      },
      ApiKeyListResponse: {
        type: "object",
        required: ["apiKeys"],
        properties: {
          apiKeys: {
            type: "array",
            items: { $ref: "#/components/schemas/ApiKeySummary" },
          },
        },
      },
      CreateApiKeyRequest: {
        type: "object",
        properties: {
          name: stringSchema,
          expiresIn: nullableIntegerSchema,
        },
      },
      CreateApiKeyResponse: {
        type: "object",
        required: ["token", "apiKey"],
        properties: {
          token: stringSchema,
          apiKey: { $ref: "#/components/schemas/ApiKeySummary" },
        },
      },
      PlaybackPreferenceRequest: {
        type: "object",
        properties: {
          playbackPreference: {
            type: "string",
            enum: ["auto", "prefer_direct", "prefer_transcode"],
          },
          preferredAudioLanguage: nullableStringSchema,
          preferredSubtitleLanguage: nullableStringSchema,
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
        required: [
          "id",
          "title",
          "year",
          "posterUrl",
          "releaseDate",
          "fileCount",
          "resumeFileId",
          "progressSeconds",
          "durationSeconds",
          "completed",
        ],
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
      MovieDetailRecord: {
        type: "object",
        required: ["id", "title"],
        description: "Movie metadata record with database snake_case field names.",
        properties: {
          id: stringSchema,
          title: stringSchema,
          original_title: nullableStringSchema,
          year: nullableIntegerSchema,
          overview: nullableStringSchema,
          tagline: nullableStringSchema,
          runtime_seconds: nullableNumberSchema,
          release_date: nullableStringSchema,
          status: nullableStringSchema,
          homepage: nullableStringSchema,
          original_language: nullableStringSchema,
          imdb_id: nullableStringSchema,
          budget: nullableIntegerSchema,
          revenue: nullableIntegerSchema,
          vote_count: nullableIntegerSchema,
          certification: nullableStringSchema,
          trailer_site: nullableStringSchema,
          trailer_key: nullableStringSchema,
          trailer_name: nullableStringSchema,
          collection_provider_id: nullableStringSchema,
          collection_name: nullableStringSchema,
          provider: nullableStringSchema,
          provider_id: nullableStringSchema,
          vote_average: nullableNumberSchema,
          updated_at: nullableStringSchema,
        },
      },
      MovieFileRecord: {
        type: "object",
        required: ["id", "basename", "extension", "size_bytes"],
        properties: {
          id: stringSchema,
          basename: stringSchema,
          extension: stringSchema,
          size_bytes: { type: "integer", minimum: 0 },
          duration_seconds: nullableNumberSchema,
          video_codec: nullableStringSchema,
          audio_codec: nullableStringSchema,
          container: nullableStringSchema,
        },
      },
      MovieProgressRecord: {
        type: "object",
        required: ["media_file_id", "position_seconds", "completed", "updated_at"],
        properties: {
          media_file_id: stringSchema,
          position_seconds: { type: "number", minimum: 0 },
          duration_seconds: nullableNumberSchema,
          completed: { type: "boolean" },
          updated_at: stringSchema,
        },
      },
      MovieOverviewResponse: {
        type: "object",
        required: [
          "movie",
          "files",
          "progress",
          "genres",
          "directors",
          "writers",
          "keywords",
          "productionCompanies",
          "posterUrl",
          "backdropUrl",
        ],
        properties: {
          movie: { $ref: "#/components/schemas/MovieDetailRecord" },
          files: {
            type: "array",
            items: { $ref: "#/components/schemas/MovieFileRecord" },
          },
          progress: {
            type: "array",
            items: { $ref: "#/components/schemas/MovieProgressRecord" },
          },
          genres: {
            type: "array",
            items: stringSchema,
          },
          directors: {
            type: "array",
            items: stringSchema,
          },
          writers: {
            type: "array",
            items: stringSchema,
          },
          keywords: {
            type: "array",
            items: stringSchema,
          },
          productionCompanies: {
            type: "array",
            items: stringSchema,
          },
          posterUrl: nullableStringSchema,
          backdropUrl: nullableStringSchema,
        },
      },
      MovieCreditsResponse: {
        type: "object",
        required: ["show", "cast", "directors", "writers"],
        properties: {
          show: { $ref: "#/components/schemas/MediaHeader" },
          cast: {
            type: "array",
            items: { $ref: "#/components/schemas/ShowCastCredit" },
          },
          directors: {
            type: "array",
            items: stringSchema,
          },
          writers: {
            type: "array",
            items: stringSchema,
          },
        },
      },
      MovieFullResponse: {
        type: "object",
        required: [
          "movie",
          "files",
          "progress",
          "genres",
          "cast",
          "directors",
          "writers",
          "keywords",
          "productionCompanies",
          "posterUrl",
          "backdropUrl",
        ],
        properties: {
          movie: { $ref: "#/components/schemas/MovieDetailRecord" },
          files: {
            type: "array",
            items: { $ref: "#/components/schemas/MovieFileRecord" },
          },
          progress: {
            type: "array",
            items: { $ref: "#/components/schemas/MovieProgressRecord" },
          },
          genres: {
            type: "array",
            items: stringSchema,
          },
          cast: {
            type: "array",
            items: { $ref: "#/components/schemas/ShowCastCredit" },
          },
          directors: {
            type: "array",
            items: stringSchema,
          },
          writers: {
            type: "array",
            items: stringSchema,
          },
          keywords: {
            type: "array",
            items: stringSchema,
          },
          productionCompanies: {
            type: "array",
            items: stringSchema,
          },
          posterUrl: nullableStringSchema,
          backdropUrl: nullableStringSchema,
        },
      },
      EpisodeSummary: {
        type: "object",
        required: [
          "id",
          "title",
          "showId",
          "showTitle",
          "seasonId",
          "seasonTitle",
          "seasonNumber",
          "episodeNumber",
          "fileCount",
          "fileId",
          "progressSeconds",
          "durationSeconds",
          "completed",
        ],
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
        required: [
          "id",
          "title",
          "year",
          "posterUrl",
          "backdropUrl",
          "releaseDate",
          "status",
          "episodeCount",
          "seasonCount",
        ],
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
      ShowCastCredit: {
        type: "object",
        required: ["name"],
        properties: {
          provider: nullableStringSchema,
          providerId: nullableStringSchema,
          name: stringSchema,
          character: nullableStringSchema,
          profilePath: nullableStringSchema,
        },
      },
      ShowMetadata: {
        type: "object",
        required: ["id", "title", "genres"],
        properties: {
          id: stringSchema,
          title: stringSchema,
          originalTitle: nullableStringSchema,
          year: nullableIntegerSchema,
          overview: nullableStringSchema,
          posterUrl: nullableStringSchema,
          backdropUrl: nullableStringSchema,
          releaseDate: nullableStringSchema,
          status: nullableStringSchema,
          voteAverage: nullableNumberSchema,
          voteCount: nullableIntegerSchema,
          popularity: nullableNumberSchema,
          genres: {
            type: "array",
            items: stringSchema,
          },
          provider: nullableStringSchema,
          providerId: nullableStringSchema,
          updatedAt: nullableStringSchema,
          certification: nullableStringSchema,
          originalLanguage: nullableStringSchema,
          trailerSite: nullableStringSchema,
          trailerKey: nullableStringSchema,
        },
      },
      SeasonEpisodeDetail: {
        type: "object",
        required: ["id", "title", "fileCount", "fileId", "progressSeconds", "durationSeconds", "completed"],
        properties: {
          id: stringSchema,
          title: stringSchema,
          overview: nullableStringSchema,
          seasonNumber: nullableIntegerSchema,
          episodeNumber: nullableIntegerSchema,
          releaseDate: nullableStringSchema,
          runtimeSeconds: nullableNumberSchema,
          stillUrl: nullableStringSchema,
          fileCount: { type: "integer", minimum: 0 },
          fileId: nullableStringSchema,
          progressSeconds: { type: "number", minimum: 0 },
          durationSeconds: nullableNumberSchema,
          completed: { type: "boolean" },
        },
      },
      SeasonOverviewStub: {
        type: "object",
        required: ["id", "title", "episodeCount", "playableCount", "watchedCount"],
        properties: {
          id: stringSchema,
          title: stringSchema,
          seasonNumber: nullableIntegerSchema,
          overview: nullableStringSchema,
          posterUrl: nullableStringSchema,
          episodeCount: { type: "integer", minimum: 0 },
          playableCount: { type: "integer", minimum: 0 },
          watchedCount: { type: "integer", minimum: 0 },
        },
      },
      SeasonDetailWithEpisodes: {
        type: "object",
        required: ["id", "title", "episodes"],
        properties: {
          id: stringSchema,
          title: stringSchema,
          seasonNumber: nullableIntegerSchema,
          overview: nullableStringSchema,
          posterUrl: nullableStringSchema,
          episodes: {
            type: "array",
            items: { $ref: "#/components/schemas/SeasonEpisodeDetail" },
          },
        },
      },
      SeasonTabSummary: {
        type: "object",
        required: ["id", "title"],
        properties: {
          id: stringSchema,
          title: stringSchema,
          seasonNumber: nullableIntegerSchema,
        },
      },
      ShowOverviewResponse: {
        type: "object",
        required: ["show", "creators", "keywords", "productionCompanies", "seasons"],
        properties: {
          show: { $ref: "#/components/schemas/ShowMetadata" },
          creators: {
            type: "array",
            items: stringSchema,
          },
          keywords: {
            type: "array",
            items: stringSchema,
          },
          productionCompanies: {
            type: "array",
            items: stringSchema,
          },
          seasons: {
            type: "array",
            items: { $ref: "#/components/schemas/SeasonOverviewStub" },
          },
        },
      },
      ShowCreditsResponse: {
        type: "object",
        required: ["show", "cast", "creators"],
        properties: {
          show: { $ref: "#/components/schemas/MediaHeader" },
          cast: {
            type: "array",
            items: { $ref: "#/components/schemas/ShowCastCredit" },
          },
          creators: {
            type: "array",
            items: stringSchema,
          },
        },
      },
      ShowSeasonDetailResponse: {
        type: "object",
        required: ["show", "season", "seasons"],
        properties: {
          show: { $ref: "#/components/schemas/ShowMetadata" },
          season: { $ref: "#/components/schemas/SeasonDetailWithEpisodes" },
          seasons: {
            type: "array",
            items: { $ref: "#/components/schemas/SeasonTabSummary" },
          },
        },
      },
      ShowFullResponse: {
        type: "object",
        required: ["show", "creators", "keywords", "productionCompanies", "cast", "seasons"],
        properties: {
          show: { $ref: "#/components/schemas/ShowMetadata" },
          creators: {
            type: "array",
            items: stringSchema,
          },
          keywords: {
            type: "array",
            items: stringSchema,
          },
          productionCompanies: {
            type: "array",
            items: stringSchema,
          },
          cast: {
            type: "array",
            items: { $ref: "#/components/schemas/ShowCastCredit" },
          },
          seasons: {
            type: "array",
            items: {
              type: "object",
              required: ["id", "title", "episodes"],
              properties: {
                id: stringSchema,
                title: stringSchema,
                seasonNumber: nullableIntegerSchema,
                overview: nullableStringSchema,
                posterUrl: nullableStringSchema,
                episodes: {
                  type: "array",
                  items: { $ref: "#/components/schemas/SeasonEpisodeDetail" },
                },
              },
            },
          },
        },
      },
      EpisodeDetailResponse: {
        type: "object",
        required: ["show", "season", "episode", "files", "progress"],
        properties: {
          show: {
            type: "object",
            required: ["id", "title"],
            properties: {
              id: stringSchema,
              title: stringSchema,
              posterUrl: nullableStringSchema,
              backdropUrl: nullableStringSchema,
            },
          },
          season: {
            type: "object",
            required: ["id", "title"],
            properties: {
              id: stringSchema,
              title: stringSchema,
              seasonNumber: nullableIntegerSchema,
            },
          },
          episode: {
            type: "object",
            required: ["id", "title"],
            properties: {
              id: stringSchema,
              title: stringSchema,
              overview: nullableStringSchema,
              seasonNumber: nullableIntegerSchema,
              episodeNumber: nullableIntegerSchema,
              releaseDate: nullableStringSchema,
              runtimeSeconds: nullableNumberSchema,
              stillUrl: nullableStringSchema,
              voteAverage: nullableNumberSchema,
            },
          },
          files: {
            type: "array",
            items: {
              type: "object",
              required: ["id", "basename", "extension", "size_bytes"],
              properties: {
                id: stringSchema,
                basename: stringSchema,
                extension: stringSchema,
                size_bytes: { type: "integer", minimum: 0 },
                duration_seconds: nullableNumberSchema,
                video_codec: nullableStringSchema,
                audio_codec: nullableStringSchema,
                container: nullableStringSchema,
              },
            },
          },
          progress: {
            type: "array",
            items: {
              type: "object",
              required: ["media_file_id", "position_seconds", "completed", "updated_at"],
              properties: {
                media_file_id: stringSchema,
                position_seconds: { type: "number", minimum: 0 },
                duration_seconds: nullableNumberSchema,
                completed: { type: "boolean" },
                updated_at: stringSchema,
              },
            },
          },
        },
      },
      PersonDetailResponse: {
        type: "object",
        required: ["person", "stats", "movies", "shows", "moviePage", "showPage"],
        properties: {
          person: objectSchema("Person metadata."),
          stats: objectSchema("Aggregate filmography counts, year span, and featured characters."),
          movies: {
            type: "array",
            items: { $ref: "#/components/schemas/MovieSummary" },
          },
          shows: {
            type: "array",
            items: { $ref: "#/components/schemas/ShowSummary" },
          },
          moviePage: { $ref: "#/components/schemas/PageMetadata" },
          showPage: { $ref: "#/components/schemas/PageMetadata" },
        },
      },
      MediaHeader: {
        type: "object",
        required: ["id", "title"],
        properties: {
          id: stringSchema,
          title: stringSchema,
        },
      },
      SimilarMoviesResponse: {
        type: "object",
        required: ["movie", "movies", "page"],
        properties: {
          movie: { $ref: "#/components/schemas/MediaHeader" },
          movies: {
            type: "array",
            items: { $ref: "#/components/schemas/MovieSummary" },
          },
          page: { $ref: "#/components/schemas/PageMetadata" },
        },
      },
      SimilarShowsResponse: {
        type: "object",
        required: ["show", "shows", "page"],
        properties: {
          show: { $ref: "#/components/schemas/MediaHeader" },
          shows: {
            type: "array",
            items: { $ref: "#/components/schemas/ShowSummary" },
          },
          page: { $ref: "#/components/schemas/PageMetadata" },
        },
      },
      MovieRowsResponse: {
        type: "object",
        required: ["continueWatching", "all", "allPage", "recent", "latest", "popular"],
        properties: {
          continueWatching: {
            type: "array",
            items: { $ref: "#/components/schemas/MovieSummary" },
          },
          all: {
            type: "array",
            items: { $ref: "#/components/schemas/MovieSummary" },
          },
          allPage: { $ref: "#/components/schemas/PageMetadata" },
          recent: {
            type: "array",
            items: { $ref: "#/components/schemas/MovieSummary" },
          },
          latest: {
            type: "array",
            items: { $ref: "#/components/schemas/MovieSummary" },
          },
          popular: {
            type: "array",
            items: { $ref: "#/components/schemas/MovieSummary" },
          },
        },
      },
      MovieBrowseRailResponse: {
        type: "object",
        description: "Partial browse payload returned when `rail` is set on GET /api/movies.",
        properties: {
          continueWatching: {
            type: "array",
            items: { $ref: "#/components/schemas/MovieSummary" },
          },
          all: {
            type: "array",
            items: { $ref: "#/components/schemas/MovieSummary" },
          },
          allPage: { $ref: "#/components/schemas/PageMetadata" },
          recent: {
            type: "array",
            items: { $ref: "#/components/schemas/MovieSummary" },
          },
          latest: {
            type: "array",
            items: { $ref: "#/components/schemas/MovieSummary" },
          },
          popular: {
            type: "array",
            items: { $ref: "#/components/schemas/MovieSummary" },
          },
        },
      },
      PageMetadata: {
        type: "object",
        required: ["page", "pageSize", "total", "totalPages", "hasPrevious", "hasNext"],
        properties: {
          page: { type: "integer", minimum: 1 },
          pageSize: { type: "integer", minimum: 1 },
          total: { type: "integer", minimum: 0 },
          totalPages: { type: "integer", minimum: 0 },
          hasPrevious: { type: "boolean" },
          hasNext: { type: "boolean" },
        },
      },
      ContinueWatchingResponse: {
        type: "object",
        required: ["movies", "episodes", "nextUp"],
        properties: {
          movies: {
            type: "array",
            items: { $ref: "#/components/schemas/MovieSummary" },
          },
          episodes: {
            type: "array",
            items: { $ref: "#/components/schemas/EpisodeSummary" },
          },
          nextUp: {
            type: "array",
            items: { $ref: "#/components/schemas/EpisodeSummary" },
          },
        },
      },
      DiscoverMoviesResponse: {
        type: "object",
        required: ["movies", "page"],
        properties: {
          movies: {
            type: "array",
            items: { $ref: "#/components/schemas/MovieSummary" },
          },
          page: { $ref: "#/components/schemas/PageMetadata" },
        },
      },
      DiscoverShowsResponse: {
        type: "object",
        required: ["shows", "page"],
        properties: {
          shows: {
            type: "array",
            items: { $ref: "#/components/schemas/ShowSummary" },
          },
          page: { $ref: "#/components/schemas/PageMetadata" },
        },
      },
      ShowRowsResponse: {
        type: "object",
        required: ["continueWatching", "nextUp", "all", "allPage", "recent", "latest", "popular"],
        properties: {
          continueWatching: {
            type: "array",
            items: { $ref: "#/components/schemas/EpisodeSummary" },
          },
          nextUp: {
            type: "array",
            items: { $ref: "#/components/schemas/EpisodeSummary" },
          },
          all: {
            type: "array",
            items: { $ref: "#/components/schemas/ShowSummary" },
          },
          allPage: { $ref: "#/components/schemas/PageMetadata" },
          recent: {
            type: "array",
            items: { $ref: "#/components/schemas/ShowSummary" },
          },
          latest: {
            type: "array",
            items: { $ref: "#/components/schemas/ShowSummary" },
          },
          popular: {
            type: "array",
            items: { $ref: "#/components/schemas/ShowSummary" },
          },
        },
      },
      ShowBrowseRailResponse: {
        type: "object",
        description: "Partial browse payload returned when `rail` is set on GET /api/shows.",
        properties: {
          continueWatching: {
            type: "array",
            items: { $ref: "#/components/schemas/EpisodeSummary" },
          },
          nextUp: {
            type: "array",
            items: { $ref: "#/components/schemas/EpisodeSummary" },
          },
          all: {
            type: "array",
            items: { $ref: "#/components/schemas/ShowSummary" },
          },
          allPage: { $ref: "#/components/schemas/PageMetadata" },
          recent: {
            type: "array",
            items: { $ref: "#/components/schemas/ShowSummary" },
          },
          latest: {
            type: "array",
            items: { $ref: "#/components/schemas/ShowSummary" },
          },
          popular: {
            type: "array",
            items: { $ref: "#/components/schemas/ShowSummary" },
          },
        },
      },
      JobSummary: {
        type: "object",
        required: ["total", "active", "completed", "failed", "cancelled", "errors"],
        properties: {
          total: { type: "integer", minimum: 0 },
          active: { type: "integer", minimum: 0 },
          completed: { type: "integer", minimum: 0 },
          failed: { type: "integer", minimum: 0 },
          cancelled: { type: "integer", minimum: 0 },
          errors: { type: "integer", minimum: 0 },
        },
      },
      JobsResponse: {
        type: "object",
        required: ["summary", "playbackSessionSummary", "playbackSessions", "jobs"],
        properties: {
          summary: { $ref: "#/components/schemas/JobSummary" },
          playbackSessionSummary: { $ref: "#/components/schemas/JobSummary" },
          playbackSessions: {
            type: "array",
            items: objectSchema("Playback session job row."),
          },
          jobs: { type: "array", items: objectSchema("Scan job row.") },
        },
      },
      JobErrorsResponse: {
        type: "object",
        required: ["errors", "limit"],
        properties: {
          errors: { type: "array", items: objectSchema("Scan error row.") },
          limit: { type: "integer", minimum: 1 },
        },
      },
      Library: objectSchema("Configured library with source-specific fields."),
      LibraryUser: {
        type: "object",
        required: ["id", "name", "email", "role"],
        properties: {
          id: stringSchema,
          name: nullableStringSchema,
          email: stringSchema,
          role: stringSchema,
        },
      },
      LibraryResponse: {
        type: "object",
        required: ["library"],
        properties: {
          library: { $ref: "#/components/schemas/Library" },
        },
      },
      LibrariesResponse: {
        type: "object",
        required: ["libraries", "users", "tmdbConfigured"],
        properties: {
          libraries: {
            type: "array",
            items: { $ref: "#/components/schemas/Library" },
          },
          users: {
            type: "array",
            items: { $ref: "#/components/schemas/LibraryUser" },
          },
          tmdbConfigured: { type: "boolean" },
        },
      },
      LibraryInput: {
        type: "object",
        additionalProperties: true,
        properties: {
          source: { type: "string", enum: ["local", "sftp", "webdav"] },
          kind: { type: "string", enum: ["movie", "tv"] },
          name: stringSchema,
          path: stringSchema,
          host: stringSchema,
          port: { type: "integer" },
          username: stringSchema,
          password: stringSchema,
          root: stringSchema,
          secure: { type: "boolean" },
          walkConcurrency: { type: "integer" },
          operationTimeoutMs: { type: "integer" },
          watchEnabled: { type: "boolean" },
          scanIntervalMinutes: nullableIntegerSchema,
        },
      },
      LibraryAccessRequest: {
        type: "object",
        required: ["accessMode", "userIds"],
        properties: {
          accessMode: { type: "string", enum: ["all", "shared"] },
          userIds: { type: "array", items: stringSchema },
        },
      },
      ScanStartResponse: objectSchema("Scan start result."),
      MetadataRefreshResponse: objectSchema("Metadata refresh result."),
      LastScanSummary: {
        type: "object",
        description: "Most recent scan job summary.",
        properties: {
          status: nullableStringSchema,
          finished_at: nullableStringSchema,
          created_at: nullableStringSchema,
        },
      },
      ServerStatus: {
        type: "object",
        description: "Server status summary returned by GET /api/settings.",
        required: [
          "dataDir",
          "dbFile",
          "libraries",
          "mediaFiles",
          "movies",
          "shows",
          "episodes",
          "matchedMovies",
          "moviesWithPosters",
          "matchedShows",
          "showsWithPosters",
          "matchedEpisodes",
          "scanJobs",
          "activeScanJobs",
          "scanErrors",
          "playbackCacheEntries",
          "playbackCacheBytes",
          "playbackCacheActiveRefs",
          "playbackCacheIdleEntries",
        ],
        properties: {
          dataDir: stringSchema,
          dbFile: stringSchema,
          libraries: { type: "integer", minimum: 0 },
          mediaFiles: { type: "integer", minimum: 0 },
          movies: { type: "integer", minimum: 0 },
          shows: { type: "integer", minimum: 0 },
          episodes: { type: "integer", minimum: 0 },
          matchedMovies: { type: "integer", minimum: 0 },
          moviesWithPosters: { type: "integer", minimum: 0 },
          matchedShows: { type: "integer", minimum: 0 },
          showsWithPosters: { type: "integer", minimum: 0 },
          matchedEpisodes: { type: "integer", minimum: 0 },
          scanJobs: { type: "integer", minimum: 0 },
          activeScanJobs: { type: "integer", minimum: 0 },
          scanErrors: { type: "integer", minimum: 0 },
          lastScan: { $ref: "#/components/schemas/LastScanSummary" },
          playbackCacheEntries: {
            type: "integer",
            minimum: 0,
            description: "Number of shared HLS segment cache entries on disk.",
          },
          playbackCacheBytes: {
            type: "integer",
            minimum: 0,
            description: "Total bytes used by shared HLS segment cache entries.",
          },
          playbackCacheActiveRefs: {
            type: "integer",
            minimum: 0,
            description: "Sum of playback session reference counts across cache entries.",
          },
          playbackCacheIdleEntries: {
            type: "integer",
            minimum: 0,
            description: "Number of shared HLS cache entries with no active playback session refs.",
          },
        },
      },
      SettingsResponse: {
        type: "object",
        required: [
          "signupOpen",
          "tmdbConfigured",
          "transcodePolicy",
          "playbackSessionArtifactMaxBytes",
          "playbackSessionArtifactMaxBytesOptions",
          "encodeAheadSegmentCount",
          "playbackCacheTtlHours",
          "version",
          "status",
        ],
        properties: {
          signupOpen: { type: "boolean" },
          tmdbConfigured: { type: "boolean" },
          tmdbAccessTokenConfigured: { type: "boolean" },
          tmdbAccessTokenSaved: { type: "boolean" },
          tmdbApiKeyConfigured: { type: "boolean" },
          tmdbApiKeySaved: { type: "boolean" },
          transcodePolicy: objectSchema("Effective transcoding policy."),
          playbackSessionArtifactMaxBytes: { type: "integer", minimum: 0 },
          playbackSessionArtifactMaxBytesOptions: {
            type: "array",
            items: { type: "integer", minimum: 0 },
          },
          encodeAheadSegmentCount: {
            type: "integer",
            minimum: 1,
            description: "Request-driven HLS encode-ahead window in segments beyond the requested segment. Default 4.",
          },
          playbackCacheTtlHours: {
            type: "number",
            minimum: 0,
            description:
              "Idle TTL for unreferenced shared HLS cache entries, in hours. Default 24. Combined with LRU eviction against playbackSessionArtifactMaxBytes.",
          },
          version: stringSchema,
          status: { $ref: "#/components/schemas/ServerStatus" },
        },
      },
      RegistrationSettingsRequest: {
        type: "object",
        required: ["signupOpen"],
        properties: {
          signupOpen: { type: "boolean" },
        },
      },
      MetadataSettingsRequest: {
        type: "object",
        properties: {
          tmdbAccessToken: stringSchema,
          tmdbApiKey: stringSchema,
          clearTmdbAccessToken: { type: "boolean" },
          clearTmdbApiKey: { type: "boolean" },
        },
      },
      TranscodingSettingsRequest: {
        type: "object",
        properties: {
          transcodingEnabled: { type: "boolean" },
          hardwareAcceleration: stringSchema,
          hardwareAccelerationRequired: { type: "boolean" },
          transcodeQualityPreset: stringSchema,
          playbackSessionArtifactMaxBytes: {
            ...nullableIntegerSchema,
            description: "Combined byte limit for playback-sessions playlists and playback-cache segments.",
          },
          encodeAheadSegmentCount: {
            ...nullableIntegerSchema,
            description: "Request-driven HLS encode-ahead window in segments. Minimum 1.",
          },
          playbackCacheTtlHours: {
            type: "number",
            minimum: 0,
            description: "Idle TTL for unreferenced shared HLS cache entries, in hours. Minimum 1 minute when saved.",
          },
        },
      },
      SettingsActionRequest: {
        type: "object",
        required: ["action"],
        properties: {
          action: {
            type: "string",
            enum: [
              "scanAll",
              "refreshMovieMetadata",
              "refreshTvMetadata",
              "repairMediaProbes",
              "testTmdb",
              "cleanupPlaybackArtifacts",
            ],
          },
        },
      },
      SettingsActionResponse: {
        description:
          "Settings action result. Synchronous actions use PlaybackArtifactsCleanupResponse or TmdbTestResponse. Job actions return job metadata.",
        oneOf: [
          { $ref: "#/components/schemas/PlaybackArtifactsCleanupResponse" },
          { $ref: "#/components/schemas/TmdbTestResponse" },
          objectSchema("Job action result."),
        ],
      },
      PlaybackArtifactsCleanupResponse: {
        type: "object",
        required: ["cacheRemoved", "sessionsRemoved", "sessionArtifactsRemoved", "message"],
        description: "Result of `cleanupPlaybackArtifacts` force cleanup.",
        properties: {
          cacheRemoved: {
            type: "integer",
            minimum: 0,
            description: "Idle shared HLS cache entries removed.",
          },
          sessionsRemoved: {
            type: "integer",
            minimum: 0,
            description: "Distinct playback sessions whose artifacts were cleaned.",
          },
          sessionArtifactsRemoved: {
            type: "integer",
            minimum: 0,
            description: "Session artifact directories removed (including orphans).",
          },
          message: {
            ...stringSchema,
            description: "Human-readable cleanup summary.",
          },
        },
      },
      TmdbTestResponse: {
        type: "object",
        required: ["ok", "message"],
        additionalProperties: true,
        description: "Result of `testTmdb`.",
        properties: {
          ok: { type: "boolean" },
          message: stringSchema,
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
