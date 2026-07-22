# ORB — Synthétiseur 3D à billes & plasma

Instrument de musique 3D interactif dans le navigateur, inspiré du **Roli Seaboard** :

- **Bain de billes métalliques** à la place des touches — effet « sable » avec profondeur : chaque appui enfonce la bille et tasse les voisines (ripple).
- **Jeu expressif MPE-like** : l'appui joue la note, la **profondeur** (drag vertical ou pression du pointeur) ouvre le filtre, ajoute vibrato et brillance ; le **glisser latéral** produit un glissando.
- **Chambre plasma** : un parallélépipède en verre fumé noir contenant un plasma shader (FBM) qui pulse en temps réel avec le son (AnalyserNode → RMS).
- Scène **orbitable à 360°** (OrbitControls), éclairage et environnement 100 % procéduraux — aucun asset externe.
- Polyphonie multi-touch, 3 gammes (majeure / pentatonique / mineure), octave ±2, mode démo (arpégiateur).

## Stack

React 19 + TypeScript · Vite 7 · Tailwind CSS 3.4 · Three.js (`@react-three/fiber`, `@react-three/drei`) · WebAudio API (moteur maison : oscillateurs + ADSR + filtre piloté par la profondeur + reverb à impulse procédurale).

## Lancer le projet

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # build de production dans dist/
```

> Le `package-lock.json` n'est pas versionné : `npm install` le régénère.
> Le template shadcn/ui est préconfiguré (`components.json`) — les composants
> non utilisés par l'app ne sont pas inclus ; ajoutez-les au besoin avec
> `npx shadcn@latest add <composant>`.

## Structure

```
src/
├── audio/SynthEngine.ts      # Moteur WebAudio (voix, profondeur, reverb, analyser)
├── state/instrument.ts       # Grille de billes, gammes, contrôleur MPE-like
├── components/
│   ├── Scene.tsx             # Canvas R3F, lumières, OrbitControls
│   ├── Pedestal.tsx          # Socle de l'instrument
│   ├── BallBed.tsx           # Bain de billes + interactions
│   └── PlasmaChamber.tsx     # Verre fumé + shader plasma audio-réactif
└── pages/Home.tsx            # HUD (octave, volume, gamme, plasma, démo)
```
