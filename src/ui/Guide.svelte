<script lang="ts">
  import type { Engine } from './engine.svelte';

  let { engine }: { engine: Engine } = $props();
</script>

{#if engine.guide === 1 || engine.guide === 2 || engine.guide === 4}
  <div class="guide" role="note">
    {#if engine.guide === 1}
      <p>Ce monde vit seul, nuit et jour. Chaque couleur est une lignée : une famille d'êtres qui naissent, mangent le sol et meurent.</p>
      <div class="row">
        <button class="skip" onclick={() => engine.endGuide()}>passer</button>
        <button class="main" onclick={() => engine.nextGuide()}>suivant</button>
      </div>
    {:else if engine.guide === 2}
      <p>Touche un endroit du monde pour y préparer ta spore. Elle héritera de la lignée la plus proche : tu entres dans une famille.</p>
    {:else}
      <p>Elle ne t'obéit plus. Reviens demain voir ce qu'elle est devenue, et qui descend d'elle : touche « revenir demain ».</p>
    {/if}
  </div>
{/if}

<style>
  .guide {
    position: absolute;
    z-index: 4;
    left: 50%;
    bottom: calc(120px + env(safe-area-inset-bottom));
    transform: translateX(-50%);
    width: min(420px, calc(100vw - 32px));
    padding: 14px 16px;
    border-radius: 14px;
    background: rgba(14, 12, 10, 0.94);
    border: 1px solid rgba(201, 180, 138, 0.45);
    font-family: var(--serif);
    font-size: 0.95rem;
    line-height: 1.45;
  }

  p {
    margin: 0;
  }

  .row {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 10px;
    font-family: var(--sans);
    font-size: 0.8rem;
  }

  .skip {
    border-color: transparent;
    color: var(--ink-dim);
  }

  .main {
    background: rgba(201, 180, 138, 0.22);
    border-color: rgba(201, 180, 138, 0.6);
  }
</style>
