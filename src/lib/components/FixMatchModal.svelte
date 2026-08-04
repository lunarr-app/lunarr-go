<script lang="ts">
  import { goto, invalidateAll } from "$app/navigation";
  import ModalDialog from "$lib/components/ModalDialog.svelte";
  import { applyFixMatch, searchFixMatchCandidates } from "$lib/media/fix-match-client";
  import type { FixMatchCandidate } from "$lib/media/types";
  import { tmdbImageUrl } from "$lib/media/images";
  import { Check, Search } from "@lucide/svelte";

  let {
    kind,
    mediaItemId,
    onClose,
  }: {
    kind: "movie" | "show";
    mediaItemId: string;
    onClose: () => void;
  } = $props();

  let query = $state("");
  let searching = $state(false);
  let searched = $state(false);
  let candidates = $state<FixMatchCandidate[]>([]);
  let selectedProviderId = $state<string | null>(null);
  let applying = $state(false);
  let error = $state<string | null>(null);

  const kindLabel = $derived(kind === "movie" ? "movie" : "show");
  const selected = $derived(candidates.find((candidate) => candidate.providerId === selectedProviderId) ?? null);

  async function searchCandidates() {
    const trimmed = query.trim();
    if (!trimmed || searching) return;
    searching = true;
    error = null;
    selectedProviderId = null;
    try {
      const result = await searchFixMatchCandidates(kind, mediaItemId, trimmed);
      candidates = result.candidates;
      searched = true;
      if (result.resolved && candidates.length === 1) {
        selectedProviderId = candidates[0].providerId;
      }
    } catch (searchError) {
      candidates = [];
      searched = true;
      error = searchError instanceof Error ? searchError.message : "Could not search TMDb.";
    } finally {
      searching = false;
    }
  }

  async function applyMatch() {
    if (!selected || applying) return;
    applying = true;
    error = null;
    try {
      const result = await applyFixMatch(kind, mediaItemId, Number(selected.providerId));
      await goto(`/${kind === "movie" ? "movies" : "shows"}/${result.mediaItemId}`);
      await invalidateAll();
      onClose();
    } catch (applyError) {
      error = applyError instanceof Error ? applyError.message : "Could not update the match.";
      applying = false;
    }
  }
</script>

<ModalDialog
  title="Fix match"
  titleId="fix-match-title"
  subtitle={`Paste a TMDb ${kindLabel} URL or ID, or search TMDb to pick the correct ${kindLabel}.`}
  width="38rem"
  maxHeight="42rem"
  {onClose}
>
  <div class="dialog-form">
    <form
      class="fix-match-search"
      onsubmit={(event) => {
        event.preventDefault();
        void searchCandidates();
      }}
    >
      <input
        type="search"
        placeholder={`TMDb URL, ID, or ${kindLabel} name`}
        aria-label={`Search TMDb for the correct ${kindLabel}`}
        bind:value={query}
      />
      <button type="submit" disabled={searching || !query.trim()}>
        <Search size={15} aria-hidden="true" />
        {searching ? "Searching…" : "Search"}
      </button>
    </form>

    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}

    {#if searched && candidates.length === 0 && !error}
      <p class="muted">No TMDb results. Try pasting the TMDb URL or ID directly.</p>
    {/if}

    {#if candidates.length}
      <ul class="candidate-list" aria-label="TMDb candidates">
        {#each candidates as candidate (candidate.providerId)}
          <li>
            <button
              type="button"
              class="candidate"
              class:selected={candidate.providerId === selectedProviderId}
              aria-pressed={candidate.providerId === selectedProviderId}
              onclick={() => (selectedProviderId = candidate.providerId)}
            >
              {#if tmdbImageUrl(candidate.posterPath, "w92")}
                <img src={tmdbImageUrl(candidate.posterPath, "w92")} alt="" loading="lazy" />
              {:else}
                <span class="candidate-poster-fallback" aria-hidden="true"></span>
              {/if}
              <span class="candidate-copy">
                <strong>{candidate.title}</strong>
                <span class="muted">{candidate.year ?? "Unknown year"} · TMDb ID {candidate.providerId}</span>
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}

    {#if selected}
      <section class="preview">
        <h3 class="section-title">Selected match</h3>
        <p class="preview-title">
          {selected.title}
          {#if selected.year}
            ({selected.year})
          {/if}
        </p>
        {#if selected.overview}
          <p class="muted preview-overview">{selected.overview}</p>
        {/if}
      </section>
    {/if}

    <div class="form-actions">
      <button class="secondary" type="button" onclick={onClose}>Cancel</button>
      <button type="button" disabled={!selected || applying} onclick={() => void applyMatch()}>
        <Check size={15} aria-hidden="true" />
        {applying ? "Applying…" : "Apply match"}
      </button>
    </div>
  </div>
</ModalDialog>

<style>
  .fix-match-search {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--space-2);
    margin: 0;
  }

  .fix-match-search input {
    min-height: 2.25rem;
  }

  .candidate-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.4rem;
    max-height: 16rem;
    overflow-y: auto;
  }

  .candidate-list li {
    margin: 0;
  }

  .candidate {
    display: grid;
    grid-template-columns: 3rem minmax(0, 1fr);
    gap: var(--space-2);
    align-items: center;
    width: 100%;
    min-height: 0;
    padding: 0.45rem 0.55rem;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    background: var(--color-surface-faint);
    color: var(--color-text);
    text-align: left;
    font-size: 0.88rem;
  }

  .candidate:hover:not(:disabled) {
    border-color: var(--color-border-strong);
  }

  .candidate.selected {
    border-color: var(--color-accent);
    box-shadow: 0 0 0 1px var(--color-accent);
  }

  .candidate img,
  .candidate-poster-fallback {
    width: 3rem;
    aspect-ratio: 2 / 3;
    object-fit: cover;
    border-radius: 4px;
    background: var(--color-surface-muted);
  }

  .candidate-copy {
    display: grid;
    gap: 0.1rem;
    min-width: 0;
  }

  .candidate-copy strong {
    overflow-wrap: anywhere;
  }

  .candidate-copy .muted {
    font-size: 0.78rem;
  }

  .preview {
    display: grid;
    gap: 0.3rem;
    border-top: 1px solid var(--color-border);
    padding-top: 0.65rem;
  }

  .section-title {
    margin: 0;
    font-size: 0.84rem;
    font-weight: 700;
    color: var(--color-subtle);
  }

  .preview-title {
    margin: 0;
    font-weight: 700;
  }

  .preview-overview {
    margin: 0;
    font-size: 0.86rem;
    display: -webkit-box;
    -webkit-line-clamp: 4;
    line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .error {
    margin: 0;
    font-size: 0.84rem;
  }

  .form-actions {
    justify-content: flex-end;
  }
</style>
