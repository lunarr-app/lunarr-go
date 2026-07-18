<script lang="ts">
  import { FileWarning } from "@lucide/svelte";

  type ScanJobError = {
    id: number;
    path: string;
    message: string;
  };

  let { jobId, errorCount }: { jobId: string; errorCount: number } = $props();

  let errors = $state<ScanJobError[] | null>(null);
  let loading = $state(false);
  let fetchError = $state<string | null>(null);

  async function loadErrors() {
    if (errors !== null || loading) return;

    loading = true;
    fetchError = null;
    try {
      const response = await fetch(`/api/jobs/${jobId}/errors`);
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(body?.detail ?? "Could not load errors.");
      }
      const body = (await response.json()) as { errors: ScanJobError[] };
      errors = body.errors;
    } catch (error) {
      fetchError = error instanceof Error ? error.message : "Could not load errors.";
    } finally {
      loading = false;
    }
  }

  function onToggle(event: Event) {
    const details = event.currentTarget as HTMLDetailsElement;
    if (details.open) {
      void loadErrors();
      return;
    }

    errors = null;
    fetchError = null;
  }
</script>

{#if errorCount > 0}
  <details class="job-errors" ontoggle={onToggle}>
    <summary>
      <FileWarning size={15} aria-hidden="true" />
      {errorCount}
      {errorCount === 1 ? "error" : "errors"}
    </summary>
    <div class="error-list">
      {#if loading}
        <p class="muted">Loading errors…</p>
      {:else if fetchError}
        <p class="error-message">{fetchError}</p>
      {:else if errors}
        {#if errors.length === 0}
          <p class="muted">No error details were recorded for this job.</p>
        {:else}
          {#if errors.length < errorCount}
            <p class="muted">Showing latest {errors.length} of {errorCount} errors.</p>
          {/if}
          {#each errors as item (item.id)}
            <div class="error-row">
              <span class="error-path">{item.path}</span>
              <span class="error-message">{item.message}</span>
            </div>
          {/each}
        {/if}
      {/if}
    </div>
  </details>
{/if}

<style>
  .job-errors {
    grid-column: 1 / -1;
    color: var(--color-subtle);
  }

  .job-errors summary {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    color: var(--ops-warning);
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 800;
  }

  .error-list {
    display: grid;
    gap: var(--space-2);
    margin-top: 0.6rem;
  }

  .error-list > .muted,
  .error-list > .error-message {
    margin: 0;
  }

  .error-row {
    display: grid;
    gap: 0.2rem;
    margin: 0;
  }

  .error-path {
    color: var(--color-muted);
    font-size: 0.82rem;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }

  .error-message {
    color: var(--color-error-strong);
    font-size: 0.9rem;
    line-height: 1.4;
    overflow-wrap: anywhere;
  }
</style>
