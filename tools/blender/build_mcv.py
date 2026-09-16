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
# Real-time reference vehicle. The existing detailed yard exterior is articulated
# separately by hq_assembly.js. All vehicle poses use rigid parts.
glass=material('Cab | smoked blue glass',(.018,.029,.049),.45,.22)
lamps=material('Headlights | warm glass',(.78,.74,.55),.2,.28)
origins={'Hull':(0,0,0)}; tracks={}; parents={}
def moving(name,origin=(0,0,0),parent='Hull',start=0,end=90,stow=(0,0,0),angles=(0,0,0)):
 origins[name]=origin;parents[name]=parent;tracks[name]=(start,end,stow,angles)
def beam(name,a,b,r,mat,group):
 a,b=Vector(a),Vector(b);o=cylinder(name,(a+b)/2,r,(b-a).length,mat,group,vertices=8,rad=0)
 o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o
# Vehicle chassis sinks only as deck rails take its load. Wheels fold inward.
moving('Chassis',start=12,end=48,stow=(0,0,1.1))
box('Truck ladder frame',(0,0,-.3),(2.8,8.45,.42),steel,'Chassis',.08)
box('Truck running floor',(0,0,-.04),(3.15,8.30,.12),panel,'Chassis',.03)
for s in (-1,1):
 for j,y in enumerate((-3,-1.48,1.55,3.08)):
  n=f'Wheel_{"L" if s<0 else "R"}_{j}';moving(n,(s*1.48,y,.05),start=6,end=35,stow=(s*.13,0,.62),angles=(0,0,0))
  cylinder('Rubber tire',(s*1.48,y,.05),.65,.48,rubber,n,'X',32,.03)
  cylinder('Steel wheel',(s*1.75,y,.05),.39,.06,steel,n,'X',24)
  cylinder('Faction wheel hub',(s*1.795,y,.05),.265,.07,team,n,'X',24)
  cylinder('Axle cap',(s*1.84,y,.05),.10,.08,edge,n,'X',16)
  for k in range(6):
   a=k*math.tau/6;cylinder('Wheel lug',(s*1.84,y+math.sin(a)*.19,.05+math.cos(a)*.19),.025,.04,edge,n,'X',8,0)
# A continuous cab: no central split. Slides under the front entrance deck.
moving('Cab',(0,-1.93,1.3),start=8,end=43,angles=(-math.pi/2,0,0))
cab_start=set(bpy.data.objects)
box('Cab lower',(0,-3.11,-1.05),(3.16,2.35,.64),armor,'Cab',.18)
loft('One piece rounded cab',[rect_ring(1.57,-4.16,-2.10,.22,-.84),rect_ring(1.42,-3.94,-2.16,.32,.55),rect_ring(1.32,-3.77,-2.24,.36,.67)],team,'Cab',.10)
box('Wide windshield',(0,-4.02,-.04),(2.51,.055,.71),glass,'Cab',.08,rotation=(math.radians(-9),0,0))
box('Silver windshield lower trim',(0,-4.15,-.56),(2.80,.06,.09),edge,'Cab',.025)
box('Radiator grille',(0,-4.31,-1.02),(1.50,.05,.50),black,'Cab',.04)
for z in (-1.20,-1.08,-.96,-.84):box('Radiator chrome slat',(0,-4.35,z),(1.43,.04,.035),edge,'Cab',.005)
box('Front bumper',(0,-4.43,-1.45),(3.30,.29,.23),edge,'Cab',.08)
for s in (-1,1):
 box('Cab side window',(s*1.46,-2.98,-.06),(.045,1.24,.69),glass,'Cab',.07)
 box('Door seam',(s*1.59,-2.44,-.78),(.024,.035,.56),black,'Cab',.005)
 box('Door handle',(s*1.61,-2.48,-.46),(.08,.30,.07),edge,'Cab',.015)
 box('Headlamp',(s*1.18,-4.30,-1.12),(.38,.08,.26),lamps,'Cab',.045)
 box('Wheel mudguard',(s*1.47,-2.41,-1.17),(.38,3.13,.23),edge,'Cab',.07)
 cylinder('Exhaust stack',(s*1.21,-1.95,-.05),.075,1.63,steel,'Cab',vertices=12)
 beam('Mirror stalk',(s*1.45,-3.52,.10),(s*1.86,-3.44,.08),.035,steel,'Cab')
 box('Mirror',(s*1.86,-3.44,.11),(.13,.23,.39),steel,'Cab',.045)
# Rotate the complete cab down on its rear hinge; stowed inverse pose restores
# the original single cab exactly. It becomes the recessed entry machinery.
cab_pivot=Vector(origins['Cab'])
for o in set(bpy.data.objects)-cab_start:
 o.matrix_world=Matrix.Translation(cab_pivot)@Matrix.Rotation(math.pi/2,4,'X')@Matrix.Translation(-cab_pivot)@Matrix.Translation((0,0,2.8))@o.matrix_world
# Central equipment cassette and continuous rounded rear container.
moving('Engine',start=10,end=44,stow=(0,0,2.8))
box('Engine equipment pack',(0,-1.45,-.44),(3.04,1.18,1.83),armor,'Engine',.14)
for s in (-1,1):
 box('Engine louvre recess',(s*1.54,-1.48,-.65),(.035,.75,.91),black,'Engine',.01)
 for z in (-.99,-.80,-.61,-.42,-.23):box('Engine vent',(s*1.57,-1.48,z),(.05,.67,.035),edge,'Engine',.005)
 cylinder('Fuel reservoir',(s*1.1,-.55,-1.50),.31,1.18,steel,'Engine','Y',24,.02)
