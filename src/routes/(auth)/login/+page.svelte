<script lang="ts">
  import { POST_LOGIN_REDIRECT_QUERY_PARAM } from "$lib/auth/post-login-redirect";

  let { data, form } = $props();

  const formData = $derived((form ?? {}) as Record<string, string>);
</script>

<svelte:head>
  <title>Sign in - Lunarr</title>
  <meta name="description" content="Sign in to your Lunarr account." />
</svelte:head>

<h1>Sign in</h1>
<p class="muted">Use your Lunarr account to manage and watch this local library.</p>

<form method="POST" action="?/signIn">
  {#if data.redirectTo}
    <input type="hidden" name={POST_LOGIN_REDIRECT_QUERY_PARAM} value={data.redirectTo} />
  {/if}
  <label>
    Email
    <input name="email" type="email" autocomplete="email" value={formData.email ?? ""} required />
  </label>
  <label>
    Password
    <input name="password" type="password" autocomplete="current-password" required />
  </label>
  {#if form?.error}
    <p class="error">{form.error}</p>
  {/if}
  <button> Sign in </button>
</form>

{#if data.signupOpen}
  <div class="auth-link">
    <span class="muted">Need an account?</span>
    <a href="/signup">Create account</a>
  </div>
{/if}
