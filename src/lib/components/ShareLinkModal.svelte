<script lang="ts">
  import ModalDialog from "$lib/components/ModalDialog.svelte";
  import { createShare, listSharesForMedia, revokeShare, shareLinkUrl } from "$lib/shares/client";
  import {
    DEFAULT_SHARE_EXPIRY_SECONDS,
    SHARE_EXPIRY_PRESET_OPTIONS,
    type ShareExpiryPresetKey,
  } from "$lib/shares/constants";
  import {
    customShareExpirySeconds,
    maxCustomShareExpiryAmount,
    shareStatusDetail,
    shareStatusLabel,
    validateCustomShareExpiry,
  } from "$lib/shares/format";
  import type { CreateSharePayload, PublicShareRecord } from "$lib/shares/types";
  import { Copy, Link2, Trash2 } from "@lucide/svelte";

  type SeasonOption = {
    id: string;
    title: string;
  };

  let {
    title,
    kind,
    mediaItemId,
    seasons = [],
    onClose,
  }: {
    title: string;
    kind: "movie" | "show";
    mediaItemId: string;
    seasons?: SeasonOption[];
    onClose: () => void;
  } = $props();

  let shares = $state<PublicShareRecord[]>([]);
  let loading = $state(true);
  let creating = $state(false);
  let error = $state<string | null>(null);
  let copiedToken = $state<string | null>(null);
  let expiryMode = $state<"preset" | "custom">("preset");
  let presetExpiryKey = $state<ShareExpiryPresetKey>("7d");
  let customAmount = $state(7);
  let customUnit = $state<"hours" | "days">("days");
  let allSeasons = $state(true);
  let selectedSeasonIds = $state<string[]>([]);

  const skeletonShareRowCount = 3;

  async function loadShares() {
    loading = true;
    error = null;
    try {
      shares = await listSharesForMedia(mediaItemId);
    } catch (loadError) {
      error = loadError instanceof Error ? loadError.message : "Could not load share links.";
    } finally {
      loading = false;
    }
  }

  async function createShareLink() {
    creating = true;
    error = null;
    try {
      const payload: CreateSharePayload = {
        kind,
        mediaItemId,
        seasonIds: kind === "show" && !allSeasons ? selectedSeasonIds : undefined,
      };

      if (expiryMode === "preset") {
        const preset = SHARE_EXPIRY_PRESET_OPTIONS.find((option) => option.key === presetExpiryKey);
        payload.expiresInSeconds = preset?.seconds ?? DEFAULT_SHARE_EXPIRY_SECONDS;
      } else {
        const amount = Number(customAmount);
        const validationError = validateCustomShareExpiry(amount, customUnit);
        if (validationError) {
          error = validationError;
          return;
        }
        payload.expiresInSeconds = customShareExpirySeconds(amount, customUnit);
      }

      const share = await createShare(payload);
      if (share) {
        shares = [share, ...shares];
      } else {
        await loadShares();
      }
    } catch (createError) {
      error = createError instanceof Error ? createError.message : "Could not create share link.";
    } finally {
      creating = false;
    }
  }

  async function revokeShareLink(shareId: string) {
    error = null;
    try {
      const body = await revokeShare(shareId);
      shares = shares.map((share) =>
        share.id === shareId
          ? { ...share, active: false, revokedAt: body?.revokedAt ?? new Date().toISOString() }
          : share,
      );
    } catch (revokeError) {
      error = revokeError instanceof Error ? revokeError.message : "Could not revoke share link.";
    }
  }

  async function copyShareLink(share: PublicShareRecord) {
    try {
      await navigator.clipboard.writeText(shareLinkUrl(share));
      copiedToken = share.token;
      window.setTimeout(() => {
        if (copiedToken === share.token) copiedToken = null;
      }, 2000);
    } catch {
      error = "Could not copy link to clipboard.";
    }
  }

  function toggleSeason(seasonId: string, checked: boolean) {
    if (checked) {
      selectedSeasonIds = [...new Set([...selectedSeasonIds, seasonId])];
      return;
    }
    selectedSeasonIds = selectedSeasonIds.filter((id) => id !== seasonId);
  }

  $effect(() => {
    void loadShares();
  });
</script>

<ModalDialog
  title="Share {title}"
  titleId="share-link-title"
  subtitle="Links expire automatically and can be revoked anytime."
  width="34rem"
  maxHeight="34rem"
  {onClose}
