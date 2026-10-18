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
