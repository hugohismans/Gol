// Boucle principale : relie la simulation, le rendu et l'interface Svelte.

import { DEFAULT_PARAMS, SECONDS_PER_TICK, SPEEDS, TICKS_PER_DAY, TICKS_PER_SECOND_X1 } from '../sim/config';
import type { Params } from '../sim/config';
import { dateOf, daylight } from '../sim/calendar';
import type { SimDate } from '../sim/calendar';
import { Organisme } from '../sim/organisme';
import { GpuBackend } from '../sim/gpu/backend';
import { GRID_SIZE } from '../sim/config';
import type { MutationKind, SimStats } from '../sim/types';
import { Renderer } from '../render/renderer';
import type { Layer, View, ViewMode } from '../render/renderer';
import { clearWorld, loadPrefs, loadWorld, savePrefs, saveWorld } from '../persistence';

/** Bornes du nombre de ticks joués par image, ajusté selon la fluidité. */
const MIN_TICKS_PER_FRAME = 1;
const MAX_TICKS_PER_FRAME = 4000;
/** Durée d'image visée (ms) avant de réduire le travail par image. */
const FRAME_BUDGET_MS = 22;
const AUTOSAVE_MS = 20000;
const UI_REFRESH_MS = 200;
/** Le rendu est doux : au delà, la résolution coûte sans se voir. */
const MAX_PIXEL_RATIO = 1.5;

export type Speed = (typeof SPEEDS)[number];

interface Prefs {
  speed: Speed;
  layer: Layer;
  view: ViewMode;
  mutation: MutationKind;
  debugOpen: boolean;
}

export class Engine {
  speed = $state<Speed>(1);
  layer = $state<Layer>('final');
  view = $state<ViewMode>('mosaique');
  mutation = $state<MutationKind>('gourmande');
  debugOpen = $state(false);
  params = $state<Params>({ ...DEFAULT_PARAMS });
  stats = $state<SimStats | null>(null);
  date = $state<SimDate>(dateOf(0));
  /** Vitesse réellement obtenue, en multiple de x1. */
  effectiveSpeed = $state(0);
  /** Avance rapide en cours : ticks restants et total. */
  fastForward = $state<{ left: number; total: number } | null>(null);
  error = $state<string | null>(null);
  saveInfo = $state('');
  sizeCells = $state(0);

  private canvas!: HTMLCanvasElement;
  private gl!: WebGL2RenderingContext;
  private sim!: Organisme;
  private gpu!: GpuBackend;
  private renderer!: Renderer;
  private raf = 0;
  private last = 0;
  private ticksPerFrame = 8;
  private lastUi = 0;
  private lastSave = 0;
  private tickWindow: { t: number; ticks: number }[] = [];
  private startTime = performance.now();

  async start(canvas: HTMLCanvasElement): Promise<void> {
    this.canvas = canvas;
    const prefs = loadPrefs<Prefs>();
    Object.assign(this, prefs);
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
    if (!gl) {
      this.error = "WebGL2 n'est pas disponible dans ce navigateur.";
      return;
    }
    this.gl = gl;
    try {
      this.gpu = new GpuBackend(gl, GRID_SIZE);
      this.sim = new Organisme(this.gpu);
      this.renderer = new Renderer(gl, this.sim.size);
    } catch (e) {
      this.error = (e as Error).message;
      return;
    }
    this.sizeCells = this.sim.size * this.sim.size;
    try {
      const saved = await loadWorld();
      if (saved) this.sim.restore(saved);
      else this.sim.seedRandom();
    } catch (e) {
      console.warn('Sauvegarde illisible, nouveau monde.', e);
      this.sim.reset();
      this.sim.seedRandom();
    }
    this.params = { ...this.sim.params };
    this.sim.census();
    this.refreshUi();
    canvas.addEventListener('webglcontextlost', (ev) => {
      ev.preventDefault();
      this.error = 'Le contexte WebGL a été perdu. Recharge la page pour reprendre la dernière sauvegarde.';
      cancelAnimationFrame(this.raf);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void this.save();
    });
    this.last = performance.now();
    this.lastSave = this.last;
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    const frameMs = now - this.last;
    const realDt = Math.min(0.1, frameMs / 1000);
    this.last = now;
    this.adaptBudget(frameMs);

    let ran = 0;
    if (this.fastForward) {
      const k = Math.min(this.fastForward.left, Math.round(this.ticksPerFrame));
      this.sim.runTicks(k);
      ran = k;
      const left = this.fastForward.left - k;
      this.fastForward = left > 0 ? { left, total: this.fastForward.total } : null;
    } else if (this.speed > 0) {
      const wanted = this.speed * TICKS_PER_SECOND_X1 * realDt;
      const capped = Math.min(wanted, this.ticksPerFrame);
      ran = this.sim.step(capped * SECONDS_PER_TICK);
    }
    this.tickWindow.push({ t: now, ticks: ran });
    while (this.tickWindow.length > 1 && now - this.tickWindow[0].t > 1000) this.tickWindow.shift();

    const v = this.currentView();
    this.renderer.render(
      this.gpu.textures, this.canvas.width, this.canvas.height, v, this.layer,
      (now - this.startTime) / 1000, daylight(this.sim.tick), this.sim.stats.meanSediment,
    );

    if (now - this.lastUi > UI_REFRESH_MS) {
      this.lastUi = now;
      this.refreshUi();
    }
    if (now - this.lastSave > AUTOSAVE_MS) {
      this.lastSave = now;
      void this.save();
    }
  };

