<script lang="ts">
  import { onMount } from 'svelte';
  import { Engine } from './ui/engine.svelte';
  import Hud from './ui/Hud.svelte';
  import TimeBar from './ui/TimeBar.svelte';
  import MutationBar from './ui/MutationBar.svelte';
  import DebugPanel from './ui/DebugPanel.svelte';

  const engine = new Engine();
  let canvas: HTMLCanvasElement;
  let down: { x: number; y: number; t: number } | null = null;

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
  <div class="bottom">
    <TimeBar {engine} />
    <MutationBar {engine} />
  </div>
  <DebugPanel {engine} />
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

  .bottom > :global(*) {
    pointer-events: auto;
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
