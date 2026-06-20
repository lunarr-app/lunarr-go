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
