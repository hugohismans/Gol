<script lang="ts">
  import { SPEEDS, TICKS_PER_DAY, TICKS_PER_SECOND_X1 } from '../sim/config';
  import type { Engine } from './engine.svelte';

  let { engine }: { engine: Engine } = $props();

  const fmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
  const fmt1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
  let limited = $derived(engine.speed > 0 && !engine.fastForward && engine.effectiveSpeed < engine.speed * 0.85);
  let shown = $derived(engine.fastForward || limited ? engine.effectiveSpeed : engine.speed);

  /** Durée réelle d'un jour simulé à une vitesse donnée (multiple de x1). */
  function dayLasts(speed: number): string {
    if (speed <= 0) return '';
    const s = TICKS_PER_DAY / (speed * TICKS_PER_SECOND_X1);
    if (s >= 90) return `${fmt.format(s / 60)} min`;
    return `${fmt1.format(s)} s`;
  }
</script>

<div class="bar">
  <div class="group">
    {#each SPEEDS as s (s)}
      <button class:on={engine.speed === s && !engine.fastForward} onclick={() => engine.setSpeed(s)} aria-label={s === 0 ? 'pause' : `vitesse x${s}`}>
        {s === 0 ? 'pause' : `x${s}`}
      </button>
    {/each}
  </div>
  <div class="group">
    {#if engine.fastForward}
      <button class="on" onclick={() => engine.cancelFastForward()}>
        avance {fmt.format(100 * (1 - engine.fastForward.left / engine.fastForward.total))} %
      </button>
    {:else}
      <button onclick={() => engine.advanceDays(1)}>+1 jour</button>
      <button onclick={() => engine.advanceDays(30)}>+1 mois</button>
    {/if}
  </div>
  {#if engine.speed > 0 || engine.fastForward}
    <div class="real">
      {#if limited || engine.fastForward}
        ton appareil suit x{fmt1.format(engine.effectiveSpeed)} ·
      {/if}
      un jour simulé en {dayLasts(shown)}
    </div>
  {/if}
</div>

<style>
  .bar {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 6px 10px;
    font-size: 0.78rem;
  }

  .group {
    display: flex;
    gap: 4px;
    padding: 4px;
    border-radius: 999px;
    background: var(--panel);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }

  .group button {
    border-color: transparent;
    padding: 0.4em 0.75em;
  }

  .group button.on {
    border-color: rgba(217, 210, 197, 0.3);
  }

  .real {
    color: var(--ink-dim);
    font-variant-numeric: tabular-nums;
    text-shadow: 0 1px 6px rgba(0, 0, 0, 0.9);
  }
</style>
