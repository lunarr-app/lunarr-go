<script lang="ts">
  import { Search } from "@lucide/svelte";

  let {
    ariaLabel,
    name = "q",
    placeholder,
    value = "",
    oninput,
  }: {
    ariaLabel: string;
    name?: string;
    placeholder: string;
    value?: string;
    oninput?: (event: Event) => void;
  } = $props();
</script>

<label class="search-field" aria-label={ariaLabel}>
  <Search size={16} aria-hidden="true" />
  <input type="search" {name} {placeholder} {value} {oninput} />
</label>

<style>
  .search-field {
    position: relative;
    display: block;
  }

  .search-field :global(svg) {
    position: absolute;
    top: 50%;
    left: 0.75rem;
    color: var(--color-muted);
    transform: translateY(-50%);
    pointer-events: none;
  }

  input {
    padding-left: 2.25rem;
  }
</style>
