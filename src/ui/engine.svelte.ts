// Boucle principale : relie la simulation, le rendu et l'interface Svelte.

import { DEFAULT_PARAMS, SECONDS_PER_TICK, SPEEDS, TICKS_PER_DAY, TICKS_PER_SECOND_X1 } from '../sim/config';
import type { Params } from '../sim/config';
import { dateOf, daylight } from '../sim/calendar';
import type { SimDate } from '../sim/calendar';
import { Organisme } from '../sim/organisme';
import { GpuBackend } from '../sim/gpu/backend';
import { GRID_SIZE } from '../sim/config';
import type { Dna, Genome, SimStats } from '../sim/types';
import { NEUTRAL_DNA, applyDna, isValidDna } from '../sim/genome';
import { FrameTextures, Renderer } from '../render/renderer';
import type { Layer, RenderOptions, View, ViewMode } from '../render/renderer';
import { clearWorld, loadPrefs, loadWorld, savePrefs, saveWorld } from '../persistence';
import { clearFrames, getFrame, listTicks, pruneFrames, putFrame, useWorldSize } from '../history';
import { decodeFrame } from '../sim/frame';
import { lineageStory, mySpores, placeAt, registry } from './story';
import { buildRecap, concernsFamily, eventText, myFamily, objective } from './recit';
import type { Recap } from './recit';
import { SimulatedVisitors } from '../sim/visitors';
import type { WorldEvent } from '../sim/types';
import type { RegistryRow, RegistryTab, SporeCard, Story } from './story';

/**
 * Part du temps réel que la simulation peut occuper aux grandes vitesses ;
 * le reste va à l'affichage et à l'interface.
 */
const SIM_TIME_SHARE = 0.75;
/** Mesure du coût d'un tick : intervalle, taille minimale du paquet chronométré, lissage. */
const CALIBRATE_EVERY_MS = 1500;
const CALIBRATE_MIN_TICKS = 4;
const CALIBRATE_SMOOTHING = 0.3;
/** Plafond d'un pas de temps réel (onglet en arrière plan, à-coups). */
const MAX_FRAME_DT = 0.25;
/** Durée d'affichage d'une phrase du narrateur, et écart minimal entre deux phrases sur le monde (ms). */
const CAPTION_MS = 7000;
const WORLD_CAPTION_GAP_MS = 6000;
/** Phrases du narrateur affichées ensemble au plus. */
const MAX_CAPTIONS = 3;
/** Au delà de cette vitesse, le narrateur se tait (trop d'événements pour être lus). */
const NARRATOR_MAX_SPEED = 10;
/** Heures de la tombée de la nuit et de l'aube racontées. */
const DUSK_HOUR = 20;
const DAWN_HOUR = 6;

export interface Caption {
  id: number;
  text: string;
  family: boolean;
  until: number;
}

/** Étapes de la première visite guidée (0 : terminée). */
export type GuideStep = 0 | 1 | 2 | 3 | 4 | 5;
const AUTOSAVE_MS = 20000;
const UI_REFRESH_MS = 200;
/** Le rendu est doux : au delà, la résolution coûte sans se voir. */
const MAX_PIXEL_RATIO = 1.5;
/** Durée d'affichage d'un instantané pendant la relecture (ms). */
const REPLAY_STEP_MS = 280;
/** Durée du signal « où est-elle ? » (ms). */
const LOCATE_MS = 6000;
/** Sous cette surface, une lignée est signalée par un anneau en plus de sa mise en évidence. */
const SMALL_AREA = 150;

export interface Replay {
  ticks: number[];
  index: number;
  playing: boolean;
}

export type Speed = (typeof SPEEDS)[number];

export type Panel = 'registre' | 'spores' | 'reglages';

/** Spore en préparation dans l'éprouvette : lieu choisi et génome prélevé. */
export interface PendingSpore {
  x: number;
  y: number;
  parentId: number | null;
  base: Genome;
}

interface Prefs {
  speed: Speed;
  layer: Layer;
  view: ViewMode;
  pseudo: string;
  dna: Dna;
  name: string;
  eprouvette: boolean;
  atelier: boolean;
  visiteurs: boolean;
  guided: boolean;
}

