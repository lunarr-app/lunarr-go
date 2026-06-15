<script lang="ts">
  import { Save } from "@lucide/svelte";
  import type { PageData } from "../$types";
  import LibraryAutomationFields from "./LibraryAutomationFields.svelte";
  import LibraryDialog from "./LibraryDialog.svelte";
  import { libraryRemoteFieldValues } from "./libraryRemoteFieldValues";
  import RemoteLibraryFields from "./RemoteLibraryFields.svelte";

  type Library = PageData["libraries"][number];

  let {
    library,
    onClose,
  }: {
    library: Library;
    onClose: () => void;
  } = $props();

  const subtitle = $derived(`${library.kind === "tv" ? "TV shows" : "Movies"} · ${library.source} · ${library.path}`);
</script>

<LibraryDialog title="Edit {library.name}" titleId="library-edit-title" {subtitle} focusKey={library.id} {onClose}>
  <form method="POST" action="?/edit" class="dialog-form">
    <input type="hidden" name="libraryId" value={library.id} />
    <input type="hidden" name="source" value={library.source} />
    <label>
      Name
      <input name="name" value={library.name} />
    </label>
    {#if library.source === "sftp"}
      <RemoteLibraryFields
        protocol="sftp"
        values={libraryRemoteFieldValues(library)}
        passwordPlaceholder="Leave blank to keep current password"
        rootPlaceholder="media/movies"
      />
    {:else if library.source === "webdav"}
      <RemoteLibraryFields
        protocol="webdav"
        values={libraryRemoteFieldValues(library)}
        passwordPlaceholder="Leave blank to keep current password"
        rootPlaceholder="media/movies"
      />
    {:else}
      <label>
        Folder path
        <input name="path" value={library.path} placeholder="/Volumes/Media/Movies" autocomplete="off" />
      </label>
    {/if}
    <LibraryAutomationFields
      showWatch={library.source === "local"}
      watchEnabled={library.watch_enabled !== 0}
      scanIntervalMinutes={library.scan_interval_minutes}
    />
    <div class="form-actions">
      <button class="secondary" type="button" onclick={onClose}>Cancel</button>
      <button class="secondary" disabled={library.scanActive}>
        <Save size={16} aria-hidden="true" />
        Save changes
      </button>
    </div>
    {#if library.scanActive}
      <p class="muted">Finish or cancel the active scan before editing this library.</p>
    {/if}
  </form>
</LibraryDialog>
