<script lang="ts">
  import { formatDateTime } from "$lib/media/format";
  import MediaMetadataPanel from "$lib/components/MediaMetadataPanel.svelte";

  let {
    show,
    onFixMatchOpen,
    canManageMetadata,
    tmdbConfigured,
    ratingLabel,
    voteCountLabel,
    providerLabel,
    creatorLabel,
    seasonCountLabel,
    episodeCountLabel,
    productionCompanies,
    keywords,
    metadataError,
  }: {
    show: {
      certification: string | null;
      status: string | null;
      releaseDate: string | null;
      originalLanguage: string | null;
      providerId: string | null;
      updatedAt: string;
    };
    onFixMatchOpen?: () => void;
    canManageMetadata: boolean;
    tmdbConfigured: boolean;
    ratingLabel: string | null;
    voteCountLabel: string | null;
    providerLabel: string;
    creatorLabel: string;
    seasonCountLabel: string;
    episodeCountLabel: string;
    productionCompanies: string[];
    keywords: string[];
    metadataError?: string;
  } = $props();
</script>

<MediaMetadataPanel
  chipsLabel="Show metadata facts"
  {ratingLabel}
  {voteCountLabel}
  certificationLabel={show.certification ?? "NR"}
  statusLabel={show.status ?? "Unknown status"}
  {canManageMetadata}
  {tmdbConfigured}
  {metadataError}
  {keywords}
  {onFixMatchOpen}
>
  {#snippet chips()}
    <span>{providerLabel}</span>
    {#if show.releaseDate}
      <span>{show.releaseDate}</span>
    {/if}
    {#if show.originalLanguage}
      <span>{show.originalLanguage.toUpperCase()}</span>
    {/if}
  {/snippet}

  {#snippet blocks()}
    <section>
      <h3>Credits</h3>
      <dl>
        <div>
          <dt>Created by</dt>
          <dd>{creatorLabel || "Unknown"}</dd>
        </div>
      </dl>
    </section>
    <section>
      <h3>Library</h3>
      <dl>
        <div>
          <dt>Seasons</dt>
          <dd>{seasonCountLabel}</dd>
        </div>
        <div>
          <dt>Episodes</dt>
          <dd>{episodeCountLabel}</dd>
        </div>
        <div>
          <dt>Provider ID</dt>
          <dd>{show.providerId ?? "None"}</dd>
        </div>
        <div>
          <dt>Last updated</dt>
          <dd>{formatDateTime(show.updatedAt)}</dd>
        </div>
      </dl>
    </section>
    {#if productionCompanies.length}
      <section>
        <h3>Production</h3>
        <dl>
          <div>
            <dt>Studios</dt>
            <dd>{productionCompanies.join(", ")}</dd>
          </div>
        </dl>
      </section>
    {/if}
  {/snippet}
</MediaMetadataPanel>
