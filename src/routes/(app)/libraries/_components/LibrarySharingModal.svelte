<script lang="ts">
  import { Save, X } from "@lucide/svelte";
  import { tick } from "svelte";
  import type { PageData } from "../$types";

  type Library = PageData["libraries"][number];
  type User = PageData["users"][number];

  let {
    library,
    users,
    onClose,
  }: {
    library: Library;
    users: User[];
    onClose: () => void;
  } = $props();

  let dialog: HTMLDivElement | null = $state(null);

  $effect(() => {
    library.id;
    void tick().then(() => dialog?.focus());
  });

  $effect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  });
</script>

<div class="overlay" role="presentation" onpointerdown={(event) => event.target === event.currentTarget && onClose()}>
  <div
    class="dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="library-sharing-title"
    tabindex="-1"
    bind:this={dialog}
  >
    <header class="dialog-header">
      <div>
        <h2 id="library-sharing-title">Sharing for {library.name}</h2>
        <p class="muted">
          {library.kind === "tv" ? "TV shows" : "Movies"} · {library.source}
        </p>
      </div>
      <button class="secondary icon-button" type="button" aria-label="Close" onclick={onClose}>
        <X size={18} aria-hidden="true" />
      </button>
    </header>

    <div class="dialog-body">
      <form method="POST" action="?/access" class="access-form">
        <input type="hidden" name="libraryId" value={library.id} />
        <fieldset>
          <legend>Who can access this library</legend>
          <label class="check subdued">
            <input type="radio" name="accessMode" value="all" checked={library.access_mode !== "shared"} />
            <span>All users</span>
          </label>
          <label class="check subdued">
            <input type="radio" name="accessMode" value="shared" checked={library.access_mode === "shared"} />
            <span>Selected users</span>
          </label>
          <div class="share-list">
            {#each users as user (user.id)}
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
        <div class="form-actions">
          <button class="secondary" type="button" onclick={onClose}>Cancel</button>
          <button class="secondary">
            <Save size={16} aria-hidden="true" />
            Save sharing
          </button>
        </div>
      </form>
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.58);
    padding: 1rem;
  }

  .dialog {
    width: min(100%, 36rem);
    max-height: min(90vh, 48rem);
    overflow: auto;
    border: 1px solid var(--color-border-strong);
    border-radius: 8px;
    background: var(--color-popover);
    box-shadow: 0 1.5rem 4rem rgba(0, 0, 0, 0.42);
    display: grid;
    gap: 0;
  }

  .dialog:focus {
    outline: none;
  }

  .dialog-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1rem 0.75rem;
    border-bottom: 1px solid var(--color-border);
  }

  .dialog-header h2 {
    margin: 0;
    font-size: 1.1rem;
  }

  .dialog-header p {
    margin: 0.25rem 0 0;
    font-size: 0.9rem;
  }

  .icon-button {
    min-height: 2rem;
    padding: 0 0.55rem;
  }

  .dialog-body {
    padding: 1rem;
  }

  .access-form {
    display: grid;
    gap: 0.75rem;
  }

  fieldset {
    border: 1px solid var(--color-border);
    border-radius: 8px;
    margin: 0;
    padding: 0.75rem;
    display: grid;
    gap: 0.55rem;
  }

  legend {
    padding: 0 0.25rem;
    font-weight: 700;
  }

  .check {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .check input[type="checkbox"],
  .check input[type="radio"] {
    width: 1rem;
    height: 1rem;
    min-height: 0;
    margin: 0;
    padding: 0;
    flex: 0 0 auto;
  }

  .share-list {
    display: grid;
    gap: 0.35rem;
    padding-top: 0.25rem;
  }

  .share-list small {
    color: var(--ops-muted);
    margin-left: 0.25rem;
  }

  .form-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.5rem;
  }
</style>
