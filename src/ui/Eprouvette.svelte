<script lang="ts">
  import { onMount } from 'svelte';
  import { DNA_HUE_RANGE, DNA_MAX_LEVEL } from '../sim/config';
  import { DNA_GENES } from '../sim/types';
  import type { DnaGene } from '../sim/types';
  import type { Engine } from './engine.svelte';
  import { Eprouvette } from './preview';
  import type { PreviewState } from './preview';
  import { GENE_LABELS, formatDuration, lineageColor } from './story';
  import { TICKS_PER_DAY } from '../sim/config';

  let { engine }: { engine: Engine } = $props();

  const LEVELS = Array.from({ length: 2 * DNA_MAX_LEVEL + 1 }, (_, i) => i - DNA_MAX_LEVEL);
  /** Délai avant de relancer l'essai après un réglage (ms). */
  const RESTART_DELAY = 250;

  let canvas: HTMLCanvasElement;
  let preview: Eprouvette | null = null;
  let essai = $state<PreviewState | null>(null);
  let failed = $state(false);

  let sum = $derived(DNA_GENES.reduce((s, g) => s + engine.dna[g], 0));
  let genome = $derived(engine.pending ? engine.preparedGenome() : null);
  let parent = $derived(engine.pending?.parentId ? engine.organisme.lineages.get(engine.pending.parentId) : null);
  let color = $derived(engine.pending ? lineageColor(engine.pending.base.hue + engine.dna.teinte) : 'transparent');
  let ready = $derived(sum === 0 && engine.pseudo.trim() !== '');

  function setLevel(g: DnaGene, v: number) {
    engine.dna[g] = v;
  }

  // Relance l'essai quand le génome préparé change.
  $effect(() => {
    const g = genome;
    if (!g || !preview) return;
    const params = $state.snapshot(engine.params);
    const nutrients = engine.stats?.meanNutrients ?? params.initialNutrients;
    const t = setTimeout(() => preview?.start(g, params, nutrients), RESTART_DELAY);
    return () => clearTimeout(t);
  });

  onMount(() => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
    try {
      preview = new Eprouvette(canvas);
      const g = engine.preparedGenome();
      if (g) preview.start(g, $state.snapshot(engine.params), engine.stats?.meanNutrients ?? 0.3);
    } catch {
      failed = true;
      return;
    }
    let last = performance.now();
    let raf = requestAnimationFrame(function loop(now) {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (preview) essai = preview.frame(dt, now / 1000);
    });
    return () => {
      cancelAnimationFrame(raf);
      preview?.dispose();
      preview = null;
    };
  });
</script>

