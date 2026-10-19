<script lang="ts">
  import { PARAM_RANGES } from '../sim/config';
  import type { Params } from '../sim/config';
  import { LAYERS } from '../render/renderer';
  import type { Layer, ViewMode } from '../render/renderer';
  import type { Engine } from './engine.svelte';

  let { engine }: { engine: Engine } = $props();

  const LAYER_LABELS: Record<Layer, string> = {
    final: 'final',
    vitalite: 'vitalité',
    lignees: 'lignées',
    nutriments: 'nutriments',
    sediment: 'sédiment',
  };
  const VIEWS: { id: ViewMode; label: string }[] = [
    { id: 'mosaique', label: 'mosaïque' },
    { id: 'couvrir', label: 'couvrir' },
    { id: 'contenir', label: 'contenir' },
  ];
  const KEY_PARAMS: (keyof Params)[] = ['radiusScale', 'muOffset', 'sigmaScale', 'regenRate', 'appetiteScale', 'mutationRate', 'sedimentRate'];
  const OTHER_PARAMS = (Object.keys(PARAM_RANGES) as (keyof Params)[]).filter((k) => !KEY_PARAMS.includes(k));

  let showOthers = $state(false);
  let confirmReset = $state(false);

  function fmt(v: number, step: number): string {
    if (step < 1e-6) return v.toExponential(1);
    const digits = Math.max(0, Math.min(5, Math.ceil(-Math.log10(step))));
    return v.toFixed(digits);
  }

  function setLayer(l: Layer) {
    engine.layer = l;
    engine.persistPrefs();
  }

  function setView(v: ViewMode) {
    engine.view = v;
    engine.persistPrefs();
  }

  function reset() {
    if (!confirmReset) {
      confirmReset = true;
      setTimeout(() => (confirmReset = false), 3000);
      return;
    }
    confirmReset = false;
    engine.reset();
  }
</script>

{#snippet slider(key: keyof Params)}
  {@const r = PARAM_RANGES[key]}
  <label class="param">
    <span class="name">{r.label}</span>
    <span class="value">{fmt(engine.params[key], r.step)}</span>
    <input
      type="range"
      min={r.min}
      max={r.max}
      step={r.step}
      value={engine.params[key]}
      oninput={(e) => engine.setParam(key, Number((e.currentTarget as HTMLInputElement).value))}
    />
  </label>
{/snippet}

{#if engine.panel === 'reglages'}
  <aside class="panel">
    <section>
      <h2>Calques</h2>
      <div class="chips">
        {#each LAYERS as l (l)}
          <button class:on={engine.layer === l} onclick={() => setLayer(l)}>{LAYER_LABELS[l]}</button>
        {/each}
      </div>
    </section>

    <section>
      <h2>Vue</h2>
      <div class="chips">
        {#each VIEWS as v (v.id)}
          <button class:on={engine.view === v.id} onclick={() => setView(v.id)}>{v.label}</button>
        {/each}
      </div>
    </section>

    <section>
      <h2>Monde</h2>
      <div class="chips">
        <button onclick={() => engine.seed()}>seed aléatoire</button>
        <button class:danger={confirmReset} onclick={reset}>{confirmReset ? 'confirmer le reset' : 'reset'}</button>
        <button onclick={() => engine.save()}>sauvegarder</button>
      </div>
      <label class="check">
        <input
          type="checkbox"
          checked={engine.eprouvette}
          onchange={(e) => {
            engine.eprouvette = (e.currentTarget as HTMLInputElement).checked;
            engine.persistPrefs();
          }}
        />
        passer par l'éprouvette avant chaque dépôt (sinon : dépôt direct avec le dernier ADN)
      </label>
      {#if engine.stats}
        <p class="info">
          biomasse {engine.stats.biomass.toFixed(0)} · nutriments moyens {engine.stats.meanNutrients.toFixed(2)} · lignées
          enregistrées {engine.stats.totalLineages}
        </p>
      {/if}
      {#if engine.saveInfo}<p class="info">{engine.saveInfo}</p>{/if}
      {#if engine.perf.msPerTick > 0}
        <p class="info">
          un tick coûte {engine.perf.msPerTick.toFixed(2)} ms sur cet appareil : vitesse maximale environ x{Math.round(engine.perf.maxSpeed)}
        </p>
      {/if}
    </section>

    <section>
      <h2>Constantes</h2>
      {#each KEY_PARAMS as k (k)}
        {@render slider(k)}
      {/each}
      <button class="more" onclick={() => (showOthers = !showOthers)}>{showOthers ? 'moins' : 'toutes les constantes'}</button>
      {#if showOthers}
        {#each OTHER_PARAMS as k (k)}
          {@render slider(k)}
        {/each}
      {/if}
      <button class="more" onclick={() => engine.resetParams()}>valeurs par défaut</button>
    </section>
  </aside>
{/if}

<style>
  .panel {
    position: absolute;
    z-index: 2;
    right: 0;
    top: 0;
    bottom: 0;
    width: min(360px, 100vw);
    padding: calc(112px + env(safe-area-inset-top)) 16px calc(24px + env(safe-area-inset-bottom));
    overflow-y: auto;
    background: rgba(12, 10, 9, 0.88);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border-left: 1px solid var(--line);
    font-size: 0.8rem;
  }

  @media (max-width: 600px) {
    .panel {
      top: auto;
      left: 0;
      width: 100%;
      height: 62vh;
      padding-top: 16px;
      border-left: 0;
      border-top: 1px solid var(--line);
      border-radius: 16px 16px 0 0;
    }

  }

  section + section {
    margin-top: 18px;
  }

  h2 {
    margin: 0 0 8px;
    font-family: var(--serif);
    font-weight: normal;
    font-size: 0.95rem;
    color: var(--accent);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .danger {
    border-color: #a0624f;
    color: #e5a08c;
  }

  .check {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    margin-top: 10px;
    color: var(--ink-dim);
    line-height: 1.35;
  }

  .info {
    margin: 8px 0 0;
    color: var(--ink-dim);
    line-height: 1.4;
  }

  .param {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 2px 8px;
    margin-bottom: 10px;
  }

  .name {
    color: var(--ink-dim);
  }

  .value {
    font-variant-numeric: tabular-nums;
  }

  input[type='range'] {
    grid-column: 1 / -1;
    width: 100%;
    accent-color: var(--accent);
  }

  .more {
    margin-top: 4px;
    margin-right: 6px;
    font-size: 0.75rem;
  }
</style>
