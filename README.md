# Showcase

A dark introduction to Behance on the web. The work is the first screen. The pitch stays quiet.

A draggable fisheye grid fills the hero. Holding the pointer zooms the grid in; a short click opens the project; dragging pans. The pointer leaves a slow water wake and a slight tilt. Wheel down, or "View more work", slides into a curved reel of the same projects.

## Aha moments

- **Opening intro** — a Phantom-style sequence (real load progress, sheared labels, pixel reveal, 25-frame morph, particle scatter) hands off into the hero. A short line fades in above the blue progress bar. The particle subject is an original procedural stand-in, not the site logo.
- **Hero assemble** — tiles gather from the edges toward the center, then the settled fisheye grid takes over. Returning to the hero replays the coalesce.
- **Section transition punch** — scrolling from the hero into Featured projects fires one cinematic beat: a soft blue veil sweeps through while the stage blooms (blur + scale + slight rotate) and the cards fade in.
- **Immersive project open** — clicking a work (hero tile or reel card) expands into a fuller detail view: the image fills, the title/meta stagger in, the backdrop dims and blurs. ESC or click-out collapses it back.
- **Light easter egg** — click the Behance mark in the navbar 3× to trigger a short logo wobble and a blue particle burst, then it settles. Never blocks the UX.
- **Larger card radius** — the waterfall/reel cards use a 38px corner radius so they read as very large round corners, with images clipped cleanly.
- **Dense unique hero** — a long-pan fisheye grid over the same 60 Behance featured covers. An 8×5 window does not repeat a cover.

## Run locally

```bash
npm install
npm run dev
```

Dev server: [http://127.0.0.1:43123](http://127.0.0.1:43123)

```bash
npm run build
npm run preview
```

`npm run build` writes a static site to `dist/`.

## What to try

- Move the pointer. The whole scene leans a few degrees toward it. On the hero, a viscous wake follows the stroke and lingers.
- Press and hold on the grid to dolly in. Release eases back. A short click opens that project. Drag pans across the unique collection.
- 「查看更多项目」 under the hero subtitle, "View more work", or a downward wheel slides to the project reel. Covers are local Behance featured images with matched depth maps, so hover shifts the picture in layers. At rest the images drift. A gloss sweep appears only while a card is hovered. At the top, scroll up, or press Back, to return.
- Click the Behance mark in the navbar a few times for a small surprise.

## Preview

After `npm run dev`, open [http://127.0.0.1:43123](http://127.0.0.1:43123). Move across the grid, then open the project list.

## Stack

Vite, React, TypeScript, and Three.js. The hero keeps its screen-space barrel. A second pass advects a small fluid field (viscosity 0.999) and bends the grid along that wake. The project list eases its own scroll inside the pane. Device pixel ratio is capped (1.75 desktop, 1.35 on small screens).

## Image credits

Grid photography is placeholder imagery from Unsplash, used under the [Unsplash License](https://unsplash.com/license). Named and generated poster tiles are drawn in canvas.

- `01-ridge.jpg` — photo-1464822759023-fed622ff2c3b
- `02-summit.jpg` — photo-1469474968029-e6953c6e8e04
- `03-portrait.jpg` — photo-1534528741775-53994a69daeb
- `04-gaze.jpg` — photo-1531746020798-e6953c6e8e04
- `05-gold.jpg` — photo-1524504388940-b1c1722653e1
- `06-runway.jpg` — photo-1515886657613-9f3515b0c78f
- `07-cloth.jpg` — photo-1490481651871-ab68de25d43d
- `08-fluid.jpg` — photo-1541701494587-cb585028663601
- `12-bloom.jpg` — photo-1490750967868-88aa4486c946
- `13-leaves.jpg` — photo-1466781783364-36c955e42a7f
- `14-atrium.jpg` — photo-1487958449943-2429e8be8625
- `15-stairs.jpg` — photo-1511818966892-d7d671e672a2
- `16-interior.jpg` — photo-1600607687939-ce8a6c25118c
- `17-perfume.jpg` — photo-1541643600914-78b084683601
- `18-flask.jpg` — photo-1594035910387-fea47794261f
- `19-camera.jpg` — photo-1526170375885-4d8ecf77b99f
- `22-fog.jpg` — photo-1470071459604-3b5ec3a7fe05
- `23-dune.jpg` — photo-1509316785289-025f5b846b35
- `24-neon.jpg` — photo-1550684848-fac1c5b4e853
- `25-watch.jpg` — photo-1523275335684-37898b6baf30
- `26-phones.jpg` — photo-1505740420928-5e560c06d30e
- `27-shade.jpg` — photo-1572635196237-14b3f281503f
- `28-sole.jpg` — photo-1560343090-f0409e92791a
- `29-night.jpg` — photo-1519681393784-d120267933ba
- `30-city.jpg` — photo-1449824913935-59a10b8d2000
- `31-skyline.jpg` — photo-1477959858617-67f85cf4f1df
- `32-forest.jpg` — photo-1418065460487-3e41a6c84dc5
- `33-meadow.jpg` — photo-1472214103451-9374bd1c798e
- `34-man.jpg` — photo-1507003211169-0a1dd7228f2d
- `35-street.jpg` — photo-1539571696357-5a69c17a67c6
- `36-rail.jpg` — photo-1469334031218-e382a71b716b
- `37-desk.jpg` — photo-1497366216548-37526070297c
- `38-lounge.jpg` — photo-1586023492125-27b2c045efd7
- `39-glow.jpg` — photo-1618005182384-a83a8bd57fbe
- `40-wash.jpg` — photo-1579546929518-9e396f3cc809
- `41-paper.jpg` — photo-1558591710-4b4a1ae0f04d
- `42-dusk.jpg` — photo-1514565131-fce0801e5785
- `43-yose.jpg` — photo-1426604966848-d7adac402bff
