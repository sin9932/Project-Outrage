"""Project Outrage war factory. Blender 5.1; meters, +Z up, -Y forward.
Run: blender --background --factory-startup --python build_factory.py -- OUTPUT
Independent reconstruction from the supplied sentry base and head references.
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
concrete=material('Concrete | olive grey',(.24,.255,.205),.12,.8)
trim=material('Trim | worn edges',(.42,.43,.35),.25,.63)
yellow=material('Safety | amber',(.8,.52,.06),.12,.48)
light=material('Interior | lamps',(.48,.77,.81),.1,.3)
box('Foundation',(0,0,.10),(16.2,21.6,.2),concrete,'Hull',.08)
box('Interior floor',(0,0,.24),(12.2,18.8,.22),steel,'Floor',.02)
for x in (-3.0,3.0):box('Floor guide',(x,-1,.36),(.09,16,.02),yellow,'Floor',0)
for side in (-1,1):
 group='WallL' if side<0 else 'WallR'
 box('Armored side',(side*7.2,0,3),(1.5,20,5.8),concrete,group,.18)
 box('Faction stripe',(side*8.01,0,2.55),(.06,19.3,.48),team,group,.015)
 for y in (-8,-4,0,4,8):
  loft('Buttress',[rect_ring(.68,-.62,.62,.10,.3),rect_ring(.5,-.45,.45,.10,5.65)],trim,group,.08).location=(side*7.95,y,0)
  box('Vent',(side*8.06,y,4.25),(.09,.64,.75),steel,group,.02)
  for z in (4.0,4.2,4.4):box('Vent slat',(side*8.12,y,z),(.025,.58,.035),panel,group,0)
 for y in (-6,2,6):box('Interior strip',(side*6.38,y,4.8),(.08,1.7,.11),light,group,.02)
box('Rear wall',(0,9.5,3),(13,1.2,5.8),concrete,'Rear',.12)
for x in (-5.4,5.4):
 box('Gate jamb',(x,-9.3,2.8),(2.0,1.6,5.4),trim,'Front',.16)
 box('Gate faction band',(x,-10.15,2.6),(1.95,.05,.55),team,'Front',.015)
 cylinder('Warning beacon',(x,-9.5,5.6),.19,.35,yellow,'Front')
box('Gate lintel',(0,-9.3,5.65),(12.6,1.7,1.0),concrete,'Front',.12)
box('Safety header',(0,-10.18,5.22),(8.5,.055,.28),yellow,'Front',.015)
for x in range(-4,5):box('Safety stripe',(x,-10.22,5.22),(.33,.03,.29),steel,'Front',0,rotation=(0,.45,0))
box('Shutter',(0,-9.15,2.9),(8.6,.32,4.6),steel,'Door',.035)
for z in [0.7+i*.4 for i in range(12)]:box('Shutter slat',(0,-9.34,z),(8.5,.065,.07),trim,'Door',.005)
box('Apron',(0,-11,.14),(9.0,3.6,.25),steel,'Ramp',.025)
for y in [-9.6-i*.27 for i in range(12)]:box('Ramp grip',(0,y,.285),(8.5,.07,.035),trim,'Ramp',0)
for x in (-4.5,4.5):box('Apron edge',(x,-11,.34),(.16,3.6,.4),yellow,'Ramp',.025)
# Full interior machinery is visible when either roof leaf opens.
for x in (-4.8,4.8):
 for y in (-4,1,6):
  box('Work station',(x,y,1.1),(1.4,2.6,1.65),panel,'Floor',.06)
  box('Station panel',(x,y-1.33,1.5),(.8,.045,.38),light,'Floor',.02)
# Two roof leaves, pivots on the outer long edges.
for side in (-1,1):
 group='RoofL' if side<0 else 'RoofR'
 box('Roof leaf',(side*3.12,0,6.4),(6.1,17.5,.30),concrete,group,.05)
 for y in (-8,-4,0,4,8):box('Roof cross rib',(side*3.12,y,6.62),(6.12,.18,.18),trim,group,.02)
 for x in (side*.25,side*5.95):box('Roof edge rib',(x,0,6.62),(.16,17.5,.18),trim,group,.02)
 for y in (-6,-2,2,6):box('Roof inset',(side*3.12,y,6.57),(5.2,3.45,.10),panel,group,.015)
# Rear equipment block stays clear of opening roof.
for x in (-4.8,4.8):
 box('Fan housing',(x,9.1,6.05),(4.5,2.6,1.0),trim,'Equipment',.08)
 for dx in (-1,1):
  cylinder('Fan well',(x+dx,9.1,6.59),.7,.08,black,'Equipment')
  for a in range(6):box('Fan blade',(x+dx,9.1,6.66),(.12,1.2,.04),steel,'Equipment',.01,rotation=(0,0,a*math.pi/3))
 cylinder('Antenna',(x,9.7,7.5),.045,2.6,steel,'Equipment',vertices=8)
 for y in (-7,7):
  cylinder('Pipe',(x/abs(x)*7.7,y,1.4),.14,2.1,edge,'Equipment')
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
for name,loc,power,size in [('Key',(-12,-18,30),14000,18),('Fill',(18,-5,20),9000,16),('Rim',(0,20,25),12000,12)]:
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.size=size;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=loc;aim(o,(0,0,3))
d=bpy.data.cameras.new('Review');o=bpy.data.objects.new('Review',d);scene.collection.objects.link(o);o.location=(30,-40,30);aim(o,(0,-1,2));d.type='ORTHO';d.ortho_scale=37;scene.camera=o
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.resolution_x=1100;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.world.color=(.15,.15,.15);scene.render.film_transparent=True
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(OUT/'factory-preview.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'factory.blend'));bpy.ops.render.render(write_still=True)
print('FACTORY_COMPLETE')
