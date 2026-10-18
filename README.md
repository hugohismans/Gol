# Organisme

Œuvre d'art interactive : un automate cellulaire continu qui vit en permanence et que les visiteurs influencent très faiblement. Voir `CLAUDE.md` pour la vision et les règles.

Phase 1 : prototype 100 % client, pour tester les règles et le rendu.

## Lancer

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # version statique dans dist/
npm test           # tests unitaires (moteur CPU)
npm run check      # typage Svelte et TypeScript
```

Il faut un navigateur avec WebGL2 et `EXT_color_buffer_float` (tous les navigateurs récents, y compris mobiles).

## Utilisation

- Toucher ou cliquer le monde dépose une spore. Elle hérite du génome vivant le plus proche, puis reçoit la mutation choisie en bas de l'écran.
- Vitesses : pause, x1 (60 ticks par seconde), x10, x100, x1000. Au delà de ce que le GPU peut suivre, la vitesse réelle s'affiche à côté.
- « +1 jour » et « +1 mois » jouent le temps simulé aussi vite que possible (une barre de progression permet d'annuler).
- « réglages » ouvre le panneau : calques (final, vitalité, lignées, nutriments, sédiment), cadrage (mosaïque du tore, couvrir, contenir), reset, seed aléatoire, et toutes les constantes de `src/sim/config.ts`, appliquées en direct.
- L'état est sauvegardé dans localStorage toutes les 20 secondes et quand la page passe en arrière plan. Les constantes réglées font partie de la sauvegarde (« valeurs par défaut » les remet à zéro).
- « mes spores » liste tes dépôts : vivante ou éteinte, surface, descendantes. Une spore choisie est mise en évidence dans le monde ; sa fiche montre sa courbe d'étendue et ce qui lui est arrivé. Toucher la courbe ou une date fait revenir le monde à cet instant ; « revoir son histoire » rejoue tout depuis le dépôt.
- Les instantanés du passé (un toutes les 4 h simulées, puis un par jour au delà de 7 jours) sont gardés dans IndexedDB.
- `?taille=128` lance un monde plus petit, séparé du vrai monde, pour tester vite.
- Dans la console : `engine.organisme` donne accès direct à la simulation.

## Architecture

```
src/sim/            simulation, TypeScript pur, aucun accès au DOM
  config.ts         toutes les constantes (et plages des sliders)
  organisme.ts      API : step(dt), spawnSpore(x, y, mutation), getState()
                    + lignées, recensement, sous-lignées, sauvegarde
  backend.ts        interface commune aux deux moteurs de calcul
  gpu/              moteur WebGL2 : ping-pong de textures RGBA32F (navigateur)
  cpu/              moteur CPU : portage fidèle des shaders (tests, réglage, futur serveur)
  calendar.ts       date simulée, saisons, cycle jour/nuit
  genome.ts         mutations de visiteur, sous-lignées
  kernel.ts         taps du kernel en anneau
  serialize.ts      format binaire compact des sauvegardes
src/render/         rendu WebGL2 : préparation à la résolution de la grille, composition bicubique
src/ui/             interface Svelte 5 et boucle principale
```

Les deux moteurs appliquent exactement les mêmes règles (même hash, même échantillonnage mipmappé). `scripts/dev/compare.mjs` vérifie leur concordance. Toute modification d'une règle doit être faite dans `src/sim/gpu/shaders.ts` et `src/sim/cpu/backend.ts`.

## Banc de survie

Pour vérifier qu'un jeu de constantes reste vivant sur la durée, sans navigateur :

```sh
npx tsx scripts/survie-cpu.ts 30 128 1 '{"regenRate": 0.0008}'
# jours, taille de grille, graine, surcharges de constantes en JSON
```

Une ligne par jour simulé : part de vie, lignées vivantes et totales, nutriments moyens, part des cases qui ont changé (« bouge », pour détecter un monde figé) et génome moyen. Avec `SAUVE=monde.bin`, l'état final est écrit et peut être rendu par `scripts/dev/rendu.mjs` (serveur de dev lancé). `scripts/dev/lot.sh` lance plusieurs essais en parallèle.
