<script lang="ts">
  import { TriangleAlert } from "@lucide/svelte";
  import { tick, type Snippet } from "svelte";

  let {
    action,
    fieldName,
    fieldValue,
    title,
    message,
    confirmLabel,
    buttonClass = "secondary danger",
    disabled = false,
    children,
  }: {
    action: string;
    fieldName: string;
    fieldValue: string;
    title: string;
    message: string;
    confirmLabel: string;
    buttonClass?: string;
    disabled?: boolean;
    children: Snippet;
  } = $props();

  let open = $state(false);
  let confirmButton: HTMLButtonElement | null = $state(null);
  let dialog: HTMLDivElement | null = $state(null);

  async function openDialog() {
    open = true;
    await tick();
    confirmButton?.focus();
  }

  function closeDialog() {
    open = false;
  }

  $effect(() => {
    if (!open) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDialog();
    };

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  });
</script>

<button class={buttonClass} type="button" {disabled} onclick={openDialog}>
  {@render children()}
</button>

{#if open}
  <div
    class="overlay"
    role="presentation"
    onpointerdown={(event) => event.target === event.currentTarget && closeDialog()}
  >
    <div class="dialog" role="dialog" aria-modal="true" aria-label={title} bind:this={dialog}>
      <div class="icon" aria-hidden="true">
        <TriangleAlert size={22} />
      </div>
      <div class="copy">
        <h2>{title}</h2>
        <p>{message}</p>
      </div>
      <form method="POST" {action}>
        <input type="hidden" name={fieldName} value={fieldValue} />
        <button class="secondary" type="button" onclick={closeDialog}>Keep</button>
        <button class="danger" type="submit" bind:this={confirmButton}>{confirmLabel}</button>
      </form>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.58);
    padding: 1rem;
  }

  .dialog {
    width: min(100%, 26rem);
    border: 1px solid var(--color-border-strong);
    border-radius: 8px;
    background: var(--color-popover);
    box-shadow: 0 1.5rem 4rem rgba(0, 0, 0, 0.42);
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.85rem;
    padding: 1rem;
  }

  .icon {
    display: grid;
    place-items: center;
    width: 2.4rem;
    height: 2.4rem;
    border-radius: 8px;
    background: var(--color-warning-soft);
    color: var(--color-warning);
  }

  .copy {
    display: grid;
    gap: 0.35rem;
    min-width: 0;
  }

  h2,
  p {
    margin: 0;
  }

  h2 {
    font-size: 1.05rem;
  }

  p {
    color: var(--color-subtle);
    line-height: 1.45;
  }

  form {
    grid-column: 1 / -1;
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  @media (max-width: 480px) {
    .dialog {
      grid-template-columns: 1fr;
    }

    form {
      flex-direction: column-reverse;
    }
  }
</style>
