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

armor = material('Armor | silver', (.48,.55,.57), .48,.34)
edge = material('Armor | machined edges', (.46,.44,.37), .68,.32)
panel = material('Armor | recessed panels', (.19,.18,.15), .55,.40)
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


# Shared palette and long-axis factory architecture replace the old concrete box.
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from industrial_palette import SILVER, FRAME, RECESS, COMPOSITE, TRIM, DECK
from types import SimpleNamespace
from factory_architecture import build as build_architecture
for mat,color in ((armor,SILVER),(edge,FRAME),(panel,RECESS)):
 mat.diffuse_color=(*color,1)
 mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(*color,1)
concrete=material('Composite | blue graphite',COMPOSITE,.46,.42)
trim=material('Trim | titanium ceramic',TRIM,.50,.34)
roofmat=material('Roof | graphite decking',DECK,.45,.43)
yellow=material('Safety | amber',(.63,.40,.045),.12,.55)
light=material('Worklight | inset ivory',(.71,.77,.72),.10,.24)
contract=build_architecture(SimpleNamespace(**globals()))
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
# Apply bevels once and consolidate by assembly group before AO baking/export.
for group,objs in list(parts.items()):
 for o in objs:
  bpy.context.view_layer.objects.active=o
  for modifier in list(o.modifiers):bpy.ops.object.modifier_apply(modifier=modifier.name)
 bpy.ops.object.select_all(action='DESELECT')
 for o in objs:o.select_set(True)
 bpy.context.view_layer.objects.active=objs[0];bpy.ops.object.join()
 joined=bpy.context.object;joined.name=group+'_Geometry';parts[group]=[joined]
# Unique second UV channel for baked contact occlusion, shared by all materials.
meshes=[o for objects in parts.values() for o in objects]
for o in meshes:
 o.data.uv_layers.new(name='ContactUV');o.data.uv_layers.active_index=1
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:o.select_set(True)
bpy.context.view_layer.objects.active=meshes[0]
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.006)
bpy.ops.object.mode_set(mode='OBJECT')
scene.render.engine='CYCLES';scene.cycles.samples=24
occlusion=bpy.data.images.new('Factory contact occlusion',width=2048,height=2048,alpha=False)
occlusion.colorspace_settings.name='Non-Color'
used_mats=set(m for o in meshes for m in o.data.materials)
restore=[]
for m in used_mats:
 nt=m.node_tree;nodes_=nt.nodes;links=nt.links
 # Albedo uses the original object-projected UV channel.
 for node in list(nodes_):
  if node.type=='TEX_IMAGE':
   uv=nodes_.new('ShaderNodeUVMap');uv.uv_map='UVMap';links.new(uv.outputs['UV'],node.inputs['Vector'])
 target=nodes_.new('ShaderNodeTexImage');target.image=occlusion;nodes_.active=target
 ao=nodes_.new('ShaderNodeAmbientOcclusion');ao.inputs['Distance'].default_value=1.8;ao.samples=16
 emit=nodes_.new('ShaderNodeEmission');links.new(ao.outputs['AO'],emit.inputs['Color'])
 output=next(n for n in nodes_ if n.type=='OUTPUT_MATERIAL')
 original=output.inputs['Surface'].links[0].from_socket
 links.new(emit.outputs['Emission'],output.inputs['Surface']);restore.append((m,output,original,target,ao,emit))
scene.render.bake.margin=8;scene.render.bake.use_clear=True
print('BAKING_CONTACT_OCCLUSION',flush=True)
bpy.ops.object.bake(type='EMIT',uv_layer='ContactUV')
occlusion.pack()
settings=bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree')
settings.interface.new_socket('Occlusion',in_out='INPUT',socket_type='NodeSocketFloat')
settings.nodes.new('NodeGroupInput');settings.nodes.new('NodeGroupOutput')
for m,out,original,target,ao,emit in restore:
 nt=m.node_tree;nt.links.new(original,out.inputs['Surface']);nt.nodes.remove(ao);nt.nodes.remove(emit)
 uv=nt.nodes.new('ShaderNodeUVMap');uv.uv_map='ContactUV';nt.links.new(uv.outputs['UV'],target.inputs['Vector'])
 gn=nt.nodes.new('ShaderNodeGroup');gn.node_tree=settings;nt.links.new(target.outputs['Color'],gn.inputs['Occlusion'])
for o in meshes:o.data.uv_layers.active_index=0
print('CONTACT_OCCLUSION_COMPLETE',flush=True)
nodes={}
origins=[('Hull',(0,0,0)),('Floor',(0,0,0)),('WallL',(0,0,0)),('WallR',(0,0,0)),('Rear',(0,0,0)),('Front',(0,0,0)),('Ramp',(0,0,0)),('RoofFrame',(0,0,0)),('RoofL',(0,-6.4,2.6)),('RoofR',(0,6.4,2.6)),('Door',(9.5,0,6.45)),('Equipment',(0,0,0))]
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
(OUT/'contract.json').write_text(json.dumps(contract,indent=2))
def aim(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
for name,loc,power,size in [('Key',(-12,-18,30),8500,18),('Fill',(18,-5,20),4500,16),('Rim',(0,20,25),6500,12)]:
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.size=size;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=loc;aim(o,(0,0,3))
d=bpy.data.cameras.new('Review');o=bpy.data.objects.new('Review',d);scene.collection.objects.link(o);o.location=(32,-40,31);aim(o,(0,-1,2));d.type='ORTHO';d.ortho_scale=37;scene.camera=o
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.resolution_x=1100;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.world.color=(.15,.15,.15);scene.render.film_transparent=True
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(OUT/'factory-preview.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'factory.blend'));bpy.ops.render.render(write_still=True)
print('FACTORY_COMPLETE')
