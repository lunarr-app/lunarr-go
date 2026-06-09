<script lang="ts">
  let { form } = $props();

  const formData = $derived((form ?? {}) as Record<string, string>);
</script>

<svelte:head>
  <title>Create account - Lunarr</title>
  <meta name="description" content="Create a Lunarr account for this server." />
</svelte:head>

<h1>Create account</h1>
<p class="muted">Register a user account for this Lunarr server.</p>

<form method="POST">
  <label>
    Name
    <input
      name="name"
      autocomplete="name"
      value={formData.name ?? ""}
      required
    />
  </label>
  <label>
    Email
    <input
      name="email"
      type="email"
      autocomplete="email"
      value={formData.email ?? ""}
      required
    />
  </label>
  <label>
    Password
    <input
      name="password"
      type="password"
      autocomplete="new-password"
      minlength="8"
      required
    />
  </label>
  {#if form?.error}
    <p class="error">{form.error}</p>
  {/if}
  <button>
    Create account
  </button>
</form>

<div class="auth-link">
  <span class="muted">Already have an account?</span>
  <a href="/login">Sign in</a>
</div>
