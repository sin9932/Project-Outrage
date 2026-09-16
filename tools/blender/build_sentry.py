"""Project Outrage sentry gun. Blender 5.1; meters, +Z up, -Y forward.
Run: blender --background --factory-startup --python build_sentry.py -- OUTPUT
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

# Five fixed support outriggers, orange armored feet and exposed silver beams.
for i in range(5):
    a=2*math.pi*i/5
    x,y=math.sin(a),math.cos(a)
    box('Outrigger', (x*1.05,y*1.05,.20),(.30,1.75,.23),armor,'Hull',.035,rotation=(0,0,-a))
    box('Team foot',(x*1.88,y*1.88,.19),(.73,.70,.26),team,'Hull',.07,rotation=(0,0,-a))
    for j in (-1,1):
        cylinder('Foot bolt',(x*1.88+math.cos(a)*j*.22,y*1.88-math.sin(a)*j*.22,.35),.07,.07,steel,'Hull',vertices=8)
cylinder('Base flange',(0,0,.34),.67,.20,team,'Hull')
cylinder('Bearing',(0,0,.51),.48,.18,armor,'Hull')
cylinder('Bearing recess',(0,0,.62),.29,.06,black,'Hull')
cylinder('Stem',(0,0,.83),.24,.47,steel,'Turret')
cylinder('Rotating skirt',(0,0,1.04),.58,.19,armor,'Turret')
box('Orange receiver',(0,-.03,1.66),(1.28,1.36,1.12),team,'Turret',.14)
box('Top silver panel',(0,.05,2.25),(.83,.84,.08),armor,'Turret',.035)
cylinder('Top inspection lid',(0,.08,2.31),.28,.06,edge,'Turret')
# Side ammunition drums and dark endcaps.
for z in (1.36,1.96):
    cylinder('Ammo drum',(-.84,.14,z),.36,.92,team,'Turret','Y')
    for y in (-.33,.61):
        cylinder('Drum end',(-.84,y,z),.29,.045,steel,'Turret','Y')
box('Belt housing',(-.70,-.50,1.44),(.28,.28,.73),teamdark,'Turret')
for z in (1.21,1.39,1.57):
    box('Belt round',(-.88,-.66,z),(.25,.10,.10),edge,'Turret',.015)
cylinder('Gun collar',(0,-.76,1.77),.43,.27,armor,'Turret','Y')
cylinder('Rotating core',(0,-1.45,1.77),.15,1.20,steel,'Barrel','Y')
for i in range(3):
    a=i*math.pi*2/3
    x,z=.24*math.cos(a),1.77+.24*math.sin(a)
    cylinder('Barrel tube',(x,-1.45,z),.10,1.42,steel,'Barrel','Y',vertices=16)
    for y in (-1.0,-1.45,-1.89):
        cylinder('Orange barrel band',(x,y,z),.125,.13,team,'Barrel','Y',vertices=16)
    cylinder('Muzzle dark bore',(x,-2.18,z),.073,.018,black,'Barrel','Y',vertices=16)
nodes={}
for name,origin in [('Hull',(0,0,0)),('Turret',(0,0,.66)),('Barrel',(0,-.80,1.77)),('Muzzle',(0,-2.20,1.77))]:
    o=bpy.data.objects.new(name,None);scene.collection.objects.link(o);o.location=origin;nodes[name]=o
bpy.context.view_layer.update()
for group,objs in parts.items():
    for o in objs:
        matrix=o.matrix_world.copy();o.parent=nodes[group];o.matrix_world=matrix
bpy.context.view_layer.update()
for child,parent in [('Turret','Hull'),('Barrel','Turret'),('Muzzle','Barrel')]:
    o=nodes[child];matrix=o.matrix_world.copy();o.parent=nodes[parent];o.matrix_world=matrix
    bpy.context.view_layer.update()
asset=list(bpy.context.scene.objects)
bpy.ops.object.select_all(action='DESELECT')
for o in asset:o.select_set(True)
bpy.context.view_layer.objects.active=nodes['Hull']
bpy.ops.export_scene.gltf(filepath=str(OUT/'sentry.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_apply=True)
def aim(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
for name,loc,power,size in [('Key',(-4,-6,8),1200,5),('Fill',(5,-2,6),800,4),('Rim',(2,4,6),1000,3)]:
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size
    o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=loc;aim(o,(0,0,1))
d=bpy.data.cameras.new('Review');o=bpy.data.objects.new('Review',d);scene.collection.objects.link(o)
o.location=(6,-9,7);aim(o,(0,-.15,1));d.type='ORTHO';d.ortho_scale=6.8;scene.camera=o
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.resolution_x=900;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.world.color=(.12,.12,.12);scene.render.film_transparent=True
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(OUT/'sentry-preview.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'sentry.blend'))
bpy.ops.render.render(write_still=True)
print('SENTRY_MODEL_COMPLETE')