export class Engine {
  speed = $state<Speed>(1);
  layer = $state<Layer>('final');
  view = $state<ViewMode>('mosaique');
  /** Panneau latéral ouvert. */
  panel = $state<Panel | null>(null);
  pseudo = $state('');
  /** ADN et nom préparés pour la prochaine spore. */
  dna = $state<Dna>({ ...NEUTRAL_DNA });
  name = $state('');
  /** Passer par l'éprouvette avant chaque dépôt. */
  eprouvette = $state(true);
  pending = $state<PendingSpore | null>(null);
  registryTab = $state<RegistryTab>('doyennes');
  /** Mode atelier : outils du prototype (vitesses, avance rapide, réglages). Sinon, mode visiteur. */
  atelier = $state(false);
  /** Visiteurs simulés actifs. */
  visiteurs = $state(true);
  guided = $state(false);
  guide = $state<GuideStep>(0);
  captions = $state<Caption[]>([]);
  objectiveText = $state('');
  recap = $state<Recap | null>(null);
  registry = $state<RegistryRow[]>([]);
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
  /** Spores déposées par le visiteur. */
  spores = $state<SporeCard[]>([]);
  /** Lignée dont on lit l'histoire (et qui est mise en évidence). */
  selected = $state<number | null>(null);
  story = $state<Story | null>(null);
  replay = $state<Replay | null>(null);
  /** Tick affiché : celui de l'instantané en relecture, sinon le présent. */
  shownTick = $state(0);

  private canvas!: HTMLCanvasElement;
  private gl!: WebGL2RenderingContext;
  private sim!: Organisme;
  private gpu!: GpuBackend;
  private renderer!: Renderer;
  private raf = 0;
  private last = 0;
  /** Coût mesuré d'un tick en ms (GPU compris), et date de la dernière mesure. */
  private msPerTick = 1;
  private lastCalibration = 0;
  /** Coût d'un tick et vitesse maximale atteignable, pour les réglages. */
  perf = $state({ msPerTick: 0, maxSpeed: 0 });
  private lastUi = 0;
  private lastSave = 0;
  private tickWindow: { t: number; ticks: number }[] = [];
  private startTime = performance.now();
  private frameTex!: FrameTextures;
  private loadingFrame = false;
  private lastReplayStep = 0;
  private locateUntil = 0;
  private bots!: SimulatedVisitors;
  private recapFrom: number | null = null;
  private lastWorldCaption = 0;
  private captionId = 0;
  private lastHour = -1;

  async start(canvas: HTMLCanvasElement): Promise<void> {
    this.canvas = canvas;
    const prefs = loadPrefs<Prefs>();
    Object.assign(this, prefs);
    if (!prefs.dna || !isValidDna(prefs.dna)) this.dna = { ...NEUTRAL_DNA };
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
    if (!gl) {
      this.error = "WebGL2 n'est pas disponible dans ce navigateur.";
      return;
    }
    this.gl = gl;
    try {
      // ?taille=128 : monde plus petit, pour tester vite ou sur un appareil modeste.
      const asked = Number(new URLSearchParams(location.search).get('taille'));
      const size = [64, 128, 256, 512].includes(asked) ? asked : GRID_SIZE;
      useWorldSize(size);
      this.gpu = new GpuBackend(gl, size);
      this.sim = new Organisme(this.gpu);
      this.renderer = new Renderer(gl, this.sim.size);
      this.frameTex = new FrameTextures(gl, this.sim.size);
    } catch (e) {
      this.error = (e as Error).message;
      return;
    }
    this.sizeCells = this.sim.size * this.sim.size;
    try {
      const saved = await loadWorld();
      if (saved && this.sim.size === GRID_SIZE) this.sim.restore(saved);
      else this.sim.seedRandom();
    } catch (e) {
      console.warn('Sauvegarde illisible, nouveau monde.', e);
      this.sim.reset();
      this.sim.seedRandom();
    }
    this.params = { ...this.sim.params };
    this.sim.onSnapshot = (tick, frame) => putFrame(tick, frame);
    this.bots = new SimulatedVisitors(this.sim, (Math.random() * 2 ** 32) >>> 0, () => this.pseudo);
    this.sim.onTick = (t) => {
      if (this.visiteurs) this.bots.tick(t);
    };
    this.sim.onEvent = (e) => this.narrate(e);
    if (!this.guided) this.guide = 1;
    void pruneFrames(this.sim.tick).catch(() => {});
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
    const realDt = Math.min(MAX_FRAME_DT, (now - this.last) / 1000);
    this.last = now;
    // Ticks que la simulation peut jouer dans cette image sans dépasser sa part du temps.
    const allowed = ((SIM_TIME_SHARE * 1000) / this.msPerTick) * realDt;

    let ran = 0;
    if (this.replay) {
      this.stepReplay(now);
    } else if (this.fastForward) {
      const k = Math.max(1, Math.min(this.fastForward.left, Math.floor(allowed)));
      this.runMeasured(k, now);
      ran = k;
      const left = this.fastForward.left - k;
      this.fastForward = left > 0 ? { left, total: this.fastForward.total } : null;
      if (!this.fastForward && this.recapFrom !== null) this.showRecap();
    } else if (this.runSpeed > 0) {
      const wanted = this.runSpeed * TICKS_PER_SECOND_X1 * realDt;
      const capped = Math.min(wanted, allowed);
      // step() garde le reliquat fractionnaire d'une image à l'autre.
      const before = this.sim.tick;
      if (capped >= CALIBRATE_MIN_TICKS) this.runMeasured(Math.floor(capped), now);
      else this.sim.step(capped * SECONDS_PER_TICK);
      ran = this.sim.tick - before;
    }
    this.tickWindow.push({ t: now, ticks: ran });
    while (this.tickWindow.length > 1 && now - this.tickWindow[0].t > 1000) this.tickWindow.shift();

    const past = this.replay && this.frameTex.tick >= 0;
    const tick = past ? this.frameTex.tick : this.sim.tick;
    const opts: RenderOptions = {
      width: this.canvas.width,
      height: this.canvas.height,
      view: this.currentView(),
      layer: this.layer,
      time: (now - this.startTime) / 1000,
      daylight: daylight(tick),
      meanSediment: past ? this.frameTex.meanSediment : this.sim.stats.meanSediment,
      ...this.highlight(tick, now),
    };
    this.renderer.render(past ? this.frameTex : this.gpu.textures, opts);

    if (now - this.lastUi > UI_REFRESH_MS) {
      this.lastUi = now;
      this.refreshUi();
    }
    if (now - this.lastSave > AUTOSAVE_MS) {
      this.lastSave = now;
      void this.save();
    }
  };

