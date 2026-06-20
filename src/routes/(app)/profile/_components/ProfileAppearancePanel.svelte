<script lang="ts">
  import { browser } from "$app/environment";
  import { getStoredTheme, setStoredTheme, type Theme } from "$lib/theme";
  import { SunMoon } from "@lucide/svelte";

  let selectedTheme = $state<Theme>("dark");

  $effect(() => {
    if (!browser) return;
    selectedTheme = getStoredTheme();
  });

  function chooseTheme(theme: Theme) {
    selectedTheme = theme;
    setStoredTheme(theme);
  }
</script>

<section class="ops-panel">
  <div class="ops-panel-header">
    <div>
      <h2>Appearance</h2>
      <p class="muted">Theme for this browser.</p>
    </div>
    <SunMoon size={18} aria-hidden="true" />
  </div>

  <div class="ops-panel-body">
    <div class="theme-options" role="group" aria-label="Theme">
      <button
        class:active={selectedTheme === "dark"}
        type="button"
        class="secondary"
        aria-pressed={selectedTheme === "dark"}
        onclick={() => chooseTheme("dark")}
      >
        Dark
      </button>
      <button
        class:active={selectedTheme === "light"}
        type="button"
        class="secondary"
        aria-pressed={selectedTheme === "light"}
        onclick={() => chooseTheme("light")}
      >
        Light
      </button>
    </div>
  </div>
</section>

<style>
  .theme-options {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem;
  }

  .theme-options button.active {
    border-color: var(--color-accent-border);
    background: var(--color-accent-soft);
    color: var(--color-accent);
  }

  .ops-panel-header :global(svg) {
    color: var(--ops-muted);
    flex-shrink: 0;
  }
</style>
