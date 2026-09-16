"""Project Outrage light tank. Blender 5.1; meters, +Z up, -Y forward.
Run: blender --background --factory-startup --python build_light_tank.py -- OUTPUT
Independent reconstruction from the project's eight-direction hull/turret sprites.
"""
import bpy, math, json, sys, os
from mathutils import Vector, Matrix
from pathlib import Path

OUT = Path(sys.argv[sys.argv.index('--') + 1])
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.render.fps = 30
parts = {}

def material(name, color, metal=0.0, rough=.45):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    return m

armor = material('Armor | warm field grey', (.29,.275,.224), .48,.38)
edge = material('Armor | machined edges', (.46,.44,.37), .62,.32)
panel = material('Armor | recessed panels', (.19,.18,.15), .4,.46)
rubber = material('Tracks | charcoal rubber', (.018,.023,.025), .12,.62)
steel = material('Tracks | dark steel', (.075,.085,.083), .68,.43)
team = material('TeamColor | orchid', (.56,.035,.39), .25,.34)
teamdark = material('TeamColor | recessed orchid', (.24,.018,.14), .25,.43)
black = material('Recess | near black', (.007,.01,.011), .12,.64)
lens = material('Lamp | orchid glass', (.65,.07,.46), .22,.2)
lp = lens.node_tree.nodes.get('Principled BSDF')
lp.inputs['Emission Color'].default_value = (.35,.01,.18,1)
lp.inputs['Emission Strength'].default_value = .3

def tag(obj, name, mat, group):
    obj.name = name
    if mat: obj.data.materials.append(mat)
    if group: parts.setdefault(group, []).append(obj)
    return obj

def bevel(obj, width=.035, seg=2):
    if width:
        b=obj.modifiers.new('Machined bevels','BEVEL'); b.width=width; b.segments=seg
        b.affect='EDGES'; b.harden_normals=True
        n=obj.modifiers.new('Face weighted normals','WEIGHTED_NORMAL'); n.keep_sharp=True; n.weight=50
    return obj

def box(name, loc, scale, mat=armor, group='Hull', rad=.03, rotation=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o=bpy.context.object; o.dimensions=scale
    if rotation: o.rotation_euler=rotation
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return bevel(tag(o,name,mat,group),rad)

def cylinder(name, loc, radius, depth, mat=armor, group='Hull', axis='Z', vertices=24, rad=.015):
    rot={'X':(0,math.pi/2,0),'Y':(math.pi/2,0,0),'Z':(0,0,0)}[axis]
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=loc,rotation=rot)
    o=bpy.context.object
    for p in o.data.polygons: p.use_smooth=len(p.vertices)==4
    return bevel(tag(o,name,mat,group),rad)

def mesh(name, verts, faces, mat, group, rad=0):
    data=bpy.data.meshes.new(name); data.from_pydata(verts,[],faces); data.update()
    o=bpy.data.objects.new(name,data); scene.collection.objects.link(o)
    return bevel(tag(o,name,mat,group),rad)

def rect_ring(wx, front, rear, cut, z):
    return [(-wx+cut,front,z),(wx-cut,front,z),(wx,front+cut,z),(wx,rear-cut,z),
            (wx-cut,rear,z),(-wx+cut,rear,z),(-wx,rear-cut,z),(-wx,front+cut,z)]

def loft(name,rings,mat,group,rad=.035):
    n=len(rings[0]); verts=[v for ring in rings for v in ring]
    faces=[tuple(reversed(range(n))),tuple(range((len(rings)-1)*n,len(rings)*n))]
    for layer in range(len(rings)-1):
        for j in range(n): faces.append((layer*n+j,layer*n+(j+1)%n,(layer+1)*n+(j+1)%n,(layer+1)*n+j))
    return mesh(name,verts,faces,mat,group,rad)

