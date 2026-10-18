<script lang="ts">
  import { MUTATION_KINDS } from '../sim/types';
  import type { MutationKind } from '../sim/types';
  import type { Engine } from './engine.svelte';

  let { engine }: { engine: Engine } = $props();

  const LABELS: Record<MutationKind, string> = {
    gourmande: 'plus gourmande',
    sobre: 'plus sobre',
    expansive: 'plus expansive',
    compacte: 'plus compacte',
    teinte: 'décalage de teinte',
  };

  function pick(m: MutationKind) {
    engine.mutation = m;
    engine.persistPrefs();
  }
</script>

<div class="wrap">
  <div class="hint">toucher le monde pour déposer une spore</div>
  <div class="bar" role="radiogroup" aria-label="mutation de la spore">
    {#each MUTATION_KINDS as m (m)}
      <button role="radio" aria-checked={engine.mutation === m} class:on={engine.mutation === m} onclick={() => pick(m)}>
        {LABELS[m]}
      </button>
    {/each}
  </div>
</div>

<style>
  .wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    max-width: 100%;
  }

  .hint {
    font-family: var(--serif);
    font-style: italic;
    font-size: 0.8rem;
    color: var(--ink-dim);
    text-shadow: 0 1px 6px rgba(0, 0, 0, 0.9);
  }

  .bar {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    max-width: 100%;
    padding: 2px;
    scrollbar-width: none;
    font-size: 0.8rem;
  }

  .bar button {
    white-space: nowrap;
    background: var(--panel);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }

  .bar button.on {
    background: rgba(201, 180, 138, 0.22);
    border-color: rgba(201, 180, 138, 0.6);
  }
</style>
