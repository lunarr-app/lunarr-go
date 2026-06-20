<script lang="ts">
  import { RefreshCw, ScanSearch, SearchCheck, Wrench } from "@lucide/svelte";

  let {
    tmdbConfigured,
    tmdbTestMessage,
    tmdbTestOk,
    metadataError,
    metadataMessage,
    tvMetadataError,
    tvMetadataMessage,
    scanError,
    scanMessage,
    probeError,
    probeMessage,
  }: {
    tmdbConfigured: boolean;
    tmdbTestMessage?: string;
    tmdbTestOk?: boolean;
    metadataError?: string;
    metadataMessage?: string;
    tvMetadataError?: string;
    tvMetadataMessage?: string;
    scanError?: string;
    scanMessage?: string;
    probeError?: string;
    probeMessage?: string;
  } = $props();
</script>

<section class="ops-panel maintenance-panel" aria-label="Settings actions">
  <div class="ops-panel-header">
    <div>
      <h2>Actions</h2>
      <p class="muted">Checks, metadata repair, and scans.</p>
    </div>
  </div>

  <div class="ops-panel-body">
    {#if !tmdbConfigured}
      <p class="muted action-note">TMDb actions need metadata credentials.</p>
    {/if}

    <div class="action-row">
      <div class="action-copy">
        <h3>TMDb connection</h3>
        <p class="muted">Validate the active credential.</p>
        {#if tmdbTestMessage}
          <p class:error={tmdbTestOk === false}>
            {tmdbTestMessage}
          </p>
        {/if}
      </div>
      <form method="POST" action="?/testTmdb">
        <button class="secondary compact-action">
          <SearchCheck size={16} aria-hidden="true" />
          Test
        </button>
      </form>
    </div>

    <div class="action-row">
      <div class="action-copy">
        <h3>Metadata repair</h3>
        <p class="muted">Refresh stored TMDb data.</p>
        <div class="action-messages">
          {#if metadataError}
            <p class="error">{metadataError}</p>
          {/if}
          {#if metadataMessage}
            <p>{metadataMessage}</p>
          {/if}
          {#if tvMetadataError}
            <p class="error">{tvMetadataError}</p>
          {/if}
          {#if tvMetadataMessage}
            <p>{tvMetadataMessage}</p>
          {/if}
        </div>
      </div>
      <div class="button-group">
        <form method="POST" action="?/refreshMetadata">
          <button class="secondary compact-action" disabled={!tmdbConfigured}>
            <RefreshCw size={16} aria-hidden="true" />
            Movies
          </button>
        </form>
        <form method="POST" action="?/refreshTvMetadata">
          <button class="secondary compact-action" disabled={!tmdbConfigured}>
            <RefreshCw size={16} aria-hidden="true" />
            TV
          </button>
        </form>
      </div>
    </div>

    <div class="action-row">
      <div class="action-copy">
        <h3>Library scans</h3>
        <p class="muted">Detect file additions, changes, and removals.</p>
        {#if scanError}
          <p class="error">{scanError}</p>
        {/if}
        {#if scanMessage}
          <p>{scanMessage}</p>
        {/if}
      </div>
      <form method="POST" action="?/scanAll">
        <button class="secondary compact-action">
          <ScanSearch size={16} aria-hidden="true" />
          Scan all
        </button>
      </form>
    </div>

    <div class="action-row">
      <div class="action-copy">
        <h3>Media probes</h3>
        <p class="muted">Backfill duration and codec details for playback.</p>
        {#if probeError}
          <p class="error">{probeError}</p>
        {/if}
        {#if probeMessage}
          <p>{probeMessage}</p>
        {/if}
      </div>
      <form method="POST" action="?/repairMediaProbes">
        <button class="secondary compact-action">
          <Wrench size={16} aria-hidden="true" />
          Repair
        </button>
      </form>
    </div>
  </div>
</section>

<style>
  h2,
  h3 {
    margin: 0;
  }

  h2 {
    font-size: 1.02rem;
  }

  h3 {
    font-size: 0.95rem;
  }

  .maintenance-panel {
    align-self: start;
  }

  .action-note {
    border: 1px solid var(--color-warning-border);
    border-radius: 8px;
    background: var(--color-warning-soft);
    padding: 0.5rem 0.6rem;
    font-size: 0.86rem;
  }

  .action-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.75rem;
    border-top: 1px solid var(--color-border);
    padding-top: 0.65rem;
  }

  .action-copy,
  .action-messages {
    display: grid;
    gap: 0.2rem;
    min-width: 0;
  }

  .action-row form,
  .button-group {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    justify-content: flex-end;
    margin: 0;
  }

  .compact-action {
    min-height: 2rem;
    padding: 0 0.65rem;
    font-size: 0.86rem;
  }

  @media (max-width: 920px) {
    .action-row {
      grid-template-columns: 1fr;
    }

    .action-row form,
    .button-group {
      justify-self: start;
      justify-content: flex-start;
    }
  }
</style>
