import json, copy, math
R = '/home/user/Gorras/reconstruction'
starter = json.load(open(f'{R}/starter-spec.json'))
spec = copy.deepcopy(starter)
root_t = copy.deepcopy(starter['componentTree'][0])
mat_t = copy.deepcopy(starter['materials'][0])
PI = math.pi

# ---------------- evaluación previa ----------------
pa = spec['preSpecAssessment']
pa['objectClass'] = {
  'primaryType': 'structured five-panel baseball cap with curved visor and plastic snapback closure',
  'primaryDomain': 'object',
  'formLanguage': ['fabric-like', 'organic over geometric structure'],
  'structureKind': ['compound object', 'layered shell'],
  'motionPotential': ['whole-object transform', 'detachable (visor, strap)'],
  'materialFamilies': ['cloth', 'plastic', 'mixed'],
  'notes': 'Assessed from four studio views (front, right, left, rear). Crown is a revolved fabric shell with a flatter front panel; visor is a thin arched plate; closure is a moulded plastic strap.'
}
pa['complexity']['scores'] = {'silhouetteComplexity': 2, 'componentCount': 2, 'hierarchyDepth': 2, 'repetitionDensity': 1, 'materialLayerCount': 2, 'localDetailDensity': 2, 'occlusionRisk': 1, 'actionReadinessNeed': 1}
pa['complexity']['estimatedCounts'] = {'macroComponents': 3, 'mesoComponents': 12, 'microFeatureGroups': 10, 'materialLayers': 6, 'repetitionSystems': 1}
pa['complexity']['reasoning'] = [
  'Three macro masses (crown, visor, closure) with a dozen meso parts (button, liner, opening, panels with decals, patch, buckle).',
  'Repeated systems: four embroidered eyelets, seven strap holes, six visor stitch rows, topstitched seams.',
  'Six visually distinct materials: bone twill, navy thread, navy plastic, black liner, tricolour patch, green monogram thread.',
  'Occlusion: visor underside and interior are hidden; inferred dark.']
pa['specDepthDecision']['rationale'] = 'Complex: several hierarchy levels, repeated small systems (eyelets, holes, stitches) and six material responses; identity lives in embroidered decals on a simple macro form.'
pa['unknownsToResolveBeforeImplementation'] = []
spec['assumptions'] = [
  'Visor underside is dark navy/charcoal twill (hidden in all four views).',
  'Interior is black taping and mesh with a light grey printed tape (seen only through the rear opening).',
  'Crown apex panel layout follows a standard five-panel construction (seen only obliquely).',
  'Embroidered letterforms are approximated by generated canvas textures; exact reference letter spacing is not guaranteed.']
spec['suitability'] = 'pass'
spec['scores'] = {'object_isolation': 3, 'silhouette_readability': 3, 'depth_inference': 2, 'primitive_decomposition': 2, 'material_procedurality': 2, 'occlusion_risk': 1, 'interaction_fit': 3}
spec['coordinateFrame'] = {'front': '+Z (visor points toward +Z)', 'up': '+Y', 'lateral': "+X is the wearer's left (ONE COMMUNITY side, as the front view shows it peeking at image-right); the flag and monogram sit on the wearer's right (-X). The sheet's two lateral photos both show the visor pointing left, so one of them is mirrored; the front view is taken as authoritative.", 'origin': 'crown axis at eyelet height (y=0); crown band at y=-0.28, apex at y=+0.34', 'scaleReference': 'crown band diameter = 1.0 unit'}
spec['silhouette'] = {
  'boundingShape': 'truncated dome (crown) 1.0 wide x 0.62 tall over a thin arched plate (visor) extending 0.46 forward; total depth ~1.45',
  'aspectRatios': ['crown height / crown width = 0.62', 'visor length / crown width = 0.46', 'visor thickness / crown width = 0.02'],
  'symmetry': 'bilateral about the sagittal (YZ) plane; decals break the symmetry',
  'dominantCurves': ['crown dome profile (lathe): near-vertical sides (r 0.52) from the band up to y=0.10, then a rounded apex; a structured crown, not a sphere', 'visor arch: sides droop ~0.1 units below the centre', 'visor plan: D shape, outer edge a circle of r 0.52 centred 0.42 ahead of the crown axis'],
  'negativeSpaces': ['rear opening: inverted-U arch 0.34 wide x 0.16 tall above the band', 'gap between visor underside and band'],
  'landmarks': ['apex button', 'eyelets at y=0 on the four lateral/rear panels', 'front seam pair delimiting the front panel', 'strap spanning the rear opening']}
spec['viewEvidence'] = [
  {'id': 'full-object', 'view': 'sheet', 'imageRegion': {'x': 0, 'y': 0, 'width': 1, 'height': 1, 'units': 'normalized'}, 'observations': ['four studio views of the same cap'], 'confidence': 0.95},
  {'id': 'view-front', 'view': 'front', 'imageRegion': {'x': 0.0, 'y': 0.0, 'width': 0.508, 'height': 0.452, 'units': 'normalized'}, 'observations': ['three-line navy embroidery centred on the front panel', 'visor arch visible as a downward curve at both sides', 'partial ONE COMMUNITY on the right side'], 'confidence': 0.95},
  {'id': 'view-right', 'view': 'right-lateral', 'imageRegion': {'x': 0.515, 'y': 0.0, 'width': 0.485, 'height': 0.452, 'units': 'normalized'}, 'observations': ['ONE / COMMUNITY two-line embroidery lower rear third', 'one eyelet upper third of the side panel', 'visor profile: thin plate ~0.02, slight downward curve to the tip', 'strap buckle peeking at the rear'], 'confidence': 0.9},
  {'id': 'view-left', 'view': 'left-lateral', 'imageRegion': {'x': 0.0, 'y': 0.505, 'width': 0.508, 'height': 0.495, 'units': 'normalized'}, 'observations': ['green script monogram at the front seam', 'rectangular tricolour flag patch lower rear third', 'one eyelet upper third'], 'confidence': 0.9},
  {'id': 'view-back', 'view': 'rear', 'imageRegion': {'x': 0.515, 'y': 0.505, 'width': 0.485, 'height': 0.495, 'units': 'normalized'}, 'observations': ['inverted-U opening with black interior', 'navy strap with seven holes spanning the opening bottom', 'light grey tape print ONE COMMUNITY inside', 'two eyelets on the rear panels', 'apex button'], 'confidence': 0.9}]

