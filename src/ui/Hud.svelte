<script lang="ts">
  import type { Engine } from './engine.svelte';

  let { engine }: { engine: Engine } = $props();

  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

  let surface = $derived(engine.stats && engine.sizeCells ? (100 * engine.stats.livingCells) / engine.sizeCells : 0);
  let age = $derived(engine.date.ageDays);
</script>

<header class="hud">
  <div class="date">
    <div class="day">{engine.date.dayOfMonth} {engine.date.month}, an {engine.date.year}</div>
    <div class="sub">{pad(engine.date.hour)}:{pad(engine.date.minute)} · {engine.date.season}</div>
  </div>
  <dl class="stats">
    <div><dt>lignées vivantes</dt><dd>{engine.stats?.livingLineages ?? 0}</dd></div>
    <div><dt>surface vivante</dt><dd>{fmt.format(surface)} %</dd></div>
    <div><dt>âge du monde</dt><dd>{age < 1 ? `${fmt.format(age * 24)} h` : `${fmt.format(age)} j`}</dd></div>
  </dl>
</header>

<style>
  .hud {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    padding: calc(12px + env(safe-area-inset-top)) 16px 0;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    pointer-events: none;
    z-index: 3;
    text-shadow: 0 1px 8px rgba(0, 0, 0, 0.8);
  }

  .day {
    font-family: var(--serif);
    font-size: 1.15rem;
    letter-spacing: 0.01em;
  }

  .sub {
    margin-top: 2px;
    font-size: 0.78rem;
    color: var(--ink-dim);
    letter-spacing: 0.04em;
  }

  .stats {
    margin: 0;
    display: grid;
    gap: 2px;
    text-align: right;
    font-size: 0.75rem;
  }

  .stats div {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  dt {
    color: var(--ink-dim);
  }

  dd {
    margin: 0;
    min-width: 3.5em;
    font-variant-numeric: tabular-nums;
  }
</style>
