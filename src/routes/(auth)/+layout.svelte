<script lang="ts">
  let { children } = $props();
</script>

<main class="auth-shell">
  <section class="auth-card">
    <img class="brand" src="/images/lunarr-logo.svg" alt="Lunarr" />
    {@render children()}
  </section>
</main>

<style>
  .auth-shell {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 1rem;
    background:
      linear-gradient(rgba(2, 8, 12, 0.54), rgba(2, 8, 12, 0.78)),
      url("/images/lunarr-auth-background.png") center / cover;
  }

  .auth-card {
    width: min(100%, 28rem);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    background: rgba(5, 10, 14, 0.76);
    padding: clamp(1.25rem, 4vw, 2rem);
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.42);
    backdrop-filter: blur(14px);
  }

  .brand {
    display: block;
    width: min(13rem, 72%);
    height: auto;
    margin: 0 auto 1.45rem;
  }

  .auth-card :global(h1) {
    margin: 0 0 0.35rem;
  }

  .auth-card :global(form) {
    display: grid;
    gap: 1rem;
    margin-top: 1.4rem;
  }

  .auth-card :global(.auth-link) {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    margin-top: 1rem;
    font-size: 0.92rem;
  }

  .auth-card :global(.auth-link a) {
    color: #9be8ff;
    font-weight: 700;
  }
</style>