# ---------------- materiales ----------------
def material(mid, name, base, secondary, rough, rough_var, extra=None, normal_pattern='fine diagonal weave grain', normal_strength=0.3, normal_scale=48.0, pattern='woven'):
    m = copy.deepcopy(mat_t)
    m.update({'id': mid, 'name': name, 'baseColor': base, 'color': base})
    m['albedo'] = {'dominant': base, 'secondary': secondary, 'samplingNotes': 'sampled from reconstruction/crops'}
    m['colorVariation'] = {'palette': [base] + secondary, 'pattern': pattern, 'amplitude': 0.06, 'heightCorrelation': 0.25}
    m['roughness'] = {'base': rough, 'variation': rough_var, 'map': 'independent-procedural-field', 'localResponse': 'slightly lower roughness on convex panel crests, higher in seams'}
    m['normal'] = {'pattern': normal_pattern, 'strength': normal_strength, 'scale': normal_scale, 'space': 'tangent'}
    m['bump'] = {'pattern': normal_pattern, 'amplitude': 0.02, 'scale': normal_scale}
    m['textureResolution'] = 2048
    m['textureProjection'] = {'mode': 'uv', 'repeat': [6.0, 6.0], 'anisotropy': 8, 'texelDensityIntent': 'weave grain at constant object scale; do not stretch with component scale'}
    m['surfaceFrequencyBands'] = [
      {'id': 'macro', 'frequency': 2.0, 'amplitude': 0.06, 'role': 'broad tonal breakup across panels'},
      {'id': 'meso', 'frequency': 14.0, 'amplitude': 0.12, 'role': 'weave direction bands and seam shading'},
      {'id': 'micro', 'frequency': 64.0, 'amplitude': 0.10, 'role': 'thread grain visible under grazing light'}]
    m['ambientOcclusion'] = {'cavityStrength': 0.35, 'contactShadowBias': 0.4, 'notes': 'darken seams, the band under the visor and the rear opening'}
    m['notes'] = name
    m['localOverrides'] = []
    if extra: m.update(extra)
    return m

twill = material('twill-bone', 'Bone cotton twill (crown, visor top, button, eyelets)', '#ECE8DE', ['#E2DDD1', '#F3F0E8'], 0.9, 0.06)
twill['localOverrides'] = [
  {'id': 'weave-grain', 'region': 'all panels', 'changes': 'diagonal twill grain as normal/bump; roughness 0.86-0.94', 'strength': 0.3, 'evidenceRefs': ['view-front', 'view-right']},
  {'id': 'seam-shadow', 'region': 'along the five panel seams and the band', 'changes': 'ambient occlusion darkening 0.35, roughness +0.04', 'strength': 0.35, 'evidenceRefs': ['view-front']},
  {'id': 'visor-stitch-lines', 'region': 'visor top: six concentric arcs from the crown edge to the tip', 'changes': 'painted linework in slightly darker bone (#D8D3C6) plus stitch bump 0.01', 'strength': 0.4, 'evidenceRefs': ['view-front', 'view-right']}]
thread = material('thread-navy', 'Navy embroidery thread (front text, ONE COMMUNITY)', '#1F2A44', ['#182238', '#2A3757'], 0.6, 0.08, normal_pattern='satin stitch ridges', normal_strength=0.45, normal_scale=90.0, pattern='striated')
thread['localOverrides'] = [{'id': 'stitch-relief', 'region': 'letter strokes', 'changes': 'raised 1-2 mm satin stitch; roughness 0.55-0.65', 'strength': 0.45, 'evidenceRefs': ['view-front']}]
plastic = material('plastic-navy', 'Navy moulded plastic (snapback strap, buckle)', '#232B4A', ['#1B2238', '#2F3A5F'], 0.45, 0.05, normal_pattern='none', normal_strength=0.05, normal_scale=8.0, pattern='uniform')
plastic['localOverrides'] = [{'id': 'hole-rims', 'region': 'rim of each of the seven holes', 'changes': 'moulding gloss on the rims, AO inside the hole', 'roughness': 0.28, 'strength': 0.3, 'evidenceRefs': ['view-back']}]
liner = material('liner-black', 'Black interior taping and mesh', '#15161A', ['#0E0F12', '#22242A'], 0.9, 0.05, normal_pattern='fine mesh weave', normal_strength=0.25, normal_scale=70.0, pattern='woven')
liner['localOverrides'] = [{'id': 'tape-print', 'region': 'centre of the inner rear tape', 'changes': 'painted decal ONE COMMUNITY in light grey (#9A9EA8), no relief', 'strength': 0.6, 'evidenceRefs': ['view-back']}]
patch = material('patch-flag', 'Woven tricolour flag patch', '#1F8A4C', ['#F2F2EE', '#C8202E'], 0.55, 0.08, normal_pattern='fine woven thread', normal_strength=0.35, normal_scale=80.0, pattern='banded')
patch['localOverrides'] = [{'id': 'flag-bands', 'region': 'three equal vertical bands green / white / red with a brown-gold eagle in the centre band', 'changes': 'albedo decal, merrowed edge ridge 0.005', 'strength': 1.0, 'evidenceRefs': ['view-left']}]
mono = material('monogram-green', 'Green script monogram thread', '#2E9E63', ['#23804F', '#3FB577'], 0.6, 0.08, normal_pattern='satin stitch ridges', normal_strength=0.45, normal_scale=90.0, pattern='striated')
spec['materials'] = [twill, thread, plastic, liner, patch, mono]
# evidencia PBR extraída de los recortes (forge/stage1_intake/extract_pbr_evidence.py) y análisis de acabado
ANALYZER_NOTE = {
  'twill-bone': 'analyzer: plastic/rough 0.6 on a 120x80 crop; observed matte cotton twill with no specular hotspot, roughness kept at 0.9 (fabric).',
  'thread-navy': 'analyzer: brushed-steel because the crop mixes navy letters with bone background; observed satin-stitch thread, dielectric, roughness 0.6.',
  'plastic-navy': 'analyzer: painted-metal rough 0.5; observed moulded plastic, dielectric, roughness 0.45.',
  'liner-black': 'analyzer: worn-composite rough 0.9; consistent with black taping/mesh.',
  'patch-flag': 'analyzer: candy-coat metal 0.35 rough 0.18 from saturated bands; observed woven polyester patch, dielectric, roughness 0.55.',
  'monogram-green': 'analyzer: brushed-steel because the crop is mostly bone background; observed green satin thread, dielectric, roughness 0.6.'}
