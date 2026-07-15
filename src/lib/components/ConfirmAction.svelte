<script lang="ts">
  import { tick, type Snippet } from "svelte";
  import ModalDialog from "./ModalDialog.svelte";

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

  const titleId = `confirm-dialog-${Math.random().toString(36).slice(2, 9)}`;

  async function openDialog() {
    open = true;
    await tick();
    confirmButton?.focus();
  }

  function closeDialog() {
    open = false;
  }
</script>

<button class={buttonClass} type="button" {disabled} onclick={openDialog}>
  {@render children()}
</button>

{#if open}
  <ModalDialog {title} {titleId} onClose={closeDialog}>
    <div class="dialog-form">
      <p class="message">{message}</p>
      <form method="POST" {action} class="form-actions">
        <input type="hidden" name={fieldName} value={fieldValue} />
        <button class="secondary" type="button" onclick={closeDialog}>Keep</button>
        <button class="danger" type="submit" bind:this={confirmButton}>{confirmLabel}</button>
      </form>
    </div>
  </ModalDialog>
{/if}

<style>
  .dialog-form {
    display: grid;
    gap: var(--space-3);
  }

  .message {
    margin: 0;
    color: var(--color-subtle);
    line-height: 1.45;
  }

  @media (max-width: 480px) {
    .form-actions {
      flex-direction: column-reverse;
    }
  }
</style>