# Low, forward-sloped hull and heavy wraparound fenders.
loft('Lower armoured tub',[rect_ring(.96,-1.96,1.95,.22,.61),rect_ring(1.14,-2.03,2.04,.20,1.12)],panel,'Hull')
loft('Upper hull',[rect_ring(1.19,-2.06,2.00,.12,1.08),rect_ring(1.09,-1.41,1.72,.13,1.68)],armor,'Hull',.055)
loft('Deck edge seam',[rect_ring(1.092,-1.414,1.725,.13,1.665),rect_ring(1.092,-1.414,1.725,.13,1.7)],edge,'Hull',.012)
for side in (-1,1):
    # Full track belt, hollow through the wheel area.
    x=side*1.34; group='Track_L' if side<0 else 'Track_R'
    samples=[]
    for i in range(17):
        a=-math.pi/2+i*math.pi/16
        samples.append((1.68,.59,a))
    for i in range(17):
        a=math.pi/2+i*math.pi/16
        samples.append((-1.68,.59,a))
    verts=[]
    for xx,rr in [(x-.235,.56),(x+.235,.56),(x-.235,.445),(x+.235,.445)]:
        verts.extend([(xx,y+rr*math.cos(a),z+rr*math.sin(a)) for y,z,a in samples])
    n=len(samples); faces=[]
    for j in range(n):
        k=(j+1)%n
        faces.extend([(j,k,n+k,n+j),(2*n+j,3*n+j,3*n+k,2*n+k),
                      (j,2*n+j,2*n+k,k),(n+j,n+k,3*n+k,3*n+j)])
    mesh('Continuous track belt',verts,faces,rubber,group)
    # Separate tread geometry is merged into one track mesh at export.
    L=3.36; R=.565; perimeter=2*L+2*math.pi*R
    for i in range(64):
        s=i*perimeter/64
        if s<L: yy=-1.68+s; zz=.59+R; ang=0
        elif s<L+math.pi*R:
            a=math.pi/2-(s-L)/R; yy=1.68+R*math.cos(a); zz=.59+R*math.sin(a); ang=a-math.pi/2
        elif s<2*L+math.pi*R: yy=1.68-(s-L-math.pi*R); zz=.59-R; ang=math.pi
        else:
            a=-math.pi/2-(s-2*L-math.pi*R)/R; yy=-1.68+R*math.cos(a); zz=.59+R*math.sin(a); ang=a-math.pi/2
        box('Track shoe',(x,yy,zz),(.48,.13,.045),steel,group,.009,(ang,0,0))
    for wi,yy in enumerate([-1.64,-.82,0,.82,1.64]):
        wg=('Wheel_L_' if side<0 else 'Wheel_R_')+str(wi+1)
        cylinder('Road wheel tire',(x,yy,.59),.427,.38,rubber,wg,'X',24,.014)
        cylinder('Machined wheel rim',(x+side*.21,yy,.59),.322,.052,edge,wg,'X',24,.015)
        cylinder('Orchid wheel disc',(x+side*.242,yy,.59),.267,.035,teamdark,wg,'X',24,.02)
        cylinder('Orchid wheel hub',(x+side*.27,yy,.59),.117,.047,team,wg,'X',16,.022)
    box('Fender',(side*1.355,0,1.23),(.61,4.35,.2),armor,rad=.08)
    box('Fender edge',(side*1.67,0,1.22),(.055,4.10,.07),edge,rad=.025)
    for yy in (-2.10,2.10):
        box('Fender end cap',(side*1.36,yy,1.08),(.59,.24,.4),armor,rad=.075)
        box('Fender end inset',(side*1.36,yy+(-.127 if yy<0 else .127),1.08),(.405,.03,.225),panel,rad=.025)
    for yy in (-.76,.27,1.22):
        box('Stowage recess',(side*1.17,yy,1.41),(.19,.71,.24),black,rad=.04)
        box('Armoured stowage box',(side*1.21,yy,1.43),(.20,.65,.23),armor,rad=.045)
        box('Stowage lid rim',(side*1.225,yy-.23,1.45),(.207,.042,.23),edge,rad=.009)
    box('Hull team stripe',(side*1.097,.15,1.673),(.027,2.86,.06),team,rad=.01)

