<script lang="ts">
  import { formatDateTime, formatFileSize } from "$lib/media/format";
  import MediaMetadataPanel from "$lib/components/MediaMetadataPanel.svelte";

  let {
    movie,
    canManageMetadata,
    tmdbConfigured,
    ratingLabel,
    voteCountLabel,
    runtimeLabel,
    providerLabel,
    directorLabel,
    writerLabel,
    fileCountLabel,
    totalSizeBytes,
    productionCompanies,
    keywords,
    metadataError,
  }: {
    movie: {
      certification: string | null;
      status: string | null;
      release_date: string | null;
      original_language: string | null;
      provider_id: string | null;
      updated_at: string;
      collection_name: string | null;
    };
    canManageMetadata: boolean;
    tmdbConfigured: boolean;
    ratingLabel: string | null;
    voteCountLabel: string | null;
    runtimeLabel: string | null;
    providerLabel: string;
    directorLabel: string;
    writerLabel: string;
    fileCountLabel: string;
    totalSizeBytes: number;
    productionCompanies: string[];
    keywords: string[];
    metadataError?: string;
  } = $props();
</script>

<MediaMetadataPanel
  chipsLabel="Movie metadata facts"
  {ratingLabel}
  {voteCountLabel}
  certificationLabel={movie.certification ?? "NR"}
  statusLabel={movie.status ?? "Unknown status"}
  {canManageMetadata}
  {tmdbConfigured}
  {metadataError}
  {keywords}
>
  {#snippet chips()}
    <span>{providerLabel}</span>
    {#if movie.release_date}
      <span>{movie.release_date}</span>
    {/if}
    {#if runtimeLabel}
      <span>{runtimeLabel}</span>
    {/if}
    {#if movie.original_language}
      <span>{movie.original_language.toUpperCase()}</span>
    {/if}
  {/snippet}

  {#snippet blocks()}
    <section>
      <h3>Credits</h3>
      <dl>
        <div>
          <dt>Director</dt>
          <dd>{directorLabel || "Unknown"}</dd>
        </div>
        <div>
          <dt>Writers</dt>
          <dd>{writerLabel || "Unknown"}</dd>
        </div>
      </dl>
    </section>
    <section>
      <h3>Library</h3>
      <dl>
        <div>
          <dt>Files</dt>
          <dd>{fileCountLabel}</dd>
        </div>
        <div>
          <dt>Total size</dt>
          <dd>{formatFileSize(totalSizeBytes)}</dd>
        </div>
        <div>
          <dt>Provider ID</dt>
          <dd>{movie.provider_id ?? "None"}</dd>
        </div>
        <div>
          <dt>Last updated</dt>
          <dd>{formatDateTime(movie.updated_at)}</dd>
        </div>
      </dl>
    </section>
    {#if movie.collection_name || productionCompanies.length}
      <section>
        <h3>Production</h3>
        <dl>
          <div>
            <dt>Collection</dt>
            <dd>{movie.collection_name ?? "None"}</dd>
          </div>
          {#if productionCompanies.length}
            <div>
              <dt>Studios</dt>
              <dd>{productionCompanies.join(", ")}</dd>
            </div>
          {/if}
        </dl>
      </section>
    {/if}
  {/snippet}
</MediaMetadataPanel>
