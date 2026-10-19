<script lang="ts">
  import type { Engine } from './engine.svelte';
  import LineageStory from './LineageStory.svelte';
  import { dnaSummary, formatDate } from './story';
  import { family, status } from './cards';

  let { engine }: { engine: Engine } = $props();
</script>

{#if engine.panel === 'spores'}
  <aside class="side-panel" aria-label="Mes spores">
    {#if engine.story}
      <LineageStory {engine} back="toutes mes spores" />
    {:else}
      <h2>Mes spores</h2>
      <label class="pseudo">
        <span class="sub">ton pseudo</span>
        <input
          value={engine.pseudo}
          maxlength="24"
          placeholder="choisis un nom"
          onchange={(e) => {
            engine.pseudo = (e.currentTarget as HTMLInputElement).value.trim();
            engine.persistPrefs();
          }}
        />
      </label>
      {#if engine.spores.length === 0}
        <p class="empty">Tu n'as encore rien déposé. Touche le monde pour préparer une spore, puis reviens ici suivre ce qu'elle devient.</p>
      {:else}
        <ul class="list">
          {#each engine.spores as c (c.id)}
            <li>
              <button class="card" onclick={() => engine.select(c.id)}>
                <i class="dot" style:background={c.color} class:dead={c.area === 0 && c.descendantsAlive === 0}></i>
                <span class="text">
                  <span class="name">{c.name ?? `n°${c.id}`}</span>
                  <span class="sub">{formatDate(c.bornTick)} · {status(c)}{family(c) ? `, ${family(c)}` : ''}</span>
                  {#if c.dna}<span class="sub">{dnaSummary(c.dna)}</span>{/if}
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
  .pseudo {
    display: grid;
    gap: 4px;
    margin-top: 12px;
  }

  input {
    font: inherit;
    color: inherit;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 0.45em 0.6em;
  }

  .empty {
    margin-top: 12px;
    color: var(--ink-dim);
    font-family: var(--serif);
    font-style: italic;
    line-height: 1.5;
  }

  .list {
    list-style: none;
    margin: 14px 0 0;
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
</style>
