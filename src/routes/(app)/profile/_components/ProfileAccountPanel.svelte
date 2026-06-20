<script lang="ts">
  import { Save, UserRound } from "@lucide/svelte";

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

  let displayName = $state("");
  let currentPassword = $state("");
  let newPassword = $state("");
  let confirmPassword = $state("");

  const nameDirty = $derived(displayName.trim() !== (user.name ?? "").trim());
  const passwordDirty = $derived(currentPassword.length > 0 || newPassword.length > 0 || confirmPassword.length > 0);

  $effect(() => {
    displayName = user.name ?? "";
  });
</script>

<section class="ops-panel account-panel" aria-label="Account">
  <div class="ops-panel-header">
    <div>
      <h2>Account</h2>
      <p class="muted">Name, email, and sign-in password.</p>
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

      <button type="submit" disabled={!nameDirty}>
        <Save size={16} aria-hidden="true" />
        Save name
      </button>
    </form>

    <div class="account-divider" aria-hidden="true"></div>

    <form class="password-form" method="POST" action="?/changePassword">
      <h3>Password</h3>

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

      <button type="submit" disabled={!passwordDirty}>
        <Save size={16} aria-hidden="true" />
        Change password
      </button>
    </form>
  </div>
</section>

<style>
  .account-panel {
    align-self: start;
  }

  .account-identity {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.65rem;
  }

  .account-form,
  .password-form {
    display: grid;
    gap: 0.65rem;
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
    padding: 0.18rem 0.5rem;
    font-size: 0.76rem;
    font-weight: 700;
  }

  .ops-panel-header :global(svg) {
    color: var(--ops-muted);
    flex-shrink: 0;
  }
</style>