for m in spec['materials']:
    e = json.load(open(f"{R}/material-evidence/{m['id']}.evidence.json"))
    t = json.load(open(f"{R}/material-evidence/{m['id']}.texture.json"))
    m['referencePbr'] = {'usable': bool(e.get('ok')) and e.get('verdict') == 'pass', 'confidence': e['confidence'], 'estimatedFidelity': e['estimatedFidelity'],
                         'sourceCrop': e['sourceImage'], 'extractedBy': 'forge/stage1_intake/extract_pbr_evidence.py', 'palette': e['palette'],
                         'maps': {k: {'path': v['path'], 'url': v['url'], 'channel': k, 'source': v['source']} for k, v in e['maps'].items()},
                         'limitation': 'single-image inference, not inverse rendering'}
    m['textureAnalysis'] = {'finishClass': t['finishClass'], 'recipe': t['recipe'], 'palette': t['palette'], 'appliedScalars': 'observed values kept; see note', 'note': ANALYZER_NOTE[m['id']]}
    m['colorVariation']['palette'] = e['palette'][:3] if m['id'] in ('twill-bone', 'liner-black', 'plastic-navy') else m['colorVariation']['palette']

# ---------------- componentes ----------------
def comp(cid, name, level, role, primitive, topo, rationale, material, dims, pos, rot, parent, tier, descriptor=None, attachment=None, features=None, evidence=None, recipe=None, importance=0.6, confidence=0.85):
    c = copy.deepcopy(root_t)
    c.update({'id': cid, 'name': name, 'level': level, 'role': role, 'importance': importance, 'confidence': confidence,
              'primitive': primitive, 'topologyClass': topo, 'topologyRationale': rationale, 'material': material,
              'materialLayers': [material], 'parent': parent, 'fidelityTier': tier})
    c['dimensions'] = {'width': dims[0], 'height': dims[1], 'depth': dims[2], 'units': 'relative', 'confidence': confidence}
    c['transform'] = {'position': pos, 'rotation': rot, 'scale': [1, 1, 1]}
    c['geometryDescriptor'] = {'topologyIntent': rationale, 'edgeTreatment': {'type': 'none', 'bevelRadius': 0.0, 'segments': 1}, 'deformationStack': [], 'uvStrategy': 'generated procedural coordinates', 'normalStrategy': 'vertex normals from generated geometry'}
    if descriptor: c['geometryDescriptor'].update(descriptor)
    c['attachment'] = attachment
    c['localFeatures'] = features or []
    c['evidenceRefs'] = evidence or ['full-object']
    c['actionProfile']['animationRole'] = 'root' if parent is None else 'static-part'
    c['actionProfile']['destruction']['fractureGroup'] = cid if parent is None else parent
    c['actionProfile']['destruction']['debrisMaterial'] = material
    c['colorMaterialRecipe'] = recipe
    return c

def recipe(cls, conf, c1, c2):
    return {'materialClass': cls, 'materialClassConfidence': conf, 'dominantAlbedo': c1, 'secondaryAlbedo': c2, 'colorGradient': {'type': 'linear', 'stops': [{'position': 0.0, 'color': c1}, {'position': 1.0, 'color': c2}]}, 'finishStyle': 'matte' if cls == 'fabric' else 'satin'}

def rgba(h, a='1.0'):
    h = h.lstrip('#'); return f'rgba({int(h[0:2],16)}, {int(h[2:4],16)}, {int(h[4:6],16)}, {a})'

twill_recipe = recipe('fabric', 0.9, rgba('#F3F0E8'), rgba('#E2DDD1'))
navy_recipe = recipe('fabric', 0.85, rgba('#2A3757'), rgba('#182238'))
plastic_recipe = recipe('plastic', 0.9, rgba('#2F3A5F'), rgba('#1B2238'))
liner_recipe = recipe('fabric', 0.8, rgba('#22242A'), rgba('#0E0F12'))
patch_recipe = recipe('fabric', 0.85, rgba('#1F8A4C'), rgba('#C8202E'))
mono_recipe = recipe('fabric', 0.75, rgba('#3FB577'), rgba('#23804F'))

