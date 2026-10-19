<script lang="ts">
  import type { Engine } from './engine.svelte';
  import { formatDate } from './story';

  let { engine }: { engine: Engine } = $props();
</script>

{#if engine.recap}
  {@const r = engine.recap}
  <div class="veil" role="presentation"></div>
  <div class="recap" role="dialog" aria-modal="true" aria-label="Pendant ton absence">
    <h2>Pendant ton absence</h2>
    <p class="sub">du {formatDate(r.from)} au {formatDate(r.to)}</p>

    {#if r.families.length === 0}
      <p class="empty">Tu n'as pas encore de famille dans ce monde. Dépose une spore : demain, elle aura une histoire.</p>
    {/if}
    {#each r.families as f (f.rootId)}
      <article>
        <h3><i class="dot" style:background={f.color} class:dead={!f.alive}></i>{f.title}</h3>
        {#each f.lines as line, i (i)}<p>{line}</p>{/each}
        <button class="link" onclick={() => { engine.closeRecap(); engine.openPanel('spores'); engine.select(f.rootId); }}>lire toute son histoire</button>
      </article>
    {/each}

    {#if r.world.length}
      <h3 class="world">Dans le reste du monde</h3>
      <ul>
        {#each r.world as w, i (i)}<li>{w}</li>{/each}
      </ul>
    {/if}

    {#if engine.guide === 5}
      <p class="guide">Voilà la boucle : chaque jour, lire ce qui est arrivé, puis déposer la spore du jour. Tu ne contrôles rien, tu transmets.</p>
    {/if}

    <div class="actions">
      <button onclick={() => engine.replayRecap()}>revoir ces 24 h</button>
      <button
        class="main"
        onclick={() => {
          engine.closeRecap();
          if (engine.guide === 5) engine.endGuide();
        }}>retourner au monde</button
      >
    </div>
  </div>
{/if}

<style>
  .veil {
    position: absolute;
    inset: 0;
    z-index: 5;
    background: rgba(5, 4, 3, 0.55);
  }

  .recap {
    position: absolute;
    z-index: 6;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(480px, calc(100vw - 24px));
    max-height: calc(100vh - 48px);
    overflow-y: auto;
    padding: 22px 20px 16px;
    border-radius: 18px;
    background: rgba(14, 12, 10, 0.96);
    border: 1px solid var(--line);
    font-size: 0.86rem;
    line-height: 1.45;
  }

  h2 {
    margin: 0;
    font-family: var(--serif);
    font-weight: normal;
    font-size: 1.35rem;
  }

  h3 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 18px 0 4px;
    font-family: var(--serif);
    font-weight: normal;
    font-size: 1.05rem;
  }

  h3.world {
    color: var(--accent);
    font-size: 0.95rem;
  }

  article p {
    margin: 4px 0;
  }

  ul {
    margin: 4px 0 0;
    padding-left: 18px;
    color: var(--ink-dim);
  }

  .empty,
  .guide {
    font-family: var(--serif);
    font-style: italic;
    color: var(--ink-dim);
  }

  .guide {
    margin-top: 16px;
    padding: 10px 12px;
    border-left: 2px solid var(--accent);
    color: var(--ink);
  }

  .link {
    border: 0;
    padding: 0;
    margin-top: 2px;
    font-size: 0.78rem;
    color: var(--accent);
    text-decoration: underline dotted;
    text-underline-offset: 3px;
  }

  .actions {
    position: sticky;
    bottom: -16px;
    display: flex;
    gap: 8px;
    margin: 18px -20px -16px;
    padding: 12px 20px;
    background: rgba(14, 12, 10, 0.98);
  }

  .actions .main {
    flex: 1;
    background: rgba(201, 180, 138, 0.22);
    border-color: rgba(201, 180, 138, 0.6);
  }
</style>
