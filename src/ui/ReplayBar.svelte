<script lang="ts">
  import type { Engine } from './engine.svelte';
  import { formatDate } from './story';

  let { engine }: { engine: Engine } = $props();
</script>

{#if engine.replay}
  {@const r = engine.replay}
  <div class="bar" role="group" aria-label="Retour en arrière">
    <div class="row">
      <span class="tag">souvenir</span>
      <span class="when">{formatDate(r.ticks[r.index])}</span>
      <span class="count">{r.index + 1} / {r.ticks.length}</span>
    </div>
    <div class="row">
      <button class:on={r.playing} onclick={() => engine.togglePlay()}>{r.playing ? 'pause' : 'lecture'}</button>
      <input
        type="range"
        min="0"
        max={r.ticks.length - 1}
        step="1"
        value={r.index}
        aria-label="Instant revu"
        oninput={(e) => engine.setReplayIndex(Number((e.currentTarget as HTMLInputElement).value))}
      />
      <button onclick={() => engine.exitReplay()}>présent</button>
    </div>
  </div>
{/if}

<style>
  .bar {
    width: min(560px, 100%);
    display: grid;
    gap: 6px;
    padding: 10px 12px;
    border-radius: 16px;
    background: var(--panel);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    font-size: 0.8rem;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .tag {
    font-family: var(--serif);
    font-style: italic;
    color: var(--accent);
  }

  .when {
    font-variant-numeric: tabular-nums;
  }

  .count {
    margin-left: auto;
    color: var(--ink-dim);
    font-variant-numeric: tabular-nums;
  }

  input[type='range'] {
    flex: 1;
    accent-color: var(--accent);
  }
</style>