# Paired front armour windows in the sloping glacis.
tilt=math.radians(-47.1)
for xx in (-.5,.5):
    box('Glacis panel seam',(xx,-1.700,1.429),(.71,.035,.50),black,rad=.025,rotation=(tilt,0,0))
    box('Glacis armour plate',(xx,-1.713,1.443),(.63,.062,.425),edge,rad=.026,rotation=(tilt,0,0))
    box('Inset sight slit',(xx,-1.86,1.329),(.31,.045,.06),panel,rad=.016,rotation=(tilt,0,0))
box('Front lower armour',(0,-2.039,1.18),(1.02,.14,.23),panel,rad=.04)
box('Front identity band',(0,-2.129,1.10),(1.6,.023,.075),team,rad=.01)
for xx in (-.64,.64):
    box('Front tow lug',(xx,-2.14,1.01),(.16,.14,.15),steel,rad=.03)

# Rear engine deck: twin recessed purple louvres and circular rear lamps.
for xx in (-.53,.53):
    box('Cooling grille recess',(xx,1.12,1.709),(.69,.75,.05),black,rad=.025)
    box('Cooling grille bed',(xx,1.12,1.733),(.61,.66,.028),teamdark,rad=.008)
    for j in range(7):
        box('Cooling louvre',(xx,.843+j*.091,1.76),(.588,.042,.035),team,rad=.012)
    for yy in (.75,1.49): box('Grille rim',(xx,yy,1.752),(.72,.042,.056),edge,rad=.014)
    for dx in (-.355,.355): box('Grille side rim',(xx+dx,1.12,1.75),(.037,.735,.052),edge,rad=.012)
    cylinder('Rear lamp housing',(xx*1.28,2.03,1.24),.17,.12,panel,'Hull','Y',20,.025)
    cylinder('Rear lamp bezel',(xx*1.28,2.102,1.24),.127,.04,edge,'Hull','Y',20,.012)
    cylinder('Rear orchid lamp',(xx*1.28,2.129,1.24),.093,.025,lens,'Hull','Y',20,.012)
box('Rear service hatch',(0,2.038,1.22),(.57,.09,.4),panel,rad=.04)
box('Service hatch latch',(0,2.092,1.35),(.20,.06,.055),edge,rad=.012)

# Broad low octagonal turret with a separate ring, roof, and cupola.
ty=-.28
cylinder('Turret bearing',(0,ty,1.72),.88,.16,black,'Hull',vertices=48,rad=.025)
cylinder('Turret ring',(0,ty,1.82),1.02,.16,steel,'Turret',vertices=48,rad=.035)
turret_rings=[rect_ring(1.12,ty-1.05,ty+.98,.34,1.85),
              rect_ring(1.20,ty-1.04,ty+1.00,.35,2.01),
              rect_ring(1.00,ty-.86,ty+.84,.30,2.53)]
loft('Turret shell',turret_rings,armor,'Turret',.055)
loft('Turret roof lip',[rect_ring(1.005,ty-.866,ty+.846,.3,2.509),
                        rect_ring(.984,ty-.846,ty+.826,.3,2.554)],edge,'Turret',.018)
# Identity bands follow the four sloped corner faces of the solid turret.
for face in (1,3,5,7):
    low=turret_rings[1]; high=turret_rings[2]; a=face; b=(face+1)%8
    vs=[]
    for t,u in [(0,.13),(0,.75),(1,.75),(1,.13)]:
        v=Vector(low[a]).lerp(Vector(low[b]),u).lerp(Vector(high[a]).lerp(Vector(high[b]),u),t)
        outward=Vector((v.x,v.y-ty,0)).normalized()*.015; v+=outward
        vs.append(tuple(v))
    mesh('Turret orchid identity band',vs,[(0,1,2,3)],team,'Turret')
