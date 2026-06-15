<script lang="ts">
  let {
    showWatch = false,
    watchEnabled = true,
    scanIntervalMinutes = null,
  }: {
    showWatch?: boolean;
    watchEnabled?: boolean;
    scanIntervalMinutes?: number | string | null;
  } = $props();

  const selectedInterval = $derived(
    scanIntervalMinutes === null || scanIntervalMinutes === "" ? "" : String(scanIntervalMinutes),
  );
</script>

<fieldset class="automation-fieldset">
  <legend>Automation</legend>
  {#if showWatch}
    <input type="hidden" name="watchEnabled" value="0" />
    <label class="check subdued">
      <input type="checkbox" name="watchEnabled" value="1" checked={watchEnabled} />
      <span>Watch local changes</span>
    </label>
  {/if}
  <label>
    Scheduled rescan
    <select name="scanIntervalMinutes">
      <option value="" selected={selectedInterval === ""}>Off</option>
      <option value="15" selected={selectedInterval === "15"}>Every 15 minutes</option>
      <option value="60" selected={selectedInterval === "60"}>Hourly</option>
      <option value="360" selected={selectedInterval === "360"}>Every 6 hours</option>
      <option value="720" selected={selectedInterval === "720"}>Every 12 hours</option>
      <option value="1440" selected={selectedInterval === "1440"}>Daily</option>
    </select>
  </label>
</fieldset>

<style>
  .automation-fieldset {
    border: 0;
    border-radius: 0;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.65rem;
  }

  legend {
    padding: 0;
    margin-bottom: 0.25rem;
    font-weight: 700;
  }

  .check {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .check input[type="checkbox"] {
    width: 1rem;
    height: 1rem;
    min-height: 0;
    margin: 0;
    padding: 0;
    flex: 0 0 auto;
  }
</style>
