<script lang="ts">
  import SettingsSwitchField from "./SettingsSwitchField.svelte";

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
    <SettingsSwitchField
      name="signupOpen"
      title="Allow new users"
      description={signupOpen ? "Registration open" : "Registration closed"}
      bind:checked={signupOpen}
      onchange={submitRegistration}
    />
    <p class="muted detail-copy">
      Existing users and admins are unaffected when registration is disabled. Manage per-library sharing from Libraries.
    </p>

    {#if registrationError}
      <p class="error">{registrationError}</p>
    {/if}
  </div>
</form>
