# Organisme

Œuvre d'art interactive : automate cellulaire continu, vivant en permanence, influencé très faiblement par les visiteurs. Ce n'est pas un jeu. Esthétique sobre, contemplative, organique.

## Vision
Le visiteur est un parent, pas un dessinateur : il dépose une spore puis ne contrôle plus rien. L'émotion vient de l'attachement à une lignée qu'on ne maîtrise pas et de la lecture de l'histoire du monde.

## Stack
- Svelte 5 (runes), TypeScript, Vite
- Rendu WebGL2 en shaders (pas de canvas 2D pour le rendu final)
- Simulation en TypeScript pur, indépendante du framework, dans src/sim/
- Plus tard : Cloudflare Workers + Durable Object pour la simulation serveur, Cloudflare Pages pour le front, R2 pour les snapshots. Ne pas anticiper ce code maintenant, mais garder la simulation découplée du DOM pour qu'elle puisse tourner côté serveur telle quelle.

## Règles de simulation (v1)
Grille torique 256x256.
1. Cellules continues : vitalité entre 0 et 1, approche type Lenia / SmoothLife (kernel en anneau, fonction de croissance en cloche). Jamais binaire.
2. Génome par lignée : chaque case vivante porte un lineageId et un génome (rayon du kernel, centre et largeur de la croissance, appétit, teinte). Chaque case applique ses propres paramètres. Une case qui naît hérite du génome de la lignée dominante autour, avec mutation gaussienne légère et faible probabilité de sous-lignée.
3. Nutriments : grille parallèle entre 0 et 1, consommée par vitalité x appétit, régénérée lentement par diffusion. Sans nutriments, déclin. Aucune structure ne doit pouvoir devenir éternelle.
4. Temps : le taux de régénération suit un cycle jour/nuit et une saisonnalité annuelle douce. En prototype, ce temps est simulé et accélérable.
5. Sédiment : la vitalité perdue à la mort se dépose dans une couche de sédiment colorée par la teinte de la lignée, s'assombrit très lentement, ne disparaît jamais.

## Pouvoir du visiteur (version finale)
Une spore par jour. Hérite du génome le plus proche, une seule mutation au choix (plus gourmande, plus sobre, plus expansive, plus compacte, décalage de teinte). Peut nommer sa lignée. Arbre généalogique public et registre fossile. Timelapse.

## Conventions
- Toutes les constantes de simulation dans src/sim/config.ts, rien de magique ailleurs.
- La simulation expose une API simple : step(dt), spawnSpore(x, y, mutation), getState(). Pas d'accès au DOM dans src/sim/.
- Typed arrays (Float32Array) partout pour la grille.
- Commits petits et fréquents, messages en français.
- Ne jamais utiliser le tiret cadratin dans le code, les commentaires ou les textes.
- Avant toute refonte des règles, me demander.

## État du projet
Phase 1 (en cours) : prototype client avec accélération du temps et spores illimitées.
Phase 2 : simulation dans un Durable Object, WebSocket, cookie, une spore par jour.
Phase 3 : lignées nommées, arbre généalogique, snapshots R2, timelapse.

## Architecture (phase 1)
- src/sim/organisme.ts porte la logique du monde (calendrier, lignées, recensement, spores, sauvegarde) et délègue le calcul des champs à un Backend.
- Deux moteurs appliquent les mêmes règles : src/sim/gpu/ (WebGL2, navigateur) et src/sim/cpu/ (TypeScript pur, tests et futur serveur). Toute modification d'une règle se fait dans src/sim/gpu/shaders.ts ET src/sim/cpu/backend.ts, puis se vérifie avec scripts/dev/compare.mjs.
- Le banc de survie (scripts/survie-cpu.ts) mesure la survie sur la durée hors navigateur.
- Histoire : chaque lignée garde sa surface et son centre à chaque recensement (Lineage.history), son visiteur et ses descendantes. Le monde produit un instantané compact (src/sim/frame.ts) tous les 600 ticks ; le prototype les garde dans IndexedDB (src/history.ts), la phase 3 les mettra dans R2.

## Ajouts du prototype à valider
- Lignée fantôme : une case morte porte la lignée la plus influente de son voisinage ; c'est le génome dont elle hérite si elle naît (implémentation de "la lignée dominante autour").
- Consommation saturante : vitalité x appétit x N / (N + uptakeHalf).
- Fertilité du sol : la régénération varie dans l'espace selon une carte douce qui dérive en quelques semaines (fertilityContrast, 0 = sol uniforme).
- Sénescence : une case vivante décline après quelques jours d'âge.
- Nutriments initiaux réglables (initialNutrients).
