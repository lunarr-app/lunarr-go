<script lang="ts">
  import "../app.css";

  let { children } = $props();
</script>

<svelte:head>
  <title>Lunarr</title>
  <meta
    name="description"
    content="Lunarr is a self-hosted media server for scanning, organizing, and watching your movie libraries."
  />
</svelte:head>

{@render children()}
