<script lang="ts">
  import type { Engine } from './engine.svelte';
  import StoryChart from './StoryChart.svelte';
  import { MUTATION_LABELS, formatDate, formatDuration } from './story';
  import type { SporeCard } from './story';

  let { engine }: { engine: Engine } = $props();

  function status(c: SporeCard): string {
    if (c.area > 0) return `vivante · ${c.area} cases`;
    const age = c.extinctTick !== null ? ` après ${formatDuration(c.extinctTick - c.bornTick)}` : '';
    return `éteinte${age}`;
  }

  function family(c: SporeCard): string {
    if (!c.descendantsAlive) return '';
    const s = c.descendantsAlive > 1 ? 's' : '';
    return `${c.area > 0 ? 'et ' : 'survit à travers '}${c.descendantsAlive} descendante${s} vivante${s}`;
  }
</script>

{#if engine.sporesOpen}
  <aside class="panel" aria-label="Mes spores">
    {#if engine.story}
      {@const s = engine.story}
      <button class="back" onclick={() => engine.select(null)}>toutes mes spores</button>
      <header>
        <i class="dot" style:background={s.card.color}></i>
        <div>
          <h2>Lignée n°{s.card.id}</h2>
          <p class="sub">
            déposée le {formatDate(s.card.bornTick)}{s.card.mutation ? ` · ${MUTATION_LABELS[s.card.mutation]}` : ''}
          </p>
        </div>
      </header>
      <p class="status">
        {status(s.card)}{family(s.card) ? `, ${family(s.card)}` : ''}. Record : {s.card.peakArea} cases.
      </p>

      <div class="actions">
        <button onclick={() => engine.locate()}>où est-elle ?</button>
        <button onclick={() => engine.replayStory()}>revoir son histoire</button>
      </div>

      <StoryChart story={s} cursor={engine.replay ? engine.shownTick : null} onseek={(t) => engine.seek(t)} />

      <h3>Ce qui s'est passé</h3>
      <ol class="events">
        {#each s.events as ev, i (i)}
          <li>
            <button class="when" onclick={() => engine.seek(ev.tick)} title="revoir ce moment">{formatDate(ev.tick)}</button>
            <span>{ev.text}</span>
          </li>
        {/each}
      </ol>
    {:else}
      <h2>Mes spores</h2>
      {#if engine.spores.length === 0}
        <p class="empty">Tu n'as encore rien déposé. Touche le monde pour déposer une spore, puis reviens ici suivre ce qu'elle devient.</p>
      {:else}
        <ul class="list">
          {#each engine.spores as c (c.id)}
            <li>
              <button class="card" onclick={() => engine.select(c.id)}>
                <i class="dot" style:background={c.color} class:dead={c.area === 0}></i>
                <span class="text">
                  <span class="name">n°{c.id}{c.mutation ? ` · ${MUTATION_LABELS[c.mutation]}` : ''}</span>
                  <span class="sub">{formatDate(c.bornTick)} · {status(c)}{family(c) ? `, ${family(c)}` : ''}</span>
                </span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
  </aside>
{/if}

<style>
  .panel {
    position: absolute;
    z-index: 2;
    left: 0;
    top: 0;
    bottom: 0;
    width: min(360px, 100vw);
    padding: calc(76px + env(safe-area-inset-top)) 16px calc(24px + env(safe-area-inset-bottom));
    overflow-y: auto;
    background: rgba(12, 10, 9, 0.88);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border-right: 1px solid var(--line);
    font-size: 0.82rem;
  }

  @media (max-width: 600px) {
    .panel {
      top: auto;
      width: 100%;
      height: var(--sheet, 62vh);
      padding-top: 16px;
      border-right: 0;
      border-top: 1px solid var(--line);
      border-radius: 16px 16px 0 0;
    }
  }

  h2 {
    margin: 0;
    font-family: var(--serif);
    font-weight: normal;
    font-size: 1.1rem;
  }

  h3 {
    margin: 18px 0 6px;
    font-family: var(--serif);
    font-weight: normal;
    font-size: 0.95rem;
    color: var(--accent);
  }

  header {
    display: flex;
    gap: 10px;
    align-items: center;
    margin-top: 10px;
  }

  .dot {
    flex: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    box-shadow: 0 0 10px rgba(255, 245, 225, 0.18);
  }

  .dot.dead {
    opacity: 0.35;
    box-shadow: none;
  }

  .sub {
    margin: 2px 0 0;
    color: var(--ink-dim);
    font-size: 0.75rem;
  }

  .status {
    margin: 10px 0;
    line-height: 1.45;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .back {
    font-size: 0.72rem;
    padding: 0.3em 0.7em;
  }

  .empty {
    margin-top: 10px;
    color: var(--ink-dim);
    font-family: var(--serif);
    font-style: italic;
    line-height: 1.5;
  }

  .list {
    list-style: none;
    margin: 12px 0 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }

  .card {
    width: 100%;
    display: flex;
    gap: 10px;
    align-items: center;
    text-align: left;
    border-radius: 12px;
    padding: 0.6em 0.8em;
  }

  .text {
    display: grid;
    gap: 2px;
  }

  .name {
    font-weight: 600;
  }

  .events {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }

  .events li {
    display: grid;
    gap: 2px;
    line-height: 1.4;
  }

  .when {
    justify-self: start;
    border: 0;
    padding: 0;
    font-size: 0.72rem;
    color: var(--accent);
    text-decoration: underline dotted;
    text-underline-offset: 3px;
  }
</style>
