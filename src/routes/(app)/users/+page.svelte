<script lang="ts">
  import ConfirmAction from "$lib/components/ConfirmAction.svelte";
  import { formatDateTime } from "$lib/media/format";
  import UserCreateModal from "./_components/UserCreateModal.svelte";
  import { CirclePlus, Shield, Trash2 } from "@lucide/svelte";

  let { data, form } = $props();

  const formData = $derived((form ?? {}) as Record<string, string>);
  const createDraft = $derived({
    name: formData.name ?? "",
    email: formData.email ?? "",
    role: formData.role ?? "user",
  });

  let createOpen = $state(false);

  const createError = $derived(form?.createError ?? "");
  const listError = $derived(form?.userActionError && !form?.createError ? form.userActionError : "");

  $effect(() => {
    if (form?.createError) createOpen = true;
  });

  function roleLabel(role: string) {
    return role === "admin" ? "Admin" : "User";
  }
</script>

<svelte:head>
  <title>Users - Lunarr</title>
  <meta name="description" content="Manage Lunarr accounts, roles, and access." />
</svelte:head>

<header class="ops-page-header">
  <div>
    <h1>Users</h1>
    <p class="muted">Manage accounts and roles.</p>
  </div>
  <button type="button" onclick={() => (createOpen = true)}>
    <CirclePlus size={16} aria-hidden="true" />
    Add user
  </button>
</header>

{#if listError}
  <p class="page-error">{listError}</p>
{/if}

<div class="content">
  <section class="ops-panel">
    <div class="ops-panel-header">
      <div>
        <h2>Accounts</h2>
        <p class="muted">{data.users.length} registered {data.users.length === 1 ? "user" : "users"}.</p>
      </div>
    </div>

    <div class="ops-table">
      {#each data.users as user (user.id)}
        <article class="ops-row">
          <div class="user-summary">
            <div class="user-title">
              <strong>{user.name}</strong>
              <span class={`status-badge ${user.role}`}>{roleLabel(user.role)}</span>
              {#if user.banned}
                <span class="status-badge failed">Banned</span>
              {/if}
              {#if user.id === data.currentUserId}
                <span class="you-badge">You</span>
              {/if}
            </div>
            <span class="muted">{user.email}</span>
            <span class="muted">Joined {formatDateTime(user.createdAt)}</span>
          </div>

          <div class="actions" role="toolbar" aria-label={`Actions for ${user.name}`}>
            {#if user.id === data.currentUserId}
              <span class="muted role-readonly">{roleLabel(user.role)}</span>
              <span class="muted current-account">Current account</span>
            {:else}
              <form method="POST" action="?/updateRole">
                <input type="hidden" name="userId" value={user.id} />
                <label class="role-label">
                  <span class="sr-only">Role for {user.name}</span>
                  <select name="role" onchange={(event) => event.currentTarget.form?.requestSubmit()}>
                    <option value="user" selected={user.role === "user"}>User</option>
                    <option value="admin" selected={user.role === "admin"}>Admin</option>
                  </select>
                </label>
              </form>

              <ConfirmAction
                action="?/delete"
                fieldName="userId"
                fieldValue={user.id}
                title={`Delete ${user.name}?`}
                message="This removes the account, sessions, API keys, library sharing, and watch progress. Media files are not deleted."
                confirmLabel="Delete user"
                buttonClass="ops-action-link danger"
              >
                <Trash2 size={15} aria-hidden="true" />
                Delete
              </ConfirmAction>
            {/if}
          </div>
        </article>
      {:else}
        <p class="muted empty-state">No users found.</p>
      {/each}
    </div>
  </section>

  <section class="ops-panel notice-panel">
    <Shield size={20} aria-hidden="true" />
    <div>
      <strong>Admin safeguards</strong>
      <p class="muted">
        Lunarr keeps at least one admin account. You cannot change your own role or delete your own account from this
        page. Role changes apply immediately.
      </p>
    </div>
  </section>
</div>

{#if createOpen}
  <UserCreateModal draft={createDraft} error={createError} onClose={() => (createOpen = false)} />
{/if}

<style>
  .content {
    display: grid;
    gap: 1rem;
    margin-top: 1rem;
  }

  .ops-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 0.75rem 1rem;
    padding: 0.8rem 1rem;
  }

  .user-summary {
    display: grid;
    gap: 0.2rem;
    min-width: 0;
  }

  .user-title {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }

  .ops-row span {
    overflow-wrap: anywhere;
  }

  .status-badge.admin {
    background: color-mix(in srgb, var(--color-accent) 18%, transparent);
    color: var(--color-accent);
  }

  .status-badge.user {
    background: color-mix(in srgb, var(--color-subtle) 16%, transparent);
    color: var(--color-subtle);
  }

  .you-badge {
    border-radius: 999px;
    background: color-mix(in srgb, var(--color-border) 70%, transparent);
    color: var(--color-subtle);
    font-size: 0.78rem;
    padding: 0.1rem 0.55rem;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 0.35rem;
  }

  .actions form {
    margin: 0;
  }

  .role-label select {
    min-width: 7rem;
  }

  .role-readonly {
    font-size: 0.92rem;
  }

  .current-account {
    font-size: 0.92rem;
  }

  .notice-panel {
    display: flex;
    align-items: flex-start;
    gap: 0.85rem;
    padding: 0.85rem 1rem;
  }

  .empty-state {
    padding: 0.75rem 0.85rem;
    margin: 0;
  }

  .page-error {
    color: var(--color-danger);
    margin: 0 0 1rem;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @media (max-width: 760px) {
    .ops-row {
      grid-template-columns: 1fr;
    }

    .actions {
      justify-content: flex-start;
    }
  }
</style>
