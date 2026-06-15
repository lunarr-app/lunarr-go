<script lang="ts">
  import ConfirmAction from "$lib/components/ConfirmAction.svelte";
  import ScanJobErrors from "./_components/ScanJobErrors.svelte";
  import { invalidateAll } from "$app/navigation";
  import { formatDateTime, formatElapsedDuration, formatRelativeTime } from "$lib/media/format";
  import { Activity, XCircle } from "@lucide/svelte";
  import { onMount } from "svelte";

  let { data, form } = $props();

  type Job = (typeof data.jobs)[number];
  type PlaybackSession = (typeof data.playbackSessions)[number];

  let now = $state(Date.now());

  const hasActiveJobs = $derived(
    data.jobs.some((job) => job.status === "queued" || job.status === "running") ||
      data.playbackSessions.some((job) => job.status === "queued" || job.status === "running"),
  );
  const scanKindLabel: Record<Job["job_kind"], string> = {
    library_scan: "Library scan",
    movie_metadata_refresh: "Movie metadata",
    tv_metadata_refresh: "TV metadata",
    media_probe_refresh: "Probe repair",
  };

  const scanStatusLabel: Record<Job["status"], string> = {
    queued: "Queued",
    running: "Running",
    completed: "Completed",
    failed: "Failed",
    cancelled: "Cancelled",
  };

  const playbackStatusLabel: Record<PlaybackSession["status"], string> = {
    queued: "Preparing",
    running: "Active",
    completed: "Ended",
    failed: "Failed",
    cancelled: "Cancelled",
  };

  function displayStatus(job: Job) {
    return job.status === "running" && job.cancel_requested_at ? "Cancelling" : scanStatusLabel[job.status];
  }

  function statusClass(job: Job) {
    return job.status === "running" && job.cancel_requested_at ? "cancelling" : job.status;
  }

  function formatJobDuration(
    start: string | null,
    end: string | null,
    status: Job["status"] | PlaybackSession["status"],
  ) {
    return formatElapsedDuration(start, end, { running: status === "running", nowMs: now });
  }

  function jobMetricsSummary(job: Job) {
    const parts: string[] = [];
    const seen = Number(job.files_seen ?? 0);
    const added = Number(job.files_added ?? 0);
    const updated = Number(job.files_updated ?? 0);
    const removed = Number(job.files_removed ?? 0);
    const errors = Number(job.errors_count ?? 0);

    if (seen > 0) parts.push(`${seen} seen`);
    if (added > 0) parts.push(`${added} added`);
    if (updated > 0) parts.push(`${updated} updated`);
    if (removed > 0) parts.push(`${removed} removed`);
    if (errors > 0) parts.push(`${errors} errors`);

    if (parts.length > 0) return parts.join(" · ");
    if (job.job_kind === "library_scan") return "No file changes";
    return "No files processed";
  }

  function jobName(job: Pick<Job, "job_kind" | "library_id" | "library_name">) {
    if (job.library_name) return job.library_name;
    if (job.job_kind === "movie_metadata_refresh") return "All movies";
    if (job.job_kind === "tv_metadata_refresh") return "All TV shows";
    if (job.job_kind === "media_probe_refresh") return "All media files";
    if (job.job_kind === "library_scan" && !job.library_id) return "Deleted library";
    return "Library scan";
  }

  function mediaHref(job: Pick<PlaybackSession, "media_item_id" | "media_item_kind">) {
    if (!job.media_item_id) return null;
    if (job.media_item_kind === "movie") return `/movies/${job.media_item_id}`;
    if (job.media_item_kind === "episode") return `/episodes/${job.media_item_id}`;
    return null;
  }

  function playbackSessionName(job: PlaybackSession) {
    return job.media_title ?? job.file_basename ?? job.media_file_id;
  }

  function playbackPipelineLabel(job: PlaybackSession) {
    if (job.pipeline === "request_driven") return "Request-driven";
    return "Pending";
  }

  function formatStartOffset(value: number | null | undefined) {
    const seconds = Math.max(0, Math.floor(Number(value ?? 0)));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
    return `${remainingSeconds}s`;
  }

  function playbackSessionActivity(job: PlaybackSession) {
    if (job.last_segment_request_at) return `Segment ${formatRelativeTime(job.last_segment_request_at, now)}`;
    if (job.last_heartbeat_at) return `Heartbeat ${formatRelativeTime(job.last_heartbeat_at, now)}`;
    return "No playback activity";
  }

  onMount(() => {
    const interval = window.setInterval(() => {
      now = Date.now();
      if (hasActiveJobs) void invalidateAll();
    }, 3000);

    return () => window.clearInterval(interval);
  });
</script>

<svelte:head>
  <title>Jobs - Lunarr</title>
  <meta name="description" content="Review scan jobs and playback sessions." />
</svelte:head>

