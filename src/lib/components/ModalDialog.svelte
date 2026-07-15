<script lang="ts">
  import { X } from "@lucide/svelte";
  import { tick, type Snippet } from "svelte";

  let {
    title,
    titleId,
    subtitle = "",
    focusKey,
    width = "36rem",
    maxHeight = "48rem",
    onClose,
    children,
  }: {
    title: string;
    titleId: string;
    subtitle?: string;
    focusKey?: string;
    width?: string;
    maxHeight?: string;
    onClose: () => void;
    children: Snippet;
  } = $props();

  let dialog: HTMLDivElement | null = $state(null);

  $effect(() => {
    focusKey;
    void tick().then(() => dialog?.focus());
  });

  $effect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  });
</script>

<div class="overlay" role="presentation" onpointerdown={(event) => event.target === event.currentTarget && onClose()}>
  <div
    class="dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby={titleId}
    tabindex="-1"
    bind:this={dialog}
    style:--modal-width={width}
    style:--modal-max-height={maxHeight}
  >
    <header class="dialog-header">
      <div>
        <h2 id={titleId}>{title}</h2>
        {#if subtitle}
          <p class="muted">{subtitle}</p>
        {/if}
      </div>
      <button class="secondary icon-button" type="button" aria-label="Close" onclick={onClose}>
        <X size={18} aria-hidden="true" />
      </button>
    </header>

    <div class="dialog-body">
      {@render children()}
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.58);
    padding: var(--space-3);
  }

  .dialog {
    width: min(100%, var(--modal-width, 36rem));
    max-height: min(90vh, var(--modal-max-height, 48rem));
    overflow: auto;
    border: 1px solid var(--color-border-strong);
    border-radius: 8px;
    background: var(--color-popover);
    box-shadow: 0 1.5rem 4rem rgba(0, 0, 0, 0.42);
    display: grid;
    gap: 0;
  }

  .dialog:focus {
    outline: none;
  }

  .dialog-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-3) 0.75rem;
    border-bottom: 1px solid var(--color-border);
  }

  .dialog-header h2 {
    margin: 0;
    font-size: 1.1rem;
  }

  .dialog-header p {
    margin: 0.25rem 0 0;
    font-size: 0.9rem;
  }

  .icon-button {
    min-height: 2rem;
    padding: 0 0.55rem;
  }

  .dialog-body {
    padding: var(--space-3);
  }

  .dialog-body :global(.dialog-form) {
    display: grid;
    gap: 0.75rem;
  }

  .dialog-body :global(.form-actions) {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-2);
  }
</style>