def feat(fid, ftype, placement, size, effect, conf=0.85):
    return {'id': fid, 'type': ftype, 'placement': placement, 'approximateSize': size, 'orientation': 'follows the parent surface', 'materialEffect': effect, 'geometryEffect': effect, 'confidence': conf}

# perfil de la copa (radio, y): banda en y=-0.28, ojales en y=0, ápice en y=0.24
crown_profile = {'points': [[0.520, -0.280], [0.523, -0.150], [0.518, 0.000], [0.500, 0.100], [0.462, 0.180], [0.400, 0.250], [0.300, 0.300], [0.170, 0.335], [0.0001, 0.346]], 'segments': 96}
liner_profile = {'points': [[0.502, -0.270], [0.505, -0.150], [0.500, 0.000], [0.482, 0.100], [0.444, 0.178], [0.382, 0.246], [0.282, 0.294], [0.152, 0.326], [0.0001, 0.334]], 'segments': 64}

# visera: barrido de una sección plana a lo largo de un arco frontal; los extremos caen 0.10
def visor_spine(y0, sag):
    pts = []
    for deg in range(-78, 79, 13):
        t = math.radians(deg); k = (deg / 78.0) ** 2
        pts.append([round(0.468 * math.sin(t), 4), round(y0 - sag * k, 4), round(0.468 * math.cos(t), 4)])
    return pts
def visor_profile(r_in, r_out, zc, n=30):
    # plano de la visera: borde exterior = circulo de radio r_out centrado zc adelante del eje de la copa;
    # borde interior = circulo de la copa (r_in). y del shape = -z del mundo (rotacion -90 grados en X).
    # interseccion de ambos circulos -> angulo de arranque
    zi = (r_in**2 - r_out**2 + zc**2) / (2 * zc)
    xi = math.sqrt(max(0.0, r_in**2 - zi**2))
    a_out = math.atan2(xi, zi - zc)          # angulo en el circulo exterior (desde +z)
    a_in = math.atan2(xi, zi)                # angulo en el circulo interior
    pts = []
    for k in range(n + 1):                   # exterior, de -a_out a +a_out
        a = -a_out + 2 * a_out * k / n
        pts.append([round(r_out * math.sin(a), 4), round(-(zc + r_out * math.cos(a)), 4)])
    for k in range(n + 1):                   # interior de regreso
        a = a_in - 2 * a_in * k / n
        pts.append([round(r_in * math.sin(a), 4), round(-(r_in * math.cos(a)), 4)])
    return pts
visor_extrude = {'points': visor_profile(0.49, 0.58, 0.36), 'depth': 0.02}
under_extrude = {'points': visor_profile(0.51, 0.56, 0.36), 'depth': 0.006}

# correa snapback: rectángulo redondeado con siete agujeros
def rounded_rect(w, h, r, n=6):
    pts = []
    cx = [w/2 - r, -w/2 + r, -w/2 + r, w/2 - r]; cy = [h/2 - r, h/2 - r, -h/2 + r, -h/2 + r]; a0 = [0, 90, 180, 270]
    for i in range(4):
        for k in range(n + 1):
            a = math.radians(a0[i] + 90 * k / n); pts.append([round(cx[i] + r * math.cos(a), 4), round(cy[i] + r * math.sin(a), 4)])
    return pts
strap_profile = {'points': rounded_rect(0.40, 0.062, 0.02), 'depth': 0.012,
                 'ovalHoles': [{'cx': round(-0.15 + i * 0.05, 3), 'cy': 0.0, 'rx': 0.011, 'ry': 0.011} for i in range(7)]}
# abertura trasera: arco en U invertida (relleno negro que lee como el interior)
def arch_profile(w, h, n=14):
    pts = [[-w/2, -h/2]]
    for k in range(n + 1):
        a = math.pi - math.pi * k / n; pts.append([round(w/2 * math.cos(a), 4), round(-h/2 + (h - w/2) + w/2 * math.sin(a), 4)])
    pts.append([w/2, -h/2]); return pts
opening_profile = {'points': arch_profile(0.34, 0.20), 'depth': 0.02}

C = []
C.append(comp('root', 'Crown (five-panel dome)', 'macro', 'body', 'lathe', 'continuous-sculpt',
  'A single revolved fabric shell: the dome profile varies smoothly from the band to the apex with no independent faces, so it is a lathe, never a box or sphere.',
  'twill-bone', [1.0, 0.62, 1.0], [0, 0, 0], [0, 0, 0], None, 'blockout', {'latheProfile': crown_profile, 'uvStrategy': 'lathe UVs (u around, v along profile)'},
  features=[feat('panel-seams', 'seam line', 'five meridian seams: two delimiting the front panel at +-32 degrees, two at +-108 degrees, one at the rear centre', 'width 0.006, full crown height', 'painted topstitch line + AO darkening + 0.004 raised ridge'),
            feat('eyelet-row', 'hole or socket', 'four embroidered eyelets at y=0 at azimuths 55, 125, 235 and 305 degrees (side and rear panels)', 'outer diameter 0.032', 'raised thread ring around a dark hole'),
            feat('front-panel-flat', 'raised ridge', 'the front panel between the two front seams is flatter and 0.02 taller than the revolved profile', 'width 0.48', 'geometry flattening of the lathe within the front sector')],
  evidence=['view-front', 'view-left', 'view-right', 'view-back'], recipe=twill_recipe, importance=1.0, confidence=0.9))
