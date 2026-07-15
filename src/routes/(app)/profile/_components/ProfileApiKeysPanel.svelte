<script lang="ts">
  import { browser } from "$app/environment";
  import ConfirmAction from "$lib/components/ConfirmAction.svelte";
  import ModalDialog from "$lib/components/ModalDialog.svelte";
  import { formatDateTime } from "$lib/media/format";
  import { enhance } from "$app/forms";
  import { Clipboard, ExternalLink, KeyRound, Plus } from "@lucide/svelte";

  type ApiKey = {
    id: string;
    name: string;
    tokenPrefix: string;
    createdAt: string;
    lastUsedAt: string | null;
    expiresAt: string | null;
  };

  let {
    apiKeys,
    createdApiKeyToken,
    apiKeySuccess,
    apiKeyError,
  }: {
    apiKeys: ApiKey[];
    createdApiKeyToken?: string;
    apiKeySuccess?: string;
    apiKeyError?: string;
  } = $props();

  let apiKeyExpiresPreset = $state("");
  let copiedToken = $state(false);
  let createOpen = $state(false);

  const createTitleId = `api-key-create-${Math.random().toString(36).slice(2, 9)}`;

  function openCreate() {
    apiKeyExpiresPreset = "";
    createOpen = true;
  }

  function closeCreate() {
    createOpen = false;
  }

  async function copyToken(token: string) {
    if (!browser || !navigator.clipboard) return;
    await navigator.clipboard.writeText(token);
    copiedToken = true;
    setTimeout(() => {
      copiedToken = false;
    }, 1800);
  }
</script>

<section class="ops-panel">
  <div class="ops-panel-header">
    <div>
      <h2>API Keys</h2>
      <p class="muted">Personal tokens for mobile apps and custom clients.</p>
    </div>
    <KeyRound size={18} aria-hidden="true" />
  </div>

  <div class="ops-panel-body api-panel-body">
    <p class="muted api-docs-note">
      OpenAPI specification for building custom clients. Authenticate requests with the X-API-Key header.
    </p>

    <div class="api-links" aria-label="API documentation">
      <a class="api-link" href="/api/openapi.json" target="_blank" rel="noreferrer">
        OpenAPI JSON
        <ExternalLink size={14} aria-hidden="true" />
      </a>
      <a class="api-link" href="/api/openapi.yaml" target="_blank" rel="noreferrer">
        OpenAPI YAML
        <ExternalLink size={14} aria-hidden="true" />
      </a>
    </div>

    {#if createdApiKeyToken}
      <div class="token-reveal" role="status">
        <div>
          <strong>{apiKeySuccess ?? "API key created."}</strong>
          <code>{createdApiKeyToken}</code>
        </div>
        <button class="secondary" type="button" onclick={() => copyToken(createdApiKeyToken)}>
          <Clipboard size={16} aria-hidden="true" />
          {copiedToken ? "Copied" : "Copy"}
        </button>
      </div>
    {/if}

    <button class="button create-trigger" type="button" onclick={openCreate}>
      <Plus size={16} aria-hidden="true" />
      Create key
    </button>

    {#if createOpen}
      <ModalDialog title="Create API key" titleId={createTitleId} onClose={closeCreate}>
        <form
          class="api-create-form"
          method="POST"
          action="?/createApiKey"
          use:enhance={() => {
            return async ({ result, update }) => {
              if (result.type === "success") createOpen = false;
              await update();
            };
          }}
        >
          <label>
            Name
            <input name="name" maxlength="80" placeholder="iPhone, scripts" />
          </label>

          <div class="expiry-grid">
            <label>
              Expires
              <select name="expiresPreset" bind:value={apiKeyExpiresPreset}>
                <option value="">Never</option>
                <option value="604800">7 days</option>
                <option value="2592000">30 days</option>
                <option value="7776000">90 days</option>
                <option value="31536000">1 year</option>
                <option value="custom">Custom seconds</option>
              </select>
            </label>

            {#if apiKeyExpiresPreset === "custom"}
              <label>
                Seconds
                <input
                  name="expiresIn"
                  type="number"
                  min="1"
                  max="315360000"
                  step="1"
                  inputmode="numeric"
                  placeholder="2592000"
                />
              </label>
            {/if}
          </div>

          {#if apiKeyError}
            <p class="error">{apiKeyError}</p>
          {/if}

          <div class="form-actions">
            <button type="button" class="secondary" onclick={closeCreate}>Cancel</button>
            <button>Create key</button>
          </div>
        </form>
      </ModalDialog>
    {/if}

    <div class="api-key-list">
      {#if apiKeys.length > 0}
        {#each apiKeys as apiKey (apiKey.id)}
          <article class="api-key-row">
            <div>
              <h3>{apiKey.name}</h3>
              <p class="muted">
                {apiKey.tokenPrefix}...
                <span>Created {formatDateTime(apiKey.createdAt, { fallback: "never" })}</span>
                <span>Last used {formatDateTime(apiKey.lastUsedAt, { fallback: "never" })}</span>
                <span>Expires {formatDateTime(apiKey.expiresAt, { fallback: "never" })}</span>
              </p>
            </div>
            <ConfirmAction
              action="?/revokeApiKey"
              fieldName="apiKeyId"
              fieldValue={apiKey.id}
              title="Revoke API key?"
              message={`This immediately disables ${apiKey.name}. Existing clients using it will lose access.`}
              confirmLabel="Revoke"
            >
              Revoke
            </ConfirmAction>
          </article>
        {/each}
      {:else}
        <p class="muted empty-state">No API keys created.</p>
      {/if}
    </div>
  </div>
</section>

<style>
  .api-panel-body {
    gap: 0.85rem;
  }

  .api-links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    align-items: center;
  }

  .api-docs-note {
    margin: 0;
    font-size: 0.85rem;
    line-height: 1.4;
  }

  .api-link {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    color: var(--color-accent);
    font-weight: 600;
    font-size: 0.9rem;
    text-decoration: none;
  }

  .api-link:hover {
    text-decoration: underline;
  }

  .token-reveal {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.7rem;
    align-items: center;
    border: 1px solid var(--color-success-border);
    border-radius: 8px;
    background: var(--color-success-soft);
    padding: 0.7rem;
  }

  .token-reveal div {
    display: grid;
    gap: 0.4rem;
    min-width: 0;
  }

  .token-reveal code {
    overflow: auto;
    white-space: nowrap;
    border-radius: 6px;
    background: var(--color-surface);
    color: var(--color-text);
    padding: 0.45rem 0.55rem;
    font-size: 0.82rem;
  }

  .api-create-form {
    display: grid;
    gap: 0.65rem;
  }

  .create-trigger {
    width: fit-content;
  }

  .expiry-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.65rem;
  }

  .api-key-list {
    display: grid;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    overflow: hidden;
  }

  .api-key-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.75rem;
    align-items: center;
    padding: 0.75rem;
    background: var(--color-surface-faint);
  }

  .api-key-row + .api-key-row {
    border-top: 1px solid var(--color-border);
  }

  .api-key-row h3 {
    margin: 0;
    font-size: 0.95rem;
  }

  .api-key-row p {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem 0.7rem;
    margin-top: 0.25rem;
    font-size: 0.82rem;
  }

  .empty-state {
    padding: 0.75rem;
    margin: 0;
  }

  .ops-panel-header :global(svg) {
    color: var(--ops-muted);
    flex-shrink: 0;
  }

  @media (max-width: 560px) {
    .token-reveal,
    .api-key-row,
    .expiry-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
