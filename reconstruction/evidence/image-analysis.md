# Image analysis: gorra "Make Cumbres Chingón Again" (hoja de 4 vistas)

Reference: reconstruction/reference/gorra-4vistas.jpg (1379x752, four studio views on a white
sweep: front, right lateral, left lateral, rear). Views are split into reconstruction/views/*.png.

## Layer 1. Identification
- Observed: a structured five-panel baseball cap (a-frame / "trucker-shape" crown with a flat front
  panel), curved visor, plastic snapback closure. Category: apparel, headwear. primaryDomain: object.
- Confidence: 0.95.

## Layer 2. Overall form and silhouette
- Crown: a truncated dome, taller at the front panel than at the rear, approximated by a lathe
  profile (revolved curve) with the front panel flattened; bilateral symmetry about the sagittal
  plane. Height of crown roughly 0.55 of crown width; crown width ~ 1.0 reference unit.
- Visor: a curved "D" plate, thickness ~0.02 units, extending ~0.55 units forward from the crown
  edge, with lateral curvature (arch) of about 25 degrees from the profile view; edges rounded.
- Overall bounding volume: 1.0 wide x 0.6 tall x 1.5 deep (crown + visor). Shape language: organic
  (fabric under tension) over a geometric structure.

## Layer 3. Macro, meso, micro
- Macro: crown, visor, closure (snapback strap + opening), sweatband/interior (rear view only).
- Meso: five crown panels with seams (front panel, two side panels, two rear panels), top button,
  eyelets (one per side panel, one per rear panel), visor stitching rows, rear opening arch.
- Micro: embroidered front text (three lines, navy), right-side embroidery "ONE COMMUNITY"
  (two lines, navy), left-side green script monogram embroidery, left-side Mexican flag woven
  patch (rectangular, green/white/red with eagle), snapback strap with 7 round holes and a
  buckle, printed "ONE COMMUNITY" on the inner rear tape, visor stitching (6 concentric rows),
  seam topstitching along every panel seam.

## Layer 4. Spatial relationships
- <visor, attached-to, crown front lower edge> contact: butt joint along an arc, embed into the
  crown band.
- <front panel, flush-with, side panels> contact: seam overlap; side panels meet at the crown top.
- <button, attached-to, crown apex> contact: embed, centered.
- <eyelet, embedded-in, panel> one per lateral and rear panel, upper third of the panel.
- <rear opening, cut-into, rear panels> an inverted-U arch centered at the back; the strap spans
  the arch bottom, attached to both sides of the crown band.
- <snapback strap, inside, opening> horizontal, slight sag, buckle on the wearer's left side.
- <flag patch, attached-to, left side panel> lower-mid rear third of the panel, rectangular, ~0.2
  wide; <script monogram, attached-to, left side panel> forward of the patch, near the front seam.
- <"ONE COMMUNITY" embroidery, attached-to, right side panel> lower rear third, two lines.

## Layer 5. Materials (PBR)
- Crown and visor top: brushed cotton twill / faux-suede weave. Albedo: light warm off-white
  (bone). Metalness 0. Roughness ~0.85 to 0.95 (matte, no specular hotspot, soft sheen along the
  panel curvature). Relief: fine diagonal weave grain, low amplitude; slight fabric fuzz visible
  on silhouettes. Opaque.
- Embroidered text: navy thread, satin stitch, gloss slightly higher than the fabric
  (roughness ~0.6), raised ~1 to 2 mm (relief), edges crisp.
- Flag patch: woven polyester, saturated green / white / red bands, gloss slightly higher than
  the twill (roughness ~0.55), raised, merrowed edge.
- Snapback strap: injection-moulded plastic, dark navy, roughness ~0.45, metalness 0, 7 round
  holes; the buckle is the same material.
- Interior seen through the rear opening: black mesh/tape (nearly matte black, roughness 0.9),
  with light grey printed text "ONE COMMUNITY".
- Visor underside: not visible in any view (undetermined; inferred dark grey or navy from the
  thin edge in the profile views).
- Button: fabric-covered, same material as the crown.
- Eyelets: embroidered eyelets in matching thread (off-white), not metal.

## Layer 6. Colour and finish
- Crown/visor: hue warm neutral, high value (~0.92), very low saturation. Finish matte.
- Navy thread: hue blue, low value (~0.2), moderate saturation. Finish satin.
- Flag: green (hue 140, value 0.5, sat 0.8), white, red (hue 0, value 0.7, sat 0.9).
- Strap: navy, value 0.25. Finish satin plastic.
- Studio lighting: soft top-front key with a light grey sweep; the visor casts a soft shadow onto
  the sweep. The gradient on the background is not albedo.

## Layer 7. Identity-defining features
1. Front embroidery "MAKE / CUMBRES / CHINGÓN AGAIN", serif capitals, three lines, centred on the
   front panel, navy.
2. Right-side embroidery "ONE / COMMUNITY", two lines, serif capitals, navy.
3. Left-side Mexican flag patch (rectangular, horizontal tricolour with eagle).
4. Left-side green script monogram, forward of the flag.
5. Navy snapback strap with 7 holes.
6. Six concentric stitch rows on the visor top.
7. Five-panel construction with a flat front panel and visible topstitched seams.
8. Off-white bone colour with navy contrast.

## Layer 8. Uncertainty and single-image limits
- Visor underside colour: hidden in all four views. Inferred dark; undetermined.
- Interior construction (sweatband, taping): only the black mesh and tape print are visible
  through the opening; the rest is hidden.
- The exact letterforms of the script monogram are partly cropped in the left view: uncertain.
- The top of the crown (button surroundings) is seen only obliquely: the panel layout at the apex
  is inferred from a standard five-panel construction.
- Perspective: each view is a near-orthographic studio shot; the front view is taken slightly
  above eye level, so crown height reads slightly taller than the lateral views suggest.
- Text fidelity: embroidery will be approximated with a generated canvas texture; exact letter
  spacing of the reference is not guaranteed.
