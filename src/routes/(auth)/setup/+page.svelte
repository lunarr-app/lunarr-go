<script lang="ts">
  let { form } = $props();

  const formData = $derived((form ?? {}) as Record<string, string>);
</script>

<svelte:head>
  <title>Set up Lunarr</title>
  <meta name="description" content="Create the first admin account for this Lunarr server." />
</svelte:head>

<h1>Set up Lunarr</h1>
<p class="muted">Create the first admin account for this server.</p>

<form method="POST">
  <label>
    Name
    <input name="name" autocomplete="name" value={formData.name ?? ""} required />
  </label>
  <label>
    Email
    <input name="email" type="email" autocomplete="email" value={formData.email ?? ""} required />
  </label>
  <label>
    Password
    <input name="password" type="password" autocomplete="new-password" minlength="8" required />
  </label>
  {#if form?.error}
    <p class="error">{form.error}</p>
  {/if}
  <button> Create admin </button>
</form>
