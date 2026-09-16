"""Project Outrage harvester. Blender 5.1; meters, +Z up, -Y forward.
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

# Sprite silhouette: sealed box, sloping nose, broad low suction scoop.
loft('Harvester body',[rect_ring(1.24,-2.02,1.97,.13,1.22),rect_ring(1.24,-1.34,1.97,.15,2.66)],armor,'Hull',.055)
box('Roof raised deck',(0,.45,2.69),(2.27,2.66,.10),edge,rad=.04)
box('Roof panel',(0,.45,2.75),(2.12,2.5,.07),armor,rad=.04)
box('Orchid service hatch',(0,.56,2.87),(.74,.74,.20),team,rad=.04)
for xx in (-.30,.30):
 for yy in (.26,.86): cylinder('Hatch bolt',(xx,yy,2.981),.035,.018,steel,vertices=8,rad=0)
for xx in (-.50,.50): box('Roof access lid',(xx,-.42,2.805),(.29,.39,.08),edge,rad=.04)
for i in range(10): box('Roof cooling slot',(-.83+i*.183,1.59,2.798),(.07,.30,.022),black,rad=.008)
for side in (-1,1):
 box('Side stripe backing',(side*1.255,-.14,2.17),(.06,1.77,.21),steel,rad=.02)
 box('Side orchid stripe',(side*1.292,-.14,2.18),(.035,1.67,.105),team,rad=.012)
 box('Side engine housing',(side*1.30,1.02,1.90),(.22,1.02,1.09),panel,rad=.05)
 box('Side grille inset',(side*1.426,1.02,1.89),(.028,.80,.70),black,rad=.015)
 for j in range(7): box('Grille louvre',(side*1.45,1.02,1.62+j*.09),(.048,.77,.035),edge,rad=.006)
 cylinder('Rear service pipe',(side*1.09,1.92,1.88),.092,1.12,steel,vertices=12)
 cylinder('Intake pivot',(side*1.20,-2.02,1.0),.24,.20,steel,axis='X',vertices=16)
 box('Intake arm',(side*1.17,-2.23,.88),(.15,.77,.18),steel,rad=.025)
# Scoop cavity and vertical separators match the broad ribbed reference.
box('Intake dark throat',(0,-2.48,.75),(2.15,.17,.72),black,'Intake',.02)
box('Intake lower lip',(0,-2.80,.35),(2.30,.78,.10),edge,'Intake',.015)
box('Intake top beam',(0,-2.46,1.11),(2.37,.23,.17),armor,'Intake',.025)
box('Intake team strip',(0,-2.589,1.12),(2.18,.025,.09),team,'Intake',.008)
for i in range(7):
 xx=-1.11+i*.37
 box('Intake separator',(xx,-2.69,.68),(.065,.62,.62),steel,'Intake',.01)
 box('Intake tooth',(xx,-3.04,.34),(.18,.19,.11),edge,'Intake',.01)
cylinder('Suction rotor',(0,-2.37,.70),.19,2.12,steel,'Rotor','X',16)
for i in range(8):
 a=i*math.pi/4
 box('Rotor blade',(0,-2.37+math.cos(a)*.18,.70+math.sin(a)*.18),(2.12,.045,.085),panel,'Rotor',.005,(a,0,0))
# Rear discharge hatch: pivots upward, revealing stored ore and a low chute.
box('Rear outlet shadow',(0,1.993,1.92),(1.63,.035,.99),black,rad=.025)
box('Rear hatch',(0,2.035,1.96),(1.68,.13,1.05),armor,'Tailgate',.045)
for i in range(6): box('Rear hatch louvre',(0,2.111,1.71+i*.105),(1.27,.035,.039),panel,'Tailgate',.008)
cylinder('Tailgate hinge',(0,2.055,2.52),.077,1.82,steel,'Hull','X',16)
box('Discharge chute',(0,2.17,1.31),(1.67,.57,.09),steel,rad=.025)
oremat=material('Ore | warm gold',(.48,.27,.052),.45,.58)
import random
random.seed(23)
for i in range(28):
 bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=random.uniform(.09,.19),location=(random.uniform(-.67,.67),random.uniform(1.64,1.91),random.uniform(1.44,2.26)))
 tag(bpy.context.object,'Stored ore',oremat,'Cargo')

nodes={}
for name,objects in parts.items():
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:
  bpy.context.view_layer.objects.active=o;o.select_set(True)
  for mod in list(o.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
  o.select_set(False)
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();o=bpy.context.object;o.name=name
 bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 pivot=(0,0,0)
 if name=='Tailgate':pivot=(0,2.055,2.52)
 elif name=='Rotor':pivot=(0,-2.37,.70)
 elif name=='Cargo':pivot=(0,1.77,1.40)
 elif name.startswith('Wheel_'):pivot=((-1 if '_L_' in name else 1)*1.34,[-1.64,-.82,0,.82,1.64][int(name[-1])-1],.59)
 o.data.transform(Matrix.Translation(-Vector(pivot)));o.location=pivot;nodes[name]=o
root=bpy.data.objects.new('OUTRAGE_Harvester',None);scene.collection.objects.link(root)
root['source']='Project-Outrage harvester_idle.png';root['forward_axis']='-Y Blender / +Z glTF'
def parent_keep(o,p):
 bpy.context.view_layer.update();w=o.matrix_world.copy();o.parent=p;o.matrix_world=w
for name,o in nodes.items():parent_keep(o,root if name=='Hull' else nodes['Hull'])
for name,pos in [('IntakeSocket',(0,-2.80,.63)),('DischargeSocket',(0,2.43,1.40))]:
 o=bpy.data.objects.new(name,None);scene.collection.objects.link(o);o.location=pos;parent_keep(o,nodes['Hull']);nodes[name]=o
asset=[root,*nodes.values()]
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
scene.render.resolution_x=1000;scene.render.resolution_y=800;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.filepath=str(OUT/'harvester_hero.png');bpy.ops.render.render(write_still=True)
nodes['Tailgate'].rotation_euler.x=-1.8
camera_angle(138,30);scene.render.filepath=str(OUT/'harvester_unload.png');bpy.ops.render.render(write_still=True)
nodes['Tailgate'].rotation_euler.x=0
camera_angle(43,30)
bpy.ops.object.select_all(action='DESELECT')
for o in asset:o.select_set(True)
bpy.context.view_layer.objects.active=nodes['Hull']
bpy.ops.export_scene.gltf(filepath=str(OUT/'harvester.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_apply=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'harvester.blend'))
print('HARVESTER COMPLETE',flush=True)
