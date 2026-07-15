<script lang="ts">
  import ShowCard from "$lib/components/ShowCard.svelte";
  import Rail from "$lib/components/Rail.svelte";
  import { ChevronRight, Library } from "@lucide/svelte";

  let { data } = $props();

  function countLabel(total: number, singular: string, plural: string) {
    return `${total} ${total === 1 ? singular : plural}`;
  }

  const showSections = $derived([
    {
      key: "recent",
      title: "Recently added",
      shows: data.rows.recent,
      href: "/shows/recent",
    },
    {
      key: "latest",
      title: "Recently aired",
      shows: data.rows.latest,
      href: "/shows/latest",
    },
    {
      key: "popular",
      title: "Popular",
      shows: data.rows.popular,
      href: "/shows/popular",
    },
  ]);
  const hasContent = $derived(showSections.some((section) => section.shows.length > 0));
</script>

<svelte:head>
  <title>Shows - Lunarr</title>
  <meta name="description" content="Browse scanned TV shows in your Lunarr library by show and season." />
</svelte:head>

{#if !hasContent}
  <section class="empty">
    <h2>No shows scanned yet</h2>
    <p class="muted">Add a TV library and run a scan to populate this page.</p>
    <a class="button" href="/libraries">
      <Library size={16} aria-hidden="true" />
      Add library
    </a>
  </section>
{:else}
  {#each showSections as section}
    {#if section.shows.length}
      <section class="media-section" aria-labelledby={`${section.key}-heading`}>
        <div class="section-heading">
          <h2 id={`${section.key}-heading`}>{section.title}</h2>
          <div class="section-meta">
            <span>{countLabel(section.shows.length, "show", "shows")}</span>
            {#if section.href}
              <a class="view-all" href={section.href}>
                <span>View all</span>
                <ChevronRight size={16} aria-hidden="true" />
              </a>
            {/if}
          </div>
        </div>
        <Rail items={section.shows} variant="poster">
          {#snippet children(show)}
            <ShowCard {show} />
          {/snippet}
        </Rail>
      </section>
    {/if}
  {/each}
{/if}

<style>
  .media-section + .media-section {
    margin-top: var(--space-5);
  }

  h2 {
    margin: 0;
  }

  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: 0.85rem;
  }

  .section-meta {
    display: flex;
    align-items: center;
    gap: 0.85rem;
  }

  .section-meta span {
    color: var(--color-muted);
    font-size: 0.86rem;
    font-weight: 700;
  }

  .view-all {
    display: inline-flex;
    align-items: center;
    gap: 0.15rem;
    color: var(--color-muted);
    font-size: 0.9rem;
    font-weight: 700;
    white-space: nowrap;
  }

  .view-all:hover {
    color: var(--color-text);
  }

  .empty {
    display: grid;
    justify-items: start;
    gap: 0.8rem;
    margin-top: 3rem;
    max-width: 34rem;
  }

  .empty h2 {
    margin: 0;
  }
</style>
