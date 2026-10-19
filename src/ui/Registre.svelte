<script lang="ts">
  import type { Engine } from './engine.svelte';
  import LineageStory from './LineageStory.svelte';
  import type { RegistryTab } from './story';

  let { engine }: { engine: Engine } = $props();

  const TABS: { id: RegistryTab; label: string; hint: string }[] = [
    { id: 'doyennes', label: 'doyennes', hint: 'Les familles qui survivent depuis le plus longtemps.' },
    { id: 'etendues', label: 'étendues', hint: 'Les familles qui couvrent le plus de terrain en ce moment.' },
    { id: 'prolifiques', label: 'prolifiques', hint: 'Les lignées qui ont donné le plus de descendantes.' },
  ];
</script>

{#if engine.panel === 'registre'}
  <aside class="side-panel" aria-label="Registre des lignées">
    {#if engine.story}
      <LineageStory {engine} back="retour au registre" />
    {:else}
      <h2>Registre</h2>
      <div class="tabs" role="tablist">
        {#each TABS as t (t.id)}
          <button role="tab" aria-selected={engine.registryTab === t.id} class:on={engine.registryTab === t.id} onclick={() => engine.setRegistryTab(t.id)}>
            {t.label}
          </button>
        {/each}
      </div>
      <p class="sub hint">
        {TABS.find((t) => t.id === engine.registryTab)?.hint} Une famille, c'est une spore et toutes ses descendantes.
      </p>
      {#if engine.registry.length === 0}
        <p class="sub">Personne pour l'instant.</p>
      {:else}
        <ol class="rows">
          {#each engine.registry as r, i (r.id)}
            <li>
              <button class="row" class:mine={r.mine} onclick={() => engine.select(r.id)}>
                <span class="rank">{i + 1}</span>
                <i class="dot" style:background={r.color} class:dead={!r.familyAlive}></i>
                <span class="who">
                  <span class="name">{r.name ?? `n°${r.id}`}</span>
                  <span class="sub">{r.visitor ? (r.mine ? `${r.visitor} (toi)` : r.visitor) : 'graine du monde'}</span>
                </span>
                <span class="value">{r.label}</span>
              </button>
            </li>
          {/each}
        </ol>
      {/if}
      <p class="sub note">En prototype, chaque navigateur a son propre monde : seules tes spores y portent un pseudo. Le registre partagé viendra avec le serveur.</p>
    {/if}
  </aside>
{/if}

<style>
  .tabs {
    display: flex;
    gap: 4px;
    margin-top: 12px;
  }

  .tabs button {
    font-size: 0.75rem;
  }

  .hint {
    margin: 10px 0;
    line-height: 1.4;
  }

  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 4px;
  }

  .row {
    width: 100%;
    display: grid;
    grid-template-columns: 1.6em auto 1fr auto;
    gap: 8px;
    align-items: center;
    text-align: left;
    border-radius: 10px;
    border-color: transparent;
    padding: 0.45em 0.6em;
  }

  .row.mine {
    border-color: rgba(201, 180, 138, 0.45);
  }

  .rank {
    color: var(--ink-dim);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .who {
    display: grid;
    min-width: 0;
  }

  .name {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .value {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .note {
    margin-top: 16px;
    font-style: italic;
    line-height: 1.4;
  }
</style>
