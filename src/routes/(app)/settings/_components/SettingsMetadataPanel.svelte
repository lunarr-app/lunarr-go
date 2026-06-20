<script lang="ts">
  import { Save } from "@lucide/svelte";

  let {
    tmdbAccessTokenConfigured,
    tmdbApiKeyConfigured,
    tmdbAccessTokenSaved,
    tmdbApiKeySaved,
    metadataSaveError,
  }: {
    tmdbAccessTokenConfigured: boolean;
    tmdbApiKeyConfigured: boolean;
    tmdbAccessTokenSaved: boolean;
    tmdbApiKeySaved: boolean;
    metadataSaveError?: string;
  } = $props();

  let tmdbAccessToken = $state("");
  let tmdbApiKey = $state("");
  let clearTmdbAccessToken = $state(false);
  let clearTmdbApiKey = $state(false);

  const metadataChanged = $derived(
    tmdbAccessToken.trim().length > 0 || tmdbApiKey.trim().length > 0 || clearTmdbAccessToken || clearTmdbApiKey,
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
      Provide either a TMDb read access token or an API key; both are not required. A read access token is preferred.
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
</style>
