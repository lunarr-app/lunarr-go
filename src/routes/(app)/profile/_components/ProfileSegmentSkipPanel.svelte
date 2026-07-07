<script lang="ts">
  import SwitchField from "$lib/components/SwitchField.svelte";
  import type { SegmentSkipPreferences } from "$lib/server/playback/segment-skip-preferences";

  let {
    segmentSkip: initialSegmentSkip,
    segmentSkipError,
  }: {
    segmentSkip: SegmentSkipPreferences;
    segmentSkipError?: string;
  } = $props();

  let segmentSkipForm: HTMLFormElement | null = $state(null);
  let segmentSkipEnabled = $state(true);
  let segmentSkipAutomatic = $state(false);

  $effect(() => {
    segmentSkipEnabled = initialSegmentSkip.enabled;
    segmentSkipAutomatic = initialSegmentSkip.automatic;
  });

  function submitSegmentSkip() {
    segmentSkipForm?.requestSubmit();
  }
</script>

<form class="ops-panel" method="POST" action="?/saveSegmentSkip" bind:this={segmentSkipForm}>
  <div class="ops-panel-header">
    <div>
      <h2>Skip intro & credits</h2>
      <p class="muted">Intro, recap, and credits markers from IntroDB during playback.</p>
    </div>
  </div>

  <div class="ops-panel-body">
    <SwitchField
      name="segmentSkipEnabled"
      title="Skip intro, recap, and credits"
      description={segmentSkipEnabled
        ? "Lunarr looks up segment timestamps when playback starts"
        : "Segment skip is turned off"}
      bind:checked={segmentSkipEnabled}
      onchange={submitSegmentSkip}
    />

    <label>
      Skip behavior
      {#if !segmentSkipEnabled}
        <input type="hidden" name="segmentSkipAutomatic" value={segmentSkipAutomatic ? "1" : "0"} />
      {/if}
      <select
        name="segmentSkipAutomatic"
        value={segmentSkipAutomatic ? "1" : "0"}
        disabled={!segmentSkipEnabled}
        onchange={(event) => {
          segmentSkipAutomatic = event.currentTarget.value === "1";
          submitSegmentSkip();
        }}
      >
        <option value="0">Show skip button</option>
        <option value="1">Skip automatically</option>
      </select>
    </label>

    <p class="muted detail-copy">
      Timestamps come from TheIntroDB when available. Automatic skip seeks past each segment once per title. Rewinding
      into a segment does not auto-skip again.
    </p>

    {#if segmentSkipError}
      <p class="error">{segmentSkipError}</p>
    {/if}
  </div>
</form>