>
  <div class="dialog-form">
    <section class="create-panel">
      <div class="control-row">
        <span class="row-label">Expiry</span>
        <div class="control-stack">
          <div class="expiry-row">
            <div class="segmented" role="group" aria-label="Expiry mode">
              <button class:active={expiryMode === "preset"} type="button" onclick={() => (expiryMode = "preset")}>
                Preset
              </button>
              <button class:active={expiryMode === "custom"} type="button" onclick={() => (expiryMode = "custom")}>
                Custom
              </button>
            </div>

            {#if expiryMode === "preset"}
              <select class="compact-control" bind:value={presetExpiryKey} aria-label="Preset duration">
                {#each SHARE_EXPIRY_PRESET_OPTIONS as option (option.key)}
                  <option value={option.key}>{option.label}</option>
                {/each}
              </select>
            {:else}
              <div class="custom-expiry">
                <input
                  class="compact-control"
                  type="number"
                  aria-label="Custom amount"
                  min="1"
                  max={maxCustomShareExpiryAmount(customUnit)}
                  step="1"
                  bind:value={customAmount}
                />
                <select class="compact-control" bind:value={customUnit} aria-label="Custom unit">
                  <option value="hours">Hours</option>
                  <option value="days">Days</option>
                </select>
              </div>
            {/if}
          </div>
        </div>
      </div>

      {#if kind === "show"}
        <div class="control-row">
          <span class="row-label">Seasons</span>
          <div class="control-stack">
            <div class="segmented" role="group" aria-label="Season scope">
              <button class:active={allSeasons} type="button" onclick={() => (allSeasons = true)}>All seasons</button>
              <button
                class:active={!allSeasons}
                type="button"
                onclick={() => {
                  allSeasons = false;
                  if (selectedSeasonIds.length === 0 && seasons[0]) {
                    selectedSeasonIds = [seasons[0].id];
                  }
                }}
              >
                Selected
              </button>
            </div>

            {#if !allSeasons}
              <div class="season-list">
                {#each seasons as season (season.id)}
                  <label class="check subdued">
                    <input
                      type="checkbox"
                      checked={selectedSeasonIds.includes(season.id)}
                      onchange={(event) => toggleSeason(season.id, event.currentTarget.checked)}
                    />
                    <span>{season.title}</span>
                  </label>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      {/if}

      {#if error}
        <p class="error" role="alert">{error}</p>
      {/if}

      <div class="form-actions">
        <button
          type="button"
          disabled={creating || (kind === "show" && !allSeasons && selectedSeasonIds.length === 0)}
          onclick={createShareLink}
        >
          <Link2 size={15} aria-hidden="true" />
          {creating ? "Creating…" : "Create link"}
        </button>
      </div>
    </section>

    <section class="share-list">
      <h3 class="section-title">Links for this title</h3>
      {#if loading}
        <p class="visually-hidden">Loading share links…</p>
        <ul aria-busy="true" aria-label="Loading share links">
          {#each Array.from({ length: skeletonShareRowCount }) as _, index (index)}
            <li class="skeleton-row" aria-hidden="true">
              <div class="share-copy">
                <span class="skeleton-block skeleton-line strong"></span>
                <span class="skeleton-block skeleton-line muted"></span>
                <span class="skeleton-block skeleton-line muted short"></span>
              </div>
              <div class="share-actions">
                <span class="skeleton-block skeleton-button"></span>
                <span class="skeleton-block skeleton-button"></span>
              </div>
            </li>
          {/each}
        </ul>
      {:else if shares.length === 0}
        <p class="muted">No share links yet.</p>
      {:else}
        <ul>
          {#each shares as share (share.id)}
            <li class:inactive={!share.active}>
              <div class="share-copy">
                <strong>{shareStatusLabel(share)}</strong>
                <span class="muted">{shareStatusDetail(share)}</span>
                {#if share.seasonIds}
                  <span class="muted">{share.seasonIds.length} season(s)</span>
                {/if}
              </div>
              {#if share.active}
                <div class="share-actions">
                  <button class="secondary compact-button" type="button" onclick={() => copyShareLink(share)}>
                    <Copy size={14} aria-hidden="true" />
                    {copiedToken === share.token ? "Copied" : "Copy"}
                  </button>
                  <button
                    class="secondary danger compact-button"
                    type="button"
                    onclick={() => revokeShareLink(share.id)}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                    Revoke
                  </button>
                </div>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  </div>
</ModalDialog>

<style>
  .dialog-form {
    gap: 0.65rem;
  }

  .create-panel {
    display: grid;
    gap: 0.55rem;
    padding: 0.65rem;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-surface-faint);
  }

  .control-row {
    display: grid;
    grid-template-columns: 3.75rem minmax(0, 1fr);
    gap: 0.45rem 0.65rem;
    align-items: start;
  }

  .row-label {
    padding-top: 0.3rem;
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--color-subtle);
  }

  .control-stack {
    display: grid;
    gap: 0.4rem;
    min-width: 0;
  }

  .expiry-row {
    display: grid;
    grid-template-columns: minmax(8.5rem, 9.5rem) minmax(0, 1fr);
    gap: 0.4rem;
    align-items: center;
  }

  .segmented {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.2rem;
    padding: 0.15rem;
    border-radius: 6px;
    background: var(--color-popover);
    border: 1px solid var(--color-border);
  }

  .segmented button {
    min-height: 1.75rem;
    padding: 0 0.45rem;
    border-radius: 5px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--color-subtle);
    font-size: 0.82rem;
    font-weight: 650;
  }

  .segmented button.active {
    background: var(--color-button-secondary);
    color: var(--color-text);
    border-color: var(--color-button-secondary-border);
  }

  .compact-control {
    min-height: 1.75rem;
    padding: 0.2rem 0.55rem;
    font-size: 0.86rem;
  }

  .custom-expiry {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(5.5rem, 6.5rem);
    gap: 0.35rem;
  }

  .season-list {
    display: grid;
    gap: 0.25rem;
    max-height: 8.5rem;
    overflow-y: auto;
    padding-right: 0.15rem;
  }

  .check {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--color-text);
    font-size: 0.84rem;
  }

  .check.subdued {
    color: var(--color-text-soft);
  }

  .check input[type="checkbox"] {
    width: 0.95rem;
    height: 0.95rem;
    min-height: 0;
    margin: 0;
    padding: 0;
    flex: 0 0 auto;
  }

  .share-list {
    display: grid;
    gap: 0.45rem;
    border-top: 1px solid var(--color-border);
    padding-top: 0.55rem;
  }

  .section-title {
    margin: 0;
    font-size: 0.84rem;
    font-weight: 700;
    color: var(--color-subtle);
  }

  .visually-hidden {
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

  .skeleton-block {
    display: block;
    border-radius: 6px;
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--color-border) 70%, transparent) 0%,
      color-mix(in srgb, var(--color-border) 35%, transparent) 50%,
      color-mix(in srgb, var(--color-border) 70%, transparent) 100%
    );
    background-size: 200% 100%;
    animation: skeleton-shimmer 1.2s ease-in-out infinite;
  }

  .skeleton-line.strong {
    width: 4.5rem;
    height: 0.84rem;
  }

  .skeleton-line.muted {
    width: min(12rem, 100%);
    height: 0.78rem;
  }

  .skeleton-line.short {
    width: 5rem;
  }

  .skeleton-button {
    width: 4.35rem;
    height: 1.75rem;
    border-radius: 999px;
  }

  @keyframes skeleton-shimmer {
    0% {
      background-position: 100% 0;
    }

    100% {
      background-position: -100% 0;
    }
  }

  .share-list ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.35rem;
    max-height: 9.5rem;
    overflow-y: auto;
  }

  .share-list li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.5rem;
    align-items: center;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    padding: 0.45rem 0.55rem;
    background: var(--color-surface-faint);
    font-size: 0.84rem;
  }

  .share-list li.inactive {
    opacity: 0.72;
  }

  .share-copy {
    display: grid;
    gap: 0.05rem;
    min-width: 0;
  }

  .share-copy strong {
    font-size: 0.84rem;
  }

  .share-copy .muted {
    font-size: 0.78rem;
  }

  .share-actions {
    display: flex;
    gap: 0.35rem;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .compact-button {
    min-height: 1.75rem;
    padding: 0 0.55rem;
    font-size: 0.8rem;
    gap: 0.3rem;
  }

  .error {
    margin: 0;
    font-size: 0.84rem;
    color: var(--color-error);
  }

  .form-actions {
    justify-content: flex-end;
    padding-top: 0.15rem;
  }

  .form-actions :global(button) {
    width: auto;
    min-height: 2rem;
    padding: 0 0.85rem;
    font-size: 0.88rem;
  }

  @media (max-width: 520px) {
    .control-row {
      grid-template-columns: 1fr;
      gap: 0.3rem;
    }

    .row-label {
      padding-top: 0;
    }

    .expiry-row,
    .custom-expiry {
      grid-template-columns: 1fr;
    }

    .share-list li {
      grid-template-columns: 1fr;
    }

    .share-actions {
      justify-content: flex-start;
    }
  }
</style>
