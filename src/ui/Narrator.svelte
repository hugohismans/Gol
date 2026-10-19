<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import type { Engine } from './engine.svelte';

  let { engine }: { engine: Engine } = $props();
</script>

<div class="narrator" aria-live="polite">
  {#each engine.captions as c (c.id)}
    <p class:family={c.family} in:fly={{ y: -6, duration: 500 }} out:fade={{ duration: 900 }}>{c.text}</p>
  {/each}
</div>

<style>
  .narrator {
    position: absolute;
    z-index: 1;
    top: calc(128px + env(safe-area-inset-top));
    left: 50%;
    transform: translateX(-50%);
    width: min(520px, calc(100vw - 32px));
    display: grid;
    gap: 6px;
    pointer-events: none;
    text-align: center;
  }

  p {
    margin: 0;
    font-family: var(--serif);
    font-style: italic;
    font-size: 0.92rem;
    line-height: 1.35;
    color: var(--ink-dim);
    text-shadow: 0 1px 10px rgba(0, 0, 0, 0.95), 0 0 2px rgba(0, 0, 0, 0.9);
  }

  p.family {
    color: #f0e2c4;
  }
</style>
