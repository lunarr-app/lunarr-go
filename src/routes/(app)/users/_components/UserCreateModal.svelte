<script lang="ts">
  import { CirclePlus } from "@lucide/svelte";
  import ModalDialog from "$lib/components/ModalDialog.svelte";

  let {
    draft,
    error = "",
    onClose,
  }: {
    draft: { name: string; email: string; role: string };
    error?: string;
    onClose: () => void;
  } = $props();
</script>

<ModalDialog
  title="Add user"
  titleId="user-create-title"
  subtitle="Create a local email and password account."
  focusKey={draft.email}
  width="32rem"
  maxHeight="40rem"
  {onClose}
>
  <form method="POST" action="?/create" class="dialog-form">
    <label>
      Name
      <input name="name" value={draft.name} autocomplete="name" placeholder="Display name" required />
    </label>
    <label>
      Email
      <input
        name="email"
        type="email"
        value={draft.email}
        autocomplete="email"
        placeholder="viewer@example.com"
        required
      />
    </label>
    <label>
      Password
      <input
        name="password"
        type="password"
        autocomplete="new-password"
        minlength="8"
        placeholder="At least 8 characters"
        required
      />
    </label>
    <label>
      Role
      <select name="role">
        <option value="user" selected={draft.role === "user"}>User</option>
        <option value="admin" selected={draft.role === "admin"}>Admin</option>
      </select>
    </label>

    {#if error}
      <p class="error">{error}</p>
    {/if}

    <div class="form-actions">
      <button class="secondary" type="button" onclick={onClose}>Cancel</button>
      <button type="submit">
        <CirclePlus size={16} aria-hidden="true" />
        Create user
      </button>
    </div>
  </form>
</ModalDialog>

<style>
  .error {
    margin: 0;
    color: var(--color-danger);
  }
</style>
