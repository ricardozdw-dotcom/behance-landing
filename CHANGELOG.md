# Changelog

## archive/pre-fisheye-scale-and-reel-v1 (commit 91f1d94)

Snapshot of the working version before the fisheye center-scale, fixed navbar, and Unseen-style reel rebuild.

What this archive contains:

- **Hero press-hold zoom.** Holding the grid dollies the view in (`viewH` eases to `PRESS = 2.86`); release eases back to `REST = 3.72`. Drag still pans, and the view pulls back to `DOLLY = 5.28` while dragging.
- **Global mouse tilt.** A damped `rotateX/rotateY` on `.hero-tilt` leans the hero a few degrees toward the pointer. The project stage yaws and pitches with the pointer too.
- **Curling project reel.** Two-column waterfall inside a perspective stage. Cards `rotateX` by distance from viewport center plus velocity, with a `translateZ` depth term. Lerped scroll/drag with stretch, scroll-up-at-top returns to hero.
- **Liquid wake on the pictures.** `ProjectWake` (96×54 CPU fluid field, viscosity 0.999) paints an RG displacement data URL into an SVG `<feImage>`/`<feDisplacementMap>` on `.fall-frame`, plus a screen-blended light canvas.

Roll back to this tag with `git checkout archive/pre-fisheye-scale-and-reel-v1`.
