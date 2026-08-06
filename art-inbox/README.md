# Art inbox

Drop raster figures here (PNG straight from the generator — do **not** open
Illustrator, do not trace, do not remove the background).

**Name each file after the movement id** it illustrates, e.g. `ankle-rock.png`,
`deep-squat-hold.png`. The ids are the keys in `PENDING_ART` in
`js/stretch-art.js`. If two attempts exist for the same movement, add a suffix:
`ankle-rock-a.png`, `ankle-rock-b.png`, and both get traced for comparison.

## Why this branch exists

Images attached in chat are visible to Claude but never written to disk, so
there is no file to trace. This branch is the transport instead.

**It never merges.** Rasters do not belong in a repo whose whole shape is
"small files, no deps" — the traced paths go into `js/stretch-art.js` on the
working branch, and this branch is deleted once the batch is processed.

## What happens to them

1. flatten alpha onto white, threshold at 128 (ink = dark)
2. potrace: `turdsize 8`, `alphamax 1.0`, `opttolerance 1.2`
3. drop any contour spanning ~the whole canvas (that is the background/frame)
4. reframe the `viewBox` to a square around the real bounding box + 5% margin,
   leaving every coordinate byte-exact — **never round them**, the paths are
   relative and the error accumulates until the figure floods to a silhouette
5. render at 190px and 52×44 and look at it before keeping it
