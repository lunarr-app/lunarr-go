<script lang="ts">
  import { Save } from "@lucide/svelte";

  let {
    tmdbAccessTokenConfigured,
    tmdbApiKeyConfigured,
    tmdbAccessTokenSaved,
    tmdbApiKeySaved,
    metadataSaveError,
    movieMetadataRefreshIntervalHours,
    tvMetadataRefreshIntervalHours,
    movieMetadataStalenessDays,
    tvMetadataStalenessDays,
  }: {
    tmdbAccessTokenConfigured: boolean;
    tmdbApiKeyConfigured: boolean;
    tmdbAccessTokenSaved: boolean;
    tmdbApiKeySaved: boolean;
    metadataSaveError?: string;
    movieMetadataRefreshIntervalHours: number | null;
    tvMetadataRefreshIntervalHours: number | null;
    movieMetadataStalenessDays: number;
    tvMetadataStalenessDays: number;
  } = $props();

  let tmdbAccessToken = $state("");
  let tmdbApiKey = $state("");
  let clearTmdbAccessToken = $state(false);
  let clearTmdbApiKey = $state(false);
  let movieIntervalHours = $state("");
  let tvIntervalHours = $state("");
  let movieStalenessDays = $state("30");
  let tvStalenessDays = $state("14");

  $effect(() => {
    movieIntervalHours = movieMetadataRefreshIntervalHours === null ? "" : String(movieMetadataRefreshIntervalHours);
    tvIntervalHours = tvMetadataRefreshIntervalHours === null ? "" : String(tvMetadataRefreshIntervalHours);
    movieStalenessDays = String(movieMetadataStalenessDays);
    tvStalenessDays = String(tvMetadataStalenessDays);
  });

  const metadataChanged = $derived(
    tmdbAccessToken.trim().length > 0 ||
      tmdbApiKey.trim().length > 0 ||
      clearTmdbAccessToken ||
      clearTmdbApiKey ||
      movieIntervalHours !==
        (movieMetadataRefreshIntervalHours === null ? "" : String(movieMetadataRefreshIntervalHours)) ||
      tvIntervalHours !== (tvMetadataRefreshIntervalHours === null ? "" : String(tvMetadataRefreshIntervalHours)) ||
      movieStalenessDays !== String(movieMetadataStalenessDays) ||
      tvStalenessDays !== String(tvMetadataStalenessDays),
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
        placeholder={tmdbAccessTokenConfigured ? "Configured" : "Read access token"}
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
        placeholder={tmdbApiKeyConfigured ? "Configured" : "API key"}
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
        <div>
          <h3>Movies</h3>
          <label>
            Interval
            <select name="movieMetadataRefreshIntervalHours" bind:value={movieIntervalHours}>
              <option value="">Off</option>
              <option value="24">Daily</option>
              <option value="168">Weekly</option>
              <option value="720">Monthly</option>
            </select>
          </label>

          <label>
            Staleness (days)
            <input
              name="movieMetadataStalenessDays"
              type="number"
              min="0"
              max="3650"
              step="1"
              bind:value={movieStalenessDays}
            />
          </label>
        </div>

        <div>
          <h3>TV shows</h3>
          <label>
            Interval
            <select name="tvMetadataRefreshIntervalHours" bind:value={tvIntervalHours}>
              <option value="">Off</option>
              <option value="24">Daily</option>
              <option value="168">Weekly</option>
              <option value="720">Monthly</option>
            </select>
          </label>

          <label>
            Staleness (days)
            <input
              name="tvMetadataStalenessDays"
              type="number"
              min="0"
              max="3650"
              step="1"
              bind:value={tvStalenessDays}
            />
          </label>
        </div>
      </div>
    </fieldset>

    {#if metadataSaveError}
      <p class="error">{metadataSaveError}</p>
    {/if}
    <button disabled={!metadataChanged}>
      <Save size={16} aria-hidden="true" />
      Save metadata
    </button>
  </div>
</form>

<style>
  .detail-copy {
    line-height: 1.5;
    font-size: 0.88rem;
  }

  .metadata-refresh {
    margin-top: 1.5rem;
  }

  .metadata-refresh-columns {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1.25rem;
    margin-top: 0.75rem;
  }

  .metadata-refresh-columns h3 {
    margin: 0 0 0.5rem;
    font-size: 0.9rem;
  }

  .metadata-refresh-columns label {
    display: grid;
    gap: 0.35rem;
    margin-bottom: 0.75rem;
  }
</style>
