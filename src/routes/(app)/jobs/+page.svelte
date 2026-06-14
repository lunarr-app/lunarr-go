<script lang="ts">
  import ConfirmAction from "$lib/components/ConfirmAction.svelte";
  import { invalidateAll } from "$app/navigation";
  import { Activity, Clock3, FileWarning, XCircle } from "@lucide/svelte";
  import { onMount } from "svelte";

  let { data, form } = $props();

  type Job = (typeof data.jobs)[number];
  type PlaybackSession = (typeof data.playbackSessions)[number];

  let now = $state(Date.now());

  const hasActiveJobs = $derived(
    data.jobs.some((job) => job.status === "queued" || job.status === "running") ||
      data.playbackSessions.some((job) => job.status === "queued" || job.status === "running"),
  );
  const errorsByJob = $derived.by(() => {
    const grouped = new Map<string, typeof data.errors>();
    for (const item of data.errors) {
      grouped.set(item.scan_job_id, [...(grouped.get(item.scan_job_id) ?? []), item]);
    }
    return grouped;
  });

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

  function formatTime(value: string | null | undefined) {
    if (!value) return "Not yet";
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  }

  function formatRelativeTime(value: string | null | undefined) {
    if (!value) return "Not yet";
    const seconds = Math.max(0, Math.floor((now - new Date(value).getTime()) / 1000));
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  function formatDuration(start: string | null, end: string | null, status: Job["status"] | PlaybackSession["status"]) {
    if (!start) return "Not started";
    const endMs = end ? new Date(end).getTime() : status === "running" ? now : new Date(start).getTime();
    const seconds = Math.max(0, Math.floor((endMs - new Date(start).getTime()) / 1000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }

  function totalChanges(job: Job) {
    return Number(job.files_added ?? 0) + Number(job.files_updated ?? 0) + Number(job.files_removed ?? 0);
  }

  function jobName(job: Pick<Job, "job_kind" | "library_id" | "library_name">) {
    if (job.library_name) return job.library_name;
    if (job.job_kind === "movie_metadata_refresh") return "Movie metadata refresh";
    if (job.job_kind === "tv_metadata_refresh") return "TV metadata refresh";
    if (job.job_kind === "media_probe_refresh") return "Media probe repair";
    return job.library_id ? "Deleted library" : "Library scan";
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
    if (job.last_segment_request_at) return `Segment ${formatRelativeTime(job.last_segment_request_at)}`;
    if (job.last_heartbeat_at) return `Heartbeat ${formatRelativeTime(job.last_heartbeat_at)}`;
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
  <meta name="description" content="Review Lunarr scan jobs, playback sessions, and recent processing errors." />
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
    <div class="overview-heading">
      <Activity size={18} aria-hidden="true" />
      <h2>Scans</h2>
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
    <div class="overview-heading">
      <Clock3 size={18} aria-hidden="true" />
      <h2>Playback</h2>
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

<div class="content-grid">
  <div class="primary-stack">
    <section class="ops-panel">
      <div class="ops-panel-header">
        <div>
          <h2>Scan jobs</h2>
          <p class="muted">
            Latest {data.jobs.length} scans and metadata refreshes.
          </p>
        </div>
      </div>

      <div class="ops-table">
        {#each data.jobs as job}
          {@const jobErrors = errorsByJob.get(job.id) ?? []}
          <article class="job-row ops-row">
            <div class="job-main">
              <div class="job-title">
                <strong>{jobName(job)}</strong>
                <span class={`status-badge ${statusClass(job)}`}>{displayStatus(job)}</span>
              </div>
              <div class="job-meta">
                <span>{formatRelativeTime(job.updated_at ?? job.created_at)}</span>
                <span>{formatDuration(job.started_at, job.finished_at, job.status)}</span>
                {#if job.cancel_requested_at}
                  <span>Cancel requested {formatRelativeTime(job.cancel_requested_at)}</span>
                {:else}
                  <span>Started {formatTime(job.started_at)}</span>
                {/if}
              </div>
              {#if jobErrors.length}
                <details class="job-errors">
                  <summary
                    ><FileWarning size={15} aria-hidden="true" />
                    {jobErrors.length} recent {jobErrors.length === 1 ? "error" : "errors"}</summary
                  >
                  <div>
                    {#each jobErrors.slice(0, 3) as item}
                      <p>
                        <strong>{item.path}</strong><span>{item.message}</span>
                      </p>
                    {/each}
                  </div>
                </details>
              {/if}
            </div>

            <div class="metrics" aria-label="Job file counts">
              <span><strong>{job.files_seen}</strong> seen</span>
              <span><strong>{totalChanges(job)}</strong> changed</span>
              <span><strong>{job.files_added}</strong> added</span>
              <span><strong>{job.files_removed}</strong> removed</span>
              <span class:error-count={Number(job.errors_count) > 0}><strong>{job.errors_count}</strong> errors</span>
            </div>

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
              {:else}
                <span class="muted">Done</span>
              {/if}
            </div>
          </article>
        {:else}
          <p class="muted">No scan jobs yet.</p>
        {/each}
      </div>
    </section>

    <section class="ops-panel">
      <div class="ops-panel-header">
        <div>
          <h2>Playback sessions</h2>
          <p class="muted">
            Latest {data.playbackSessions.length} HLS playback sessions.
          </p>
        </div>
      </div>

      <div class="ops-table">
        {#each data.playbackSessions as job}
          <article class="job-row ops-row">
            <div class="job-main">
              <div class="job-title">
                <strong>{playbackSessionName(job)}</strong>
                <span class={`status-badge ${job.status}`}>{playbackStatusLabel[job.status]}</span>
              </div>
              <div class="job-meta">
                <span>{formatRelativeTime(job.updated_at ?? job.created_at)}</span>
                <span>{formatDuration(job.started_at, job.finished_at, job.status)}</span>
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
              {:else}
                <span class="muted">Done</span>
              {/if}
            </div>
          </article>
        {:else}
          <p class="muted">No playback sessions yet.</p>
        {/each}
      </div>
    </section>
  </div>

  <aside class="recent-errors ops-panel" aria-labelledby="recent-errors-heading">
    <div class="ops-panel-header">
      <div>
        <h2 id="recent-errors-heading">Recent errors</h2>
        <p class="muted">Latest {data.errors.length} scan errors.</p>
      </div>
    </div>
    <div class="errors ops-table">
      {#each data.errors as item}
        <article class="ops-row">
          <div class="error-meta">
            <span>{jobName(item)}</span>
            <span>{scanStatusLabel[item.job_status]}</span>
            <span>{formatRelativeTime(item.created_at)}</span>
          </div>
          <strong>{item.path}</strong>
          <span class="error">{item.message}</span>
        </article>
      {:else}
        <p class="muted">No scan errors recorded.</p>
      {/each}
    </div>
  </aside>
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

  .overview-heading {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    margin-bottom: 0.65rem;
  }

  .overview-heading :global(svg) {
    color: var(--ops-muted);
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
  .metrics,
  .error-meta {
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

  .content-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(18rem, 23rem);
    gap: 1rem;
    align-items: start;
    margin-top: 1rem;
  }

  .primary-stack {
    display: grid;
    gap: 1rem;
    min-width: 0;
  }

  .job-row {
    display: grid;
    grid-template-columns: minmax(14rem, 1fr) minmax(18rem, 0.9fr) auto;
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

  .job-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 0.75rem;
  }

  .metrics {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem 0.65rem;
    min-width: 0;
    line-height: 1.3;
  }

  .metrics span {
    min-width: 0;
  }

  .metrics strong {
    color: var(--ops-text);
    font-size: 0.9rem;
  }

  .metrics .error-count {
    color: var(--color-error-strong);
  }

  .playback-metrics {
    display: grid;
    gap: 0.25rem;
  }

  .playback-metrics strong {
    overflow-wrap: anywhere;
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

  .job-errors {
    color: var(--color-subtle);
  }

  .job-errors summary {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    color: var(--ops-warning);
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 800;
  }

  .job-errors div {
    display: grid;
    gap: 0.5rem;
    margin-top: 0.6rem;
  }

  .job-errors p {
    display: grid;
    gap: 0.2rem;
    margin: 0;
  }

  .errors article {
    display: grid;
    gap: 0.25rem;
    padding: 0.65rem 0.85rem;
  }

  .errors strong {
    overflow-wrap: anywhere;
  }

  .recent-errors {
    position: sticky;
    top: 1rem;
  }

  .error-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .error-meta span:not(:last-child)::after {
    content: "/";
    margin-left: 0.5rem;
    color: var(--color-muted);
  }

  @media (max-width: 1080px) {
    .content-grid {
      grid-template-columns: 1fr;
    }

    .recent-errors {
      position: static;
    }

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
