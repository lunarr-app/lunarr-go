<script lang="ts">
  let {
    name,
    title,
    description,
    checked = $bindable(false),
    onchange,
  }: {
    name: string;
    title: string;
    description: string;
    checked?: boolean;
    onchange?: () => void;
  } = $props();
</script>

<label class="switch-row">
  <span>
    <strong>{title}</strong>
    <small>{description}</small>
  </span>
  <span class="switch">
    <input type="checkbox" {name} bind:checked {onchange} />
    <span class="switch-track" aria-hidden="true"></span>
  </span>
</label>

<style>
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
