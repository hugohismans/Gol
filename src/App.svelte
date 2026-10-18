<script lang="ts">
  import { onMount } from 'svelte';
  import { Engine } from './ui/engine.svelte';
  import Hud from './ui/Hud.svelte';
  import TimeBar from './ui/TimeBar.svelte';
  import MutationBar from './ui/MutationBar.svelte';
  import DebugPanel from './ui/DebugPanel.svelte';
  import MySpores from './ui/MySpores.svelte';
  import ReplayBar from './ui/ReplayBar.svelte';

  const engine = new Engine();
  let canvas: HTMLCanvasElement;
  let down: { x: number; y: number; t: number } | null = null;

  // Hauteur du panneau « mes spores » sur mobile : plus bas pendant la relecture pour laisser voir le monde.
  $effect(() => {
    document.documentElement.style.setProperty('--sheet', engine.replay ? '40vh' : '62vh');
  });

  onMount(() => {
    const ro = new ResizeObserver(() => engine.resize(canvas, canvas.clientWidth, canvas.clientHeight));
    ro.observe(canvas);
    engine.resize(canvas, canvas.clientWidth, canvas.clientHeight);
    void engine.start(canvas);
    (window as unknown as { engine: Engine }).engine = engine;
    return () => ro.disconnect();
  });

  function pointerDown(e: PointerEvent) {
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
  }

  function pointerUp(e: PointerEvent) {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    if (moved < 12 && performance.now() - down.t < 600) engine.tap(e.clientX, e.clientY);
    down = null;
  }
</script>

<canvas
  bind:this={canvas}
  onpointerdown={pointerDown}
  onpointerup={pointerUp}
  onpointercancel={() => (down = null)}
></canvas>

{#if engine.error}
  <div class="error">{engine.error}</div>
{:else}
  <Hud {engine} />
  <div class="bottom" class:beside={engine.sporesOpen}>
    {#if engine.replay}
      <ReplayBar {engine} />
    {:else}
      <TimeBar {engine} />
      <MutationBar {engine} />
    {/if}
  </div>
  <MySpores {engine} />
  <DebugPanel {engine} />
  <div class="tools" class:raised={engine.sporesOpen || engine.debugOpen}>
    <button class:on={engine.sporesOpen} onclick={() => engine.toggleSpores()} aria-expanded={engine.sporesOpen}>
      mes spores{engine.spores.length ? ` · ${engine.spores.length}` : ''}
    </button>
    <button class:on={engine.debugOpen} onclick={() => engine.toggleDebug()} aria-expanded={engine.debugOpen}>réglages</button>
  </div>
{/if}

<style>
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    touch-action: none;
    cursor: crosshair;
  }

  .bottom {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    padding: 0 12px calc(12px + env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    pointer-events: none;
  }

  @media (min-width: 601px) {
    .bottom.beside {
      padding-left: 372px;
    }
  }

  .bottom > :global(*) {
    pointer-events: auto;
  }

  .tools {
    position: absolute;
    z-index: 3;
    top: calc(76px + env(safe-area-inset-top));
    right: 16px;
    display: flex;
    gap: 6px;
  }

  .tools button {
    font-size: 0.75rem;
    background: var(--panel);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }

  @media (max-width: 600px) {
    .tools.raised {
      top: auto;
      bottom: calc(var(--sheet, 62vh) + 8px);
    }

    .bottom.beside {
      z-index: 3;
      bottom: calc(var(--sheet, 62vh) + 44px);
    }
  }

  .error {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 2rem;
    text-align: center;
    font-family: var(--serif);
    color: var(--ink-dim);
  }
</style>
