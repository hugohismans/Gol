<script lang="ts">
  import type { Engine } from './engine.svelte';
  import StoryChart from './StoryChart.svelte';
  import { MUTATION_LABELS, dnaSummary, formatDate, isMine } from './story';
  import { status, family } from './cards';
  import { familyTree } from './recit';

  let { engine, back }: { engine: Engine; back: string } = $props();
</script>

{#if engine.story}
  {@const s = engine.story}
  <button class="back" onclick={() => engine.select(null)}>{back}</button>
  <header>
    <i class="dot" style:background={s.card.color}></i>
    <div>
      <h2>{s.card.name ?? `Lignée n°${s.card.id}`}</h2>
      <p class="sub">
        {s.card.name ? `n°${s.card.id} · ` : ''}{s.card.visitor
          ? isMine(s.card.visitor, engine.pseudo)
            ? 'ta spore'
            : `spore de ${s.card.visitor}`
          : 'graine du monde'} · {formatDate(s.card.bornTick)}
      </p>
      {#if s.card.dna}
        <p class="sub">ADN : {dnaSummary(s.card.dna)}</p>
      {:else if s.card.mutation}
        <p class="sub">{MUTATION_LABELS[s.card.mutation]}</p>
      {/if}
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

  {@const tree = familyTree(engine.organisme, s.card.id, engine.pseudo)}
  {#if tree.length > 1}
    <h3>Sa descendance</h3>
    <ul class="tree">
      {#each tree as n (n.id)}
        <li style:padding-left="{n.depth * 14}px">
          <button class="node" class:dead={!n.alive} onclick={() => engine.select(n.id)}>
            <i class="dot small" style:background={n.color} class:dead={!n.alive}></i>
            <span>{n.label}</span>
            <span class="sub">{n.who}{n.alive ? ` · ${n.area} cases` : ' · éteinte'}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  <h3>Ce qui s'est passé</h3>
  <ol class="events">
    {#each s.events as ev, i (i)}
      <li>
        <button class="when" onclick={() => engine.seek(ev.tick)} title="revoir ce moment">{formatDate(ev.tick)}</button>
        <span>{ev.text}</span>
      </li>
    {/each}
  </ol>
{/if}

<style>
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
    align-items: flex-start;
    margin-top: 10px;
  }

  header .dot {
    margin-top: 5px;
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

  .tree {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 2px;
  }

  .node {
    display: flex;
    align-items: center;
    gap: 6px;
    border: 0;
    padding: 2px 0;
    text-align: left;
  }

  .node.dead span:first-of-type {
    color: var(--ink-dim);
  }

  .dot.small {
    width: 9px;
    height: 9px;
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