C.append(comp('visor', 'Visor (curved plate)', 'macro', 'plate', 'extrude', 'conforming-shell',
  'A thin plate 0.02 thick, arched (hand refinement src/refine.ts, recorded in deformationStack): the plan is bounded by the crown circle (r 0.45) and a forward circle (r 0.58 centred 0.36 ahead) so the tip sits 0.42 beyond the band, the widest point is 1.16 crown widths and the plate meets the crown at its sides (about +-88 degrees), so the arched wings sweep down beside the crown as the front view shows; extruded to its thickness; the lateral arch (sides drooping 0.10) is a bend applied in form-refinement, recorded in deformationStack.',
  'twill-bone', [1.0, 0.02, 0.5], [0, -0.282, 0], [-PI/2, 0, 0], 'root', 'blockout', {'profile2D': visor_extrude, 'topologyIntent': 'annular-sector plate with rounded tip, arched downward at the sides', 'deformationStack': [{'type': 'bend', 'axis': 'lateral', 'formula': 'dy = -0.42*x^2 (ends at x=+-0.54 drop 0.12)', 'appliedIn': 'src/refine.ts applyRefinements'}, {'type': 'bend', 'axis': 'forward', 'formula': 'dy = -0.15*(fwd-0.45)^2 beyond the band (tip drops 0.04)', 'appliedIn': 'src/refine.ts applyRefinements'}]},
  attachment={'parentId': 'root', 'parentSocket': 'band-front', 'contactType': 'butt', 'contactNormal': [0, 0, 1], 'overlap': 0.02, 'gapTolerance': 0.005, 'evidenceRefs': ['view-right', 'view-left']},
  features=[feat('stitch-rows', 'fabric stitch', 'six concentric stitch arcs on the top face, 0.06 apart, following the outer edge', 'line width 0.003', 'painted linework in darker bone + 0.01 bump'),
            feat('visor-edge-binding', 'raised ridge', 'outer edge of the plate', 'radius 0.008', 'rounded edge treatment (chamfer segments 3)')],
  evidence=['view-front', 'view-right', 'view-left'], recipe=twill_recipe, importance=0.95, confidence=0.9))
C.append(comp('strap', 'Snapback strap', 'macro', 'closure', 'extrude', 'assembled-solid',
  'A flat moulded plastic bar with seven round holes: a rounded-rectangle profile extruded 0.012, holes as real cutouts because they read as dark discs in the rear view.',
  'plastic-navy', [0.40, 0.062, 0.012], [0.0, -0.205, -0.536], [0, PI, 0], 'root', 'blockout', {'profile2D': strap_profile, 'deformationStack': [{'type': 'bend', 'axis': 'y', 'radius': 0.53, 'formula': 'x -> R sin(x/R), z -> z - R(1-cos(x/R))', 'appliedIn': 'src/refine.ts applyRefinements'}]},
  attachment={'parentId': 'root', 'parentSocket': 'band-rear', 'contactType': 'overlap', 'contactNormal': [0, 0, -1], 'overlap': 0.006, 'gapTolerance': 0.004, 'evidenceRefs': ['view-back']},
  features=[feat('holes-7', 'hole or socket', 'seven holes on the strap centreline, 0.05 apart', 'diameter 0.022', 'through cutouts with a moulding-gloss rim')],
  evidence=['view-back', 'view-right'], recipe=plastic_recipe, importance=0.85, confidence=0.9))
C.append(comp('liner', 'Interior liner (black taping)', 'meso', 'interior', 'lathe', 'continuous-sculpt',
  'A second revolved shell 0.018 inside the crown that shows as black through the rear opening and from below.',
  'liner-black', [0.96, 0.5, 0.96], [0, 0, 0], [0, 0, 0], 'root', 'structural-pass', {'latheProfile': liner_profile},
  features=[feat('tape-print', 'decal or label area', 'centre of the inner rear tape, visible through the opening', 'width 0.12', 'light grey painted ONE COMMUNITY, no relief')],
  evidence=['view-back'], recipe=liner_recipe, importance=0.5))
C.append(comp('opening-panel', 'Rear opening (inverted-U arch)', 'meso', 'opening', 'extrude', 'material-only',
  'The opening is a cutout in the rear panels; it is represented as a black arch plate riding on the crown surface, since the lathe cannot be booleaned.',
  'liner-black', [0.34, 0.20, 0.02], [0.0, -0.16, -0.530], [0, PI, 0], 'root', 'structural-pass', {'profile2D': opening_profile, 'deformationStack': [{'type': 'bend', 'axis': 'y', 'radius': 0.52, 'formula': 'x -> R sin(x/R), z -> z - R(1-cos(x/R))', 'appliedIn': 'src/refine.ts applyRefinements'}]},
  features=[feat('arch-binding', 'seam line', 'bias binding along the arch edge', 'width 0.012', 'twill-coloured ridge 0.004 around the arch')],
  evidence=['view-back'], recipe=liner_recipe, importance=0.7))
C.append(comp('button', 'Apex button', 'meso', 'cap', 'sphere', 'assembled-solid',
  'A fabric-covered button: a small sphere at the apex, slightly flattened.',
  'twill-bone', [0.07, 0.05, 0.07], [0, 0.347, 0], [0, 0, 0], 'root', 'structural-pass',
  features=[feat('button-cover-seam', 'seam line', 'equator of the button', 'width 0.003', 'AO darkening')],
  evidence=['view-back', 'view-right'], recipe=twill_recipe, importance=0.5))
