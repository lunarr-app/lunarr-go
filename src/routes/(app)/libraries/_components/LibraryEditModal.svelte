<script lang="ts">
  import LibraryAutomationFields from "./LibraryAutomationFields.svelte";
  import ModalDialog from "$lib/components/ModalDialog.svelte";
  import { libraryRemoteFieldValues } from "./libraryRemoteFieldValues";
  import RemoteLibraryFields from "./RemoteLibraryFields.svelte";
  import type { Library } from "./types";

  let {
    library,
    onClose,
  }: {
    library: Library;
    onClose: () => void;
  } = $props();

  const subtitle = $derived(`${library.kind === "tv" ? "TV shows" : "Movies"} · ${library.source} · ${library.path}`);
</script>

<ModalDialog title="Edit {library.name}" titleId="library-edit-title" {subtitle} focusKey={library.id} {onClose}>
  <form method="POST" action="?/edit" class="dialog-form">
    <input type="hidden" name="libraryId" value={library.id} />
    <input type="hidden" name="source" value={library.source} />
    <label>
      Name
      <input name="name" value={library.name} />
    </label>
    {#if library.source === "sftp" || library.source === "webdav"}
      <RemoteLibraryFields
        protocol={library.source}
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
      <button disabled={library.scanActive}>Save</button>
    </div>
    {#if library.scanActive}
      <p class="muted">Finish or cancel the active scan before editing this library.</p>
    {/if}
  </form>
</ModalDialog>
