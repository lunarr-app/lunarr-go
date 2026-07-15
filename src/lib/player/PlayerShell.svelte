<script lang="ts">
  import "./player-chrome.css";
  import { FastForward, Maximize, Play, Rewind, Volume2, X } from "@lucide/svelte";

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

<div class="video-shell custom-player placeholder-shell" aria-live="polite" aria-label={busyLabel}>
  <div class="player-overlay">
    <span class="overlay-spinner" aria-hidden="true"></span>
    <p>{busyLabel}</p>
  </div>

  <div class="player-controls" role="group" aria-label="Playback controls">
    <div class="top-controls">
      {#if onClose}
        <button class="control-button" type="button" aria-label="Close player" onclick={onClose}>
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
      <div class="seek-slider-track">
        <input
          class="seek-slider"
          type="range"
          min="0"
          max="1"
          value="0"
          style="--seek-fill: 0%"
          tabindex="-1"
          disabled
        />
      </div>
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
            style="--volume-fill: 100%"
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
    padding: var(--space-3) var(--space-3) 4rem;
    pointer-events: none;
    background: rgba(0, 0, 0, 0.18);
    color: var(--color-text);
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
</style>