for side in (-1,1):
    # Horizontal side strips sit just outside the sloped shell.
    vs=[(side*1.166,ty-.63,2.12),(side*1.166,ty+.55,2.12),
        (side*1.121,ty+.55,2.237),(side*1.121,ty-.63,2.237)]
    mesh('Turret side band',vs,[(0,1,2,3)],team,'Turret')
    for yy in (-.53,.50):
        cylinder('Roof bolt seat',(side*.65,ty+yy,2.558),.103,.028,panel,'Turret',vertices=16,rad=.008)
        cylinder('Roof orchid bolt',(side*.65,ty+yy,2.58),.079,.035,team,'Turret',vertices=16,rad=.01)
box('Rear turret vent',(0,ty+.895,2.20),(.60,.072,.29),panel,'Turret',.03)
for zz in (2.13,2.21,2.29): box('Rear turret louvre',(0,ty+.94,zz),(.49,.058,.035),team,'Turret',.012)
cylinder('Cupola shadow ring',(0,ty+.13,2.577),.553,.063,black,'Turret',vertices=40,rad=.012)
cylinder('Cupola base',(0,ty+.13,2.63),.516,.12,edge,'Turret',vertices=40,rad=.022)
for i in range(12):
    a=2*math.pi*i/12
    box('Cupola vision slit',(.515*math.sin(a),ty+.13+.515*math.cos(a),2.622),(.13,.018,.044),black,'Turret',.006,(0,0,-a))
cylinder('Cupola hatch',(0,ty+.13,2.716),.476,.085,armor,'Turret',vertices=40,rad=.036)
box('Hatch raised rib',(0,ty+.13,2.763),(.60,.07,.034),edge,'Turret',.017,rotation=(0,0,.26))
box('Hatch hinge',(0,ty+.565,2.703),(.24,.11,.09),steel,'Turret',.02)

# Armoured mantlet, stepped gun sleeve, hollow muzzle, separate recoil node.
box('Mantlet gasket',(0,ty-.983,2.223),(.69,.24,.58),black,'Turret',.07)
box('Armoured mantlet',(0,ty-1.10,2.25),(.62,.30,.51),armor,'Turret',.065)
box('Mantlet face rim',(0,ty-1.269,2.25),(.49,.055,.405),edge,'Turret',.035)
cylinder('Gun socket',(0,ty-1.323,2.23),.193,.18,black,'Turret','Y',24,.025)
cylinder('Gun sleeve',(0,ty-1.495,2.23),.166,.38,panel,'Barrel','Y',24,.032)
cylinder('Gun collar',(0,ty-1.677,2.23),.136,.105,edge,'Barrel','Y',24,.018)
cylinder('Long cannon barrel',(0,ty-2.57,2.23),.098,1.78,armor,'Barrel','Y',20,.012)
cylinder('Barrel reinforcement',(0,ty-2.84,2.23),.11,.14,edge,'Barrel','Y',20,.012)
# Annular muzzle instead of a filled cylinder cap.
verts=[]; nn=24; front=ty-3.66; back=front+.20
for yy,rr in [(front,.112),(back,.112),(front,.070),(back,.070)]:
    verts.extend([(rr*math.cos(2*math.pi*i/nn),yy,2.23+rr*math.sin(2*math.pi*i/nn)) for i in range(nn)])
faces=[]
for i in range(nn):
    j=(i+1)%nn
    faces.extend([(i,j,nn+j,nn+i),(i,2*nn+i,2*nn+j,j),(2*nn+i,3*nn+i,3*nn+j,2*nn+j)])
mesh('Open muzzle',verts,faces,steel,'Barrel',.005)
cylinder('Muzzle bore shadow',(0,back+.006,2.23),.072,.012,black,'Barrel','Y',24,0)

print('OUTRAGE Geometry built',flush=True)
# Apply bevels and consolidate geometry. The asset keeps only useful moving nodes.
nodes={}
for name,objects in parts.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        bpy.context.view_layer.objects.active=o; o.select_set(True)
        for mod in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=mod.name)
        o.select_set(False)
    for o in objects: o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.object.join(); o=bpy.context.object; o.name=name
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    pivot=(0,0,0)
    if name=='Turret': pivot=(0,ty,1.8)
    elif name=='Barrel': pivot=(0,ty-1.32,2.23)
    elif name.startswith('Wheel_'):
        pivot=((-1 if '_L_' in name else 1)*1.34,[-1.64,-.82,0,.82,1.64][int(name[-1])-1],.59)
    o.data.transform(Matrix.Translation(-Vector(pivot))); o.location=pivot
    nodes[name]=o

