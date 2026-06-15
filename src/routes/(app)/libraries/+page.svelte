<script lang="ts">
  import ConfirmAction from "$lib/components/ConfirmAction.svelte";
  import LibraryAutomationFields from "./_components/LibraryAutomationFields.svelte";
  import LibraryEditModal from "./_components/LibraryEditModal.svelte";
  import LibrarySharingModal from "./_components/LibrarySharingModal.svelte";
  import RemoteLibraryFields from "./_components/RemoteLibraryFields.svelte";
  import type { RemoteLibraryFieldValues } from "./_components/libraryRemoteFieldValues";
  import { CirclePlus, Settings, TriangleAlert } from "@lucide/svelte";
  import type { PageData } from "./$types";

  let { data, form } = $props();

  const formData = $derived((form ?? {}) as Record<string, string>);
  let selectedSource = $state("local");
  let editingLibrary = $state<PageData["libraries"][number] | null>(null);
  let sharingLibrary = $state<PageData["libraries"][number] | null>(null);

  $effect(() => {
    if (formData.source) selectedSource = formData.source;
  });

  function addRemoteFieldValues(): RemoteLibraryFieldValues {
    return {
      host: formData.host ?? "",
      port: formData.port ?? (selectedSource === "sftp" ? "22" : "443"),
      username: formData.username ?? "",
      walkConcurrency: formData.walkConcurrency ?? "4",
      operationTimeoutMs: formData.operationTimeoutMs ?? "30000",
      root: formData.root ?? "",
      secure: (formData.secure ?? "1") !== "0",
    };
  }

  function scanIntervalLabel(value: number | string | null | undefined) {
    const minutes = Number(value);
    if (!Number.isFinite(minutes) || minutes <= 0) return "off";
    if (minutes === 15) return "every 15 minutes";
    if (minutes === 60) return "hourly";
    if (minutes === 360) return "every 6 hours";
    if (minutes === 720) return "every 12 hours";
    if (minutes === 1440) return "daily";
    return `every ${minutes} minutes`;
  }

  function automationSummary(library: { source: string; watch_enabled: number; scan_interval_minutes: number | null }) {
    const scheduled = `scheduled ${scanIntervalLabel(library.scan_interval_minutes)}`;
    if (library.source !== "local") return scheduled;
    return `watcher ${library.watch_enabled === 0 ? "off" : "on"} - ${scheduled}`;
  }

  function formatTime(value: string | null | undefined) {
    if (!value) return "Not yet";
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  }
</script>

<svelte:head>
  <title>Libraries - Lunarr</title>
  <meta
    name="description"
    content="Add local, SFTP, and WebDAV movie sources, manage configured libraries, and start scans."
  />
</svelte:head>

<header class="ops-page-header">
  <div>
    <h1>Libraries</h1>
    <p class="muted">Add movie and TV sources and start scans.</p>
  </div>
</header>

