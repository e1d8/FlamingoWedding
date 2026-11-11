# Runtime sprites: half resolution

All devices load the PNG files and `sprites.json` in this directory. The original images and manifest remain one directory above as authoring sources.

Each source PNG was deterministically resized to 50% of its width and height with macOS `sips --resampleHeightWidth`, preserving RGBA transparency. Atlas pages are 627 × 627 pixels; the heart pair is 768 × 512 pixels.

The runtime manifest halves page dimensions, rectangles, pivots, bounds and water contacts, and doubles each pose's `unitScale`. `canonicalWidth`, poses and authored timing stay unchanged. This retains the original world-space size, anatomy, feet placement, flight path and neck deformation, with one quarter of the texture pixels.

The 13 runtime images total about 1.58 MB. Their RGBA texture storage is approximately 19.5 MiB without mipmaps, versus 78 MiB for the originals. The static fallback also loads the half-resolution pair.

Image provenance and original prompts remain in [../ARTWORK.md](../ARTWORK.md).