<div class="ops-page-header">
  <div>
    <h1>Jobs</h1>
    <p class="muted">Scan and playback processing status.</p>
  </div>
  {#if hasActiveJobs}
    <span class="live-indicator"><Activity size={15} aria-hidden="true" /> Refreshing</span>
  {/if}
</div>

{#if form?.jobActionError}
  <p class="error">{form.jobActionError}</p>
{/if}

<section class="overview ops-stat-grid" aria-label="Jobs overview">
  <article class="ops-stat-card">
    <div class="overview-copy">
      <h2>Scans</h2>
      <p class="muted">Library scans, metadata refresh, and probe repair.</p>
    </div>
    <dl>
      <div>
        <dt>Active</dt>
        <dd>{data.summary.active}</dd>
      </div>
      <div>
        <dt>Completed</dt>
        <dd>{data.summary.completed}</dd>
      </div>
      <div>
        <dt>Failed</dt>
        <dd>{data.summary.failed}</dd>
      </div>
      <div>
        <dt>Cancelled</dt>
        <dd>{data.summary.cancelled}</dd>
      </div>
      <div>
        <dt>Errors</dt>
        <dd>{data.summary.errors}</dd>
      </div>
    </dl>
  </article>

  <article class="ops-stat-card">
    <div class="overview-copy">
      <h2>Playback</h2>
      <p class="muted">Temporary HLS transcode sessions.</p>
    </div>
    <dl>
      <div>
        <dt>Active</dt>
        <dd>{data.playbackSessionSummary.active}</dd>
      </div>
      <div>
        <dt>Ended</dt>
        <dd>{data.playbackSessionSummary.completed}</dd>
      </div>
      <div>
        <dt>Failed</dt>
        <dd>{data.playbackSessionSummary.failed}</dd>
      </div>
      <div>
        <dt>Cancelled</dt>
        <dd>{data.playbackSessionSummary.cancelled}</dd>
      </div>
      <div>
        <dt>Errors</dt>
        <dd>{data.playbackSessionSummary.errors}</dd>
      </div>
    </dl>
  </article>
</section>

<div class="job-panels ops-stat-grid">
  <section class="ops-panel">
    <div class="ops-panel-header">
      <h2>Scan jobs</h2>
    </div>

    <div class="ops-table">
      {#each data.jobs as job (job.id)}
        <article class="job-row ops-row">
          <div class="job-main">
            <div class="job-title">
              {#if job.library_id && job.library_name}
                <a class="job-link" href="/libraries"><strong>{jobName(job)}</strong></a>
              {:else}
                <strong>{jobName(job)}</strong>
              {/if}
              <span class={`status-badge ${statusClass(job)}`}>{displayStatus(job)}</span>
            </div>
            <div class="job-meta">
              <span>{scanKindLabel[job.job_kind]}</span>
              <span>{formatRelativeTime(job.updated_at ?? job.created_at, now)}</span>
              <span>{formatJobDuration(job.started_at, job.finished_at, job.status)}</span>
              {#if job.cancel_requested_at}
                <span>Cancel requested {formatRelativeTime(job.cancel_requested_at, now)}</span>
              {:else}
                <span>Started {formatDateTime(job.started_at, { fallback: "not-yet" })}</span>
              {/if}
            </div>
          </div>

          <p class="metrics" class:metrics-errors={Number(job.errors_count) > 0} aria-label="Job file counts">
            {jobMetricsSummary(job)}
          </p>

          <div class="job-actions">
            {#if job.status === "running" && job.cancel_requested_at}
              <span class="muted">Stopping</span>
            {:else if job.status === "queued" || job.status === "running"}
              <ConfirmAction
                action="?/cancel"
                fieldName="jobId"
                fieldValue={job.id}
                title="Cancel job?"
                message={`This will ${job.status === "queued" ? "cancel the queued job before it starts" : "request cancellation for the running job after the current item finishes"}.`}
                confirmLabel="Cancel job"
                buttonClass="secondary compact"
              >
                <XCircle size={15} aria-hidden="true" />
                Cancel
              </ConfirmAction>
            {/if}
          </div>

          <ScanJobErrors jobId={job.id} errorCount={Number(job.errors_count ?? 0)} />
        </article>
      {:else}
        <p class="empty-state muted">
          No scan jobs yet. Library scans from Libraries, plus metadata refresh and probe repair from Settings, appear
          here. The latest {data.scanJobListLimit} jobs are shown.
        </p>
      {/each}
    </div>
  </section>

  <section class="ops-panel">
    <div class="ops-panel-header">
      <h2>Playback sessions</h2>
    </div>

    <div class="ops-table">
      {#each data.playbackSessions as job}
        {@const titleHref = mediaHref(job)}
        <article class="job-row ops-row">
          <div class="job-main">
            <div class="job-title">
              {#if titleHref}
                <a class="job-link" href={titleHref}><strong>{playbackSessionName(job)}</strong></a>
              {:else}
                <strong>{playbackSessionName(job)}</strong>
              {/if}
              <span class={`status-badge ${job.status}`}>{playbackStatusLabel[job.status]}</span>
            </div>
            <div class="job-meta">
              <span>{formatRelativeTime(job.updated_at ?? job.created_at, now)}</span>
              <span>{formatJobDuration(job.started_at, job.finished_at, job.status)}</span>
              <span>{job.mode} · {playbackPipelineLabel(job)}</span>
              {#if job.user_email}
                <span>{job.user_email}</span>
              {/if}
            </div>
            {#if job.error_message}
              <p class="playback-session-error">{job.error_message}</p>
            {/if}
          </div>

          <div class="metrics playback-metrics" aria-label="Playback session details">
            <span><strong>{formatStartOffset(job.start_time_seconds)}</strong> start</span>
            <span><strong>{playbackSessionActivity(job)}</strong></span>
            <span><strong>{job.last_segment_name ?? "No segment"}</strong></span>
            <span><strong>{job.file_basename ?? "Missing file"}</strong></span>
          </div>

          <div class="job-actions">
            {#if job.status === "queued" || job.status === "running"}
              <ConfirmAction
                action="?/cancelPlaybackSession"
                fieldName="sessionId"
                fieldValue={job.playback_session_id}
                title="Cancel playback session?"
                message="This stops the active playback session and removes temporary HLS artifacts."
                confirmLabel="Cancel session"
                buttonClass="secondary compact"
              >
                <XCircle size={15} aria-hidden="true" />
                Cancel
              </ConfirmAction>
            {/if}
          </div>
        </article>
      {:else}
        <p class="empty-state muted">
          No playback sessions yet. Temporary HLS transcode sessions appear here while media is playing in a browser or
          on a receiver. The latest {data.playbackSessionListLimit} sessions are shown.
        </p>
      {/each}
    </div>
  </section>
</div>

<style>
  .live-indicator {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    min-height: 1.8rem;
    border: 1px solid var(--color-accent-border);
    border-radius: 999px;
    background: var(--color-accent-soft);
    color: var(--color-accent);
    padding: 0 0.7rem;
    font-size: 0.8rem;
    font-weight: 800;
    white-space: nowrap;
  }

  .overview {
    margin-top: 1rem;
  }

  .overview-copy {
    display: grid;
    gap: 0.15rem;
    min-width: 0;
    margin-bottom: 0.65rem;
  }

  .overview-copy p {
    margin: 0;
    font-size: 0.82rem;
    line-height: 1.35;
  }

  h2 {
    margin: 0;
    font-size: 1rem;
  }

  dl {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 0.55rem;
    margin: 0;
  }

  dl div {
    display: grid;
    gap: 0.1rem;
    min-width: 0;
  }

  dt,
  .job-meta,
  .metrics {
    color: var(--ops-muted);
    font-size: 0.82rem;
  }

  dt {
    font-size: 0.72rem;
    font-weight: 800;
    text-transform: uppercase;
  }

  dd {
    margin: 0;
    color: var(--ops-text);
    font-size: 1.25rem;
    font-weight: 850;
    line-height: 1;
  }

  .job-panels {
    margin-top: 1rem;
    align-items: start;
  }

  .job-row {
    display: grid;
    grid-template-columns: minmax(14rem, 1fr) minmax(10rem, 14rem) auto;
    gap: 0.85rem;
    align-items: center;
    padding: 0.72rem 0.85rem;
  }

  .job-main {
    display: grid;
    gap: 0.32rem;
    min-width: 0;
  }

  .job-title {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }

  .job-title strong {
    overflow-wrap: anywhere;
    line-height: 1.2;
  }

  .job-link {
    color: inherit;
    text-decoration: none;
  }

  .job-link:hover strong {
    color: var(--color-accent);
  }

  .job-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 0.75rem;
  }

  .metrics {
    margin: 0;
    min-width: 0;
    color: var(--ops-muted);
    font-size: 0.82rem;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }

  .metrics-errors {
    color: var(--color-error-strong);
  }

  .playback-metrics {
    display: grid;
    gap: 0.25rem;
  }

  .playback-metrics span {
    min-width: 0;
  }

  .playback-metrics strong {
    overflow-wrap: anywhere;
    color: var(--ops-text);
    font-size: 0.9rem;
  }

  .playback-session-error {
    margin: 0;
    color: var(--color-error-strong);
    font-size: 0.9rem;
    overflow-wrap: anywhere;
  }

  .job-actions {
    display: flex;
    justify-content: flex-end;
    min-width: 5rem;
  }

  .compact {
    min-height: 1.95rem;
    padding: 0 0.65rem;
    font-size: 0.82rem;
  }

  .empty-state {
    margin: 0;
    padding: 0.85rem;
    line-height: 1.45;
  }

  @media (max-width: 1080px) {
    .job-row {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .metrics {
      grid-column: 1 / -1;
      order: 3;
    }

    .job-actions {
      justify-content: flex-start;
    }

    .job-row :global(.job-errors) {
      order: 4;
    }
  }

  @media (max-width: 560px) {
    dl {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .job-row {
      grid-template-columns: 1fr;
    }

    .metrics {
      order: initial;
    }
  }
</style>
