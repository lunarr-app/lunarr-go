<script lang="ts">
  import AppShell from "$lib/components/AppShell.svelte";

  let { children, data } = $props();
</script>

<AppShell user={data.user}>
  {@render children()}
</AppShell>