# Container halves hinge open before any internal machinery lifts.
for s in (-1,1):
 n=f'Container_{s}';moving(n,(s*1.45,.0,1.22),start=0,end=27,stow=(0,0,0),angles=(0,s*math.pi/2,0))
 # Geometry is authored in the final open pose, then rotated upright when stowed.
 # Build closed shell first and rotate its vertices around the real lower hinge.
 before=set(bpy.data.objects)
 rings=[]
 for y in (-.82,-.65,3.64,3.82):
  r=.86 if y in (-.82,3.82) else 1
  ring=[]
  for k in range(9):
   a=(k/8)*math.pi/2
   ring.append((s*(.02+1.46*r*math.sin(a)),y,1.72+1.52*r*math.cos(a)))
  ring += [(s*1.48,y,1.42),(s*.02,y,1.42)]
  rings.append(ring)
 loft('Silver rounded container shell',rings,armor,n,.035)
 box('Capsule side faction inset',(s*1.485,1.51,2.32),(.035,3.86,.30),team,n,.03)
 for y in (-.50,1.48,3.45):
  box('Container top panel joint',(s*.55,y,3.115),(1.0,.07,.035),steel,n,.005)
  box('Capsule hoop side',(s*1.51,y,2.08),(.07,.10,1.0),edge,n,.01)
 for y in ((.24,) if s<0 else (2.52,)):
  cylinder('Container top hatch',(0,y,3.22),.30,.06,edge,n,vertices=24)
  cylinder('Hatch inset',(0,y,3.27),.23,.035,steel,n,vertices=24)
 # Final panels lie outward, forming the underside of the main roof.
 pivot=Vector(origins[n]);rot=Matrix.Rotation(-s*math.pi/2,4,'Y')
 for o in set(bpy.data.objects)-before:
  o.matrix_world=Matrix.Translation(pivot)@rot@Matrix.Translation(-pivot)@o.matrix_world
# Ground stabilizers take the vehicle load before the cab and shell hinges move.
for sx in (-1,1):
 for sy in (-1,1):
  n=f'Stabilizer_{sx}_{sy}';moving(n,start=0,end=12,stow=(0,0,.65))
  x,y=sx*1.30,sy*3.86
  cylinder('Hydraulic stabilizer',(x,y,.61),.105,.76,edge,n,vertices=12)
  cylinder('Stabilizer sleeve',(x,y,.87),.155,.32,steel,n,vertices=12)
  box('Ground foot',(x,y,.19),(.60,.64,.16),steel,n,.035)
# Deck outriggers telescope out beneath the original-art building panels.
for sx in (-1,1):
 for sy in (-1,1):
  for j in range(3):
   n=f'Rail_{sx}_{sy}_{j}';x=sx*(j+1)*1.9;y=sy*2.35
   moving(n,start=2,end=29,stow=(-x,0,0))
   box('Telescoping deck rail',(x,y,.46-j*.08),(3.8,.21,.14),steel,n,.018)
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
 for f,p in [(0,1),(start,1),(end,0),(90,0)]:
  o.location=loc+Vector(off)*p;o.rotation_euler=tuple(a*p for a in angles)
  o.keyframe_insert(data_path='location',frame=f);o.keyframe_insert(data_path='rotation_euler',frame=f)
 a=o.animation_data.action;a.name='Deploy_'+name;o.animation_data.action=None
 tr=o.animation_data.nla_tracks.new();tr.name='Deploy';tr.strips.new('Deploy',0,a)
scene.frame_start=0;scene.frame_end=90;scene.frame_set(0)
bpy.ops.object.select_all(action='SELECT');bpy.context.view_layer.objects.active=nodes['Hull']
bpy.ops.export_scene.gltf(filepath=str(OUT/'mcv.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_force_sampling=True,export_apply=True)
(OUT/'contract.json').write_text(json.dumps({'clip':'Deploy','authoringSeconds':3,'runtimeSeconds':.8,'nodes':list(origins),'moving':list(tracks),'worldUnitsPerMetre':20,'heading':'+Z','up':'+Y','constantScale':True,'settledYard':'asset/sprite/const/normal/con_yard_n.png','buildingAssembly':'js/hq_assembly.js'},indent=2))
def aim(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
for name,loc,power,size in [('Key',(-8,-12,23),6000,12),('Fill',(12,-3,17),2000,10),('Rim',(0,10,20),3000,10)]:
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.size=size;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=loc;aim(o,(0,0,4))
d=bpy.data.cameras.new('Review');cam=bpy.data.objects.new('Review',d);scene.collection.objects.link(cam);cam.location=(25,-25,20.412);aim(cam,(0,0,0));d.type='ORTHO';scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=12;scene.cycles.use_denoising=True
scene.render.resolution_x=1000;scene.render.resolution_y=1000;scene.render.resolution_percentage=100;scene.world.color=(.2,.2,.2);scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'mcv.blend'))
for f in (0,30,60,90):
 scene.frame_set(f);d.ortho_scale=39 if f else 14;cam.location=(25,-25,20.412+(6 if f else 1));aim(cam,(0,0,6 if f else 1));scene.render.filepath=str(OUT/f'mcv-{f}.png');bpy.ops.render.render(write_still=True)
print('MCV_COMPLETE',flush=True)