<aside class="eprouvette" aria-label="Préparer une spore">
  <header>
    <i class="dot" style:background={color}></i>
    <div>
      <h2>Ta spore</h2>
      <p class="sub">
        {#if parent}
          ADN prélevé sur {parent.name ?? `la lignée n°${parent.id}`}{parent.visitor ? `, de ${parent.visitor}` : ''}
        {:else}
          Sol vide ici : ADN d'origine
        {/if}
      </p>
    </div>
  </header>

  <figure>
    <canvas bind:this={canvas}></canvas>
    <figcaption class="sub">
      {#if failed}
        L'éprouvette n'a pas pu s'ouvrir sur cet appareil.
      {:else if sum !== 0}
        Équilibre ton ADN pour relancer l'essai.
      {:else if essai}
        {#if essai.done}
          {essai.area > 0
            ? `Seule, elle tient un jour : ${essai.area} cases (record ${essai.peak}).`
            : `Seule, elle ne passe pas la journée. Dans le monde, avec ses voisines, qui sait.`}
        {:else}
          Seule dans l'éprouvette · {formatDuration(essai.progress * TICKS_PER_DAY)} · {essai.area} cases
        {/if}
      {/if}
    </figcaption>
  </figure>

  <section class="genes">
    {#each DNA_GENES as g (g)}
      <div class="gene">
        <span class="low">{GENE_LABELS[g][0]}</span>
        <div class="steps" role="radiogroup" aria-label="{GENE_LABELS[g][0]} ou {GENE_LABELS[g][1]}">
          {#each LEVELS as v (v)}
            <button
              role="radio"
              aria-checked={engine.dna[g] === v}
              aria-label="{v > 0 ? `${GENE_LABELS[g][1]} +${v}` : v < 0 ? `${GENE_LABELS[g][0]} +${-v}` : 'hérité'}"
              class="step"
              class:on={engine.dna[g] === v}
              class:mid={v === 0}
              class:filled={v !== 0 && Math.sign(v) === Math.sign(engine.dna[g]) && Math.abs(v) <= Math.abs(engine.dna[g])}
              onclick={() => setLevel(g, v)}
            ></button>
          {/each}
        </div>
        <span class="high">{GENE_LABELS[g][1]}</span>
      </div>
    {/each}
    <p class="balance" class:ok={sum === 0}>
      {#if sum === 0}
        ADN équilibré : chaque gain de vigueur est payé par de la retenue.
      {:else if sum > 0}
        Encore {sum} pas vers la gauche à placer pour payer ta vigueur.
      {:else}
        Il te reste {-sum} pas de vigueur à placer vers la droite.
      {/if}
    </p>

    <label class="hue">
      <span class="sub">teinte</span>
      <input
        type="range"
        min={-DNA_HUE_RANGE}
        max={DNA_HUE_RANGE}
        step="0.01"
        value={engine.dna.teinte}
        oninput={(e) => (engine.dna.teinte = Number((e.currentTarget as HTMLInputElement).value))}
      />
    </label>
  </section>

  <section class="names">
    <label>
      <span class="sub">nom de la lignée (facultatif)</span>
      <input maxlength="32" placeholder="ex. Lichen du matin" bind:value={engine.name} />
    </label>
    <label>
      <span class="sub">ton pseudo</span>
      <input maxlength="24" placeholder="obligatoire" bind:value={engine.pseudo} />
    </label>
  </section>

  <div class="actions">
    <button class="release" disabled={!ready || !genome} onclick={() => engine.release()}>lâcher dans le monde</button>
    <button onclick={() => engine.cancelPending()}>annuler</button>
  </div>
  <p class="sub note">Une fois lâchée, tu ne contrôles plus rien. En version finale : une spore par jour.</p>
</aside>

<style>
  .eprouvette {
    position: absolute;
    z-index: 4;
    right: 16px;
    top: calc(120px + env(safe-area-inset-top));
    width: min(360px, calc(100vw - 32px));
    max-height: calc(100vh - 140px);
    overflow-y: auto;
    padding: 16px;
    border-radius: 16px;
    background: rgba(12, 10, 9, 0.92);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border: 1px solid var(--line);
    font-size: 0.82rem;
  }

  @media (max-width: 600px) {
    .eprouvette {
      right: 0;
      left: 0;
      top: auto;
      bottom: 0;
      width: 100%;
      max-height: 78vh;
      border-radius: 16px 16px 0 0;
      padding-bottom: calc(16px + env(safe-area-inset-bottom));
    }
  }

  header {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  h2 {
    margin: 0;
    font-family: var(--serif);
    font-weight: normal;
    font-size: 1.1rem;
  }

  figure {
    margin: 12px 0 0;
  }

  canvas {
    display: block;
    width: 100%;
    max-width: 240px;
    aspect-ratio: 1;
    margin: 0 auto;
    border-radius: 50%;
    background: #070605;
    box-shadow: inset 0 0 0 1px var(--line), 0 0 24px rgba(0, 0, 0, 0.6);
  }

  figcaption {
    margin-top: 8px;
    min-height: 2.6em;
    text-align: center;
    line-height: 1.35;
  }

  .genes {
    margin-top: 10px;
    display: grid;
    gap: 8px;
  }

  .gene {
    display: grid;
    grid-template-columns: 5.6em 1fr 5.6em;
    align-items: center;
    gap: 6px;
  }

  .low {
    text-align: right;
    color: var(--ink-dim);
  }

  .high {
    color: var(--ink-dim);
  }

  .steps {
    display: flex;
    justify-content: space-between;
  }

  .step {
    width: 18px;
    height: 18px;
    padding: 0;
    border-radius: 50%;
    border: 1px solid rgba(217, 210, 197, 0.25);
  }

  .step.mid {
    border-color: rgba(217, 210, 197, 0.5);
  }

  .step.filled {
    background: rgba(201, 180, 138, 0.45);
    border-color: rgba(201, 180, 138, 0.7);
  }

  .step.on.mid {
    background: rgba(217, 210, 197, 0.35);
  }

  .balance {
    margin: 2px 0 0;
    color: #d9a08c;
    line-height: 1.35;
  }

  .balance.ok {
    color: var(--ink-dim);
  }

  .hue {
    display: grid;
    grid-template-columns: 5.6em 1fr;
    align-items: center;
    gap: 6px;
  }

  .hue .sub {
    text-align: right;
    margin: 0;
  }

  .hue input {
    accent-color: var(--accent);
  }

  .names {
    margin-top: 12px;
    display: grid;
    gap: 8px;
  }

  .names label {
    display: grid;
    gap: 4px;
  }

  .names input {
    font: inherit;
    color: inherit;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 0.45em 0.6em;
  }

  .actions {
    position: sticky;
    bottom: -16px;
    display: flex;
    gap: 8px;
    margin: 14px -16px 0;
    padding: 10px 16px;
    background: rgba(12, 10, 9, 0.96);
  }

  .release {
    flex: 1;
    background: rgba(201, 180, 138, 0.22);
    border-color: rgba(201, 180, 138, 0.6);
  }

  .release:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .note {
    margin-top: 10px;
    font-style: italic;
  }
</style>
