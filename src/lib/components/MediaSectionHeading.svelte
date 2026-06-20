<script lang="ts">
  let {
    headingId,
    title,
    description,
  }: {
    headingId: string;
    title: string;
    description?: string;
  } = $props();
</script>

<div class="heading">
  <div>
    <h2 id={headingId}>{title}</h2>
    {#if description}
      <p class="muted">{description}</p>
    {/if}
  </div>
</div>

<style>
  .heading {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.85rem;
  }

  .heading h2,
  .heading p {
    margin: 0;
  }

  .heading p {
    margin-top: 0.25rem;
  }
</style>