  /**
   * Joue n ticks et, de temps en temps, chronomètre le paquet en attendant que
   * le GPU l'ait réellement fini : c'est ce coût, et non la durée de l'image
   * (souvent dominée par l'affichage), qui fixe la vitesse atteignable.
   */
  private runMeasured(n: number, now: number): void {
    const measure = n >= CALIBRATE_MIN_TICKS && now - this.lastCalibration > CALIBRATE_EVERY_MS;
    if (!measure) {
      this.sim.runTicks(n);
      return;
    }
    this.lastCalibration = now;
    this.gpu.sync();
    const t0 = performance.now();
    this.sim.runTicks(n);
    this.gpu.sync();
    const ms = Math.max(0.01, (performance.now() - t0) / n);
    this.msPerTick += (ms - this.msPerTick) * CALIBRATE_SMOOTHING;
    this.perf = { msPerTick: this.msPerTick, maxSpeed: (SIM_TIME_SHARE * 1000) / this.msPerTick / TICKS_PER_SECOND_X1 };
  }

  /** Vitesse effective : le mode visiteur vit toujours à x1. */
  get runSpeed(): number {
    return this.atelier ? this.speed : 1;
  }

  // --- Narrateur et récit ---------------------------------------------------

  private narrate(e: WorldEvent): void {
    if (this.fastForward || this.runSpeed > NARRATOR_MAX_SPEED || this.replay) return;
    const family = myFamily(this.sim, this.pseudo);
    const mine = concernsFamily(e, family);
    const now = performance.now();
    if (!mine) {
      if (e.kind === 'sous-lignee' || now - this.lastWorldCaption < WORLD_CAPTION_GAP_MS) return;
      this.lastWorldCaption = now;
    }
    this.say(eventText(e, this.sim, this.pseudo, family), mine);
    if (e.kind !== 'famine') this.renderer.markSpore(e.x, e.y, (now - this.startTime) / 1000);
  }

  private say(text: string, family: boolean): void {
    const c: Caption = { id: ++this.captionId, text, family, until: performance.now() + CAPTION_MS };
    this.captions = [...this.captions, c].slice(-MAX_CAPTIONS);
  }

  /** Raconte la tombée de la nuit et l'aube, qui changent la vie du sol. */
  private narrateDaylight(): void {
    const h = this.date.hour;
    if (this.lastHour >= 0 && h !== this.lastHour && !this.fastForward && !this.replay && this.runSpeed <= NARRATOR_MAX_SPEED) {
      if (this.lastHour < DUSK_HOUR && h >= DUSK_HOUR) this.say('La nuit tombe : le sol se régénère moins vite.', false);
      if (this.lastHour < DAWN_HOUR && h >= DAWN_HOUR) this.say('L’aube : le sol reprend des forces.', false);
    }
    this.lastHour = h;
  }