C.append(comp('visor-underside', 'Visor underside', 'meso', 'plate', 'extrude', 'conforming-shell',
  'A thin dark lamina under the visor plate with the same plan; the underside colour is inferred (hidden in every view).',
  'liner-black', [1.0, 0.006, 0.46], [0, -0.287, 0], [-PI/2, 0, 0], 'root', 'structural-pass', {'profile2D': under_extrude, 'deformationStack': [{'type': 'bend', 'axis': 'lateral', 'formula': 'dy = -0.42*x^2', 'appliedIn': 'src/refine.ts applyRefinements (Visor* prefix)'}]},
  attachment={'parentId': 'root', 'parentSocket': 'visor-bottom', 'contactType': 'overlap', 'contactNormal': [0, -1, 0], 'overlap': 0.004, 'gapTolerance': 0.003, 'evidenceRefs': ['view-right']},
  evidence=['view-right', 'view-left'], recipe=liner_recipe, importance=0.4, confidence=0.5))
C.append(comp('buckle', 'Strap buckle', 'meso', 'closure', 'box', 'assembled-solid',
  'A small rectangular moulded block at the wearer-left end of the strap.',
  'plastic-navy', [0.06, 0.07, 0.022], [-0.215, -0.205, -0.512], [0, -0.42, 0], 'root', 'structural-pass',
  evidence=['view-back', 'view-right'], recipe=plastic_recipe, importance=0.45))
C.append(comp('flag-patch', 'Mexican flag patch', 'meso', 'decal', 'box', 'assembled-solid',
  'A thin rectangular woven patch 0.012 thick sitting proud of the wearer-right side panel (-X).',
  'patch-flag', [0.20, 0.13, 0.012], [-0.518, -0.09, -0.06], [0, -PI/2 - 0.12, 0], 'root', 'structural-pass',
  features=[feat('flag-bands-decal', 'decal or label area', 'whole patch face', '0.20 x 0.13', 'tricolour bands with eagle, merrowed edge ridge')],
  evidence=['view-left'], recipe=patch_recipe, importance=0.8))
C.append(comp('front-plate', 'Front embroidery carrier', 'meso', 'decal', 'plane-card', 'material-only',
  'Carrier for the three-line MAKE / CUMBRES / CHINGON AGAIN embroidery; a plane riding on the front panel, textured with an alpha canvas in the material pass.',
  'thread-navy', [0.46, 0.22, 0.01], [0, 0.0, 0.524], [-0.06, 0, 0], 'root', 'structural-pass',
  features=[feat('decal-front-text', 'decal or label area', 'centred on the front panel, three lines: MAKE / CUMBRES / CHINGON AGAIN, serif capitals', 'text block 0.40 x 0.18', 'navy satin-stitch letters with 0.006 relief')],
  evidence=['view-front'], recipe=navy_recipe, importance=1.0))
C.append(comp('right-plate', 'ONE COMMUNITY embroidery carrier', 'meso', 'decal', 'plane-card', 'material-only',
  'Carrier for the two-line ONE / COMMUNITY embroidery on the wearer-left side panel (+X).',
  'thread-navy', [0.20, 0.09, 0.01], [0.514, -0.11, -0.10], [0, PI/2 + 0.15, 0], 'root', 'structural-pass',
  features=[feat('decal-right-text', 'decal or label area', 'lower rear third of the right side panel, two lines', 'text block 0.18 x 0.08', 'navy satin-stitch letters')],
  evidence=['view-right'], recipe=navy_recipe, importance=0.8))
C.append(comp('monogram-plate', 'Script monogram carrier', 'meso', 'decal', 'plane-card', 'material-only',
  'Carrier for the green script monogram on the wearer-right side panel (-X), forward of the flag patch.',
  'monogram-green', [0.10, 0.17, 0.01], [-0.492, 0.0, 0.17], [0, -PI/2 + 0.35, 0], 'root', 'structural-pass',
  features=[feat('decal-monogram', 'decal or label area', 'near the left front seam, vertical script letterforms', '0.09 x 0.16', 'green satin-stitch relief 0.006')],
  evidence=['view-left'], recipe=mono_recipe, importance=0.6, confidence=0.6))
for i, deg in enumerate([55, 125, 235, 305]):
    t = math.radians(deg)
    C.append(comp(f'eyelet-{i+1}', f'Eyelet {i+1}', 'meso', 'fastener', 'torus', 'surface-relief',
      'An embroidered eyelet: a small thread ring around a hole, standing 0.004 proud of the panel; a torus facing outward.',
      'twill-bone', [0.032, 0.032, 0.008], [round(0.522 * math.sin(t), 4), 0.0, round(0.522 * math.cos(t), 4)], [0, t, 0], 'root', 'structural-pass',
      {'torusTubeRatio': 0.3}, evidence=['view-left', 'view-right', 'view-back'], recipe=twill_recipe, importance=0.35))
spec['componentTree'] = C

spec['repetitionSystems'] = [{
  'id': 'eyelet-ring', 'name': 'Embroidered eyelets', 'level': 'meso', 'parent': 'root', 'count': 4, 'primitive': 'torus',
  'elementComponentIds': ['eyelet-1', 'eyelet-2', 'eyelet-3', 'eyelet-4'], 'material': 'twill-bone', 'instanceScale': [0.032, 0.032, 0.008],
  'placement': {'mode': 'radial', 'axis': [0, 1, 0], 'radius': 0.968, 'startAngleDeg': 55}, 'buildsGeometry': True,
  'distributionRule': 'one eyelet per side and rear panel at eyelet height (y=0); none on the front panel', 'evidenceRefs': ['view-left', 'view-right', 'view-back']}]

# ---------------- inventario de detalles ----------------
def detail(did, kind, desc, region, view, maps, scale='small', affects='albedo+relief', conf=0.9):
    return {'id': did, 'kind': kind, 'description': desc, 'region': region | {'units': 'normalized'}, 'scale': scale, 'affects': affects,
            'mapsTo': maps, 'evidenceRef': f'{R}/views/{view}.png', 'confidence': conf}
