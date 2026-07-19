import { APP_VERSION } from "./version";
import { CLIENT_PLAYBACK_CAPABILITY_KEYS, PLAYBACK_TARGETS } from "$lib/playback/capabilities";
import {
  HARDWARE_ACCELERATION_MODES,
  PLAYBACK_PREFERENCES,
  TRANSCODE_QUALITY_PRESETS,
} from "$lib/server/transcoding/policy";
import { PLAYBACK_SESSION_ARTIFACT_MAX_BYTES_OPTIONS } from "$lib/server/transcoding/session-artifacts";
import { API_KEY_MAX_EXPIRES_IN_SECONDS, API_KEY_MAX_NAME_LENGTH } from "./auth/api-key-config";
import { CONTINUE_MAX_AGE_DAYS_MAX, CONTINUE_MAX_AGE_DAYS_MIN } from "$lib/media/continue";

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
    "application/problem+json": {
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

const noContentResponse = {
  description: "Resource deleted.",
};

const updatedNoContentResponse = {
  description: "Resource updated.",
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

const limitParameter = {
  name: "limit",
  in: "query",
  required: false,
  description: "Maximum items per rail or continue section. Default 24. Clamped to 200.",
  schema: { type: "integer", minimum: 1, maximum: 200 },
};

function browseRailParameter(rails: readonly string[], description: string) {
  const railPattern = rails.join("|");
  return {
    name: "rail",
    in: "query" as const,
    required: false,
    schema: {
      type: "string",
      pattern: `^(${railPattern})(,(${railPattern}))*$`,
    },
    description,
  };
}

const movieBrowseRailParameter = browseRailParameter(
  ["continueWatching", "all", "recent", "latest", "popular"],
  "When set, returns only the requested rail(s). Comma-separate multiple rails. Each rail also returns a matching `*Page` object (for example `continueWatchingPage`, `allPage`). Omit for the full bundled response.",
);

const showBrowseRailParameter = browseRailParameter(
  ["continueWatching", "nextUp", "all", "recent", "latest", "popular"],
  "When set, returns only the requested rail(s). Comma-separate multiple rails. Episode rails return `EpisodeSummary` items, and show rails return `ShowSummary` items. Each rail also returns a matching `*Page` object. Omit for the full bundled response.",
);

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
    { name: "System" },
    { name: "Docs" },
  ],
  security: [{ sessionCookie: [] }, { apiKey: [] }],
  paths: {
    "/api/me": {
      get: {
        tags: ["Account"],
        summary: "Get the signed-in user and profile preferences.",
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
    "/api/profile": {
      patch: {
        tags: ["Account"],
        summary: "Update signed-in user preferences.",
        description:
          "Partial update. Only fields present in the JSON body are changed. Returns the updated preference snapshot.",
        operationId: "updateProfilePreferences",
        requestBody: {
          $ref: "#/components/requestBodies/ProfilePreferencesRequest",
        },
        responses: {
          "200": jsonResponse({
            $ref: "#/components/schemas/ProfilePreferencesResponse",
          }),
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
        parameters: [pageParameter, limitParameter],
        responses: {
          "200": jsonResponse({
            $ref: "#/components/schemas/ContinueWatchingResponse",
          }),
          "401": errorResponse,
        },
      },
    },
    "/api/continue/movies": {
      get: {
        tags: ["Catalog"],
        summary: "Get movies in continue watching.",
        operationId: "getContinueWatchingMovies",
        parameters: [pageParameter, limitParameter],
        responses: {
          "200": jsonResponse({
            $ref: "#/components/schemas/ContinueWatchingMoviesResponse",
          }),
          "401": errorResponse,
        },
      },
    },
    "/api/continue/episodes": {
      get: {
        tags: ["Catalog"],
        summary: "Get episodes in continue watching.",
        operationId: "getContinueWatchingEpisodes",
        parameters: [pageParameter, limitParameter],
        responses: {
          "200": jsonResponse({
            $ref: "#/components/schemas/ContinueWatchingEpisodesResponse",
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
          "Ranks accessible unwatched movies by shared genres, keywords, cast, and directors with the caller's recent watches. Scoring: genres +3, keywords +2, people +1 per seed, using up to three recent seeds weighted 3/2/1.",
        operationId: "getDiscoverMovies",
        parameters: [pageParameter, limitParameter],
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
          movieBrowseRailParameter,
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
          limitParameter,
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
          "401": errorResponse,
          "403": errorResponse,
          "404": errorResponse,
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
          "401": errorResponse,
          "403": errorResponse,
          "404": errorResponse,
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
          "401": errorResponse,
          "403": errorResponse,
          "404": errorResponse,
        },
      },
    },
    "/api/movies/{id}/similar": {
      get: {
        tags: ["Catalog"],
        summary: "List movies similar to a title in the caller's accessible library.",
        operationId: "getSimilarMovies",
        parameters: [pathIdParameter(), pageParameter, limitParameter],
        responses: {
          "200": jsonResponse({
            $ref: "#/components/schemas/SimilarMoviesResponse",
          }),
          "401": errorResponse,
          "403": errorResponse,
          "404": errorResponse,
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
          "401": errorResponse,
          "403": errorResponse,
          "404": errorResponse,
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
          showBrowseRailParameter,
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
          limitParameter,
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
          "Ranks accessible unwatched shows by shared genres, keywords, cast, and creators with the caller's recent episode watches. Scoring: genres +3, keywords +2, people +1 per seed, using up to three recent show seeds weighted 3/2/1.",
        operationId: "getDiscoverShows",
        parameters: [pageParameter, limitParameter],
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
          "200": jsonResponse({ $ref: "#/components/schemas/LibraryDetailResponse" }),
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
          "200": jsonResponse({ $ref: "#/components/schemas/LibraryDetailResponse" }),
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
          "204": noContentResponse,
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
        parameters: [pathIdParameter("id", "Library identifier.")],
        requestBody: {
          $ref: "#/components/requestBodies/LibraryAccessRequest",
        },
        responses: {
          "204": updatedNoContentResponse,
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
          "204": noContentResponse,
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
            required: false,
            schema: stringSchema,
            description: "When set, list shares for one movie or show. Omit to list all shares.",
          },
        ],
        responses: {
          "200": jsonResponse({
            oneOf: [
              { $ref: "#/components/schemas/AdminSharesListResponse" },
              { $ref: "#/components/schemas/MediaSharesListResponse" },
            ],
          }),
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
              schema: { $ref: "#/components/schemas/CreateShareRequest" },
            },
          },
        },
        responses: {
          "201": jsonResponse({ $ref: "#/components/schemas/ShareCreateResponse" }, "Share created."),
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
          "200": jsonResponse({ $ref: "#/components/schemas/ShareRevokeResponse" }),
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
          "401": errorResponse,
          "403": errorResponse,
          "404": errorResponse,
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
          "401": errorResponse,
          "403": errorResponse,
          "404": errorResponse,
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
          "401": errorResponse,
          "403": errorResponse,
          "404": errorResponse,
        },
      },
    },
    "/api/shows/{id}/similar": {
      get: {
        tags: ["Catalog"],
        summary: "List shows similar to a title in the caller's accessible library.",
        operationId: "getSimilarShows",
        parameters: [pathIdParameter(), pageParameter, limitParameter],
        responses: {
          "200": jsonResponse({
            $ref: "#/components/schemas/SimilarShowsResponse",
          }),
          "401": errorResponse,
          "403": errorResponse,
          "404": errorResponse,
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
          "401": errorResponse,
          "403": errorResponse,
          "404": errorResponse,
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
          "401": errorResponse,
          "403": errorResponse,
          "404": errorResponse,
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
          "401": errorResponse,
          "403": errorResponse,
          "404": errorResponse,
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
          "401": errorResponse,
          "403": errorResponse,
          "404": errorResponse,
        },
      },
    },
    "/api/playback/{id}": {
      get: {
        tags: ["Playback"],
        summary: "Prepare playback data for a media item.",
        description:
          "Returns playback mode, subtitle tracks, and a signed stream URL when ready. Cast, AirPlay, and native clients receive absolute URLs with a remoteToken (8-hour default, configurable via LUNARR_SIGNED_PLAYBACK_TOKEN_TTL_SECONDS).",
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
            description: "Force transcoding even when direct play is available.",
          },
          ...playbackCapabilityParameters(),
        ],
        responses: {
          "200": jsonResponse({ $ref: "#/components/schemas/PlaybackDataResponse" }),
          "401": errorResponse,
          "403": errorResponse,
          "404": errorResponse,
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
          "200": jsonResponse({ $ref: "#/components/schemas/GuestSharePageResponse" }),
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
          "200": jsonResponse({ $ref: "#/components/schemas/GuestShareSeasonResponse" }),
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
          "200": jsonResponse({ $ref: "#/components/schemas/PlaybackDataResponse" }),
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
          "200": okResponse,
          "400": errorResponse,
          "401": errorResponse,
          "403": errorResponse,
          "404": errorResponse,
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
      patch: {
        tags: ["Admin"],
        summary: "Update registration settings.",
        operationId: "updateRegistrationSettings",
        requestBody: {
          $ref: "#/components/requestBodies/RegistrationSettingsRequest",
        },
        responses: {
          "204": updatedNoContentResponse,
          "400": errorResponse,
          "401": errorResponse,
          "403": errorResponse,
        },
      },
    },
    "/api/settings/metadata": {
      patch: {
        tags: ["Admin"],
        summary: "Update metadata provider settings.",
        operationId: "updateMetadataSettings",
        requestBody: {
          $ref: "#/components/requestBodies/MetadataSettingsRequest",
        },
        responses: {
          "204": updatedNoContentResponse,
          "400": errorResponse,
          "401": errorResponse,
          "403": errorResponse,
        },
      },
    },
    "/api/settings/transcoding": {
      patch: {
        tags: ["Admin"],
        summary: "Update transcoding settings.",
        operationId: "updateTranscodingSettings",
        requestBody: {
          $ref: "#/components/requestBodies/TranscodingSettingsRequest",
        },
        responses: {
          "204": updatedNoContentResponse,
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
    "/api/health": {
      get: {
        tags: ["System"],
        summary: "Check Lunarr health and app version.",
        description:
          "Public readiness probe for load balancers and orchestrators. Returns HTTP 200 when the database is reachable and HTTP 503 otherwise.",
        operationId: "getHealth",
        security: [],
        responses: {
          "200": jsonResponse({
            $ref: "#/components/schemas/HealthResponse",
          }),
          "503": jsonResponse({
            $ref: "#/components/schemas/HealthResponse",
          }),
        },
      },
    },
    "/api/device-pairing": {
      post: {
        tags: ["Account"],
        summary: "Start TV or mobile device pairing.",
        description:
          "Creates a short pairing code for a device to display. Returns a pairingUrl for QR codes. Poll with GET /api/device-pairing/poll until the signed-in user approves the code.",
        operationId: "startDevicePairing",
        security: [],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  deviceName: stringSchema,
                },
              },
            },
          },
        },
        responses: {
          "201": jsonResponse({
            $ref: "#/components/schemas/DevicePairingStartResponse",
          }),
          "429": errorResponse,
          "503": errorResponse,
        },
      },
    },
    "/api/device-pairing/poll": {
      get: {
        tags: ["Account"],
        summary: "Poll device pairing status.",
        operationId: "pollDevicePairing",
        security: [],
        parameters: [
          {
            name: "deviceCode",
            in: "query",
            required: true,
            schema: stringSchema,
            description: "Secret device code returned by POST /api/device-pairing.",
          },
        ],
        responses: {
          "200": jsonResponse({
            $ref: "#/components/schemas/DevicePairingPollResponse",
          }),
          "404": errorResponse,
          "410": errorResponse,
          "429": errorResponse,
        },
      },
    },
    "/api/device-pairing/approve": {
      post: {
        tags: ["Account"],
        summary: "Approve a device pairing code.",
        description:
          "Creates a personal API key for the signed-in user and makes it available to the waiting device. Paired keys default to a 2-year expiry (LUNARR_DEVICE_PAIRING_API_KEY_EXPIRES_IN_DAYS, use 0 for no expiry).",
        operationId: "approveDevicePairing",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["userCode"],
                properties: {
                  userCode: stringSchema,
                  deviceName: stringSchema,
                },
              },
            },
          },
        },
        responses: {
          "200": jsonResponse({
            $ref: "#/components/schemas/DevicePairingApproveResponse",
          }),
          "400": errorResponse,
          "401": errorResponse,
          "404": errorResponse,
          "409": errorResponse,
          "410": errorResponse,
          "429": errorResponse,
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
          "401": errorResponse,
          "403": errorResponse,
          "404": errorResponse,
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
          "401": errorResponse,
          "403": errorResponse,
          "404": errorResponse,
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
    "/api/watchlist": {
      get: {
        tags: ["Catalog"],
        summary: "Get the user's watchlist.",
        operationId: "getWatchlist",
        parameters: [pageParameter, limitParameter],
        responses: {
          "200": jsonResponse({ $ref: "#/components/schemas/WatchlistPageResponse" }),
          "401": errorResponse,
        },
      },
      post: {
        tags: ["Catalog"],
        summary: "Toggle an item in the watchlist.",
        operationId: "toggleWatchlist",
        requestBody: { $ref: "#/components/requestBodies/WatchlistToggleRequest" },
        responses: {
          "200": jsonResponse({ $ref: "#/components/schemas/WatchlistToggleResponse" }),
          "400": errorResponse,
          "401": errorResponse,
        },
      },
    },
    "/api/watchlist/{mediaItemId}": {
      get: {
        tags: ["Catalog"],
        summary: "Check whether a media item is in the user's watchlist.",
        operationId: "getWatchlistStatus",
        parameters: [pathIdParameter("mediaItemId", "Media item identifier.")],
        responses: {
          "200": jsonResponse({ $ref: "#/components/schemas/WatchlistStatusResponse" }),
          "401": errorResponse,
        },
      },
      delete: {
        tags: ["Catalog"],
        summary: "Remove an item from the watchlist.",
        operationId: "removeFromWatchlist",
        parameters: [pathIdParameter("mediaItemId", "Media item identifier.")],
        responses: {
          "204": noContentResponse,
          "401": errorResponse,
        },
      },
    },
    "/api/watchlist/movies": {
      get: {
        tags: ["Catalog"],
        summary: "Get movies in the user's watchlist.",
        operationId: "getWatchlistMovies",
        parameters: [pageParameter, limitParameter],
        responses: {
          "200": jsonResponse({ $ref: "#/components/schemas/WatchlistMoviesResponse" }),
          "401": errorResponse,
        },
      },
    },
    "/api/watchlist/shows": {
      get: {
        tags: ["Catalog"],
        summary: "Get shows in the user's watchlist.",
        operationId: "getWatchlistShows",
        parameters: [pageParameter, limitParameter],
        responses: {
          "200": jsonResponse({ $ref: "#/components/schemas/WatchlistShowsResponse" }),
          "401": errorResponse,
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
      ProfilePreferencesRequest: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ProfilePreferencesRequest" },
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
      WatchlistToggleRequest: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/WatchlistToggleRequest" },
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
        description: "RFC 9457 problem details.",
        required: ["type", "title", "status", "detail"],
        properties: {
          type: { type: "string", description: "A URI reference identifying the problem type." },
          title: { type: "string", description: "A short, human-readable summary of the problem type." },
          status: { type: "integer", description: "The HTTP status code for this occurrence." },
          detail: { type: "string", description: "A human-readable explanation specific to this occurrence." },
        },
      },
      OkResponse: {
        type: "object",
        required: ["ok"],
        properties: { ok: { type: "boolean" } },
      },
      HealthResponse: {
        type: "object",
        required: ["ok", "setupComplete", "version"],
        properties: {
          ok: { type: "boolean" },
          setupComplete: {
            type: "boolean",
            description: "True after the first admin account has been created during setup.",
          },
          version: stringSchema,
        },
      },
      DevicePairingStartResponse: {
        type: "object",
        required: ["deviceCode", "userCode", "expiresAt", "expiresIn", "pollIntervalMs", "pairingUrl"],
        properties: {
          deviceCode: stringSchema,
          userCode: stringSchema,
          expiresAt: stringSchema,
          expiresIn: { type: "integer" },
          pollIntervalMs: { type: "integer" },
          pairingUrl: stringSchema,
        },
      },
      DevicePairingPollResponse: {
        oneOf: [
          {
            type: "object",
            required: ["status"],
            properties: {
              status: { type: "string", enum: ["pending"] },
              expiresAt: stringSchema,
              pollIntervalMs: { type: "integer" },
            },
          },
          {
            type: "object",
            required: ["status", "apiKey", "apiKeyId", "name"],
            properties: {
              status: { type: "string", enum: ["approved"] },
              apiKey: stringSchema,
              apiKeyId: stringSchema,
              name: stringSchema,
            },
          },
          {
            type: "object",
            required: ["status"],
            properties: {
              status: { type: "string", enum: ["expired"] },
            },
          },
        ],
      },
      DevicePairingApproveResponse: {
        type: "object",
        required: ["ok", "userCode", "deviceName", "apiKey"],
        properties: {
          ok: { type: "boolean", enum: [true] },
          userCode: stringSchema,
          deviceName: stringSchema,
          apiKey: { $ref: "#/components/schemas/ApiKeySummary" },
        },
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
          name: {
            type: "string",
            maxLength: API_KEY_MAX_NAME_LENGTH,
            description: "Display name for the API key. Empty or omitted defaults to 'Mobile app'.",
          },
          expiresIn: {
            ...nullableIntegerSchema,
            minimum: 1,
            maximum: API_KEY_MAX_EXPIRES_IN_SECONDS,
            description: "Lifetime of the key in seconds. Null or omitted creates a non-expiring key.",
          },
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
      ProfilePreferencesRequest: {
        type: "object",
        minProperties: 1,
        properties: {
          playbackPreference: {
            type: "string",
            enum: [...PLAYBACK_PREFERENCES],
          },
          preferredAudioLanguage: {
            ...nullableStringSchema,
            description: "Preferred audio language as an ISO-639-2 code. Empty string clears the preference.",
          },
          preferredSubtitleLanguage: {
            ...nullableStringSchema,
            description: "Preferred subtitle language as an ISO-639-2 code. Empty string clears the preference.",
          },
          continueMaxAgeDays: {
            type: "integer",
            minimum: CONTINUE_MAX_AGE_DAYS_MIN,
            maximum: CONTINUE_MAX_AGE_DAYS_MAX,
            description:
              "Hide idle in-progress items from Continue rails after this many days. 0 disables staleness filtering.",
          },
          segmentSkipEnabled: {
            type: "boolean",
            description: "Enable intro, recap, and credits skip prompts during playback.",
          },
          segmentSkipAutomatic: {
            type: "boolean",
            description:
              "When segment skip is enabled, skip matching segments automatically instead of showing a button.",
          },
        },
      },
      SegmentSkipPreferences: {
        type: "object",
        required: ["enabled", "automatic"],
        properties: {
          enabled: {
            type: "boolean",
            description: "Whether intro, recap, and credits skip is enabled.",
          },
          automatic: {
            type: "boolean",
            description: "When enabled, skip matching segments automatically instead of showing a button.",
          },
        },
      },
      ProfilePreferencesResponse: {
        type: "object",
        required: ["transcodePolicy", "continueMaxAgeDays", "segmentSkip"],
        properties: {
          transcodePolicy: { $ref: "#/components/schemas/TranscodePolicy" },
          continueMaxAgeDays: {
            type: "integer",
            minimum: 0,
            maximum: 3650,
          },
          segmentSkip: { $ref: "#/components/schemas/SegmentSkipPreferences" },
        },
      },
      MeResponse: {
        type: "object",
        required: ["user", "transcodePolicy", "continueMaxAgeDays", "segmentSkip"],
        properties: {
          user: { $ref: "#/components/schemas/User" },
          transcodePolicy: { $ref: "#/components/schemas/TranscodePolicy" },
          continueMaxAgeDays: {
            type: "integer",
            minimum: 0,
            maximum: 3650,
          },
          segmentSkip: { $ref: "#/components/schemas/SegmentSkipPreferences" },
        },
      },
      TranscodePolicy: {
        type: "object",
        required: [
          "transcodingEnabled",
          "playbackPreference",
          "preferredAudioLanguage",
          "preferredSubtitleLanguage",
          "hardwareAcceleration",
          "hardwareAccelerationRequired",
          "transcodeQualityPreset",
          "transcodeQuality",
        ],
        properties: {
          transcodingEnabled: { type: "boolean" },
          playbackPreference: {
            type: "string",
            enum: [...PLAYBACK_PREFERENCES],
          },
          preferredAudioLanguage: nullableStringSchema,
          preferredSubtitleLanguage: nullableStringSchema,
          hardwareAcceleration: {
            type: "string",
            enum: [...HARDWARE_ACCELERATION_MODES],
          },
          hardwareAccelerationRequired: { type: "boolean" },
          transcodeQualityPreset: {
            type: "string",
            enum: [...TRANSCODE_QUALITY_PRESETS],
          },
          transcodeQuality: { $ref: "#/components/schemas/TranscodeQualityTarget" },
        },
      },
      TranscodeQualityTarget: {
        type: "object",
        required: ["preset", "maxHeight", "softwareCrf", "hardwareBitrate"],
        properties: {
          preset: {
            type: "string",
            enum: ["auto", "720p", "1080p", "original"],
          },
          maxHeight: nullableIntegerSchema,
          softwareCrf: { type: "number" },
          hardwareBitrate: stringSchema,
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
          "inWatchlist",
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
          inWatchlist: { type: "boolean" },
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
        required: ["movie", "cast", "directors", "writers"],
        properties: {
          movie: { $ref: "#/components/schemas/MediaHeader" },
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
          "inWatchlist",
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
          inWatchlist: { type: "boolean" },
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
        required: ["show", "creators", "keywords", "productionCompanies", "inWatchlist", "seasons"],
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
          inWatchlist: { type: "boolean" },
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
        required: ["show", "creators", "keywords", "productionCompanies", "cast", "inWatchlist", "seasons"],
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
          inWatchlist: { type: "boolean" },
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
      PersonRecord: {
        type: "object",
        required: ["provider", "providerId", "name", "originalName", "profileUrl"],
        properties: {
          provider: nullableStringSchema,
          providerId: nullableStringSchema,
          name: stringSchema,
          originalName: nullableStringSchema,
          profileUrl: nullableStringSchema,
        },
      },
      PersonFilmographyStats: {
        type: "object",
        required: ["movieCount", "showCount", "yearMin", "yearMax", "characters"],
        properties: {
          movieCount: { type: "integer", minimum: 0 },
          showCount: { type: "integer", minimum: 0 },
          yearMin: nullableIntegerSchema,
          yearMax: nullableIntegerSchema,
          characters: {
            type: "array",
            items: stringSchema,
          },
        },
      },
      PersonDetailResponse: {
        type: "object",
        required: ["person", "stats", "movies", "shows", "moviePage", "showPage"],
        properties: {
          person: { $ref: "#/components/schemas/PersonRecord" },
          stats: { $ref: "#/components/schemas/PersonFilmographyStats" },
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
        required: [
          "continueWatching",
          "continueWatchingPage",
          "all",
          "allPage",
          "recent",
          "recentPage",
          "latest",
          "latestPage",
          "popular",
          "popularPage",
        ],
        properties: {
          continueWatching: {
            type: "array",
            items: { $ref: "#/components/schemas/MovieSummary" },
          },
          continueWatchingPage: { $ref: "#/components/schemas/PageMetadata" },
          all: {
            type: "array",
            items: { $ref: "#/components/schemas/MovieSummary" },
          },
          allPage: { $ref: "#/components/schemas/PageMetadata" },
          recent: {
            type: "array",
            items: { $ref: "#/components/schemas/MovieSummary" },
          },
          recentPage: { $ref: "#/components/schemas/PageMetadata" },
          latest: {
            type: "array",
            items: { $ref: "#/components/schemas/MovieSummary" },
          },
          latestPage: { $ref: "#/components/schemas/PageMetadata" },
          popular: {
            type: "array",
            items: { $ref: "#/components/schemas/MovieSummary" },
          },
          popularPage: { $ref: "#/components/schemas/PageMetadata" },
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
          continueWatchingPage: { $ref: "#/components/schemas/PageMetadata" },
          all: {
            type: "array",
            items: { $ref: "#/components/schemas/MovieSummary" },
          },
          allPage: { $ref: "#/components/schemas/PageMetadata" },
          recent: {
            type: "array",
            items: { $ref: "#/components/schemas/MovieSummary" },
          },
          recentPage: { $ref: "#/components/schemas/PageMetadata" },
          latest: {
            type: "array",
            items: { $ref: "#/components/schemas/MovieSummary" },
          },
          latestPage: { $ref: "#/components/schemas/PageMetadata" },
          popular: {
            type: "array",
            items: { $ref: "#/components/schemas/MovieSummary" },
          },
          popularPage: { $ref: "#/components/schemas/PageMetadata" },
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
        required: ["movies", "moviesPage", "episodes", "episodesPage", "nextUp", "nextUpPage"],
        properties: {
          movies: {
            type: "array",
            items: { $ref: "#/components/schemas/MovieSummary" },
          },
          moviesPage: { $ref: "#/components/schemas/PageMetadata" },
          episodes: {
            type: "array",
            items: { $ref: "#/components/schemas/EpisodeSummary" },
          },
          episodesPage: { $ref: "#/components/schemas/PageMetadata" },
          nextUp: {
            type: "array",
            items: { $ref: "#/components/schemas/EpisodeSummary" },
          },
          nextUpPage: { $ref: "#/components/schemas/PageMetadata" },
        },
      },
      ContinueWatchingMoviesResponse: {
        type: "object",
        required: ["movies", "pageInfo"],
        properties: {
          movies: {
            type: "array",
            items: { $ref: "#/components/schemas/MovieSummary" },
          },
          pageInfo: { $ref: "#/components/schemas/PageMetadata" },
        },
      },
      ContinueWatchingEpisodesResponse: {
        type: "object",
        required: ["episodes", "episodesPage", "nextUp", "nextUpPage"],
        properties: {
          episodes: {
            type: "array",
            items: { $ref: "#/components/schemas/EpisodeSummary" },
          },
          episodesPage: { $ref: "#/components/schemas/PageMetadata" },
          nextUp: {
            type: "array",
            items: { $ref: "#/components/schemas/EpisodeSummary" },
          },
          nextUpPage: { $ref: "#/components/schemas/PageMetadata" },
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
        required: [
          "continueWatching",
          "continueWatchingPage",
          "nextUp",
          "nextUpPage",
          "all",
          "allPage",
          "recent",
          "recentPage",
          "latest",
          "latestPage",
          "popular",
          "popularPage",
        ],
        properties: {
          continueWatching: {
            type: "array",
            items: { $ref: "#/components/schemas/EpisodeSummary" },
          },
          continueWatchingPage: { $ref: "#/components/schemas/PageMetadata" },
          nextUp: {
            type: "array",
            items: { $ref: "#/components/schemas/EpisodeSummary" },
          },
          nextUpPage: { $ref: "#/components/schemas/PageMetadata" },
          all: {
            type: "array",
            items: { $ref: "#/components/schemas/ShowSummary" },
          },
          allPage: { $ref: "#/components/schemas/PageMetadata" },
          recent: {
            type: "array",
            items: { $ref: "#/components/schemas/ShowSummary" },
          },
          recentPage: { $ref: "#/components/schemas/PageMetadata" },
          latest: {
            type: "array",
            items: { $ref: "#/components/schemas/ShowSummary" },
          },
          latestPage: { $ref: "#/components/schemas/PageMetadata" },
          popular: {
            type: "array",
            items: { $ref: "#/components/schemas/ShowSummary" },
          },
          popularPage: { $ref: "#/components/schemas/PageMetadata" },
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
          continueWatchingPage: { $ref: "#/components/schemas/PageMetadata" },
          nextUp: {
            type: "array",
            items: { $ref: "#/components/schemas/EpisodeSummary" },
          },
          nextUpPage: { $ref: "#/components/schemas/PageMetadata" },
          all: {
            type: "array",
            items: { $ref: "#/components/schemas/ShowSummary" },
          },
          allPage: { $ref: "#/components/schemas/PageMetadata" },
          recent: {
            type: "array",
            items: { $ref: "#/components/schemas/ShowSummary" },
          },
          recentPage: { $ref: "#/components/schemas/PageMetadata" },
          latest: {
            type: "array",
            items: { $ref: "#/components/schemas/ShowSummary" },
          },
          latestPage: { $ref: "#/components/schemas/PageMetadata" },
          popular: {
            type: "array",
            items: { $ref: "#/components/schemas/ShowSummary" },
          },
          popularPage: { $ref: "#/components/schemas/PageMetadata" },
        },
      },
      ShareEpisode: {
        type: "object",
        required: ["id", "title", "seasonNumber", "episodeNumber", "runtimeSeconds", "stillUrl", "fileId"],
        properties: {
          id: stringSchema,
          title: stringSchema,
          overview: nullableStringSchema,
          seasonNumber: nullableIntegerSchema,
          episodeNumber: nullableIntegerSchema,
          runtimeSeconds: nullableIntegerSchema,
          stillUrl: nullableStringSchema,
          fileId: nullableStringSchema,
        },
      },
      ShareSeasonStub: {
        type: "object",
        required: ["id", "title", "seasonNumber", "posterUrl", "episodeCount", "playableCount"],
        properties: {
          id: stringSchema,
          title: stringSchema,
          seasonNumber: nullableIntegerSchema,
          posterUrl: nullableStringSchema,
          episodeCount: { type: "integer", minimum: 0 },
          playableCount: { type: "integer", minimum: 0 },
        },
      },
      GuestShareMoviePage: {
        type: "object",
        required: [
          "kind",
          "token",
          "expiresAt",
          "title",
          "overview",
          "posterUrl",
          "backdropUrl",
          "runtimeSeconds",
          "releaseDate",
          "movieId",
          "fileId",
        ],
        properties: {
          kind: { type: "string", enum: ["movie"] },
          token: stringSchema,
          expiresAt: stringSchema,
          title: stringSchema,
          overview: nullableStringSchema,
          posterUrl: nullableStringSchema,
          backdropUrl: nullableStringSchema,
          runtimeSeconds: nullableIntegerSchema,
          releaseDate: nullableStringSchema,
          movieId: stringSchema,
          fileId: nullableStringSchema,
        },
      },
      GuestShareShowPage: {
        type: "object",
        required: ["kind", "token", "expiresAt", "title", "overview", "posterUrl", "backdropUrl", "showId", "seasons"],
        properties: {
          kind: { type: "string", enum: ["show"] },
          token: stringSchema,
          expiresAt: stringSchema,
          title: stringSchema,
          overview: nullableStringSchema,
          posterUrl: nullableStringSchema,
          backdropUrl: nullableStringSchema,
          showId: stringSchema,
          seasons: {
            type: "array",
            items: { $ref: "#/components/schemas/ShareSeasonStub" },
          },
        },
      },
      GuestSharePageData: {
        oneOf: [
          { $ref: "#/components/schemas/GuestShareMoviePage" },
          { $ref: "#/components/schemas/GuestShareShowPage" },
        ],
      },
      GuestSharePageResponse: {
        type: "object",
        required: ["share"],
        properties: {
          share: { $ref: "#/components/schemas/GuestSharePageData" },
        },
      },
      GuestShareSeasonData: {
        type: "object",
        required: ["id", "title", "seasonNumber", "posterUrl", "episodes"],
        properties: {
          id: stringSchema,
          title: stringSchema,
          seasonNumber: nullableIntegerSchema,
          posterUrl: nullableStringSchema,
          episodes: {
            type: "array",
            items: { $ref: "#/components/schemas/ShareEpisode" },
          },
        },
      },
      GuestShareSeasonResponse: {
        type: "object",
        required: ["season"],
        properties: {
          season: { $ref: "#/components/schemas/GuestShareSeasonData" },
        },
      },
      PublicShareRecord: {
        type: "object",
        required: [
          "id",
          "token",
          "kind",
          "mediaItemId",
          "seasonIds",
          "expiresAt",
          "revokedAt",
          "createdAt",
          "active",
          "sharePath",
        ],
        properties: {
          id: stringSchema,
          token: stringSchema,
          kind: { type: "string", enum: ["movie", "show"] },
          mediaItemId: stringSchema,
          seasonIds: {
            type: ["array", "null"],
            items: stringSchema,
          },
          expiresAt: stringSchema,
          revokedAt: nullableStringSchema,
          createdAt: stringSchema,
          active: { type: "boolean" },
          sharePath: stringSchema,
        },
      },
      AdminShareRecord: {
        allOf: [
          { $ref: "#/components/schemas/PublicShareRecord" },
          {
            type: "object",
            required: ["title", "contentHref", "createdByName", "createdByEmail"],
            properties: {
              title: stringSchema,
              contentHref: stringSchema,
              createdByName: stringSchema,
              createdByEmail: stringSchema,
            },
          },
        ],
      },
      AdminSharesListResponse: {
        type: "object",
        required: ["shares"],
        properties: {
          shares: {
            type: "array",
            items: { $ref: "#/components/schemas/AdminShareRecord" },
          },
        },
      },
      MediaSharesListResponse: {
        type: "object",
        required: ["shares"],
        properties: {
          shares: {
            type: "array",
            items: { $ref: "#/components/schemas/PublicShareRecord" },
          },
        },
      },
      CreateShareRequest: {
        type: "object",
        required: ["kind", "mediaItemId"],
        properties: {
          kind: { type: "string", enum: ["movie", "show"] },
          mediaItemId: stringSchema,
          seasonIds: {
            type: ["array", "null"],
            items: stringSchema,
          },
          expiresAt: nullableStringSchema,
          expiresInSeconds: nullableIntegerSchema,
        },
      },
      ShareCreateResponse: {
        type: "object",
        required: ["share"],
        properties: {
          share: { $ref: "#/components/schemas/PublicShareRecord" },
        },
      },
      ShareRevokeResponse: {
        type: "object",
        required: ["share"],
        properties: {
          share: { $ref: "#/components/schemas/PublicShareRecord" },
        },
      },
      PlaybackItem: {
        type: "object",
        required: ["id", "kind", "title", "backHref"],
        properties: {
          id: stringSchema,
          kind: stringSchema,
          title: stringSchema,
          backHref: stringSchema,
        },
      },
      SubtitleTrack: {
        type: "object",
        required: ["id", "label", "language", "src", "default"],
        properties: {
          id: stringSchema,
          label: stringSchema,
          language: stringSchema,
          src: stringSchema,
          default: { type: "boolean" },
        },
      },
      PlayableFileSummary: {
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
      PlaybackDecision: {
        type: "object",
        required: [
          "mode",
          "status",
          "target",
          "modeDecision",
          "file",
          "playbackSessionId",
          "streamUrl",
          "streamStartSeconds",
          "tracks",
          "message",
        ],
        properties: {
          mode: { type: "string", enum: ["direct", "remux", "transcode", "unavailable"] },
          status: { type: "string", enum: ["ready", "preparing", "unavailable"] },
          target: { type: "string", enum: ["web", "cast", "airplay", "native"] },
          modeDecision: {
            type: "object",
            required: ["mode", "reason"],
            properties: {
              mode: { type: "string", enum: ["direct", "remux", "transcode", "unavailable"] },
              reason: stringSchema,
            },
          },
          file: { $ref: "#/components/schemas/PlayableFileSummary" },
          playbackSessionId: nullableStringSchema,
          streamUrl: nullableStringSchema,
          streamStartSeconds: { type: "number", minimum: 0 },
          tracks: {
            type: "array",
            items: { $ref: "#/components/schemas/SubtitleTrack" },
          },
          message: nullableStringSchema,
        },
      },
      PlaybackDataResponse: {
        type: "object",
        required: ["item", "playback", "startSeconds", "segments", "segmentSkip"],
        properties: {
          item: { $ref: "#/components/schemas/PlaybackItem" },
          playback: { $ref: "#/components/schemas/PlaybackDecision" },
          startSeconds: { type: "number", minimum: 0 },
          segments: {
            type: "array",
            description:
              "Intro, recap, and credits windows from IntroDB. Empty when segmentSkip.enabled is false or lookup data is unavailable.",
            items: { $ref: "#/components/schemas/PlaybackSegment" },
          },
          segmentSkip: { $ref: "#/components/schemas/SegmentSkipPreferences" },
        },
      },
      PlaybackSegment: {
        type: "object",
        required: ["type", "startSeconds", "endSeconds", "label"],
        properties: {
          type: { type: "string", enum: ["intro", "recap", "credits"] },
          startSeconds: { type: "number", minimum: 0 },
          endSeconds: { oneOf: [{ type: "number", minimum: 0 }, { type: "null" }] },
          label: { type: "string" },
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
            items: { $ref: "#/components/schemas/PlaybackSessionJobRow" },
          },
          jobs: { type: "array", items: { $ref: "#/components/schemas/ScanJobRow" } },
        },
      },
      JobErrorsResponse: {
        type: "object",
        required: ["errors", "limit"],
        properties: {
          errors: { type: "array", items: { $ref: "#/components/schemas/ScanErrorRow" } },
          limit: { type: "integer", minimum: 1 },
        },
      },
      ScanJobRow: {
        type: "object",
        required: [
          "id",
          "job_kind",
          "library_id",
          "status",
          "started_at",
          "finished_at",
          "files_seen",
          "files_added",
          "files_updated",
          "files_removed",
          "errors_count",
          "cancel_requested_at",
          "created_at",
          "updated_at",
          "library_name",
        ],
        properties: {
          id: stringSchema,
          job_kind: stringSchema,
          library_id: nullableStringSchema,
          status: stringSchema,
          started_at: nullableStringSchema,
          finished_at: nullableStringSchema,
          files_seen: nullableIntegerSchema,
          files_added: nullableIntegerSchema,
          files_updated: nullableIntegerSchema,
          files_removed: nullableIntegerSchema,
          errors_count: nullableIntegerSchema,
          cancel_requested_at: nullableStringSchema,
          created_at: stringSchema,
          updated_at: stringSchema,
          library_name: nullableStringSchema,
        },
      },
      PlaybackSessionJobRow: {
        type: "object",
        required: [
          "playback_session_id",
          "media_file_id",
          "user_id",
          "status",
          "mode",
          "pipeline",
          "start_time_seconds",
          "last_heartbeat_at",
          "last_segment_request_at",
          "last_segment_name",
          "last_segment_index",
          "error_message",
          "started_at",
          "finished_at",
          "created_at",
          "updated_at",
          "media_title",
          "media_item_id",
          "media_item_kind",
          "file_basename",
          "user_email",
        ],
        properties: {
          playback_session_id: stringSchema,
          media_file_id: stringSchema,
          user_id: stringSchema,
          status: stringSchema,
          mode: stringSchema,
          pipeline: stringSchema,
          start_time_seconds: nullableNumberSchema,
          last_heartbeat_at: nullableStringSchema,
          last_segment_request_at: nullableStringSchema,
          last_segment_name: nullableStringSchema,
          last_segment_index: nullableIntegerSchema,
          error_message: nullableStringSchema,
          started_at: nullableStringSchema,
          finished_at: nullableStringSchema,
          created_at: stringSchema,
          updated_at: stringSchema,
          media_title: nullableStringSchema,
          media_item_id: nullableStringSchema,
          media_item_kind: nullableStringSchema,
          file_basename: nullableStringSchema,
          user_email: nullableStringSchema,
        },
      },
      ScanErrorRow: {
        type: "object",
        required: [
          "id",
          "scan_job_id",
          "path",
          "message",
          "created_at",
          "job_status",
          "job_kind",
          "library_id",
          "library_name",
        ],
        properties: {
          id: stringSchema,
          scan_job_id: stringSchema,
          path: stringSchema,
          message: stringSchema,
          created_at: stringSchema,
          job_status: stringSchema,
          job_kind: stringSchema,
          library_id: nullableStringSchema,
          library_name: nullableStringSchema,
        },
      },
      LatestScanJobSummary: {
        type: ["object", "null"],
        required: ["id", "library_id", "status", "created_at"],
        properties: {
          id: stringSchema,
          library_id: nullableStringSchema,
          status: stringSchema,
          started_at: nullableStringSchema,
          finished_at: nullableStringSchema,
          files_seen: nullableIntegerSchema,
          files_added: nullableIntegerSchema,
          files_updated: nullableIntegerSchema,
          files_removed: nullableIntegerSchema,
          errors_count: nullableIntegerSchema,
          created_at: stringSchema,
        },
      },
      SftpConfigSummary: {
        type: ["object", "null"],
        properties: {
          host: stringSchema,
          port: { type: "integer" },
          username: stringSchema,
          root: stringSchema,
          walkConcurrency: { type: "integer" },
          operationTimeoutMs: { type: "integer" },
        },
      },
      WebdavConfigSummary: {
        type: ["object", "null"],
        properties: {
          host: stringSchema,
          port: { type: "integer" },
          secure: { type: "boolean" },
          username: stringSchema,
          root: stringSchema,
          walkConcurrency: { type: "integer" },
          operationTimeoutMs: { type: "integer" },
        },
      },
      LibraryListItem: {
        type: "object",
        required: [
          "id",
          "name",
          "kind",
          "source",
          "access_mode",
          "path",
          "watch_enabled",
          "created_at",
          "updated_at",
          "sharedUserIds",
          "latestScanJob",
          "scanActive",
        ],
        properties: {
          id: stringSchema,
          name: stringSchema,
          kind: { type: "string", enum: ["movie", "tv"] },
          source: { type: "string", enum: ["local", "sftp", "webdav"] },
          access_mode: { type: "string", enum: ["all", "shared"] },
          path: stringSchema,
          config_json: nullableStringSchema,
          watch_enabled: { type: "integer" },
          scan_interval_minutes: nullableIntegerSchema,
          last_scheduled_scan_at: nullableStringSchema,
          created_at: stringSchema,
          updated_at: stringSchema,
          sftpConfig: { $ref: "#/components/schemas/SftpConfigSummary" },
          webdavConfig: { $ref: "#/components/schemas/WebdavConfigSummary" },
          sharedUserIds: {
            type: "array",
            items: stringSchema,
          },
          latestScanJob: { $ref: "#/components/schemas/LatestScanJobSummary" },
          scanActive: { type: "boolean" },
        },
      },
      Library: { $ref: "#/components/schemas/LibraryListItem" },
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
      LibraryDetail: {
        type: "object",
        required: ["id", "name", "kind", "source", "access_mode", "path", "watch_enabled", "created_at", "updated_at"],
        properties: {
          id: stringSchema,
          name: stringSchema,
          kind: { type: "string", enum: ["movie", "tv"] },
          source: { type: "string", enum: ["local", "sftp", "webdav"] },
          access_mode: { type: "string", enum: ["all", "shared"] },
          path: stringSchema,
          config_json: nullableStringSchema,
          watch_enabled: { type: "integer" },
          scan_interval_minutes: nullableIntegerSchema,
          last_scheduled_scan_at: nullableStringSchema,
          created_at: stringSchema,
          updated_at: stringSchema,
        },
      },
      LibraryDetailResponse: {
        type: "object",
        required: ["library"],
        properties: {
          library: { $ref: "#/components/schemas/LibraryDetail" },
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
        description:
          "Create or update library payload. Accepted for both JSON and form-data submissions. Unknown fields are ignored. Boolean/numeric values may be submitted as strings (e.g. 'true', '1').",
        additionalProperties: true,
        properties: {
          source: {
            type: "string",
            enum: ["local", "sftp", "webdav"],
            description: "Library storage source. Defaults to 'local' when omitted.",
          },
          kind: {
            type: "string",
            enum: ["movie", "tv"],
            description: "Media kind. Defaults to 'movie' on create when omitted.",
          },
          name: stringSchema,
          path: { ...stringSchema, description: "Absolute local path. Required for local libraries." },
          host: { ...stringSchema, description: "Remote host. Required for sftp and webdav libraries." },
          port: { type: "integer", description: "Remote port. Defaults to 22 for sftp and 443 for webdav." },
          username: { ...stringSchema, description: "Remote username. Required for sftp and webdav." },
          password: { ...stringSchema, description: "Remote password. Required on create for sftp and webdav." },
          root: { ...stringSchema, description: "Root directory on the remote server." },
          secure: {
            type: "boolean",
            description: "Use HTTPS for webdav. May also be sent as 'useHttps' or 'use_https'. Defaults to true.",
          },
          walkConcurrency: { type: "integer", description: "Concurrent directory traversal limit. Default 4." },
          operationTimeoutMs: {
            type: "integer",
            description: "Remote operation timeout in milliseconds. Default 30000.",
          },
          watchEnabled: {
            type: "boolean",
            description: "Enable filesystem watching. May also be sent as 'watch_enabled'. Default true.",
          },
          scanIntervalMinutes: {
            ...nullableIntegerSchema,
            description:
              "Automatic scan interval in minutes. May also be sent as 'scan_interval_minutes'. Null disables scheduled scans.",
          },
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
      ScanStartResponse: {
        type: "string",
        description: "Scan job identifier returned when a library scan starts or reuses an active job.",
      },
      MetadataRefreshResponse: {
        oneOf: [
          {
            type: "object",
            required: ["status", "mediaItemId"],
            properties: {
              status: { type: "string", enum: ["matched", "unmatched"] },
              mediaItemId: stringSchema,
            },
          },
          {
            type: "object",
            required: ["status", "mediaItemId"],
            properties: {
              status: { type: "string", enum: ["missing"] },
              mediaItemId: { type: "null" },
            },
          },
          {
            type: "object",
            required: ["status", "mediaItemId", "matchedSeasons", "unmatchedSeasons", "addedEpisodes"],
            properties: {
              status: { type: "string", enum: ["matched"] },
              mediaItemId: stringSchema,
              matchedSeasons: { type: "integer", minimum: 0 },
              unmatchedSeasons: { type: "integer", minimum: 0 },
              addedEpisodes: { type: "integer", minimum: 0 },
            },
          },
          {
            type: "object",
            required: ["status", "mediaItemId"],
            properties: {
              status: { type: "string", enum: ["unmatched", "no_seasons"] },
              mediaItemId: stringSchema,
            },
          },
        ],
      },
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
          "movieMetadataRefreshIntervalHours",
          "tvMetadataRefreshIntervalHours",
          "movieMetadataStalenessDays",
          "tvMetadataStalenessDays",
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
          movieMetadataRefreshIntervalHours: nullableIntegerSchema,
          tvMetadataRefreshIntervalHours: nullableIntegerSchema,
          movieMetadataStalenessDays: {
            type: "integer",
            minimum: 0,
            maximum: 3650,
            description:
              "Scheduled movie metadata staleness window in days. Default 30. Use 0 to refresh all movies each run.",
          },
          tvMetadataStalenessDays: {
            type: "integer",
            minimum: 0,
            maximum: 3650,
            description:
              "Scheduled TV metadata staleness window in days. Default 14. Use 0 to refresh all seasons each run.",
          },
          transcodePolicy: { $ref: "#/components/schemas/TranscodePolicy" },
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
          movieMetadataRefreshIntervalHours: {
            ...nullableIntegerSchema,
            description:
              "Scheduled movie metadata refresh interval, in whole hours. Null or 0 disables scheduled refresh.",
          },
          tvMetadataRefreshIntervalHours: {
            ...nullableIntegerSchema,
            description:
              "Scheduled TV metadata refresh interval, in whole hours. Null or 0 disables scheduled refresh.",
          },
          movieMetadataStalenessDays: {
            ...nullableIntegerSchema,
            description:
              "On scheduled movie metadata refresh, skip movies updated within this window. Default 30. Use 0 to refresh all movies each run.",
          },
          tvMetadataStalenessDays: {
            ...nullableIntegerSchema,
            description:
              "On scheduled TV metadata refresh, skip seasons updated within this window. Default 14. Use 0 to refresh all seasons each run.",
          },
        },
      },
      TranscodingSettingsRequest: {
        type: "object",
        properties: {
          transcodingEnabled: { type: "boolean" },
          hardwareAcceleration: {
            type: "string",
            enum: [...HARDWARE_ACCELERATION_MODES],
            description: "Hardware acceleration mode. Unsupported values are treated as 'off'.",
          },
          hardwareAccelerationRequired: { type: "boolean" },
          transcodeQualityPreset: {
            type: "string",
            enum: [...TRANSCODE_QUALITY_PRESETS],
            description: "Transcode quality preset. Unsupported values fall back to 'auto'.",
          },
          playbackSessionArtifactMaxBytes: {
            ...nullableIntegerSchema,
            enum: [null, ...PLAYBACK_SESSION_ARTIFACT_MAX_BYTES_OPTIONS],
            description:
              "Combined byte limit for playback-sessions playlists and playback-cache segments. Invalid values fall back to the default.",
          },
          encodeAheadSegmentCount: {
            type: "integer",
            minimum: 1,
            description: "Request-driven HLS encode-ahead window in segments.",
          },
          playbackCacheTtlHours: {
            type: "number",
            exclusiveMinimum: true,
            minimum: 0,
            description:
              "Idle TTL for unreferenced shared HLS cache entries, in hours. Values at or below 0 are ignored.",
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
          { $ref: "#/components/schemas/SettingsJobStartResponse" },
          { $ref: "#/components/schemas/ScanAllLibrariesResponse" },
        ],
      },
      ScanAllLibrariesResponse: {
        type: "object",
        required: ["libraries", "jobIds"],
        description: "Result of `scanAll`.",
        properties: {
          libraries: {
            type: "integer",
            minimum: 0,
            description: "Number of libraries queued for scanning.",
          },
          jobIds: {
            type: "array",
            items: stringSchema,
            description: "Scan job identifiers started or reused for each library.",
          },
        },
      },
      SettingsJobStartResponse: {
        type: "object",
        required: ["id", "existing"],
        description: "Result of metadata refresh or media probe repair actions that enqueue a background job.",
        properties: {
          id: {
            ...stringSchema,
            description: "Background job identifier.",
          },
          existing: {
            type: "boolean",
            description: "Whether an active job was reused instead of creating a new one.",
          },
        },
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
        required: ["mediaFileId"],
        properties: {
          mediaFileId: stringSchema,
          completed: { type: "boolean" },
        },
      },
      SeasonWatchedRequest: {
        type: "object",
        properties: {
          completed: { type: "boolean" },
        },
      },
      PlaybackProgressRequest: {
        type: "object",
        required: ["mediaFileId"],
        properties: {
          mediaFileId: stringSchema,
          positionSeconds: { type: "number", minimum: 0 },
          durationSeconds: nullableNumberSchema,
          completed: { type: "boolean" },
        },
      },
      WatchlistToggleRequest: {
        type: "object",
        required: ["mediaItemId"],
        properties: {
          mediaItemId: stringSchema,
        },
      },
      WatchlistToggleResponse: {
        type: "object",
        required: ["ok", "inWatchlist"],
        properties: {
          ok: { type: "boolean", enum: [true] },
          inWatchlist: { type: "boolean" },
        },
      },
      WatchlistStatusResponse: {
        type: "object",
        required: ["inWatchlist"],
        properties: {
          inWatchlist: { type: "boolean" },
        },
      },
      WatchlistPageResponse: {
        type: "object",
        required: ["movies", "moviesPage", "shows", "showsPage"],
        properties: {
          movies: {
            type: "array",
            items: { $ref: "#/components/schemas/MovieSummary" },
          },
          moviesPage: { $ref: "#/components/schemas/PageMetadata" },
          shows: {
            type: "array",
            items: { $ref: "#/components/schemas/ShowSummary" },
          },
          showsPage: { $ref: "#/components/schemas/PageMetadata" },
        },
      },
      WatchlistMoviesResponse: {
        type: "object",
        required: ["movies", "pageInfo"],
        properties: {
          movies: {
            type: "array",
            items: { $ref: "#/components/schemas/MovieSummary" },
          },
          pageInfo: { $ref: "#/components/schemas/PageMetadata" },
        },
      },
      WatchlistShowsResponse: {
        type: "object",
        required: ["shows", "pageInfo"],
        properties: {
          shows: {
            type: "array",
            items: { $ref: "#/components/schemas/ShowSummary" },
          },
          pageInfo: { $ref: "#/components/schemas/PageMetadata" },
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