  /** Avance d'un jour, puis raconte ce qui s'est passé pendant l'absence. */
  visitTomorrow(): void {
    if (this.pending || this.replay || this.fastForward) return;
    this.recapFrom = this.sim.tick;
    this.captions = [];
    this.advanceDays(1);
  }

  private showRecap(): void {
    const from = this.recapFrom!;
    this.recapFrom = null;
    this.sim.census();
    this.recap = buildRecap(this.sim, from, this.sim.tick, this.pseudo);
    if (this.guide === 4) this.guide = 5;
    this.refreshUi();
  }

  closeRecap(): void {
    this.recap = null;
  }

  /** Revoit en accéléré les 24 heures racontées. */
  async replayRecap(): Promise<void> {
    if (!this.recap) return;
    const from = this.recap.from;
    this.recap = null;
    await this.seek(from);
    if (this.replay) this.replay.playing = true;
  }

  // --- Visite guidée -----------------------------------------------------------

  nextGuide(): void {
    if (this.guide === 1) this.guide = 2;
    else if (this.guide === 4 || this.guide === 5) this.endGuide();
  }

  endGuide(): void {
    this.guide = 0;
    this.guided = true;
    this.persistPrefs();
  }

  restartGuide(): void {
    this.guided = false;
    this.guide = 1;
  }

  setAtelier(on: boolean): void {
    this.atelier = on;
    if (!on && this.panel === 'reglages') this.panel = null;
    this.persistPrefs();
  }

  /** Mise en évidence de la lignée choisie et anneau sur son lieu, au tick affiché. */
  private highlight(tick: number, now: number): Pick<RenderOptions, 'focus' | 'marker'> {
    if (this.pending) return { marker: { x: this.pending.x, y: this.pending.y, strength: 1 } };
    // On ne met une lignée en lumière que lorsqu'on lit son histoire.
    const reading = this.replay || this.panel === 'spores' || this.panel === 'registre';
    if (!reading || this.selected === null || !this.story) return {};
    const l = this.sim.lineages.get(this.selected);
    if (!l) return {};
    const place = placeAt(l, tick);
    const locating = now < this.locateUntil;
    const small = !place || place.area < SMALL_AREA;
    return {
      focus: { ids: this.story.family, strength: 1 },
      marker: place && (small || locating) ? { x: place.x, y: place.y, strength: locating ? 1 : 0.6 } : undefined,
    };
  }

  private refreshUi(): void {
    this.stats = { ...this.sim.stats };
    this.date = dateOf(this.replay && this.frameTex.tick >= 0 ? this.frameTex.tick : this.sim.tick);
    this.shownTick = this.replay && this.frameTex.tick >= 0 ? this.frameTex.tick : this.sim.tick;
    this.spores = mySpores(this.sim, this.pseudo);
    this.story = this.selected !== null ? lineageStory(this.sim, this.selected, this.pseudo) : null;
    if (this.panel === 'registre') this.registry = registry(this.sim, this.registryTab, this.pseudo);
    this.objectiveText = objective(this.sim, this.pseudo);
    const now = performance.now();
    if (this.captions.some((c) => c.until < now)) this.captions = this.captions.filter((c) => c.until >= now);
    this.narrateDaylight();
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
    if (this.replay) return;
    // Le génome est prélevé là où l'on touche : c'est celui dont la spore hérite.
    const base = this.sim.inheritedGenome(p.x, p.y);
    this.pending = { x: p.x, y: p.y, parentId: base.lineage, base: base.genome };
    if (this.guide === 2) this.guide = 3;
    if (!this.eprouvette && isValidDna(this.dna) && this.pseudo) this.release();
  }

  // --- Éprouvette ----------------------------------------------------------

  /** Génome de la spore préparée, ou null tant que l'ADN n'est pas équilibré. */
  preparedGenome(): Genome | null {
    return this.pending && isValidDna(this.dna) ? applyDna(this.pending.base, this.dna) : null;
  }