  /** Ajuste le nombre de ticks par image pour rester fluide. */
  private adaptBudget(frameMs: number): void {
    const busy = this.fastForward !== null || this.speed * TICKS_PER_SECOND_X1 / 60 >= this.ticksPerFrame * 0.9;
    if (frameMs > FRAME_BUDGET_MS * 1.6) this.ticksPerFrame *= 0.8;
    else if (frameMs < FRAME_BUDGET_MS && busy) this.ticksPerFrame *= 1.1;
    this.ticksPerFrame = Math.min(MAX_TICKS_PER_FRAME, Math.max(MIN_TICKS_PER_FRAME, this.ticksPerFrame));
  }

  private refreshUi(): void {
    this.stats = { ...this.sim.stats };
    this.date = dateOf(this.sim.tick);
    const w = this.tickWindow;
    if (w.length > 1) {
      const span = (w[w.length - 1].t - w[0].t) / 1000;
      const ticks = w.slice(1).reduce((s, e) => s + e.ticks, 0);
      this.effectiveSpeed = span > 0 ? ticks / span / TICKS_PER_SECOND_X1 : 0;
    }
  }

  currentView(): View {
    return Renderer.view(this.canvas.width, this.canvas.height, this.view);
  }

  /** Taille du canvas en pixels physiques. */
  resize(canvas: HTMLCanvasElement, cssW: number, cssH: number): void {
    if (cssW === 0 || cssH === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }

  /** Pose une spore au point écran (pixels CSS). */
  tap(cssX: number, cssY: number): void {
    if (!this.sim) return;
    const rect = this.canvas.getBoundingClientRect();
    const sx = (cssX - rect.left) * (this.canvas.width / rect.width);
    const sy = (cssY - rect.top) * (this.canvas.height / rect.height);
    const v = this.currentView();
    const p = Renderer.screenToWorld(sx, sy, this.canvas.height, v, this.sim.size);
    if (v.clip && !p.inside) return;
    this.sim.spawnSpore(p.x, p.y, this.mutation);
    this.renderer.markSpore(p.x, p.y, (performance.now() - this.startTime) / 1000);
    this.sim.census();
    this.refreshUi();
  }

  setSpeed(s: Speed): void {
    this.speed = s;
    this.persistPrefs();
  }

  advanceDays(days: number): void {
    const total = Math.round(days * TICKS_PER_DAY);
    this.fastForward = { left: total, total };
    this.ticksPerFrame = Math.max(this.ticksPerFrame, 32);
  }

  cancelFastForward(): void {
    this.fastForward = null;
  }

  setParam<K extends keyof Params>(key: K, value: Params[K]): void {
    this.params[key] = value;
    this.sim.params[key] = value;
  }

  resetParams(): void {
    this.params = { ...DEFAULT_PARAMS };
    this.sim.params = { ...DEFAULT_PARAMS };
  }

  reset(): void {
    this.fastForward = null;
    this.sim.reset();
    clearWorld();
    this.refreshUi();
  }

  seed(): void {
    this.sim.seedRandom();
    this.sim.census();
    this.refreshUi();
  }

  persistPrefs(): void {
    savePrefs({ speed: this.speed, layer: this.layer, view: this.view, mutation: this.mutation, debugOpen: this.debugOpen });
  }

  async save(): Promise<void> {
    if (!this.sim) return;
    try {
      const chars = await saveWorld(this.sim.serialize());
      this.saveInfo = `sauvegardé (${(chars / 1024).toFixed(0)} ko)`;
    } catch (e) {
      this.saveInfo = 'sauvegarde impossible : ' + (e as Error).message;
    }
  }

  /** Accès direct pour le debug dans la console. */
  get organisme(): Organisme {
    return this.sim;
  }
}