def reg(x, y, w, h): return {'x': x, 'y': y, 'width': w, 'height': h}
details = [
  detail('d-front-text', 'decal', 'three-line navy serif embroidery MAKE / CUMBRES / CHINGON AGAIN centred on the front panel', reg(0.30, 0.22, 0.42, 0.42), 'front', {'type': 'component.localFeatures', 'ref': 'front-plate/decal-front-text'}, 'medium'),
  detail('d-right-text', 'decal', 'two-line navy embroidery ONE / COMMUNITY on the right side panel, lower rear third', reg(0.55, 0.55, 0.30, 0.28), 'right', {'type': 'component.localFeatures', 'ref': 'right-plate/decal-right-text'}, 'medium'),
  detail('d-monogram', 'decal', 'green script monogram at the left front seam, partly cropped', reg(0.27, 0.12, 0.12, 0.45), 'left', {'type': 'component.localFeatures', 'ref': 'monogram-plate/decal-monogram'}, 'medium', conf=0.6),
  detail('d-flag-patch', 'decal', 'rectangular woven flag patch, green white red bands with eagle, merrowed edge', reg(0.50, 0.42, 0.25, 0.30), 'left', {'type': 'component.localFeatures', 'ref': 'flag-patch/flag-bands-decal'}, 'medium'),
  detail('d-strap-holes', 'hole', 'seven round holes along the navy strap centreline', reg(0.30, 0.78, 0.45, 0.12), 'back', {'type': 'component.localFeatures', 'ref': 'strap/holes-7'}, 'small', 'geometry'),
  detail('d-buckle', 'fastener', 'moulded buckle block at the strap end', reg(0.70, 0.72, 0.10, 0.18), 'back', {'type': 'component', 'ref': 'buckle'}, 'small', 'geometry'),
  detail('d-button', 'fastener', 'fabric-covered apex button', reg(0.44, 0.0, 0.12, 0.10), 'back', {'type': 'component', 'ref': 'button'}, 'small', 'geometry'),
  detail('d-eyelets', 'hole', 'embroidered eyelet on each side and rear panel, upper third', reg(0.55, 0.25, 0.10, 0.12), 'right', {'type': 'component.localFeatures', 'ref': 'root/eyelet-row'}, 'small'),
  detail('d-visor-stitches', 'stitch', 'six concentric stitch rows on the visor top following the outer edge', reg(0.15, 0.70, 0.70, 0.28), 'front', {'type': 'component.localFeatures', 'ref': 'visor/stitch-rows'}, 'small', 'albedo+bump'),
  detail('d-panel-seams', 'seam', 'topstitched meridian seams between the five panels', reg(0.20, 0.05, 0.60, 0.80), 'front', {'type': 'component.localFeatures', 'ref': 'root/panel-seams'}, 'small', 'ao+ridge'),
  detail('d-tape-print', 'decal', 'light grey ONE COMMUNITY print on the inner rear tape seen through the opening', reg(0.42, 0.55, 0.22, 0.12), 'back', {'type': 'component.localFeatures', 'ref': 'liner/tape-print'}, 'small', 'albedo', conf=0.7),
  detail('d-arch-binding', 'seam', 'bias binding around the inverted-U opening', reg(0.33, 0.45, 0.40, 0.45), 'back', {'type': 'component.localFeatures', 'ref': 'opening-panel/arch-binding'}, 'small', 'ridge'),
  detail('d-weave-grain', 'ridge', 'fine diagonal twill weave grain over every bone surface', reg(0.30, 0.10, 0.40, 0.30), 'right', {'type': 'material.localOverrides', 'ref': 'twill-bone/weave-grain'}, 'micro', 'normal+roughness'),
  detail('d-hole-gloss', 'gloss', 'moulding gloss on the strap hole rims', reg(0.30, 0.78, 0.45, 0.12), 'back', {'type': 'material.localOverrides', 'ref': 'plastic-navy/hole-rims'}, 'micro', 'roughness'),
  detail('d-visor-edge', 'bevel', 'rounded bound edge along the visor perimeter', reg(0.05, 0.75, 0.90, 0.22), 'front', {'type': 'component.localFeatures', 'ref': 'visor/visor-edge-binding'}, 'small', 'geometry')]
pa['detailInventory'] = {'scanMethod': 'grid-3x3 over four views', 'targetMinDetails': 10, 'zonesDirs': [f'{R}/zones-{v}' for v in ('front', 'right', 'left', 'back')], 'details': details}

# ---------------- contrato de calidad ----------------
qc = spec['qualityContract']
qc['definitionOfDone'] = [
  'From the front the crown reads as a bone five-panel dome with a flat front panel carrying three lines of navy serif embroidery, over an arched visor that droops at both sides.',
  'From either side the visor is a thin plate ~0.02 thick, and the side panel carries its decal (flag + monogram on the left, ONE COMMUNITY on the right) plus one eyelet.',
  'From the rear the inverted-U opening is black with a navy seven-hole strap spanning it, and the apex button sits centred.',
  'Bone twill reads matte with visible weave grain; embroidery reads as raised satin thread; the strap reads as satin plastic.']
