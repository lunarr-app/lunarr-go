<script lang="ts">
  import { KeyRound, Pencil, Save, UserRound, X } from "@lucide/svelte";

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

  let editing = $state(false);
  let passwordExpanded = $state(false);
  let displayName = $state("");
  let currentPassword = $state("");
  let newPassword = $state("");
  let confirmPassword = $state("");

  const nameDirty = $derived(displayName.trim() !== (user.name ?? "").trim());
  const passwordDirty = $derived(currentPassword.length > 0 || newPassword.length > 0 || confirmPassword.length > 0);
  const displayNameLabel = $derived(user.name?.trim() || "Not set");

  $effect(() => {
    displayName = user.name ?? "";
  });

  $effect(() => {
    if (accountError || passwordError) {
      editing = true;
      if (passwordError) {
        passwordExpanded = true;
      }
    }
  });

  function clearPasswordFields() {
    currentPassword = "";
    newPassword = "";
    confirmPassword = "";
  }

  function startEditing() {
    editing = true;
    passwordExpanded = false;
    clearPasswordFields();
  }

  function cancelEditing() {
    editing = false;
    passwordExpanded = false;
    displayName = user.name ?? "";
    clearPasswordFields();
  }

  function collapsePasswordSection() {
    passwordExpanded = false;
    clearPasswordFields();
  }
</script>

<section class="ops-panel" aria-label="Account">
  <div class="ops-panel-header">
    <div>
      <h2>Account</h2>
      <p class="muted">{editing ? "Edit your account details." : "Your sign-in details."}</p>
    </div>
    {#if editing}
      <button type="button" class="secondary account-header-action" onclick={cancelEditing}>
        <X size={16} aria-hidden="true" />
        Cancel
      </button>
    {:else}
      <UserRound size={18} aria-hidden="true" />
    {/if}
  </div>

  <div class="ops-panel-body">
    {#if !editing}
      <div class="account-identity">
        <div class="avatar" aria-hidden="true">
          <span>{(user.name || user.email || "L").slice(0, 1).toUpperCase()}</span>
        </div>
        <span class="role-badge">{user.role === "admin" ? "Admin" : "User"}</span>
      </div>

      <div class="account-details">
        <div class="read-only-field">
          <span>Name</span>
          <p>{displayNameLabel}</p>
        </div>

        {#if user.email}
          <div class="read-only-field">
            <span>Email</span>
            <p class="muted">{user.email}</p>
          </div>
        {/if}

        <div class="read-only-field">
          <span>Password</span>
          <p class="muted password-mask" aria-label="Password hidden">••••••••</p>
        </div>
      </div>

      <button type="button" class="secondary account-edit-button" onclick={startEditing}>
        <Pencil size={16} aria-hidden="true" />
        Edit account
      </button>
    {:else}
      <form class="account-form" method="POST" action="?/updateAccount">
        <label>
          Name
          <input name="name" autocomplete="name" bind:value={displayName} required />
        </label>

        {#if user.email}
          <div class="read-only-field">
            <span>Email</span>
            <p class="muted">{user.email}</p>
          </div>
        {/if}

        {#if accountError}
          <p class="error">{accountError}</p>
        {/if}

        <button type="submit" class:secondary={!nameDirty} disabled={!nameDirty}>
          <Save size={16} aria-hidden="true" />
          Save name
        </button>
      </form>

      <div class="account-divider" aria-hidden="true"></div>

      {#if passwordExpanded}
        <form class="password-form" method="POST" action="?/changePassword">
          <div class="password-form-header">
            <h3>Password</h3>
            <button type="button" class="secondary password-collapse-button" onclick={collapsePasswordSection}>
              Hide
            </button>
          </div>

          <label>
            Current password
            <input
              name="currentPassword"
              type="password"
              autocomplete="current-password"
              bind:value={currentPassword}
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
              required
            />
          </label>

          {#if passwordError}
            <p class="error">{passwordError}</p>
          {/if}

          <button type="submit" class:secondary={!passwordDirty} disabled={!passwordDirty}>
            <Save size={16} aria-hidden="true" />
            Change password
          </button>
        </form>
      {:else}
        <button type="button" class="secondary password-toggle-button" onclick={() => (passwordExpanded = true)}>
          <KeyRound size={16} aria-hidden="true" />
          Change password
        </button>
      {/if}
    {/if}
  </div>
</section>

<style>
  .account-identity {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.65rem;
  }

  .account-details,
  .account-form,
  .password-form {
    display: grid;
    gap: 0.65rem;
  }

  .password-form-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .password-form-header h3 {
    margin: 0;
    font-size: 0.95rem;
  }

  .account-edit-button,
  .account-header-action,
  .password-toggle-button,
  .password-collapse-button {
    width: fit-content;
  }

  .account-header-action {
    flex-shrink: 0;
  }

  .account-divider {
    height: 1px;
    background: var(--color-border);
    margin: 0.15rem 0;
  }

  .read-only-field {
    display: grid;
    gap: 0.25rem;
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
