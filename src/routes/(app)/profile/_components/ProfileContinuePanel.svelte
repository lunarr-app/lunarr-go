<script lang="ts">
  import { Save } from "@lucide/svelte";

  const CONTINUE_MAX_AGE_DAYS_MIN = 0;
  const CONTINUE_MAX_AGE_DAYS_MAX = 3650;

  let {
    continueMaxAgeDays: initialContinueMaxAgeDays,
    continueMaxAgeError,
  }: {
    continueMaxAgeDays: number;
    continueMaxAgeError?: string;
  } = $props();

  let continueForm: HTMLFormElement | null = $state(null);
  let continueMaxAgeDays = $state(0);

  const continueDirty = $derived(continueMaxAgeDays !== initialContinueMaxAgeDays);

  $effect(() => {
    continueMaxAgeDays = initialContinueMaxAgeDays;
  });

  function submitContinueMaxAge() {
    continueForm?.requestSubmit();
  }
</script>

<form class="ops-panel" method="POST" action="?/saveContinueMaxAge" bind:this={continueForm}>
  <div class="ops-panel-header">
    <div>
      <h2>Continue watching</h2>
      <p class="muted">Hide idle in-progress items from your Continue rails.</p>
    </div>
  </div>

  <div class="ops-panel-body">
    <label>
      Max age (days)
      <input
        name="continueMaxAgeDays"
        type="number"
        min={CONTINUE_MAX_AGE_DAYS_MIN}
        max={CONTINUE_MAX_AGE_DAYS_MAX}
        step="1"
        bind:value={continueMaxAgeDays}
        onchange={submitContinueMaxAge}
      />
    </label>

    <p class="muted detail-copy">
      Use 0 to show all in-progress titles. When set, items without recent watch progress are hidden from Continue rails
      only. Progress is kept for resume on detail pages, and accidental starts shorter than 60 seconds are still
      ignored.
    </p>

    {#if continueMaxAgeError}
      <p class="error">{continueMaxAgeError}</p>
    {/if}

    <button type="submit" disabled={!continueDirty}>
      <Save size={16} aria-hidden="true" />
      Save continue settings
    </button>
  </div>
</form>

<style>
  .detail-copy {
    line-height: 1.5;
    font-size: 0.88rem;
  }
</style>
