<script lang="ts">
  import {
    FastForward,
    Maximize,
    Play,
    Rewind,
    Volume2,
    X,
  } from "@lucide/svelte";

  let {
    title = "Starting playback",
    eyebrow = "Now playing",
    busyLabel = "Starting playback",
    onClose,
    backHref,
  }: {
    title?: string;
    eyebrow?: string;
    busyLabel?: string;
    onClose?: () => void;
    backHref?: string;
  } = $props();
</script>

<div
  class="video-shell custom-player placeholder-shell"
  aria-live="polite"
  aria-label={busyLabel}
>
  <div class="player-overlay">
    <span class="overlay-spinner" aria-hidden="true"></span>
    <p>{busyLabel}</p>
  </div>

  <div class="player-controls" role="group" aria-label="Playback controls">
    <div class="top-controls">
      {#if onClose}
        <button
          class="control-button"
          type="button"
          aria-label="Close player"
          onclick={onClose}
        >
          <X size={20} aria-hidden="true" />
        </button>
      {:else if backHref}
        <a class="control-button" href={backHref} aria-label="Back to title">
          <span aria-hidden="true">‹</span>
        </a>
      {:else}
        <span class="control-spacer" aria-hidden="true"></span>
      {/if}

      <div class="player-title">
        <p>{eyebrow}</p>
        <h2>{title}</h2>
      </div>

      <span class="control-spacer" aria-hidden="true"></span>
    </div>

    <div class="bottom-controls" aria-hidden="true">
      <input
        class="seek-slider"
        type="range"
        min="0"
        max="1"
        value="0"
        tabindex="-1"
        disabled
      />
      <div class="control-row">
        <div class="primary-controls">
          <button class="control-button primary-play" type="button" disabled>
            <Play size={24} fill="currentColor" aria-hidden="true" />
          </button>
          <button class="control-button skip-button" type="button" disabled>
            <Rewind size={20} aria-hidden="true" />
            <span>10</span>
          </button>
          <button class="control-button skip-button" type="button" disabled>
            <FastForward size={20} aria-hidden="true" />
            <span>30</span>
          </button>
          <span class="time-readout">0:00 / --:--</span>
        </div>
        <div class="right-controls">
          <button class="control-button" type="button" disabled>
            <Volume2 size={20} aria-hidden="true" />
          </button>
          <input
            class="volume-slider"
            type="range"
            min="0"
            max="1"
            value="1"
            tabindex="-1"
            disabled
          />
          <button class="control-button" type="button" disabled>
            <Maximize size={20} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .video-shell {
    position: relative;
    overflow: hidden;
    border-radius: 8px;
    background: #000;
  }

  .custom-player {
    --player-accent: #00ccff;
    --player-accent-strong: #00ccff;
    color: #f8fafc;
  }

  .placeholder-shell {
    min-height: min(56.25vw, 32rem);
    aspect-ratio: 16 / 9;
  }

  .player-overlay {
    position: absolute;
    inset: 0;
    display: grid;
    align-content: center;
    justify-items: center;
    gap: 0.75rem;
    padding: 1rem 1rem 4rem;
    pointer-events: none;
    background: rgba(0, 0, 0, 0.18);
    color: #f8fafc;
    text-align: center;
  }

  .player-overlay p {
    margin: 0;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.56);
    padding: 0.4rem 0.7rem;
    font-size: 0.85rem;
    font-weight: 750;
  }

  .overlay-spinner {
    width: 3rem;
    height: 3rem;
    border: 3px solid rgba(255, 255, 255, 0.28);
    border-top-color: #fff;
    border-radius: 999px;
    animation: spin 0.85s linear infinite;
  }

  .player-controls {
    position: absolute;
    inset: 0;
    z-index: 3;
    display: grid;
    grid-template-rows: auto 1fr auto;
    pointer-events: none;
    background:
      linear-gradient(rgba(0, 0, 0, 0.56), rgba(0, 0, 0, 0) 34%),
      linear-gradient(0deg, rgba(0, 0, 0, 0.72), rgba(0, 0, 0, 0) 42%);
  }

  .top-controls {
    grid-row: 1;
    min-height: 4.25rem;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: start;
    gap: 0.75rem;
    padding: 0.75rem;
    pointer-events: auto;
  }

  .player-title {
    min-width: 0;
  }

  .player-title p,
  .player-title h2 {
    margin: 0;
  }

  .player-title p {
    color: rgba(248, 250, 252, 0.7);
    font-size: 0.72rem;
    font-weight: 750;
    text-transform: uppercase;
  }

  .player-title h2 {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: clamp(0.98rem, 2.2vw, 1.2rem);
  }

  .bottom-controls {
    grid-row: 3;
    align-self: end;
    display: grid;
    gap: 0.5rem;
    padding: 0 0.9rem 0.8rem;
  }

  .control-row {
    min-height: 2.5rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .primary-controls {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .right-controls {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    gap: 0.45rem;
  }

  .control-button,
  .control-spacer {
    width: 2.5rem;
    height: 2.5rem;
  }

  .control-button {
    display: inline-grid;
    place-items: center;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: #f8fafc;
    padding: 0;
    text-decoration: none;
    touch-action: manipulation;
  }

  .control-button:not(:disabled) {
    cursor: pointer;
  }

  .control-button:hover:not(:disabled) {
    background: rgba(0, 204, 255, 0.14);
    color: #00ccff;
  }

  .control-button:disabled,
  .seek-slider:disabled,
  .volume-slider:disabled {
    cursor: default;
    opacity: 0.7;
  }

  .primary-play {
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 999px;
    background: rgba(8, 12, 16, 0.58);
  }

  .skip-button {
    position: relative;
    width: 2.75rem;
    height: 2.75rem;
    align-content: center;
    gap: 0.02rem;
    border-radius: 999px;
    background: rgba(8, 12, 16, 0.38);
    padding-top: 0.25rem;
  }

  .skip-button span {
    display: block;
    font-size: 0.62rem;
    font-weight: 850;
    line-height: 1;
  }

  .seek-slider {
    width: 100%;
    height: 1.5rem;
    min-height: 0;
    border: 0;
    border-radius: 0;
    accent-color: var(--player-accent);
    padding: 0;
  }

  .volume-slider {
    width: 6rem;
    height: 1.25rem;
    border: 0;
    background: transparent;
    padding: 0;
  }

  .time-readout {
    min-width: 7.5rem;
    color: rgba(248, 250, 252, 0.82);
    font-size: 0.82rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .overlay-spinner {
      animation: none;
    }
  }

  @media (max-width: 640px) {
    .top-controls {
      min-height: 3.5rem;
      padding: 0.55rem;
    }

    .player-title p {
      display: none;
    }

    .player-title h2 {
      font-size: 0.98rem;
    }

    .control-button,
    .control-spacer {
      width: 2.25rem;
      height: 2.25rem;
    }

    .primary-play {
      width: 2.75rem;
      height: 2.75rem;
    }

    .skip-button {
      width: 2.75rem;
      height: 2.75rem;
    }

    .bottom-controls {
      padding: 0 0.65rem 0.6rem;
    }

    .control-row {
      min-height: auto;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.45rem;
    }

    .primary-controls {
      flex: 1 1 auto;
      gap: 0.25rem;
    }

    .right-controls {
      margin-left: auto;
      gap: 0.25rem;
    }

    .volume-slider {
      display: none;
    }
  }
</style>