root=bpy.data.objects.new('OUTRAGE_LightTank',None); scene.collection.objects.link(root)
root['asset_version']='1.0'; root['source']='Project-Outrage light tank sprite reference'
root['forward_axis']='-Y in Blender / +Z in glTF'; root['units']='meters'
def parent_keep(o,p):
    bpy.context.view_layer.update()
    w=o.matrix_world.copy(); o.parent=p; o.matrix_world=w
for name,o in nodes.items():
    parent_keep(o,nodes['Turret'] if name=='Barrel' else nodes['Hull'] if name!='Hull' else root)
muzzle=bpy.data.objects.new('Muzzle',None); scene.collection.objects.link(muzzle)
muzzle.location=(0,front-.012,2.23); muzzle.empty_display_size=.15; parent_keep(muzzle,nodes['Barrel'])
asset=[root,*nodes.values(),muzzle]
scene.view_settings.view_transform='AgX'

def point_at(o,at): o.rotation_euler=(Vector(at)-o.location).to_track_quat('-Z','Y').to_euler()
groundmat=material('Studio floor',(.024,.032,.045),.05,.64)
ground=box('Studio floor',(0,0,-.08),(200,200,.10),groundmat,None,0)
def area(name,loc,energy,size,color):
    d=bpy.data.lights.new(name,'AREA'); d.energy=energy; d.shape='DISK'; d.size=size; d.color=color
    o=bpy.data.objects.new(name,d); scene.collection.objects.link(o); o.location=loc; point_at(o,(0,0,1)); return o
area('Key softbox',(-4,-5,8),1800,5,(1,.88,.74))
area('Cool fill',(5,-2,5),1250,4,(.72,.82,1))
area('Rear rim',(1,5,7),2300,3,(1,.78,.90))
scene.world.color=(.17,.17,.17)
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.16,.19,.24,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.35
camdata=bpy.data.cameras.new('Review camera'); cam=bpy.data.objects.new('Review camera',camdata)
scene.collection.objects.link(cam); scene.camera=cam; camdata.type='ORTHO'; camdata.ortho_scale=8.2
def camera_angle(deg,elevation=30):
    a=math.radians(deg); e=math.radians(elevation); target=Vector((0,-.58,1.26))
    cam.location=target+Vector((10*math.sin(a)*math.cos(e),-10*math.cos(a)*math.cos(e),10*math.sin(e)))
    point_at(cam,target)
camera_angle(43,30)
engines=[p.identifier for p in scene.render.bl_rna.properties['engine'].enum_items]
scene.render.engine='CYCLES'
scene.cycles.samples=32; scene.cycles.use_denoising=True
gpu=[]
try:
    cp=bpy.context.preferences.addons['cycles'].preferences
    for mode in ('OPTIX','CUDA','HIP'):
        try:
            cp.compute_device_type=mode; cp.get_devices()
            gpu=[d for d in cp.devices if d.type!='CPU']
            if gpu:
                for d in cp.devices: d.use=d.type!='CPU'
                scene.cycles.device='GPU'; print('OUTRAGE GPU',[(d.name,d.type) for d in gpu],flush=True); break
        except Exception: continue
except Exception as e: print('OUTRAGE CPU render',str(e),flush=True)
scene.render.resolution_x=1280; scene.render.resolution_y=960; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'; scene.render.film_transparent=False
scene.render.filepath=str(OUT/'light_tank_hero.png'); bpy.ops.render.render(write_still=True)
camera_angle(138,30); scene.render.filepath=str(OUT/'light_tank_rear.png'); bpy.ops.render.render(write_still=True)
scene.render.resolution_x=640; scene.render.resolution_y=640; scene.cycles.samples=16
for i in range(8):
    camera_angle(i*45,30); scene.render.filepath=str(OUT/f'view_{i:02d}.png'); bpy.ops.render.render(write_still=True)