{#if !data.tmdbConfigured}
  <section class="notice">
    <TriangleAlert size={20} aria-hidden="true" />
    <div>
      <strong>TMDb is not configured</strong>
      <p class="muted">
        Scans will add playable local files, but posters, backdrops, runtime, and overviews need a TMDb token or API
        key.
      </p>
    </div>
    <a class="button secondary" href="/settings">
      <Settings size={16} aria-hidden="true" />
      Settings
    </a>
  </section>
{/if}

<section class="content">
  <form class="ops-panel" method="POST" action="?/add">
    <div class="ops-panel-header">
      <div>
        <h2>Add library</h2>
        <p class="muted">Create a local, SFTP, or WebDAV source.</p>
      </div>
    </div>

    <div class="ops-panel-body">
      <label>
        Name
        <input name="name" value={formData.name ?? ""} placeholder="Movies" />
      </label>
      <label>
        Type
        <select name="kind">
          <option value="movie" selected={(formData.kind ?? "movie") === "movie"}>Movies</option>
          <option value="tv" selected={formData.kind === "tv"}>TV shows</option>
        </select>
      </label>
      <label>
        Source
        <select name="source" bind:value={selectedSource}>
          <option value="local">Local folder</option>
          <option value="sftp">SFTP</option>
          <option value="webdav">WebDAV</option>
        </select>
      </label>
      {#if selectedSource === "sftp"}
        <RemoteLibraryFields protocol="sftp" values={addRemoteFieldValues()} />
      {:else if selectedSource === "webdav"}
        <RemoteLibraryFields protocol="webdav" values={addRemoteFieldValues()} />
      {:else}
        <label>
          Folder path
          <input name="path" value={formData.path ?? ""} placeholder="/Volumes/Media" autocomplete="off" />
        </label>
      {/if}
      <LibraryAutomationFields
        showWatch={selectedSource === "local"}
        watchEnabled={(formData.watchEnabled ?? "1") !== "0"}
        scanIntervalMinutes={formData.scanIntervalMinutes ?? null}
      />
      {#if form?.addError}
        <p class="error">{form.addError}</p>
      {/if}
      <button>
        <CirclePlus size={16} aria-hidden="true" />
        Add library
      </button>
    </div>
  </form>

  <div class="ops-panel">
    <div class="ops-panel-header">
      <div>
        <h2>Configured libraries</h2>
        <p class="muted">{data.libraries.length} sources configured.</p>
      </div>
    </div>

    {#if form?.libraryActionError}
      <div class="ops-panel-body">
        <p class="error">{form.libraryActionError}</p>
      </div>
    {/if}

    <div class="ops-table">
      {#each data.libraries as library}
        <article class="ops-row">
          <div class="library-summary">
            <strong>{library.name}</strong>
            <span class="muted"
              >{library.kind === "tv" ? "TV shows" : "Movies"} - {library.source}
              - {library.path}</span
            >
            <span class="muted">{automationSummary(library)}</span>
            {#if library.latestScanJob}
              <span class:active={library.scanActive} class="scan-status">
                {library.latestScanJob.status} - seen {library.latestScanJob.files_seen}, added {library.latestScanJob
                  .files_added}, updated {library.latestScanJob.files_updated}, removed {library.latestScanJob
                  .files_removed}, errors {library.latestScanJob.errors_count}
              </span>
              <span class="muted">
                {library.latestScanJob.finished_at
                  ? `Finished ${formatTime(library.latestScanJob.finished_at)}`
                  : `Started ${formatTime(library.latestScanJob.started_at ?? library.latestScanJob.created_at)}`}
              </span>
            {:else}
              <span class="muted">No scans yet.</span>
            {/if}
          </div>
          <div class="actions" role="toolbar" aria-label={`Actions for ${library.name}`}>
            <button
              class="ops-action-link"
              type="button"
              disabled={library.scanActive}
              onclick={() => {
                editingLibrary = library;
              }}
            >
              Edit
            </button>
            <button
              class="ops-action-link"
              type="button"
              onclick={() => {
                sharingLibrary = library;
              }}
            >
              Sharing
            </button>
            <form method="POST" action="?/scan">
              <input type="hidden" name="libraryId" value={library.id} />
              <button class="ops-action-link" disabled={library.scanActive}>
                {library.scanActive ? "Scanning…" : "Scan"}
              </button>
            </form>
            <ConfirmAction
              action="?/delete"
              fieldName="libraryId"
              fieldValue={library.id}
              title={`Remove ${library.name}?`}
              message="This removes the library from Lunarr and deletes media records that are not referenced by another library. Files on disk, SFTP, or WebDAV are not deleted."
              confirmLabel="Remove library"
              disabled={library.scanActive}
              buttonClass="ops-action-link danger"
            >
              Remove
            </ConfirmAction>
          </div>
        </article>
      {:else}
        <p class="muted">No libraries configured.</p>
      {/each}
    </div>
  </div>
</section>

{#if editingLibrary}
  <LibraryEditModal library={editingLibrary} onClose={() => (editingLibrary = null)} />
{/if}

{#if sharingLibrary}
  <LibrarySharingModal library={sharingLibrary} users={data.users} onClose={() => (sharingLibrary = null)} />
{/if}

<style>
  .content {
    display: grid;
    grid-template-columns: minmax(18rem, 26rem) minmax(0, 1fr);
    gap: 1rem;
    align-items: start;
    margin-top: 1rem;
  }

  .notice {
    width: min(100%, 64rem);
    margin: 1rem 0;
    border: 1px solid var(--color-warning-border);
    border-radius: 8px;
    background: var(--color-warning-soft);
    padding: 0.9rem 1rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .notice > :global(svg) {
    flex-shrink: 0;
    color: var(--color-warning);
  }

  .notice p {
    margin: 0.25rem 0 0;
  }

  .content .ops-panel-body {
    gap: 1rem;
    padding: 1rem;
  }

  .ops-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 0.75rem 1rem;
    padding: 0.8rem 1rem;
  }

  .library-summary {
    display: grid;
    gap: 0.2rem;
    min-width: 0;
  }

  .ops-row span {
    overflow-wrap: anywhere;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;
    justify-content: flex-end;
  }

  .actions form {
    margin: 0;
  }

  .scan-status {
    color: var(--color-accent);
    font-size: 0.92rem;
  }

  .scan-status.active {
    color: var(--color-success);
  }

  @media (max-width: 860px) {
    .content {
      grid-template-columns: 1fr;
    }

    .notice {
      align-items: stretch;
      flex-direction: column;
    }

    .ops-row {
      grid-template-columns: 1fr;
    }

    .actions {
      justify-content: flex-start;
    }
  }
</style>
