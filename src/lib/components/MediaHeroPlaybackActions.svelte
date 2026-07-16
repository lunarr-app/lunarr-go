<script lang="ts">
  import { CirclePlay, Eye, EyeOff } from "@lucide/svelte";

  let {
    primaryFile,
    primaryHref,
    primaryActionLabel,
    hasCompletedProgress,
  }: {
    primaryFile?: { id: string };
    primaryHref: string;
    primaryActionLabel: string;
    hasCompletedProgress: boolean;
  } = $props();
</script>

{#if primaryFile}
  <a class="button primary-action" href={primaryHref}>
    <CirclePlay size={19} aria-hidden="true" />
    {primaryActionLabel}
  </a>
  <form class="inline-action" method="POST" action="?/watched">
    <input type="hidden" name="fileId" value={primaryFile.id} />
    <button class="secondary" name="completed" value={hasCompletedProgress ? "false" : "true"}>
      {#if hasCompletedProgress}
        <EyeOff size={16} aria-hidden="true" />
        Unwatch
      {:else}
        <Eye size={16} aria-hidden="true" />
        Watched
      {/if}
    </button>
  </form>
{/if}
