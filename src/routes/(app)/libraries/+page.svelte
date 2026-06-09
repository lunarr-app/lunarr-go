<script lang="ts">
  import ConfirmAction from "$lib/components/ConfirmAction.svelte";
  import { CirclePlus, RefreshCw, Save, Settings, Trash2, TriangleAlert } from "@lucide/svelte";

  let { data, form } = $props();

  const formData = $derived((form ?? {}) as Record<string, string>);
  let selectedSource = $state("local");
  let editingLibraryId = $state<string | null>(null);

  $effect(() => {
    if (formData.source) selectedSource = formData.source;
  });

  function formatTime(value: string | null | undefined) {
    if (!value) return "Not yet";
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  }
</script>

<svelte:head>
  <title>Libraries - Lunarr</title>
  <meta name="description" content="Add local and SFTP movie sources, manage configured libraries, and start scans." />
</svelte:head>

<header class="page-header">
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
    <p class="muted">Scans will add playable local files, but posters, backdrops, runtime, and overviews need a TMDb token or API key.</p>
  </div>
  <a class="button secondary" href="/settings">
    <Settings size={16} aria-hidden="true" />
    Settings
  </a>
</section>
{/if}

<section class="content">
  <form class="panel" method="POST" action="?/add">
    <h2>Add library</h2>
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
      </select>
    </label>
    {#if selectedSource === "sftp"}
      <div class="source-grid">
        <label>
          Host
          <input name="host" value={formData.host ?? ""} placeholder="sftp.example.com" />
        </label>
        <label>
          Port
          <input name="port" inputmode="numeric" value={formData.port ?? "22"} placeholder="22" />
        </label>
        <label class="wide">
          Username
          <input name="username" value={formData.username ?? ""} placeholder="mediauser" />
        </label>
        <label class="wide">
          Password
          <input name="password" value="" autocomplete="off" />
        </label>
        <label>
          Walk concurrency
          <input
            name="walkConcurrency"
            type="number"
            min="1"
            max="32"
            value={formData.walkConcurrency ?? "4"}
          />
        </label>
        <label>
          Timeout ms
          <input
            name="operationTimeoutMs"
            type="number"
            min="5000"
            max="300000"
            step="1000"
            value={formData.operationTimeoutMs ?? "30000"}
          />
        </label>
      </div>
      <label>
        Root path
        <input name="root" value={formData.root ?? ""} placeholder="/media" autocomplete="off" />
      </label>
    {:else}
      <label>
        Folder path
        <input name="path" value={formData.path ?? ""} placeholder="/Volumes/Media" autocomplete="off" />
      </label>
    {/if}
    {#if form?.addError}
      <p class="error">{form.addError}</p>
    {/if}
    <button>
      <CirclePlus size={16} aria-hidden="true" />
      Add library
    </button>
  </form>

  <div class="panel">
    <h2>Configured libraries</h2>
    {#if form?.libraryActionError}
      <p class="error">{form.libraryActionError}</p>
    {/if}
    <div class="list">
      {#each data.libraries as library}
        <article>
          <div class="library-summary">
            <strong>{library.name}</strong>
            <span class="muted">{library.kind === "tv" ? "TV shows" : "Movies"} - {library.source} - {library.path}</span>
            {#if library.latestScanJob}
              <span class:active={library.scanActive} class="scan-status">
                {library.latestScanJob.status} - seen {library.latestScanJob.files_seen}, added {library.latestScanJob.files_added}, updated {library.latestScanJob.files_updated}, removed {library.latestScanJob.files_removed}, errors {library.latestScanJob.errors_count}
              </span>
              <span class="muted">
                {library.latestScanJob.finished_at ? `Finished ${formatTime(library.latestScanJob.finished_at)}` : `Started ${formatTime(library.latestScanJob.started_at ?? library.latestScanJob.created_at)}`}
              </span>
            {:else}
              <span class="muted">No scans yet.</span>
            {/if}
          </div>
          <div class="actions">
            <button
              class="secondary compact-action"
              type="button"
              aria-expanded={editingLibraryId === library.id}
              onclick={() => {
                editingLibraryId = editingLibraryId === library.id ? null : library.id;
              }}
            >
              {editingLibraryId === library.id ? "Close" : "Edit"}
            </button>
            <form method="POST" action="?/scan">
              <input type="hidden" name="libraryId" value={library.id} />
              <button class="secondary compact-action" disabled={library.scanActive}>
                <RefreshCw size={16} aria-hidden="true" />
                {library.scanActive ? "Scanning" : "Scan"}
              </button>
            </form>
            <ConfirmAction
              action="?/delete"
              fieldName="libraryId"
              fieldValue={library.id}
              title={`Remove ${library.name}?`}
              message="This removes the library from Lunarr and deletes media records that are not referenced by another library. Files on disk or SFTP are not deleted."
              confirmLabel="Remove library"
              disabled={library.scanActive}
              buttonClass="secondary danger compact-action"
            >
              <Trash2 size={16} aria-hidden="true" />
              Remove
            </ConfirmAction>
          </div>
          {#if editingLibraryId === library.id}
          <div class="edit-panel">
            <form method="POST" action="?/edit">
              <input type="hidden" name="libraryId" value={library.id} />
              <input type="hidden" name="source" value={library.source} />
              <label>
                Name
                <input name="name" value={library.name} />
              </label>
              {#if library.source === "sftp"}
                <div class="source-grid">
                  <label>
                    Host
                    <input name="host" value={library.sftpConfig?.host ?? ""} placeholder="sftp.example.com" />
                  </label>
                  <label>
                    Port
                    <input name="port" inputmode="numeric" value={library.sftpConfig?.port ?? 22} placeholder="22" />
                  </label>
                  <label class="wide">
                    Username
                    <input name="username" value={library.sftpConfig?.username ?? ""} placeholder="mediauser" />
                  </label>
                  <label class="wide">
                    Password
                    <input name="password" value="" autocomplete="off" placeholder="Leave blank to keep current password" />
                  </label>
                  <label>
                    Walk concurrency
                    <input
                      name="walkConcurrency"
                      type="number"
                      min="1"
                      max="32"
                      value={library.sftpConfig?.walkConcurrency ?? 4}
                    />
                  </label>
                  <label>
                    Timeout ms
                    <input
                      name="operationTimeoutMs"
                      type="number"
                      min="5000"
                      max="300000"
                      step="1000"
                      value={library.sftpConfig?.operationTimeoutMs ?? 30000}
                    />
                  </label>
                </div>
                <label>
                  Root path
                  <input name="root" value={library.sftpConfig?.root ?? ""} placeholder="media/movies" autocomplete="off" />
                </label>
              {:else}
                <label>
                  Folder path
                  <input name="path" value={library.path} placeholder="/Volumes/Media/Movies" autocomplete="off" />
                </label>
              {/if}
              <button class="secondary" disabled={library.scanActive}>
                <Save size={16} aria-hidden="true" />
                Save changes
              </button>
              {#if library.scanActive}
                <p class="muted">Finish or cancel the active scan before editing this library.</p>
              {/if}
            </form>
            <form method="POST" action="?/access">
              <input type="hidden" name="libraryId" value={library.id} />
              <fieldset>
                <legend>Sharing</legend>
                <label class="check subdued">
                  <input
                    type="radio"
                    name="accessMode"
                    value="all"
                    checked={library.access_mode !== "shared"}
                  />
                  <span>All users</span>
                </label>
                <label class="check subdued">
                  <input
                    type="radio"
                    name="accessMode"
                    value="shared"
                    checked={library.access_mode === "shared"}
                  />
                  <span>Selected users</span>
                </label>
                <div class="share-list">
                  {#each data.users as user}
                    <label class="check subdued">
                      <input
                        type="checkbox"
                        name="userIds"
                        value={user.id}
                        checked={library.sharedUserIds.includes(user.id)}
                      />
                      <span>{user.name} <small>{user.email}</small></span>
                    </label>
                  {:else}
                    <p class="muted">No regular users yet.</p>
                  {/each}
                </div>
              </fieldset>
              <button class="secondary">
                <Save size={16} aria-hidden="true" />
                Save sharing
              </button>
            </form>
          </div>
          {/if}
        </article>
      {:else}
        <p class="muted">No libraries configured.</p>
      {/each}
    </div>
  </div>
</section>

<style>
  h1 {
    margin: 0 0 0.25rem;
    font-size: clamp(1.55rem, 2.4vw, 2.25rem);
  }

  .content {
    display: grid;
    grid-template-columns: minmax(18rem, 26rem) minmax(0, 1fr);
    gap: 1rem;
    align-items: start;
  }

  .notice {
    width: min(100%, 64rem);
    margin: 1rem 0;
    border: 1px solid rgba(214, 163, 84, 0.35);
    border-radius: 8px;
    background: rgba(214, 163, 84, 0.08);
    padding: 0.9rem 1rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .notice > :global(svg) {
    flex-shrink: 0;
    color: #d6a354;
  }

  .notice p {
    margin: 0.25rem 0 0;
  }

  .panel {
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.04);
    padding: 1rem;
    display: grid;
    gap: 1rem;
    align-content: start;
  }

  h2 {
    margin: 0;
  }

  .source-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 6rem;
    gap: 0.75rem;
  }

  .source-grid .wide {
    grid-column: 1 / -1;
  }

  .list {
    display: grid;
  }

  article {
    display: grid;
    gap: 1rem;
    padding: 0.75rem 0;
  }

  article + article {
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  article:first-child {
    padding-top: 0;
  }

  article:last-child {
    padding-bottom: 0;
  }

  .library-summary {
    display: grid;
    gap: 0.2rem;
    min-width: 0;
  }

  article span {
    overflow-wrap: anywhere;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    justify-content: flex-start;
  }

  .actions form {
    margin: 0;
  }

  .actions :global(.compact-action),
  .compact-action {
    min-height: 2rem;
    padding: 0 0.65rem;
    font-size: 0.86rem;
  }

  .actions :global(.compact-action.danger) {
    padding: 0 0.65rem;
  }

  .edit-panel {
    display: grid;
    gap: 0.75rem;
  }

  .edit-panel form {
    display: grid;
    gap: 0.75rem;
    max-width: 34rem;
  }

  fieldset {
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 0.75rem;
    display: grid;
    gap: 0.55rem;
  }

  legend {
    padding: 0 0.25rem;
    font-weight: 700;
  }

  .share-list {
    display: grid;
    gap: 0.35rem;
    padding-top: 0.25rem;
  }

  .share-list small {
    color: var(--muted);
    margin-left: 0.25rem;
  }

  .scan-status {
    color: #00ccff;
    font-size: 0.92rem;
  }

  .scan-status.active {
    color: #8fd7a6;
  }

  @media (max-width: 860px) {
    .content {
      grid-template-columns: 1fr;
    }

    .notice {
      align-items: stretch;
      flex-direction: column;
    }

    .actions {
      justify-content: flex-start;
    }
  }
</style>
