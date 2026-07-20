<script lang="ts">
  import {
    METADATA_REFRESH_FIELDS,
    METADATA_REFRESH_INTERVAL_OPTIONS,
    type MetadataRefreshKind,
  } from "$lib/metadata/refresh";
  import { DEFAULT_MOVIE_METADATA_STALENESS_DAYS, DEFAULT_TV_METADATA_STALENESS_DAYS } from "$lib/metadata/settings";

  let {
    tmdbAccessTokenSaved,
    tmdbApiKeySaved,
    metadataError,
    movieMetadataRefreshIntervalHours,
    tvMetadataRefreshIntervalHours,
    movieMetadataStalenessDays,
    tvMetadataStalenessDays,
  }: {
    tmdbAccessTokenSaved: boolean;
    tmdbApiKeySaved: boolean;
    metadataError?: string;
    movieMetadataRefreshIntervalHours: number | null;
    tvMetadataRefreshIntervalHours: number | null;
    movieMetadataStalenessDays: number;
    tvMetadataStalenessDays: number;
  } = $props();

  let tmdbAccessToken = $state("");
  let tmdbApiKey = $state("");
  let clearTmdbAccessToken = $state(false);
  let clearTmdbApiKey = $state(false);
  let intervalHours = $state<Record<MetadataRefreshKind, string>>({ movie: "", tv: "" });
  let stalenessDays = $state<Record<MetadataRefreshKind, string>>({
    movie: String(DEFAULT_MOVIE_METADATA_STALENESS_DAYS),
    tv: String(DEFAULT_TV_METADATA_STALENESS_DAYS),
  });

  $effect(() => {
    intervalHours = {
      movie: movieMetadataRefreshIntervalHours === null ? "" : String(movieMetadataRefreshIntervalHours),
      tv: tvMetadataRefreshIntervalHours === null ? "" : String(tvMetadataRefreshIntervalHours),
    };
    stalenessDays = {
      movie: String(movieMetadataStalenessDays),
      tv: String(tvMetadataStalenessDays),
    };
  });

  const metadataChanged = $derived(
    tmdbAccessToken.trim().length > 0 ||
      tmdbApiKey.trim().length > 0 ||
      clearTmdbAccessToken ||
      clearTmdbApiKey ||
      intervalHours.movie !==
        (movieMetadataRefreshIntervalHours === null ? "" : String(movieMetadataRefreshIntervalHours)) ||
      intervalHours.tv !== (tvMetadataRefreshIntervalHours === null ? "" : String(tvMetadataRefreshIntervalHours)) ||
      stalenessDays.movie !== String(movieMetadataStalenessDays) ||
      stalenessDays.tv !== String(tvMetadataStalenessDays),
  );
</script>

<form class="ops-panel" method="POST" action="?/saveMetadata">
  <div class="ops-panel-header">
    <div>
      <h2>TMDb metadata</h2>
      <p class="muted">Movie and TV metadata lookup.</p>
    </div>
  </div>

  <div class="ops-panel-body">
    <p class="muted detail-copy">
      Provide either a TMDb read access token or an API key. You do not need both. A read access token is preferred.
    </p>

    <label>
      TMDb access token
      <input
        name="tmdbAccessToken"
        type="text"
        bind:value={tmdbAccessToken}
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        placeholder={tmdbAccessTokenSaved ? "Configured" : "Read access token"}
      />
    </label>

    {#if tmdbAccessTokenSaved}
      <label class="check subdued">
        <input type="checkbox" name="clearTmdbAccessToken" bind:checked={clearTmdbAccessToken} />
        <span>Clear saved TMDb access token</span>
      </label>
    {/if}

    <label>
      TMDb API key
      <input
        name="tmdbApiKey"
        type="text"
        bind:value={tmdbApiKey}
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        placeholder={tmdbApiKeySaved ? "Configured" : "API key"}
      />
    </label>

    {#if tmdbApiKeySaved}
      <label class="check subdued">
        <input type="checkbox" name="clearTmdbApiKey" bind:checked={clearTmdbApiKey} />
        <span>Clear saved TMDb API key</span>
      </label>
    {/if}

    <fieldset class="metadata-refresh">
      <legend>Scheduled metadata refresh</legend>

      <p class="muted detail-copy">
        Interval sets how often Lunarr starts a background TMDb refresh. Staleness limits scheduled runs to movies or
        seasons not updated within that many days. Use 0 to refresh everything each run. Manual refresh from Settings
        actions still updates all matched titles and ignores staleness.
      </p>

      <div class="metadata-refresh-columns">
        {#each METADATA_REFRESH_FIELDS as field (field.kind)}
          <div>
            <h3>{field.title}</h3>
            <label>
              Interval
              <select name={field.intervalField} bind:value={intervalHours[field.kind]}>
                {#each METADATA_REFRESH_INTERVAL_OPTIONS as option (option.value)}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>
            </label>

            <label>
              Staleness (days)
              <input
                name={field.stalenessField}
                type="number"
                min="0"
                max="3650"
                step="1"
                bind:value={stalenessDays[field.kind]}
              />
            </label>
          </div>
        {/each}
      </div>
    </fieldset>

    {#if metadataError}
      <p class="error">{metadataError}</p>
    {/if}
    <button disabled={!metadataChanged}>Save metadata</button>
  </div>
</form>

<style>
  .metadata-refresh {
    margin-top: var(--space-4);
  }

  .metadata-refresh-columns {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1.25rem;
    margin-top: 0.75rem;
  }

  .metadata-refresh-columns h3 {
    margin: 0 0 var(--space-2);
    font-size: 0.9rem;
  }

  .metadata-refresh-columns label {
    display: grid;
    gap: 0.35rem;
    margin-bottom: 0.75rem;
  }
</style>