  /** Lâche la spore préparée dans le monde. */
  release(): void {
    const p = this.pending;
    const genome = this.preparedGenome();
    if (!p || !genome || !this.pseudo.trim()) return;
    const l = this.sim.plant(p.x, p.y, genome, {
      parentId: p.parentId,
      visitor: this.pseudo.trim(),
      dna: { ...this.dna },
      name: this.name,
    });
    this.pending = null;
    this.name = '';
    this.renderer.markSpore(p.x, p.y, (performance.now() - this.startTime) / 1000);
    this.sim.census();
    // Un instantané au moment du dépôt, pour que la relecture parte de là.
    putFrame(this.sim.tick, this.sim.snapshot());
    this.persistPrefs();
    this.selected = l.id;
    if (this.guide === 3) this.guide = 4;
    this.refreshUi();
  }

  cancelPending(): void {
    this.pending = null;
  }

  // --- Panneaux -------------------------------------------------------------

  openPanel(p: Panel): void {
    this.panel = this.panel === p ? null : p;
    if (!this.replay) this.selected = null;
    this.refreshUi();
  }

  setRegistryTab(t: RegistryTab): void {
    this.registryTab = t;
    this.refreshUi();
  }

  select(id: number | null): void {
    this.selected = id;
    this.refreshUi();
  }

  /** Signale où vit (ou vivait) la lignée choisie. */
  locate(): void {
    this.locateUntil = performance.now() + LOCATE_MS;
  }

  // --- Retour en arrière -------------------------------------------------------

  /** Entre en relecture au tick donné (l'instantané le plus proche avant lui). */
  async seek(tick: number): Promise<void> {
    const ticks = this.replay?.ticks ?? (await listTicks());
    if (!ticks.length) return;
    let index = 0;
    for (let i = 0; i < ticks.length; i++) if (ticks[i] <= tick) index = i;
    if (!this.replay) {
      this.replay = { ticks, index, playing: false };
      this.fastForward = null;
    } else {
      this.replay.index = index;
    }
    await this.showFrame();
  }

  /** Revoit l'histoire de la lignée choisie depuis son dépôt. */
  async replayStory(): Promise<void> {
    if (!this.story) return;
    await this.seek(this.story.card.bornTick);
    if (this.replay) this.replay.playing = true;
  }

  togglePlay(): void {
    if (!this.replay) return;
    if (!this.replay.playing && this.replay.index >= this.replay.ticks.length - 1) this.replay.index = 0;
    this.replay.playing = !this.replay.playing;
  }

  async setReplayIndex(i: number): Promise<void> {
    if (!this.replay) return;
    this.replay.index = Math.max(0, Math.min(this.replay.ticks.length - 1, i));
    await this.showFrame();
  }

  exitReplay(): void {
    if (!this.replay) return;
    this.replay = null;
    this.frameTex.tick = -1;
    this.refreshUi();
  }

  private stepReplay(now: number): void {
    const r = this.replay!;
    if (!r.playing || this.loadingFrame || now - this.lastReplayStep < REPLAY_STEP_MS) return;
    this.lastReplayStep = now;
    if (r.index >= r.ticks.length - 1) {
      r.playing = false;
      return;
    }
    r.index++;
    void this.showFrame();
  }

  private async showFrame(): Promise<void> {
    const r = this.replay;
    if (!r) return;
    this.loadingFrame = true;
    try {
      const bytes = await getFrame(r.ticks[r.index]);
      if (bytes && this.replay === r) this.frameTex.load(decodeFrame(bytes));
    } catch (e) {
      console.warn('Instantané illisible', e);
    } finally {
      this.loadingFrame = false;
      this.refreshUi();
    }
  }

  setSpeed(s: Speed): void {
    this.speed = s;
    this.persistPrefs();
  }

  advanceDays(days: number): void {
    const total = Math.round(days * TICKS_PER_DAY);
    this.fastForward = { left: total, total };
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
    this.exitReplay();
    this.selected = null;
    this.recap = null;
    this.captions = [];
    this.sim.reset();
    clearWorld();
    void clearFrames();
    this.refreshUi();
  }

  seed(): void {
    this.sim.seedRandom();
    this.sim.census();
    this.refreshUi();
  }

  persistPrefs(): void {
    const prefs: Prefs = {
      speed: this.speed, layer: this.layer, view: this.view, pseudo: this.pseudo, dna: this.dna, name: this.name,
      eprouvette: this.eprouvette, atelier: this.atelier, visiteurs: this.visiteurs, guided: this.guided,
    };
    savePrefs(prefs);
  }

  async save(): Promise<void> {
    // Un monde d'essai d'une autre taille n'écrase pas la sauvegarde du vrai monde.
    if (!this.sim || this.sim.size !== GRID_SIZE) return;
    try {
      const chars = await saveWorld(this.sim.serialize());
      void pruneFrames(this.sim.tick).catch(() => {});
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
