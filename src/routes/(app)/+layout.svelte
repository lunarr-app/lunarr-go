<script lang="ts">
  import { page } from "$app/state";
  import AppShell from "$lib/components/AppShell.svelte";

  let { children, data } = $props();
  const isErrorPage = $derived(Boolean(page.error));
</script>

{#if isErrorPage}
  {@render children()}
{:else}
  <AppShell user={data.user}>
    {@render children()}
  </AppShell>
{/if}