qc['featureGroups'] += [
  {'id': 'embroidery-decals', 'name': 'Embroidered text and patch decals', 'required': True, 'qualityCriteria': ['Front three-line text, right two-line text, left monogram and flag patch are placed on the correct panels with correct line count and colour.'], 'evidenceRefs': ['view-front', 'view-left', 'view-right'], 'failureModes': ['decal on the wrong side', 'text rendered as a flat rectangle in the final pass', 'wrong colour']},
  {'id': 'visor-form', 'name': 'Visor plan and arch', 'required': True, 'qualityCriteria': ['Annular-sector plan with rounded tip, 0.46 long, arched so both sides sit ~0.1 below the centre, thickness 0.02.'], 'evidenceRefs': ['view-right', 'view-front'], 'failureModes': ['flat visor', 'visor too short or a rectangle', 'thick slab']},
  {'id': 'closure-system', 'name': 'Rear opening and snapback', 'required': True, 'qualityCriteria': ['Black inverted-U opening 0.34 wide; navy strap with seven visible holes and a buckle at the wearer-left end.'], 'evidenceRefs': ['view-back'], 'failureModes': ['no opening', 'strap floating away from the band', 'holes missing']}]
spec['qualityTargets']['reviewViewpoints'] = ['front', 'right-lateral', 'left-lateral', 'rear', 'three-quarter-front']
spec['qualityTargets']['mustMatch'] = ['crown dome + arched visor silhouette from front and side', 'bone twill vs navy thread/plastic material response', 'front three-line embroidery, flag patch, ONE COMMUNITY and seven-hole strap on their correct panels']
spec['featureReviewTargets'] = [
  {'id': 'crown-visor-silhouette', 'name': 'Crown dome and arched visor silhouette', 'tier': 'critical', 'passIds': ['blockout', 'form-refinement'], 'minimumScore': 0.8, 'mustPass': True, 'componentRefs': ['root', 'visor'], 'evidenceRefs': ['view-front', 'view-right']},
  {'id': 'closure-structure', 'name': 'Rear opening, strap and buckle', 'tier': 'critical', 'passIds': ['blockout', 'structural-pass'], 'minimumScore': 0.8, 'mustPass': True, 'componentRefs': ['strap', 'opening-panel', 'buckle'], 'evidenceRefs': ['view-back']},
  {'id': 'panel-hardware', 'name': 'Button, eyelets and patch placement', 'tier': 'important', 'passIds': ['structural-pass', 'form-refinement'], 'minimumScore': 0.65, 'mustPass': False, 'componentRefs': ['button', 'eyelet-1', 'eyelet-2', 'eyelet-3', 'eyelet-4', 'flag-patch'], 'evidenceRefs': ['view-left', 'view-back']},
  {'id': 'embroidery-text', 'name': 'Front and side embroidered text', 'tier': 'critical', 'passIds': ['material-pass', 'surface-pass'], 'minimumScore': 0.75, 'mustPass': True, 'componentRefs': ['front-plate', 'right-plate', 'monogram-plate'], 'evidenceRefs': ['view-front', 'view-right', 'view-left']},
  {'id': 'twill-material', 'name': 'Bone twill and navy plastic response', 'tier': 'critical', 'passIds': ['material-pass', 'surface-pass', 'lighting-pass'], 'minimumScore': 0.75, 'mustPass': True, 'componentRefs': ['root', 'visor', 'strap'], 'evidenceRefs': ['view-front', 'view-back']}]

# pasadas: refs acumuladas
macro = ['root', 'visor', 'strap']
meso = [c['id'] for c in C if c['level'] == 'meso']
for p in spec['buildPasses']:
    if p['id'] == 'blockout': p['componentRefs'] = macro
    else: p['componentRefs'] = macro + meso
spec['sculptPipeline']['currentPass'] = 'blockout'

spec['lightingFromPhoto'] = [
  {'id': 'key', 'type': 'directional', 'direction': 'top-front, ~35 degrees elevation, slightly camera-left', 'intensity': 2.2, 'color': '#FFFFFF', 'notes': 'soft studio key; ACES filmic tone mapping, exposure 1.0'},
  {'id': 'fill', 'type': 'hemisphere', 'direction': 'sky white / ground light grey', 'intensity': 0.9, 'color': '#F4F5F7', 'notes': 'broad fill from the white sweep; exposure kept at 1.0 so bone stays below clipping'},
  {'id': 'rim', 'type': 'directional', 'direction': 'rear-top, camera-right', 'intensity': 0.6, 'color': '#EEF1F5', 'notes': 'separates the crown from the background; tone mapping ACES'},
  {'id': 'environment', 'type': 'environment', 'direction': 'procedural studio softbox', 'intensity': 1.0, 'color': '#FFFFFF', 'notes': 'soft reflections on the plastic strap; contact shadow under the visor and the band (ground shadow, ambient occlusion in seams)'}]
spec['risks'] = ['The lathe cannot flatten the front panel; approximated in form-refinement.', 'Embroidery text depends on generated canvas textures added in the material pass.', 'Visor underside colour is inferred.']
spec['proceduralStrategy'] = ['Blockout: lathe crown, swept visor, extruded strap.', 'Structural: liner, opening arch, button, eyelets, buckle, patch and decal carriers.', 'Form: visor edge rounding, eyelet relief.', 'Material: independent twill maps, canvas embroidery textures with alpha, flag decal.', 'Lighting: key/fill/rim with ACES and contact shadow.']
spec['sourceImage'] = f'{R}/reference/gorra-4vistas.jpg'
# conserva el historial de revisión y el estado de pasadas del spec anterior (los scripts los escriben in-place)
import os
if os.path.exists(f'{R}/object-sculpt-spec.json'):
    old = json.load(open(f'{R}/object-sculpt-spec.json'))
    for k in ('reviewHistory', 'visualEvidence', 'sculptPipeline', 'tier1Results', 'tier1Result', 'multiAngleResults', 'materialGate', 'materialPipeline'):
        if k in old: spec[k] = old[k]
json.dump(spec, open(f'{R}/object-sculpt-spec.json', 'w'), indent=1, ensure_ascii=False)
print('components', len(C), 'meso', len(meso), 'details', len(details))
