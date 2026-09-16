"""Project Outrage MCV and deployable construction yard. Blender 5.1; meters, +Z up, -Y forward.
Run: blender --background --factory-startup --python build_mcv.py -- OUTPUT
Rigid articulated reconstruction from the supplied MCV and construction yard references.
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

armor = material('Armor | silver', (.23,.255,.25), .48,.48)
edge = material('Armor | machined edges', (.32,.31,.27), .62,.40)
panel = material('Armor | recessed panels', (.19,.18,.15), .4,.46)
rubber = material('Tracks | charcoal rubber', (.018,.023,.025), .12,.62)
steel = material('Tracks | dark steel', (.075,.085,.083), .68,.43)
team = material('TeamColor | orchid', (.95,.25,.025), .25,.34)
teamdark = material('TeamColor | recessed orchid', (.45,.07,.008), .25,.43)
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

def bevel(obj, width=.035, seg=1):
    if width and width >= .02:
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


import numpy as np
concrete=material('Concrete | weathered olive',(.145,.14,.105),.05,.87)
trim=material('Trim | worn concrete',(.22,.215,.165),.12,.76)
roofmat=material('Roof | olive panels',(.175,.17,.125),.18,.73)
dirt=material('Foundation | oxidized grime',(.105,.075,.041),.03,.95)
yellow=material('Safety | amber',(.63,.40,.045),.12,.55)
light=material('Interior | lamps',(.65,.78,.77),.1,.3)
team.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.46,.025,.32,1)
team.diffuse_color=(.46,.025,.32,1)
# Packed raster albedo survives glTF export; no Blender-only procedural shader.
def weather(mat,seed):
 rng=np.random.default_rng(seed); n=512
 yy,xx=np.mgrid[0:n,0:n]/n
 noise=np.zeros((n,n))
 # Isotropic filtered noise avoids the artificial crosshatch of sine products.
 fy=np.fft.fftfreq(n)[:,None];fx=np.fft.fftfreq(n)[None,:]
 for scale,amp in [(18,.04),(7,.025),(2,.012)]:
  field=np.fft.ifft2(np.fft.fft2(rng.standard_normal((n,n)))*np.exp(-(fx*fx+fy*fy)*scale*scale*20)).real
  noise+=field/(field.std()+1e-6)*amp
 noise+=rng.uniform(-.018,.018,(n,n))
 base=np.array(mat.diffuse_color[:3]);rgba=np.ones((n,n,4),dtype=np.float32)
 rgba[:,:,:3]=np.clip(base[None,None,:]*(.88+noise[:,:,None]*2),0,1)
 # Vertical wall UVs are measured from ground: irregular splash dirt and runoff.
 if mat in (concrete,trim):
  stripe=np.zeros((n,n))
  for _ in range(40):
   cx=rng.uniform(0,1);width=rng.uniform(.002,.012);height=rng.uniform(.08,.6)
   stripe+=np.exp(-((xx-cx)/width)**2)*np.maximum(0,1-yy/height)*rng.uniform(.12,.4)
  splash=np.clip((.18-yy+noise*.27)/.2,0,.85)
  grime=np.clip(splash+stripe,0,.8)
  rgba[:,:,:3]*=(1-grime[:,:,None]*.70)
  rgba[:,:,:3]+=grime[:,:,None]*np.array([.025,.012,.004])
 # Store sRGB pixels: glTF color maps are decoded as sRGB by the game renderer.
 rgba[:,:,:3]=np.where(rgba[:,:,:3]<=.0031308,12.92*rgba[:,:,:3],1.055*np.power(rgba[:,:,:3],1/2.4)-.055)
 im=bpy.data.images.new(mat.name+' albedo',width=n,height=n)
 im.colorspace_settings.name='sRGB';im.pixels.foreach_set(rgba.ravel());im.pack()
 tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=im
 mat.node_tree.links.new(tex.outputs['Color'],mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
for i,m in enumerate([armor,edge,panel,concrete,trim,roofmat,dirt]):weather(m,71+i)
# Eight-wheel MCV. Rigid modules never change scale, mesh, or visibility.
# Deployment is a real, reversible hierarchy of sliding rails and rotating hinges.
glass=material('Cab | smoked blue glass',(.018,.035,.055),.45,.2)
lamps=material('Headlights | ivory',(.72,.70,.44),.2,.25)
origins={'Hull':(0,0,0)}; tracks={}; parents={}
def moving(name,origin=(0,0,0),parent='Hull',start=0,end=90,offset=(0,0,0),angles=(0,0,0)):
 origins[name]=origin;parents[name]=parent;tracks[name]=(start,end,offset,angles)
box('Longitudinal chassis',(0,0,.78),(2.45,8.3,.38),steel,'Hull',.08)
box('Central underfloor',(0,0,.44),(2.55,7.9,.22),panel,'Hull',.04)
# Telescoping floor leaves: stowed on distinct Z levels underneath the chassis.
for s in (-1,1):
 for j in range(2):
  n=f'Deck_{s}_{j}';moving(n,start=8+j*5,end=30+j*7,offset=(s*(j+1)*2.0,0,-.035*j))
  box('Sliding foundation leaf',(0,0,.35-j*.06),(2.5,8.2,.055),concrete,n,.01)
  for y in (-3.9,3.9):box('Deck border',(0,y,.4-j*.06),(2.45,.10,.035),edge,n,.01)
# Four self-contained corners carry suspension, wheels, armor, and roof fans.
for s in (-1,1):
 for f in (-1,1):
  n=f'Pod_{s}_{f}';oy=f*2.1;moving(n,start=6,end=40,offset=(s*3.0,f*1.2,-.1))
  box('Tracked sliding axle rail',(s*.85,oy,.90),(1.6,3.5,.25),steel,n,.04)
  box('Armored wheel fairing',(s*1.05,oy,1.55),(.95,3.60,.40),armor,n,.10)
  box('Faction side stripe',(s*1.57,oy,1.63),(.04,3.0,.18),team,n,.02)
  for j,y in enumerate([oy-.78,oy+.78]):
   wn=f'Wheel_{"L" if s<0 else "R"}_{(0 if f<0 else 2)+j}';origins[wn]=(s*1.35,y,.68);parents[wn]=n
   cylinder('Deep rubber tire',(s*1.35,y,.68),.64,.42,rubber,wn,'X',24,.035)
   cylinder('Recessed hub',(s*1.59,y,.68),.39,.035,steel,wn,'X',20)
   cylinder('Faction hubcap',(s*1.62,y,.68),.27,.04,team,wn,'X',16)
   for k in range(6):
    a=k*math.tau/6;cylinder('Lug bolt',(s*1.65,y+math.sin(a)*.19,.68+math.cos(a)*.19),.035,.025,edge,wn,'X',8,0)
  # Curved container quarters become the side housings of the deployed yard.
  cy=oy if f>0 else -.9
  half=1.66 if f>0 else .64
  rings=[]
  for z,w in [(1.72,.65),(2.0,.82),(2.7,.76),(3.1,.55)]:
   rings.append([(x+s*.85,y+cy,pz) for x,y,pz in rect_ring(w,-half,half,.21,z)])
  loft('Armored container quarter',rings,armor,n,.025)
  box('Service stripe',(s*1.64,cy,2.40),(.03,half*1.5,.31),team,n,.02)
  for y in (cy-half*.7,cy+half*.7):box('Container structural rib',(s*.85,y,3.08),(1.15,.12,.12),edge,n,.02)
  cylinder('Cooling grille surround',(s*.85,cy,3.115),.46,.065,edge,n,vertices=24)
  cylinder('Fan cavity',(s*.85,cy,3.16),.38,.025,black,n,vertices=24)
  for k in range(5):box('Fan blade',(s*.85,cy,3.18),(.12,.66,.025),steel,n,.01,rotation=(0,0,k*math.tau/5))
  # Nested support rails fill the entire travel distance: no floating pods.
  for j in range(3):
   rn=f'Rail_{s}_{f}_{j}';moving(rn,start=6,end=40,offset=(s*(j+1)*1.0,f*(j+1)*.4,0))
   box('Hydraulic extension beam',(s*.45,oy,.60-j*.08),(2.15,.32,.18),edge,rn,.02)
  # Front cab is divided along an existing center seam and stays with front pods.
  if f<0:
   cn=f'CabHinge_{s}';moving(cn,(s*1.35,-2.25,1.2),n,44,72,(0,0,0),(0,s*math.pi/2,0))
   box('Cab lower',(s*.69,-3.15,1.59),(1.32,2.14,.63),armor,cn,.14)
   box('Purple cab shell',(s*.64,-3.1,2.31),(1.32,1.76,.98),team,cn,.18)
   box('Cab roof',(s*.64,-3.05,2.87),(1.34,1.72,.12),team,cn,.06)
   box('Windshield',(s*.67,-4.002,2.46),(1.04,.035,.5),glass,cn,.04)
   box('Side window',(s*1.35,-3.29,2.45),(.032,.82,.46),glass,cn,.04)
   box('Bumper',(s*.7,-4.27,1.13),(1.33,.22,.20),edge,cn,.06)
   box('Headlight',(s*1.06,-4.12,1.54),(.30,.08,.19),lamps,cn,.035)
   for z in (1.62,1.76,1.9):box('Cab radiator slit',(s*.34,-4.13,z),(.47,.07,.065),black,cn,.01)
   box('Door handle',(s*1.38,-2.86,2.07),(.06,.25,.06),edge,cn,.015)
   cylinder('Exhaust',(s*1.15,-1.96,2.61),.075,1.04,steel,cn,vertices=12)
  else:
   box('Rear stop lamp',(s*1.35,3.82,1.6),(.32,.08,.18),team,n,.02)
# Accordion roof wings stow vertically inside the container, hinge outward
# only after the pods have moved clear; each panel retains its physical dimensions.
for s in (-1,1):
 for f in (-1,1):
  n=f'RoofWing_{s}_{f}';origin=(s*.78,f*1.6,.5)
  moving(n,origin,start=28,end=57,offset=(0,0,2.35),angles=(0,s*math.pi/2,0))
  box('Folding armored roof',(s*.78,f*1.6,1.7),(.11,2.8,2.4),armor,n,.035)
  box('Roof central strip',(s*.85,f*1.6,1.7),(.035,2.0,.24),team,n,.01)
  for z in (.7,2.7):box('Roof seam stiffener',(s*.86,f*1.6,z),(.10,2.65,.10),edge,n,.02)
  # Corrugated side panels telescope out from the machinery cassette.
  wn=f'WallSlide_{s}_{f}';moving(wn,start=20,end=48,offset=(s*2.65,f*.9,0))
  box('Sliding wall cassette',(s*.35,f*1.45,1.9),(.22,2.85,1.8),panel,wn,.04)
  box('Wall armor field',(s*.49,f*1.45,1.92),(.09,2.55,.86),armor,wn,.03)
  box('Wall faction belt',(s*.55,f*1.45,1.95),(.035,2.30,.18),team,wn,.01)
  for y in (-.8,-.4,0,.4,.8):box('Wall cooling grille',(s*.55,f*1.45+y,1.45),(.03,.15,.22),black,wn,.005)
# End-wall halves stow lengthwise, then rotate across the front/rear.
# They meet the side cassettes and roof wings to form an enclosed building.
for s in (-1,1):
 for f in (-1,1):
  n=f'EndWall_{s}_{f}';moving(n,(s*.48,f*1.5,0),start=37,end=66,offset=(s*1.10,f*1.50,0),angles=(0,0,s*f*math.pi/2))
  box('End wall armored panel',(s*.48,f*1.5,1.8),(.13,3.05,2.05),armor,n,.035)
  box('End wall faction band',(s*.56,f*1.5,1.95),(.04,2.8,.25),team,n,.01)
  for y in (-1.25,1.25):box('End wall folded rib',(s*.57,f*1.5+y,1.8),(.12,.12,2.0),edge,n,.02)
  box('End wall footing',(s*.50,f*1.5,.80),(.22,3.03,.22),panel,n,.02)
  if f<0:
   box('Personnel hatch',(s*.57,f*1.5,1.55),(.05,.72,1.05),panel,n,.025)
   box('Door inspection glass',(s*.605,f*1.5,1.8),(.025,.48,.22),glass,n,.015)
# Nested tower segments: upper stages start inside the lower ones.
for j in range(4):
 n=f'Tower_{j}';moving(n,start=36+j*6,end=64+j*6,offset=(0,0,j*1.65+.20))
 w=1.14-j*.16
 for x in (-w,w):
  for y in (-w,w):box('Tower corner column',(x,y,1.95),(.14,.14,1.85),edge,n,.025)
 for z in (1.11,2.80):box('Tower collar',(0,0,z),(w*2+.25,w*2+.25,.20),armor,n,.04)
 for s in (-1,1):
  box('Tower panel',(s*w,0,1.95),(.08,w*1.6,1.56),panel,n,.03)
  box('Tower vertical faction stripe',(s*(w+.05),0,1.95),(.04,.26,1.4),team,n,.01)
 # Solid front/rear tower casings enclose the nested mechanical column.
 for f in (-1,1):
  box('Tower face armor',(0,f*w,1.95),(w*1.7,.10,1.56),armor,n,.025)
  box('Tower face stripe',(0,f*(w+.06),1.95),(.28,.035,1.38),team,n,.01)
  for z in (1.38,2.5):box('Inspection recess',(.48*w,f*(w+.07),z),(.25,.035,.16),black,n,.01)
# Crane housing, cantilever and extending nested boom. Carries same truck rear module.
moving('Head',start=42,end=82,offset=(0,0,5.35))
box('Crane machinery',(0,0,3.12),(2.0,2.6,.65),armor,'Head',.12)
for s in (-1,1):
 for y in (-.85,-.45,-.05,.35,.75):box('Head cooling slit',(s*1.01,y,3.12),(.03,.19,.35),black,'Head',.01)
box('Head faction strip',(0,1.32,3.1),(1.55,.025,.16),team,'Head',.01)
moving('Boom',(0,-.95,3.55),'Head',64,87,(0,0,0),(0,0,-math.pi/2))
box('Folded primary boom',(0,-.12,3.55),(.64,1.75,.42),armor,'Boom',.06)
for j in range(2):
 n=f'BoomSlide_{j}';moving(n,(0,0,0),'Boom',76+j*2,90,(0,(j+1)*1.38,0))
 box('Nested crane boom',(0,-.12,3.55),(.48-j*.13,1.7,.30-j*.08),edge,n,.03)
 box('Boom faction band',(0,.4,3.73-j*.04),(.44-j*.1,.27,.03),team,n,.01)
# Stowed supplies are always present, mounted in the rear service rack.
for s in (-1,1):
 n=f'Pod_{s}_1'
 for j in range(2):
  x=s*(.65+j*.55);y=3.42
  cylinder('Supply drum',(x,y,2.2),.23,.65,panel,n,vertices=16)
  for z in (1.96,2.43):cylinder('Drum rolled rim',(x,y,z),.245,.05,edge,n,vertices=16)
 box('Spare parts crate',(s*.8,2.88,3.27),(.78,.55,.30),panel,n,.025)
 for x in (-.24,.24):box('Crate strap',(s*.8+x,2.88,3.43),(.045,.57,.035),edge,n,.005)
# Object UVs and one rigid mesh per group, preserving articulation nodes.
for group,objs in list(parts.items()):
 for o in objs:
  uv=o.data.uv_layers.active or o.data.uv_layers.new(name='UVMap')
  for poly in o.data.polygons:
   axes=[a for a in range(3) if a!=max(range(3),key=lambda a:abs(poly.normal[a]))]
   for li in poly.loop_indices:
    v=o.data.vertices[o.data.loops[li].vertex_index].co+o.location;uv.data[li].uv=(v[axes[0]]*.3,v[axes[1]]*.3)
  bpy.context.view_layer.objects.active=o
  for mod in list(o.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
 bpy.ops.object.select_all(action='DESELECT')
 for o in objs:o.select_set(True)
 bpy.context.view_layer.objects.active=objs[0];bpy.ops.object.join();parts[group]=[bpy.context.object]
nodes={}
for name,origin in origins.items():
 o=bpy.data.objects.new(name,None);scene.collection.objects.link(o);o.location=origin;nodes[name]=o
bpy.context.view_layer.update()
for name,objs in parts.items():
 for o in objs:m=o.matrix_world.copy();o.parent=nodes[name];o.matrix_world=m
bpy.context.view_layer.update()
for name,parent in parents.items():
 o=nodes[name];m=o.matrix_world.copy();o.parent=nodes[parent];o.matrix_world=m;bpy.context.view_layer.update()
for name,(start,end,off,angles) in tracks.items():
 o=nodes[name];loc=o.location.copy()
 for f,p in [(0,0),(start,0),(end,1),(90,1)]:
  o.location=loc+Vector(off)*p;o.rotation_euler=tuple(a*p for a in angles)
  o.keyframe_insert(data_path='location',frame=f);o.keyframe_insert(data_path='rotation_euler',frame=f)
 a=o.animation_data.action;a.name='Deploy_'+name;o.animation_data.action=None
 tr=o.animation_data.nla_tracks.new();tr.name='Deploy';tr.strips.new('Deploy',0,a)
scene.frame_start=0;scene.frame_end=90;scene.frame_set(0)
bpy.ops.object.select_all(action='SELECT');bpy.context.view_layer.objects.active=nodes['Hull']
bpy.ops.export_scene.gltf(filepath=str(OUT/'mcv.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_force_sampling=True,export_apply=True)
(OUT/'contract.json').write_text(json.dumps({'clip':'Deploy','seconds':3,'nodes':list(origins),'moving':list(tracks),'worldUnitsPerMetre':20,'heading':'+Z','up':'+Y','constantScale':True},indent=2))
def aim(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
for name,loc,power,size in [('Key',(-8,-12,18),5000,10),('Fill',(12,-3,12),2800,8),('Rim',(0,10,16),4000,8)]:
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.size=size;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=loc;aim(o,(0,0,2))
d=bpy.data.cameras.new('Review');cam=bpy.data.objects.new('Review',d);scene.collection.objects.link(cam);cam.location=(18,-26,22);aim(cam,(0,0,3));d.type='ORTHO';scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=16;scene.cycles.use_denoising=True
scene.render.resolution_x=1000;scene.render.resolution_y=850;scene.render.resolution_percentage=100;scene.world.color=(.15,.15,.15);scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'mcv.blend'))
for f in (0,30,60,90):
 scene.frame_set(f);d.ortho_scale=24 if f else 12;scene.render.filepath=str(OUT/f'mcv-{f}.png');bpy.ops.render.render(write_still=True)
print('MCV_COMPLETE',flush=True)