print('OUTRAGE Renders complete',flush=True)

def curves(action,slot):
    if hasattr(action,'fcurves'): return action.fcurves
    return action.layers[0].strips[0].channelbag(slot).fcurves
def clip(o,name,path,keys,linear=False):
    o.animation_data_clear()
    for frame,value in keys:
        setattr(o,path,value); o.keyframe_insert(data_path=path,frame=frame)
    ad=o.animation_data; action=ad.action; action.name=name+'__'+o.name; slot=ad.action_slot
    if linear:
        for fc in curves(action,slot):
            for kp in fc.keyframe_points: kp.interpolation='LINEAR'
    tr=ad.nla_tracks.new(); tr.name=name
    strip=tr.strips.new(name,int(keys[0][0]),action)
    if hasattr(strip,'action_slot'): strip.action_slot=slot
    ad.action=None
    setattr(o,path,keys[0][1])
clip(nodes['Turret'],'Turret_Sweep','rotation_euler',[(1,(0,0,0)),(31,(0,0,.70)),(61,(0,0,-.70)),(91,(0,0,0))])
barrel_base=nodes['Barrel'].location.copy()
clip(nodes['Barrel'],'Fire','location',[(1,barrel_base.copy()),(3,barrel_base+Vector((0,.23,0))),
     (6,barrel_base+Vector((0,.17,0))),(17,barrel_base.copy())])
for name,o in nodes.items():
    if name.startswith('Wheel_'):
        clip(o,'Drive','rotation_euler',[(1,(0,0,0)),(31,(2*math.pi,0,0))],True)
scene.frame_start=1; scene.frame_end=91; scene.frame_set(1)
camera_angle(43,30); scene.render.resolution_x=1280; scene.render.resolution_y=960; scene.cycles.samples=32
bpy.ops.object.select_all(action='DESELECT')
for o in asset: o.select_set(True)
bpy.context.view_layer.objects.active=nodes['Hull']
# Export only the tank; the studio, lights and camera are excluded.
available=bpy.ops.export_scene.gltf.get_rna_type().properties
opts={'filepath':str(OUT/'light_tank.glb'),'export_format':'GLB','use_selection':True,
      'export_yup':True,'export_animations':True,'export_animation_mode':'NLA_TRACKS',
      'export_nla_strips':True,'export_force_sampling':True,'export_frame_range':False,
      'export_apply':True,'export_cameras':False,'export_lights':False}
opts={k:v for k,v in opts.items() if k in available}
print('OUTRAGE Export options',opts,flush=True)
bpy.ops.export_scene.gltf(**opts)
for screen in bpy.data.screens:
    for area_ob in screen.areas:
        if area_ob.type=='VIEW_3D':
            sp=area_ob.spaces.active; sp.region_3d.view_distance=9; sp.region_3d.view_location=(0,-.4,1.2)
            sp.region_3d.view_rotation=cam.rotation_euler.to_quaternion(); sp.shading.type='MATERIAL'
scene.render.filepath=str(OUT/'light_tank_hero.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'light_tank.blend'))
tri=0
for o in nodes.values(): o.data.calc_loop_triangles(); tri+=len(o.data.loop_triangles)
report={'asset':'Project Outrage / light tank','mesh_objects':len(nodes),'triangles':tri,
        'materials':sorted(set(m.name for o in nodes.values() for m in o.data.materials if m)),
        'clips':['Drive','Fire','Turret_Sweep'],'nodes':list(nodes)+['OUTRAGE_LightTank','Muzzle'],
        'orientation':'Blender -Y forward, +Z up; glTF +Z forward, +Y up',
        'animation_note':'Drive rotates road wheels; tread belts are static geometry.',
        'source_reference':'Existing eight-direction lite_tank and lite_tank_muzzle atlases',
        'game_integration':'Model asset only; existing Canvas2D game renderer is unchanged.'}
(OUT/'asset_report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print('OUTRAGE COMPLETE',json.dumps(report),flush=True)
