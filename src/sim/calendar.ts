// Calendrier simulé : date, saison, cycle jour/nuit, facteur de régénération.

import {
  DAYS_PER_YEAR,
  DAY_PEAK_HOUR,
  SEASON_PEAK_DAY,
  START_DAY_OF_YEAR,
  START_HOUR,
  TICKS_PER_DAY,
} from './config';

const MONTHS = [
  ['janvier', 31], ['février', 28], ['mars', 31], ['avril', 30], ['mai', 31], ['juin', 30],
  ['juillet', 31], ['août', 31], ['septembre', 30], ['octobre', 31], ['novembre', 30], ['décembre', 31],
] as const;

export type Season = 'printemps' | 'été' | 'automne' | 'hiver';

export interface SimDate {
  year: number;
  month: string;
  dayOfMonth: number;
  hour: number;
  minute: number;
  season: Season;
  /** Jours écoulés depuis la naissance du monde. */
  ageDays: number;
}

/** Jours fractionnaires écoulés depuis le 1er janvier de l'an 1. */
function absoluteDays(tick: number): number {
  return START_DAY_OF_YEAR + START_HOUR / 24 + tick / TICKS_PER_DAY;
}

function seasonOf(dayOfYear: number): Season {
  if (dayOfYear >= 78 && dayOfYear < 171) return 'printemps';
  if (dayOfYear >= 171 && dayOfYear < 265) return 'été';
  if (dayOfYear >= 265 && dayOfYear < 355) return 'automne';
  return 'hiver';
}

export function dateOf(tick: number): SimDate {
  const abs = absoluteDays(tick);
  const year = Math.floor(abs / DAYS_PER_YEAR) + 1;
  const dayFloat = abs - (year - 1) * DAYS_PER_YEAR;
  let doy = Math.floor(dayFloat);
  const dayOfYear = doy;
  let m = 0;
  while (m < 11 && doy >= MONTHS[m][1]) {
    doy -= MONTHS[m][1];
    m++;
  }
  const minutes = Math.floor((dayFloat - dayOfYear) * 1440);
  return {
    year,
    month: MONTHS[m][0],
    dayOfMonth: doy + 1,
    hour: Math.floor(minutes / 60),
    minute: minutes % 60,
    season: seasonOf(dayOfYear),
    ageDays: tick / TICKS_PER_DAY,
  };
}

/** Lumière du jour entre -1 (minuit) et 1 (pic de l'après midi). */
export function daylight(tick: number): number {
  const hour = (absoluteDays(tick) % 1) * 24;
  return Math.cos((2 * Math.PI * (hour - DAY_PEAK_HOUR)) / 24);
}

/** Saison entre -1 (cœur de l'hiver) et 1 (cœur de l'été). */
export function seasonality(tick: number): number {
  const doy = absoluteDays(tick) % DAYS_PER_YEAR;
  return Math.cos((2 * Math.PI * (doy - SEASON_PEAK_DAY)) / DAYS_PER_YEAR);
}

/** Facteur multiplicatif de la régénération des nutriments, toujours positif. */
export function regenFactor(tick: number, dayAmplitude: number, seasonAmplitude: number): number {
  return Math.max(0, 1 + dayAmplitude * daylight(tick)) * Math.max(0, 1 + seasonAmplitude * seasonality(tick));
}
