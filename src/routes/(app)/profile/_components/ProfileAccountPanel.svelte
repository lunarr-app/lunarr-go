<script lang="ts">
  import { UserRound } from "@lucide/svelte";
  import ModalDialog from "$lib/components/ModalDialog.svelte";
  import { enhance } from "$app/forms";
  import { goto } from "$app/navigation";

  let {
    user,
    accountError,
    passwordError,
  }: {
    user: {
      name: string | null;
      email: string | null;
      role?: string | null;
    };
    accountError?: string;
    passwordError?: string;
  } = $props();

  let nameOpen = $state(false);
  let passwordOpen = $state(false);
  let displayName = $state("");
  let currentPassword = $state("");
  let newPassword = $state("");
  let confirmPassword = $state("");

  const nameTitleId = `account-name-${Math.random().toString(36).slice(2, 9)}`;
  const passwordTitleId = `account-password-${Math.random().toString(36).slice(2, 9)}`;

  const nameDirty = $derived(displayName.trim() !== (user.name ?? "").trim());
  const passwordDirty = $derived(currentPassword.length > 0 || newPassword.length > 0 || confirmPassword.length > 0);
  const displayNameLabel = $derived(user.name?.trim() || "Not set");

  $effect(() => {
    displayName = user.name ?? "";
  });

  $effect(() => {
    if (accountError) nameOpen = true;
    if (passwordError) passwordOpen = true;
  });

  function clearPasswordFields() {
    currentPassword = "";
    newPassword = "";
    confirmPassword = "";
  }

  function openName() {
    displayName = user.name ?? "";
    nameOpen = true;
  }

  function closeName() {
    nameOpen = false;
    displayName = user.name ?? "";
  }

  function openPassword() {
    clearPasswordFields();
    passwordOpen = true;
  }

  function closePassword() {
    passwordOpen = false;
    clearPasswordFields();
  }
</script>

<section class="ops-panel" aria-label="Account">
  <div class="ops-panel-header">
    <div>
      <h2>Account</h2>
      <p class="muted">Your sign-in details.</p>
    </div>
    <UserRound size={18} aria-hidden="true" />
  </div>

  <div class="ops-panel-body">
    <div class="account-identity">
      <div class="avatar" aria-hidden="true">
        <span>{(user.name || user.email || "L").slice(0, 1).toUpperCase()}</span>
      </div>
      <span class="role-badge">{user.role === "admin" ? "Admin" : "User"}</span>
    </div>

    <div class="account-details">
      <div class="detail-row">
        <div class="read-only-field">
          <span>Name</span>
          <p>{displayNameLabel}</p>
        </div>
        <button type="button" class="secondary field-edit-button" onclick={openName}>Edit</button>
      </div>

      {#if user.email}
        <div class="read-only-field">
          <span>Email</span>
          <p class="muted">{user.email}</p>
        </div>
      {/if}

      <div class="detail-row">
        <div class="read-only-field">
          <span>Password</span>
          <p class="muted password-mask" aria-label="Password hidden">••••••••</p>
        </div>
        <button type="button" class="secondary field-edit-button" onclick={openPassword}>Change</button>
      </div>
    </div>
  </div>
</section>

{#if nameOpen}
  <ModalDialog title="Edit name" titleId={nameTitleId} onClose={closeName}>
    <form
      class="account-form"
      method="POST"
      action="?/updateAccount"
      use:enhance={() => {
        return async ({ result, update }) => {
          if (result.type === "redirect") {
            nameOpen = false;
            await goto(result.location);
          } else {
            await update();
          }
        };
      }}
    >
      <label>
        Name
        <input name="name" autocomplete="name" bind:value={displayName} placeholder="Your name" required />
      </label>

      {#if accountError}
        <p class="error">{accountError}</p>
      {/if}

      <div class="form-actions">
        <button type="button" class="secondary" onclick={closeName}>Cancel</button>
        <button type="submit" class:secondary={!nameDirty} disabled={!nameDirty}>Save</button>
      </div>
    </form>
  </ModalDialog>
{/if}

{#if passwordOpen}
  <ModalDialog title="Change password" titleId={passwordTitleId} onClose={closePassword}>
    <form
      class="password-form"
      method="POST"
      action="?/changePassword"
      use:enhance={() => {
        return async ({ result, update }) => {
          if (result.type === "redirect") {
            passwordOpen = false;
            await goto(result.location);
          } else {
            await update();
          }
        };
      }}
    >
      <label>
        Current password
        <input
          name="currentPassword"
          type="password"
          autocomplete="current-password"
          bind:value={currentPassword}
          placeholder="Current password"
          required
        />
      </label>

      <label>
        New password
        <input
          name="newPassword"
          type="password"
          autocomplete="new-password"
          minlength="8"
          bind:value={newPassword}
          placeholder="New password"
          required
        />
      </label>

      <label>
        Confirm new password
        <input
          name="confirmPassword"
          type="password"
          autocomplete="new-password"
          minlength="8"
          bind:value={confirmPassword}
          placeholder="Confirm new password"
          required
        />
      </label>

      {#if passwordError}
        <p class="error">{passwordError}</p>
      {/if}

      <div class="form-actions">
        <button type="button" class="secondary" onclick={closePassword}>Cancel</button>
        <button type="submit" class:secondary={!passwordDirty} disabled={!passwordDirty}>Change password</button>
      </div>
    </form>
  </ModalDialog>
{/if}

<style>
  .account-identity {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.65rem;
  }

  .account-details {
    display: grid;
    gap: 0.65rem;
  }

  .detail-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .field-edit-button {
    width: fit-content;
    flex-shrink: 0;
  }

  .account-form,
  .password-form {
    display: grid;
    gap: 0.65rem;
  }

  .read-only-field {
    display: grid;
    gap: 0.25rem;
    min-width: 0;
  }

  .read-only-field span {
    font-size: 0.88rem;
    font-weight: 600;
  }

  .read-only-field p {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin: 0;
  }

  .password-mask {
    letter-spacing: 0.12em;
  }

  .avatar {
    display: grid;
    place-items: center;
    width: 3rem;
    height: 3rem;
    border: 1px solid var(--color-border-strong);
    border-radius: 999px;
    background: var(--color-surface-strong);
    color: var(--color-text);
    font-size: 1rem;
    font-weight: 800;
  }

  .role-badge {
    width: fit-content;
    border: 1px solid var(--color-border-strong);
    border-radius: 999px;
    color: var(--color-text-soft);
    background: var(--color-surface-faint);
    padding: 0.18rem var(--space-2);
    font-size: 0.76rem;
    font-weight: 700;
  }

  .ops-panel-header :global(svg) {
    color: var(--ops-muted);
    flex-shrink: 0;
  }
</style>
