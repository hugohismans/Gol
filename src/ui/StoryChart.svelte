<script lang="ts">
  import type { Story } from './story';
  import { formatDate } from './story';

  let { story, cursor, onseek }: { story: Story; cursor: number | null; onseek: (tick: number) => void } = $props();

  const W = 320;
  const H = 120;
  const x0 = 6;
  const x1 = W - 6;
  const y0 = 14;
  const y1 = 92;

  let t0 = $derived(story.card.bornTick);
  let t1 = $derived(Math.max(story.endTick, t0 + 1));
  let max = $derived(Math.max(1, ...story.points.map((p) => p.family)));
  const X = (t: number) => x0 + ((t - t0) / (t1 - t0)) * (x1 - x0);
  const Y = (v: number) => y1 - (v / max) * (y1 - y0);

  let familyPath = $derived(
    story.points.length
      ? `M${X(story.points[0].tick)} ${y1}` + story.points.map((p) => `L${X(p.tick)} ${Y(p.family)}`).join('') + `L${X(story.points.at(-1)!.tick)} ${y1}Z`
      : '',
  );
  let ownPath = $derived(story.points.map((p, i) => `${i ? 'L' : 'M'}${X(p.tick)} ${Y(p.own)}`).join(''));
  let hasFamily = $derived(story.points.some((p) => p.family > p.own));

  let svg: SVGSVGElement;
  let dragging = false;

  function seekAt(e: PointerEvent) {
    const r = svg.getBoundingClientRect();
    const u = ((e.clientX - r.left) / r.width) * W;
    const t = t0 + ((Math.min(x1, Math.max(x0, u)) - x0) / (x1 - x0)) * (t1 - t0);
    onseek(Math.round(t));
  }
</script>

<figure>
  <svg
    bind:this={svg}
    viewBox="0 0 {W} {H}"
    role="slider"
    tabindex="0"
    aria-label="Étendue de la lignée au fil du temps ; toucher pour revoir ce moment"
    aria-valuemin={t0}
    aria-valuemax={t1}
    aria-valuenow={cursor ?? t1}
    onpointerdown={(e) => {
      dragging = true;
      svg.setPointerCapture(e.pointerId);
      seekAt(e);
    }}
    onpointermove={(e) => dragging && seekAt(e)}
    onpointerup={() => (dragging = false)}
  >
    <line x1={x0} x2={x1} y1={y1} y2={y1} class="axis" />
    {#if hasFamily}<path d={familyPath} fill={story.card.color} fill-opacity="0.18" />{/if}
    <path d={ownPath} fill="none" stroke={story.card.color} stroke-width="1.6" stroke-linejoin="round" />
    {#if cursor !== null && cursor >= t0 && cursor <= t1}
      <line x1={X(cursor)} x2={X(cursor)} y1={y0 - 6} y2={y1} class="cursor" />
    {/if}
    <text x={x0} y="9" class="label">{max} cases</text>
    <text x={x0} y={H - 10} class="label">{formatDate(t0)}</text>
    <text x={x1} y={H - 10} class="label" text-anchor="end">{story.familyExtinctTick !== null ? formatDate(t1) : 'maintenant'}</text>
  </svg>
  <figcaption>
    <span class="key"><i style:background={story.card.color}></i>elle</span>
    {#if hasFamily}<span class="key"><i style:background={story.card.color} style:opacity="0.35"></i>avec ses descendantes</span>{/if}
    <span class="hint">toucher la courbe pour revoir ce moment</span>
  </figcaption>
</figure>

<style>
  figure {
    margin: 10px 0 0;
  }

  svg {
    width: 100%;
    display: block;
    cursor: ew-resize;
    touch-action: none;
  }

  .axis {
    stroke: var(--line);
  }

  .cursor {
    stroke: var(--ink);
    stroke-width: 1;
    stroke-dasharray: 2 2;
  }

  .label {
    font-size: 9px;
    fill: var(--ink-dim);
  }

  figcaption {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    font-size: 0.72rem;
    color: var(--ink-dim);
  }

  .key i {
    display: inline-block;
    width: 10px;
    height: 3px;
    margin-right: 5px;
    vertical-align: middle;
    border-radius: 2px;
  }

  .hint {
    font-style: italic;
  }
</style>
