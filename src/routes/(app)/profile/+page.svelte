<script lang="ts">
  import { browser } from "$app/environment";
  import ConfirmAction from "$lib/components/ConfirmAction.svelte";
  import {
    getStoredTheme,
    setStoredTheme,
    type Theme,
  } from "$lib/theme";
  import {
    Clipboard,
    ExternalLink,
    KeyRound,
    Plus,
    Save,
    SunMoon,
    Trash2,
    UserRound,
  } from "@lucide/svelte";

  let { data, form } = $props();
  let playbackPreference = $state("auto");
  let preferredAudioLanguage = $state("");
  let preferredSubtitleLanguage = $state("");
  let selectedTheme = $state<Theme>("dark");
  let apiKeyExpiresPreset = $state("");
  let copiedToken = $state(false);
  let playbackForm: HTMLFormElement | null = $state(null);

  $effect(() => {
    playbackPreference = data.transcodePolicy.playbackPreference;
    preferredAudioLanguage = data.transcodePolicy.preferredAudioLanguage ?? "";
    preferredSubtitleLanguage =
      data.transcodePolicy.preferredSubtitleLanguage ?? "";
  });

  $effect(() => {
    if (!browser) return;
    selectedTheme = getStoredTheme();
  });

  function submitPlaybackPreference() {
    playbackForm?.requestSubmit();
  }

  function chooseTheme(theme: Theme) {
    selectedTheme = theme;
    setStoredTheme(theme);
  }

  function formatDate(value: string | null) {
    if (!value) return "Never";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "Unknown";
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
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

<svelte:head>
  <title>Profile - Lunarr</title>
  <meta
    name="description"
    content="Manage your Lunarr profile and playback preferences."
  />
</svelte:head>

<div class="ops-page-header">
  <div>
    <h1>Profile</h1>
    <p class="muted">Account and playback preferences.</p>
  </div>
</div>

<div class="profile-grid">
  <section class="ops-panel account-panel" aria-label="Account details">
    <div class="avatar" aria-hidden="true">
      <span
        >{(data.user.name || data.user.email || "L")
          .slice(0, 1)
          .toUpperCase()}</span
      >
    </div>
    <div class="account-copy">
      <h2>{data.user.name || "Lunarr user"}</h2>
      {#if data.user.email}
        <p class="muted">{data.user.email}</p>
      {/if}
      <span>{data.user.role === "admin" ? "Admin" : "User"}</span>
    </div>
  </section>

  <div class="profile-stack">
    <section class="ops-panel">
      <div class="ops-panel-header">
        <div>
          <h2>Appearance</h2>
          <p class="muted">Theme for this browser.</p>
        </div>
        <SunMoon size={18} aria-hidden="true" />
      </div>

      <div class="ops-panel-body">
        <div class="theme-options" role="group" aria-label="Theme">
          <button
            class:active={selectedTheme === "dark"}
            type="button"
            class="secondary"
            aria-pressed={selectedTheme === "dark"}
            onclick={() => chooseTheme("dark")}
          >
            Dark
          </button>
          <button
            class:active={selectedTheme === "light"}
            type="button"
            class="secondary"
            aria-pressed={selectedTheme === "light"}
            onclick={() => chooseTheme("light")}
          >
            Light
          </button>
        </div>
      </div>
    </section>

    <form
      class="ops-panel"
      method="POST"
      action="?/savePlaybackPreference"
      bind:this={playbackForm}
    >
      <div class="ops-panel-header">
        <div>
          <h2>Playback</h2>
          <p class="muted">
            Default behavior when direct play and temporary HLS are both
            available.
          </p>
        </div>
        <UserRound size={18} aria-hidden="true" />
      </div>

      <div class="ops-panel-body">
        <label>
          Playback preference
          <select
            name="playbackPreference"
            bind:value={playbackPreference}
            onchange={submitPlaybackPreference}
          >
            <option value="auto">Auto</option>
            <option value="prefer_direct">Prefer direct play</option>
            <option value="prefer_transcode">Prefer temporary HLS</option>
          </select>
        </label>

        <label>
          Preferred audio language
          <input
            name="preferredAudioLanguage"
            type="text"
            maxlength="32"
            placeholder="eng, jpn, en"
            bind:value={preferredAudioLanguage}
            onchange={submitPlaybackPreference}
          />
        </label>

        <label>
          Preferred subtitle language
          <input
            name="preferredSubtitleLanguage"
            type="text"
            maxlength="32"
            placeholder="eng, jpn, en"
            bind:value={preferredSubtitleLanguage}
            onchange={submitPlaybackPreference}
          />
        </label>

        <p class="muted detail-copy">
          Auto uses direct play for browser-compatible files and temporary HLS
          only when needed. Preferred audio language is used for temporary HLS
          when probe metadata has a matching audio stream. Preferred subtitle
          language chooses the default external subtitle track when available.
        </p>

        {#if !data.transcodePolicy.transcodingEnabled}
          <p class="muted status-note">
            Temporary HLS playback is currently disabled by an admin. Compatible
            files still use direct play.
          </p>
        {/if}

        {#if form?.playbackPreferenceError}
          <p class="error">{form.playbackPreferenceError}</p>
        {/if}

        <button>
          <Save size={16} aria-hidden="true" />
          Save playback
        </button>
      </div>
    </form>

    <section class="ops-panel">
      <div class="ops-panel-header">
        <div>
          <h2>API Keys</h2>
          <p class="muted">Personal tokens for mobile apps and custom clients.</p>
        </div>
        <KeyRound size={18} aria-hidden="true" />
      </div>

      <div class="ops-panel-body api-panel-body">
        <div class="api-links" aria-label="API documentation">
          <a class="button secondary" href="/api/openapi.json" target="_blank" rel="noreferrer">
            JSON
            <ExternalLink size={14} aria-hidden="true" />
          </a>
          <a class="button secondary" href="/api/openapi.yaml" target="_blank" rel="noreferrer">
            YAML
            <ExternalLink size={14} aria-hidden="true" />
          </a>
          <code>X-API-Key</code>
        </div>

        {#if form?.createdApiKeyToken}
          <div class="token-reveal" role="status">
            <div>
              <strong>{form.apiKeySuccess ?? "API key created."}</strong>
              <code>{form.createdApiKeyToken}</code>
            </div>
            <button
              class="secondary"
              type="button"
              onclick={() => copyToken(form.createdApiKeyToken)}
            >
              <Clipboard size={16} aria-hidden="true" />
              {copiedToken ? "Copied" : "Copy"}
            </button>
          </div>
        {/if}

        <form class="api-create-form" method="POST" action="?/createApiKey">
          <label>
            Name
            <input name="name" maxlength="80" placeholder="iPhone, scripts, Jellyseerr" />
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

          {#if form?.apiKeyError}
            <p class="error">{form.apiKeyError}</p>
          {/if}

          <button>
            <Plus size={16} aria-hidden="true" />
            Create key
          </button>
        </form>

        <div class="api-key-list">
          {#if data.apiKeys.length > 0}
            {#each data.apiKeys as apiKey}
              <article class="api-key-row">
                <div>
                  <h3>{apiKey.name}</h3>
                  <p class="muted">
                    {apiKey.tokenPrefix}...
                    <span>Created {formatDate(apiKey.createdAt)}</span>
                    <span>Last used {formatDate(apiKey.lastUsedAt)}</span>
                    <span>Expires {formatDate(apiKey.expiresAt)}</span>
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
                  <Trash2 size={16} aria-hidden="true" />
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
  </div>
</div>

<style>
  h2,
  p {
    margin: 0;
  }

  h2 {
    font-size: 1.02rem;
  }

  .profile-grid {
    display: grid;
    grid-template-columns: minmax(16rem, 0.7fr) minmax(0, 1.3fr);
    gap: 0.75rem;
    align-items: start;
    margin-top: 0.8rem;
  }

  .account-panel {
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
  }

  .profile-stack {
    display: grid;
    gap: 0.75rem;
  }

  .theme-options {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem;
  }

  .theme-options button.active {
    border-color: var(--color-accent-border);
    background: var(--color-accent-soft);
    color: var(--color-accent);
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

  .account-copy {
    display: grid;
    gap: 0.18rem;
    min-width: 0;
  }

  .account-copy h2,
  .account-copy p {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .account-copy span {
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

  .detail-copy {
    line-height: 1.5;
    font-size: 0.88rem;
  }

  .status-note {
    border: 1px solid var(--color-warning-border);
    border-radius: 8px;
    background: var(--color-warning-soft);
    padding: 0.5rem 0.6rem;
    font-size: 0.86rem;
  }

  .api-panel-body {
    gap: 0.85rem;
  }

  .api-links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    align-items: center;
  }

  .api-links a {
    text-decoration: none;
  }

  .api-links code {
    border: 1px solid var(--color-border-strong);
    border-radius: 6px;
    background: var(--color-surface-faint);
    color: var(--color-text);
    padding: 0.32rem 0.5rem;
    font-size: 0.82rem;
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
  }

  @media (max-width: 760px) {
    .profile-grid {
      grid-template-columns: 1fr;
    }

    .token-reveal,
    .api-key-row,
    .expiry-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
