# Lumen

Frontend de jeux pour Windows, pensé pour la manette : tes ROMs, tes jeux Steam, Epic et GOG et tes applications au même endroit. Lumen n'inclut ni jeux ni émulateurs : il range ta bibliothèque et lance tes émulateurs et launchers.

**Télécharger :** [dernière version](https://github.com/Flaimeur/Lumen/releases/latest). Ensuite, les mises à jour s'installent toutes seules.

## Fonctionnalités

- **Bibliothèque** : ROMs (un dossier par console, noms ES-DE ou libres comme « Switch 2 game »), jeux Steam (installés ou non), Epic, GOG, applications (Word, Discord…), serveur RomM.
- **Images** : iiDB (jaquettes iiSU de la bonne console, icônes, logos, héros, soundbites), SteamGridDB, libretro-thumbnails, ou tes propres images (clic droit → Changer les images).
- **Tri et filtres** : genre, étiquettes Steam, NSFW, installés / non installés, temps de jeu, dernière session ; recherche par console.
- **Succès** : Steam (lu en local) et RetroAchievements, avec XP, niveaux, rangs et coupe d'or pour les jeux à 100 %.
- **Manettes** : PS4, PS5 (y compris DualSense en Bluetooth), Xbox, Switch, avec les bons symboles ; profils manette → clavier/souris pour les jeux qui ne gèrent pas la manette.
- **Accueil personnalisable** : widgets (horloge, météo, lecture en cours Spotify/YouTube, rang, jeu surprise, favoris, mémo…), fond d'écran (thèmes animés ou ton image), roulette de jeu au hasard.
- **Son** : sons d'interface et musique de fond (ton dossier), soundbites par jeu, touche M pour tout couper.
- **Temps de jeu** : compté par Lumen et lu dans Steam.
- **Sauvegarde** : export / import de la configuration ; mises à jour automatiques depuis GitHub.

## Lancer

```bash
npm install
npm start            # plein écran
npm run windowed     # en fenêtre
npm run check        # tests du scanner et des commandes
npm run preview      # interface seule dans le navigateur (données de démo)
```

Si `npm install` n'a pas téléchargé Electron : `node node_modules/electron/install.js`.

## Ranger ses jeux

Un sous-dossier par console dans ton dossier de ROMs (noms compatibles ES-DE) :

```
ROMs/
  snes/   gba/   n64/   psx/   ps2/   gc/   wii/   switch/   windows/ ...
```

Le dossier `windows` accepte des raccourcis `.lnk` / `.url` (Steam, GOG…) ouverts directement par Windows.

## Images

Pour chaque jeu, Lumen cherche une image portant le même nom que la ROM (sans l'extension) dans :

- `<médias ES-DE>/<console>/<type>/` (par défaut `~/ES-DE/downloaded_media`)
- `<ROMs>/<console>/media/<type>/`

| Dossier `<type>` | Utilisé pour |
|---|---|
| `boxart`, `icons`, `covers`, `miximages` | tuile du jeu (format 1:1 conseillé) |
| `heroes`, `banners`, `fanart` | bannière d'accueil et fond flou |
| `logos`, `marquees` | logo affiché sur la bannière |
| `screenshots`, `titlescreens` | fond de secours |

### Téléchargement automatique

Réglages → « Télécharger les jaquettes manquantes » (ou menu rapide → « Jaquettes de cette console ») récupère depuis [libretro-thumbnails](https://github.com/libretro/libretro-thumbnails) les jaquettes, captures, écrans-titres et logos absents, et les range dans `<ROMs>/<console>/media/`. La correspondance se fait sur le nom du fichier : les ROMs nommées selon No-Intro / Redump trouvent presque toujours leur image ; sinon Lumen essaie une correspondance approximative (sans les tags de région) en préférant ta région. Pas de source pour Switch et les jeux PC.

### iiDB

Les types `boxart`, `icons`, `banners`, `heroes` et `logos` correspondent aux catégories d'assets d'iiDB. Ses conditions d'utilisation interdisent le téléchargement automatique hors API officielle : télécharge les assets un par un depuis le site et range-les dans ces dossiers.

### Soundbites, musiques et vidéos

| Dossier | Contenu |
|---|---|
| `<console>/media/soundbites/` | extrait audio (`.ogg`, `.mp3`, `.wav`, `.opus`…) joué quand le jeu est sélectionné |
| `<console>/media/videos/` ou `videos/` d'ES-DE | vidéo (`.mp4`, `.webm`) lue dans la tuile après un instant |

Les soundbites d'iiDB se téléchargent un par un depuis le site (ses conditions interdisent le téléchargement automatique sans API officielle) ; renomme-les comme la ROM. Activables/désactivables dans Réglages, avec le volume.

## RomM

Lumen peut afficher les jeux d'un serveur [RomM](https://romm.app) (4.x / 5.x) à côté des tiens :

1. Dans RomM : **Administration → Client API Tokens** → crée un jeton (la portée `roms.read` suffit). Il commence par `rmm_`.
2. Dans Lumen : **Réglages → RomM** → adresse du serveur, jeton (Ctrl+V), puis « Tester la connexion » et active « Utiliser mon serveur RomM ».

- Les jeux RomM portent un badge ☁. **A** les télécharge (barre de progression, **B** pour annuler) puis les lance ; ils restent ensuite sur le PC (dossier réglable, par défaut `Documents\Lumen\RomM`).
- Les jeux multi-fichiers (multi-disques…) arrivent en zip et sont extraits automatiquement ; le `.m3u` ou `.cue` est choisi pour le lancement.
- Les jaquettes sont téléchargées à l'affichage puis mises en cache.
- Menu rapide : « Télécharger sans lancer » / « Supprimer la copie locale ».
- Si un fichier du même nom existe déjà dans ton dossier de ROMs, c'est la copie locale qui est utilisée.
- Hors ligne, Lumen garde la dernière liste connue.
- Le jeton (ou le mot de passe) est chiffré par Windows sur ce PC ; « Oublier les identifiants RomM » l'efface.

## Installer

```bash
npm run dist            # installeur Windows dans dist/
npm run dist:portable   # version portable (.exe unique)
```

## Contrôles

| Action | Manette | Clavier |
|---|---|---|
| Naviguer | Croix / stick gauche | Flèches |
| Valider / Jouer | A | Entrée |
| Retour | B | Échap |
| Favori | X | F |
| Détails | Y | I |
| Onglet précédent / suivant | LB / RB | Q / E |
| Lettre précédente / suivante | LT / RT | Page préc. / suiv. |
| Menu rapide (images, dossiers, profil manette…) | Start / Select | Tab ou clic droit |
| Couper / remettre le son | — | M |
| Recherche | onglet Recherche | / puis taper |
| Quitter le jeu en cours | Select + Start maintenus 1,5 s | Ctrl + Maj + Q |
| Plein écran | — | F11 |

La bibliothèque est mise en cache : Lumen s'ouvre instantanément puis vérifie le disque en arrière-plan.

## Émulateurs

Configure les chemins dans Réglages → Émulateurs. RetroArch est détecté automatiquement aux emplacements habituels. Chaque console a une commande modifiable (Réglages → Commandes par console), par exemple :

```
"{retroarch}" -f -L "{retroarchDir}\cores\snes9x_libretro.dll" "{rom}"
```

Les cœurs RetroArch doivent être installés (Menu principal → Charger un cœur → Télécharger un cœur).
