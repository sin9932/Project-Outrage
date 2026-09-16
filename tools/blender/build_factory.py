"""Project Outrage war factory. Blender 5.1; meters, +Z up, -Y forward.
Run: blender --background --factory-startup --python build_factory.py -- OUTPUT
Articulated reconstruction from the supplied war factory reference.
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

armor = material('Armor | silver', (.48,.55,.57), .48,.38)
edge = material('Armor | machined edges', (.46,.44,.37), .62,.32)
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


# Contract: 3x4 tiles, scale=20, Blender -Y is the vehicle exit.
# Reference: battered olive armor, projecting portal, paired ribbed roof leaves.
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
 rng=np.random.default_rng(seed); n=256
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
 # Store sRGB pixels: glTF color maps are decoded as sRGB by the game renderer.
 rgba[:,:,:3]=np.where(rgba[:,:,:3]<=.0031308,12.92*rgba[:,:,:3],1.055*np.power(rgba[:,:,:3],1/2.4)-.055)
 im=bpy.data.images.new(mat.name+' albedo',width=n,height=n)
 im.colorspace_settings.name='sRGB';im.pixels.foreach_set(rgba.ravel());im.pack()
 tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=im
 mat.node_tree.links.new(tex.outputs['Color'],mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
for i,m in enumerate([concrete,trim,roofmat,dirt]):weather(m,71+i)
box('Foundation',(0,0,.1),(16.2,21.6,.2),dirt,'Hull',.1)
box('Interior floor',(0,0,.25),(12.2,19,.3),steel,'Floor',.03)
for x in (-3.,3.):box('Floor guide',(x,-1,.42),(.09,16,.025),yellow,'Floor',0)
def side_section(name,side,y0,y1,z0,z1,outer0,outer1,inner,mat,group):
 v=[(side*x,y,z) for z,outer in [(z0,outer0),(z1,outer1)] for x,y in [(inner,y0),(outer,y0),(outer,y1),(inner,y1)]]
 faces=[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
 if side<0:faces=[tuple(reversed(f)) for f in faces]
 return mesh(name,v,faces,mat,group,.07)
for side in (-1,1):
 group='WallL' if side<0 else 'WallR'
 side_section('Sloped armored wall',side,-9.3,10,.2,6.25,7.95,6.65,6.15,concrete,group)
 side_section('Weathered wall foot',side,-9.31,10.01,.22,.85,7.97,7.84,7.45,dirt,group)
 side_section('Faction wall belt',side,-9.33,10.03,2.05,2.6,7.57,7.45,7.35,team,group)
 for y in (-8,-4,0,4,8):
  ob=loft('Tapered structural pier',[rect_ring(.88,-.68,.68,.16,.22),rect_ring(.82,-.64,.64,.14,1.0),rect_ring(.54,-.56,.56,.13,5.85),rect_ring(.39,-.46,.46,.10,6.25)],trim,group,.07)
  ob.location=(side*7.45,y,0)
  box('Pier faction band',(side*8.20,y,2.30),(.08,1.26,.55),team,group,.01)
  box('Recessed pier grille',(side*8.07,y,4.3),(.10,.66,.85),black,group,.025)
  for z in (3.98,4.12,4.26,4.40,4.54):box('Grille louvre',(side*8.13,y,z),(.035,.59,.04),steel,group,0)
 for y in (-6,-2,2,6):
  box('Wall panel seam',(side*7.16,y,4.65),(.035,.045,1.7),panel,group,0)
  cylinder('Utility pipe',(side*7.76,y,1.60),.095,2.6,edge,group,axis='Y',vertices=12)
  box('Wall light',(side*7.89,y,1.67),(.07,1.75,.12),light,group,.02)
 # Reinforced side personnel door, facing outward.
 box('Service door frame',(side*8.12,5.85,1.9),(.28,2.1,3.25),trim,group,.13)
 box('Service door inset',(side*8.29,5.85,1.85),(.055,1.57,2.72),steel,group,.025)
 for z in [1.0+i*.16 for i in range(12)]:box('Service door ribs',(side*8.34,5.85,z),(.035,1.36,.055),panel,group,0)
box('Rear armored wall',(0,9.8,3.2),(13.5,1.5,6.0),concrete,'Rear',.20)
# Projecting, battered portal cheeks flank a genuinely recessed doorway.
for x in (-5.5,5.5):
 ob=loft('Massive gate cheek',[rect_ring(1.60,-1.4,1.1,.25,.2),rect_ring(1.45,-1.25,1.0,.22,1.0),rect_ring(.95,-.70,.80,.18,5.75),rect_ring(.78,-.5,.65,.12,6.15)],trim,'Front',.09);ob.location=(x,-9.35,0)
 box('Gate faction belt',(x,-10.50,2.3),(2.7,.10,.55),team,'Front',.015)
 box('Gate lower weathering',(x,-10.70,.56),(2.8,.12,.65),dirt,'Front',.04)
 cylinder('Warning beacon',(x,-10.2,5.85),.17,.32,yellow,'Front',vertices=12)
box('Portal lintel',(0,-9.7,5.75),(10.4,2.1,.85),concrete,'Front',.15)
for x in (-3,-1,1,3):box('Lintel armor cap',(x,-10.45,6.03),(1.82,1.1,.42),trim,'Front',.08)
box('Safety header',(0,-10.79,5.24),(8.4,.06,.31),yellow,'Front',.015)
for x in range(-4,5):box('Hazard slash',(x,-10.84,5.24),(.33,.035,.35),steel,'Front',0,rotation=(0,.45,0))
box('Shutter',(0,-9.15,2.9),(8.5,.32,4.6),steel,'Door',.035)
for z in [.7+i*.4 for i in range(12)]:box('Shutter rib',(0,-9.34,z),(8.4,.065,.07),panel,'Door',.005)
# Shallow sloped ramp preserves the existing ground-height dispatch contract.
mesh('Sloping apron',[(-4.25,-9.35,.42),(4.25,-9.35,.42),(4.25,-13,.04),(-4.25,-13,.04),(-4.25,-9.35,0),(4.25,-9.35,0),(4.25,-13,0),(-4.25,-13,0)],[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],steel,'Ramp',.025)
for i in range(13):
 y=-9.5-i*.26;z=.42+(y+9.35)*.104
 for x in (-2.25,2.25):box('Ramp traction tread',(x,y,z+.035),(3.2,.09,.055),trim,'Ramp',.01)
for x in (-4.7,4.7):
 # Prominent diagonal guide rails run from lintel down to apron corners.
 a=Vector((x,-10.25,5.15));b=Vector((x,-13,.5));mid=(a+b)/2
 o=box('Diagonal portal brace',mid,(.65,.65,(b-a).length),trim,'Front',.07);o.rotation_euler=(a-b).to_track_quat('Z','Y').to_euler()
 for dx in (-.19,.19):
  o=box('Silver ramp guide',mid+Vector((dx,-.43,0)),(.09,.09,(b-a).length),edge,'Front',.02);o.rotation_euler=(a-b).to_track_quat('Z','Y').to_euler()
 box('Apron corner block',(x,-12.75,.42),(1.1,1.1,.8),concrete,'Ramp',.08)
 cylinder('Apron beacon',(x,-12.75,.98),.14,.28,yellow,'Ramp',vertices=12)
# Segmented roof follows a shallow ridge; leaves retain independent long-edge pivots.
for side in (-1,1):
 group='RoofL' if side<0 else 'RoofR'
 for y in (-7.15,-3.65,-.15,3.35,6.85):
  box('Roof panel',(side*3.12,y,6.58),(6.1,3.33,.34),roofmat,group,.07,rotation=(0,side*.065,0))
  for yy in (y-1.55,y+1.55):box('Raised roof frame',(side*3.12,yy,6.86),(6.12,.16,.19),trim,group,.025,rotation=(0,side*.065,0))
  for xx in (side*.25,side*5.96):box('Roof longitudinal frame',(xx,y,6.86-side*xx*.065),(.17,3.25,.18),trim,group,.025)
  box('Roof recessed seam',(side*3.12,y,6.87),(.1,3.05,.065),panel,group,.01)
# Rear deck and paired fan housings.
box('Rear service deck',(0,9.1,6.1),(13.3,3.1,.45),concrete,'Equipment',.12)
for x in (-4.5,4.5):
 box('Fan housing',(x,9.1,6.62),(4.1,2.4,.8),trim,'Equipment',.14)
 for dx in (-.98,.98):
  cylinder('Fan recess',(x+dx,9.1,7.05),.72,.07,black,'Equipment',vertices=20)
  for a in range(5):box('Fan blades',(x+dx,9.1,7.11),(.14,1.22,.055),steel,'Equipment',.01,rotation=(0,0,a*math.pi/5))
  cylinder('Fan hub',(x+dx,9.1,7.15),.16,.08,edge,'Equipment',vertices=12)
 for xx in [x-1.65+i*.3 for i in range(12)]:box('Housing front grille',(xx,7.87,6.61),(.09,.05,.49),steel,'Equipment',0)
 cylinder('Antenna',(x,10.0,8.0),.04,3.,steel,'Equipment',vertices=8)
# Small service props match the reference without occupying the vehicle lane.
wood=material('Crates | olive',(.15,.16,.075),.03,.9)
barrel=material('Barrels | rust brown',(.23,.11,.045),.3,.8)
for side in (-1,1):
 for i in range(3):
  x=side*(6.6+(i%2)*.8);y=-11.3+(i//2)*.85
  cylinder('Service barrel',(x,y,.6),.34,1.05,barrel,'Front',vertices=14,rad=.025)
  for z in (.23,.94):cylinder('Barrel hoop',(x,y,z),.355,.07,steel,'Front',vertices=14,rad=0)
 for i in range(3):
  loc=(side*8.5,-2.3+i*.85,.43+(i==1)*.4)
  box('Supply crate',loc,(.85,.72,.65),wood,'WallL' if side<0 else 'WallR',.035)
# Faction insignias: raised ring and three swept prongs on the portal cheeks.
for x in (-5.5,5.5):
 bpy.ops.mesh.primitive_torus_add(major_radius=.35,minor_radius=.055,major_segments=24,minor_segments=6,location=(x,-10.49,3.6),rotation=(math.pi/2,0,0))
 tag(bpy.context.object,'Faction insignia ring',team,'Front')
 for a in (0,math.tau/3,math.tau*2/3):
  coords=[]
  for px,pz in [(-.1,.05),(.12,.1),(.05,.65),(-.2,.44)]:
   coords.append((x+px*math.cos(a)-pz*math.sin(a),-10.51,3.6+px*math.sin(a)+pz*math.cos(a)))
  mesh('Faction insignia prong',coords,[(0,1,2,3),(3,2,1,0)],team,'Front')
for x in (-4.8,4.8):
 for y in (-4,1,6):
  box('Interior work station',(x,y,1.0),(1.3,2.5,1.4),panel,'Floor',.06)
  box('Interior instrument panel',(x,y-1.28,1.35),(.8,.045,.3),light,'Floor',.02)
# Consistent object-space box projection, including custom sloped wall meshes.
for objs in parts.values():
 for o in objs:
  if o.type!='MESH':continue
  uv=o.data.uv_layers.active or o.data.uv_layers.new(name='UVMap')
  for poly in o.data.polygons:
   axis=max(range(3),key=lambda a:abs(poly.normal[a]));axes=[a for a in range(3) if a!=axis]
   for li in poly.loop_indices:
    v=o.data.vertices[o.data.loops[li].vertex_index].co+o.location
    uv.data[li].uv=(v[axes[0]]*.15,v[axes[1]]*.15)
nodes={}
origins=[('Hull',(0,0,0)),('Floor',(0,0,0)),('WallL',(0,0,0)),('WallR',(0,0,0)),('Rear',(0,0,0)),('Front',(0,0,0)),('Ramp',(0,0,0)),('RoofFrame',(0,0,0)),('RoofL',(-6.2,0,6.4)),('RoofR',(6.2,0,6.4)),('Door',(0,-9.15,5.2)),('Equipment',(0,0,0))]
for name,origin in origins:
 o=bpy.data.objects.new(name,None);scene.collection.objects.link(o);o.location=origin;nodes[name]=o
bpy.context.view_layer.update()
for group,objs in parts.items():
 for o in objs:
  matrix=o.matrix_world.copy();o.parent=nodes[group];o.matrix_world=matrix
bpy.context.view_layer.update()
for name in nodes:
 if name=='Hull':continue
 parent='RoofFrame' if name in ('RoofL','RoofR') else 'Front' if name=='Door' else 'Hull'
 o=nodes[name];matrix=o.matrix_world.copy();o.parent=nodes[parent];o.matrix_world=matrix;bpy.context.view_layer.update()
scene.frame_start=0;scene.frame_end=60;scene.render.fps=30
rest={k:(o.location.copy(),o.rotation_euler.copy(),o.scale.copy()) for k,o in nodes.items()}
def track(name,keys):
    o=nodes[name];loc,rot,scale=rest[name]
    for f,offset,angles,sc in keys:
        o.location=loc+Vector(offset);o.rotation_euler=angles;o.scale=sc
        o.keyframe_insert(data_path='location',frame=f,group='Assembly')
        o.keyframe_insert(data_path='rotation_euler',frame=f,group='Assembly')
        o.keyframe_insert(data_path='scale',frame=f,group='Assembly')
    o.animation_data.action.name='Build_'+name
    # glTF combines identically named NLA tracks into a single Build clip.
    action=o.animation_data.action;o.animation_data.action=None
    tr=o.animation_data.nla_tracks.new();tr.name='Build';tr.strips.new('Build',0,action)

for name,start,end,depth in [('Floor',0,12,3),('Ramp',5,18,3),('WallL',10,32,7),('WallR',15,37,7),('Rear',18,39,7),('Front',23,44,7),('RoofFrame',35,53,10),('Equipment',44,60,11)]:
 track(name,[(0,(0,0,-depth),(0,0,0),(1,1,1)),(max(1,start),(0,0,-depth),(0,0,0),(1,1,1)),(end,(0,0,0),(0,0,0),(1,1,1)),(60,(0,0,0),(0,0,0),(1,1,1))])
scene.frame_set(60);bpy.context.view_layer.update()
asset=list(scene.objects);bpy.ops.object.select_all(action='DESELECT')
for o in asset:o.select_set(True)
bpy.context.view_layer.objects.active=nodes['Hull']
bpy.ops.export_scene.gltf(filepath=str(OUT/'factory.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_force_sampling=True,export_apply=True)
def aim(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
for name,loc,power,size in [('Key',(-12,-18,30),8500,18),('Fill',(18,-5,20),4500,16),('Rim',(0,20,25),6500,12)]:
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.size=size;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=loc;aim(o,(0,0,3))
d=bpy.data.cameras.new('Review');o=bpy.data.objects.new('Review',d);scene.collection.objects.link(o);o.location=(-32,-40,31);aim(o,(0,-1,2));d.type='ORTHO';d.ortho_scale=37;scene.camera=o
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.resolution_x=1100;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.world.color=(.15,.15,.15);scene.render.film_transparent=True
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(OUT/'factory-preview.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'factory.blend'));bpy.ops.render.render(write_still=True)
print('FACTORY_COMPLETE')
