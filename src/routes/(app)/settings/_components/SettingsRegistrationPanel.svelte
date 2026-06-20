<script lang="ts">
  let {
    signupOpen: initialSignupOpen,
    registrationError,
  }: {
    signupOpen: boolean;
    registrationError?: string;
  } = $props();

  let signupOpen = $state(false);
  let registrationForm: HTMLFormElement | null = $state(null);

  $effect(() => {
    signupOpen = initialSignupOpen;
  });

  function submitRegistration() {
    registrationForm?.requestSubmit();
  }
</script>

<form class="ops-panel" method="POST" action="?/saveRegistration" bind:this={registrationForm}>
  <div class="ops-panel-header">
    <div>
      <h2>User registration</h2>
      <p class="muted">New account creation.</p>
    </div>
  </div>

  <div class="ops-panel-body">
    <label class="switch-row">
      <span>
        <strong>Allow new users</strong>
        <small>{signupOpen ? "Registration open" : "Registration closed"}</small>
      </span>
      <span class="switch">
        <input type="checkbox" name="signupOpen" bind:checked={signupOpen} onchange={submitRegistration} />
        <span class="switch-track" aria-hidden="true"></span>
      </span>
    </label>
    <p class="muted detail-copy">
      Existing users and admins are unaffected when registration is disabled. Manage per-library sharing from Libraries.
    </p>

    {#if registrationError}
      <p class="error">{registrationError}</p>
    {/if}
  </div>
</form>

<style>
  h2 {
    font-size: 1.02rem;
    margin: 0;
  }

  .detail-copy {
    line-height: 1.5;
    font-size: 0.88rem;
  }

  .switch-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.75rem;
    align-items: center;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-surface-faint);
    padding: 0.6rem 0.7rem;
  }

  .switch-row > span:first-child {
    display: grid;
    gap: 0.12rem;
    min-width: 0;
  }

  .switch-row strong {
    color: var(--color-text);
  }

  .switch-row small {
    color: var(--color-dim);
    font-size: 0.86rem;
  }

  .switch {
    position: relative;
    display: inline-grid;
    width: 2.8rem;
    height: 1.55rem;
    flex-shrink: 0;
  }

  .switch input {
    position: absolute;
    inset: 0;
    z-index: 1;
    width: 100%;
    min-height: 0;
    margin: 0;
    cursor: pointer;
    opacity: 0;
  }

  .switch-track {
    position: relative;
    border: 1px solid var(--color-border-strong);
    border-radius: 999px;
    background: var(--color-border-strong);
    transition:
      background 140ms ease,
      border-color 140ms ease;
  }

  .switch-track::after {
    content: "";
    position: absolute;
    top: 0.2rem;
    left: 0.2rem;
    width: 1.05rem;
    height: 1.05rem;
    border-radius: 999px;
    background: var(--color-text-soft);
    transition: transform 140ms ease;
  }

  .switch input:checked + .switch-track {
    border-color: var(--color-accent-border);
    background: var(--color-accent-soft);
  }

  .switch input:checked + .switch-track::after {
    transform: translateX(1.22rem);
    background: var(--color-accent);
  }

  .switch input:focus-visible + .switch-track {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
</style>
