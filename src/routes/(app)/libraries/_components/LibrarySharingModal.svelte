<script lang="ts">
  import { Save } from "@lucide/svelte";
  import ModalDialog from "$lib/components/ModalDialog.svelte";
  import type { Library, LibraryUser } from "./types";

  let {
    library,
    users,
    onClose,
  }: {
    library: Library;
    users: LibraryUser[];
    onClose: () => void;
  } = $props();

  const subtitle = $derived(`${library.kind === "tv" ? "TV shows" : "Movies"} · ${library.source}`);
</script>

<ModalDialog
  title="Sharing for {library.name}"
  titleId="library-sharing-title"
  {subtitle}
  focusKey={library.id}
  {onClose}
>
  <form method="POST" action="?/access" class="dialog-form">
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
            <input type="checkbox" name="userIds" value={user.id} checked={library.sharedUserIds.includes(user.id)} />
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
</ModalDialog>

<style>
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
</style>
