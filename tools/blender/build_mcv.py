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
# A rigid mechanical rig. Geometry is authored in LOCAL coordinates of its joint.
# Hidden nested cassettes intentionally overlap internally; there is no sprite
# disassembly, visibility switching, object scaling or endpoint model replacement.
glass=material('Cab | smoked glass',(.018,.032,.052),.48,.2)
lamps=material('Headlights | ivory',(.75,.73,.55),.2,.3)
rig={}; nodes={}
def joint(name,parent='Hull',closed=(0,0,0),opened=None,rotation=(0,0,0),turn=None,start=0,end=90):
    if opened is None: opened=closed
    if turn is None: turn=rotation
    rig[name]=dict(parent=parent,closed=closed,opened=opened,rotation=rotation,turn=turn,start=start,end=end)
    o=bpy.data.objects.new(name,None);scene.collection.objects.link(o);nodes[name]=o
    if parent:o.parent=nodes[parent]
    return o
joint('Hull',None)
def beam(name,a,b,r,mat,group):
    a,b=Vector(a),Vector(b);o=cylinder(name,(a+b)/2,r,(b-a).length,mat,group,vertices=8,rad=0)
    o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o

def hollow(name,r,inside,h,mat,group,n=16):
    verts=[]
    for z,rr in [(0,r),(h,r),(0,inside),(h,inside)]:
        verts.extend((rr*math.cos(i*math.tau/n),rr*math.sin(i*math.tau/n),z) for i in range(n))
    faces=[]
    for i in range(n):
        j=(i+1)%n
        faces.extend([(i,j,n+j,n+i),(2*n+j,2*n+i,3*n+i,3*n+j),(i,2*n+i,2*n+j,j),(n+i,n+j,3*n+j,3*n+i)])
    return mesh(name,verts,faces,mat,group,.02)

def fan(x,y,z,r,group,axis='Z'):
    cylinder('Cooling fan bezel',(x,y,z),r,.14,edge,group,axis,24,0)
    ofs=Vector((0,0,.085) if axis=='Z' else (0,-.085,0))
    pos=Vector((x,y,z))+ofs
    cylinder('Cooling fan dark well',pos,r*.84,.04,black,group,axis,24,0)
    for i in range(5):
        a=i*math.tau/5
        if axis=='Z':
            box('Fan blade',(x+math.cos(a)*r*.35,y+math.sin(a)*r*.35,z+.13),(r*.72,.12,.035),steel,group,0,rotation=(0,0,a+.2))
        else:
            box('Vent slat',(x,y-.13,z+(i-2)*r*.27),(r*1.5,.06,.05),steel,group,0)
    cylinder('Fan bearing',pos+ofs,r*.14,.09,edge,group,axis,12,0)

def panel_details(x,y,z,w,h,group,front=False):
    # Raised edging and recessed service covers remain on their parent panel.
    if front:
        box('Recessed equipment cover',(x,y-.018,z),(w,.06,h),panel,group,.035)
        for side in (-1,1):box('Cover frame',(x+side*w*.49,y-.064,z),(.045,.035,h),edge,group,0)
        for row in (-.3,0,.3):box('Cooling slot',(x,y-.073,z+row*h),(w*.72,.03,.05),black,group,0)
    else:
        box('Service deck inset',(x,y,z),(w,h,.045),panel,group,.02)
        for side in (-1,1):box('Deck seam',(x+side*w*.49,y,z+.029),(.035,h,.018),steel,group,0)

# CLOSED VEHICLE: uninterrupted armored cab, capsule load and four axles.
joint('Chassis',closed=(0,0,.81),opened=(0,0,.31),start=11,end=31)
box('Ladder chassis',(0,0,0),(2.90,8.38,.44),steel,'Chassis',.08)
box('Running floor',(0,0,.28),(3.12,8.16,.12),panel,'Chassis',.025)
for s in (-1,1):
    for j,y in enumerate((-3.10,-1.56,1.52,3.05)):
        name=f'Wheel_{"L" if s<0 else "R"}_{j}'
        joint(name,closed=(s*1.49,y,.68),opened=(s*1.05,y,.40),start=12,end=35)
        cylinder('Tire',(0,0,0),.65,.46,rubber,name,'X',28,.025)
        cylinder('Rim',(s*.245,0,0),.39,.065,edge,name,'X',24,0)
        cylinder('Faction hub',(s*.288,0,0),.27,.055,team,name,'X',20,0)
        cylinder('Wheel bearing',(s*.33,0,0),.11,.07,steel,name,'X',12,0)
        for k in range(6):
            a=k*math.tau/6;cylinder('Lug',(s*.325,math.sin(a)*.19,math.cos(a)*.19),.025,.045,edge,name,'X',6,0)
        for k in range(20):
            a=k*math.tau/20;box('Tire tread',(0,.63*math.sin(a),.63*math.cos(a)),(.46,.12,.04),rubber,name,0,rotation=(-a,0,0))
joint('Cab',closed=(0,-2.1,1.25),opened=(0,-3.0,.34),turn=(math.pi/2,0,0),start=3,end=33)
loft('Cab armored body',[rect_ring(1.53,-2.14,.02,.20,.04),rect_ring(1.39,-1.92,-.04,.27,1.40),rect_ring(1.28,-1.73,-.16,.30,1.53)],team,'Cab',.075)
box('Cab steel belt',(0,-1.05,.15),(3.13,2.37,.35),armor,'Cab',.09)
box('Windshield',(0,-1.98,.97),(2.50,.05,.62),glass,'Cab',.05,rotation=(math.radians(-9),0,0))
box('Cab bumper',(0,-2.31,-.22),(3.25,.26,.24),edge,'Cab',.07)
box('Radiator recess',(0,-2.235,.20),(1.55,.045,.38),black,'Cab',.02)
for z in (.05,.16,.27,.38):box('Grille bar',(0,-2.27,z),(1.43,.045,.035),edge,'Cab',0)
for s in (-1,1):
    box('Side window',(s*1.415,-.90,.97),(.045,1.18,.58),glass,'Cab',.05)
    box('Door handle',(s*1.54,-.46,.61),(.06,.28,.06),edge,'Cab',.01)
    box('Headlight',(s*1.19,-2.24,.24),(.36,.06,.24),lamps,'Cab',.03)
    beam('Mirror arm',(s*1.40,-1.50,1.13),(s*1.76,-1.43,1.1),.025,steel,'Cab')
    box('Mirror',(s*1.76,-1.43,1.1),(.1,.22,.28),steel,'Cab',.03)
    cylinder('Exhaust',(s*1.23,.12,.78),.085,1.9,steel,'Cab',vertices=12,rad=0)
    box('Wheel arch',(s*1.46,-1.02,-.23),(.45,2.50,.22),armor,'Cab',.06)
joint('Engine',closed=(0,-1.0,1.55),opened=(0,-1.0,.76),start=15,end=32)
box('Engine cassette',(0,0,0),(2.92,1.12,1.02),armor,'Engine',.09)
for s in (-1,1):
    box('Power pack inset',(s*1.475,0,0),(.045,.80,.62),black,'Engine',.02)
    for k in range(4):box('Power pack louvre',(s*1.50,0,(k-1.5)*.15),(.06,.74,.035),edge,'Engine',0)
# Capsule halves pivot OUTWARD on real longitudinal lower hinges. Their skin
# becomes the two inner roof petals; hinges travel with the shoulder rails.
for s in (-1,1):
    n=f'Container_{s}'
    joint(n,closed=(s*1.45,.7,1.22),opened=(s*1.5,.7,1.63),turn=(0,s*math.pi/2,0),start=0,end=38)
    for iy,(y0,y1) in enumerate(((-1.4,.10),(.13,1.62),(1.65,3.05))):
        cross=[]
        for k in range(11):
            a=k*math.pi/20;cross.append((-s*(1.45-1.45*math.sin(a)),.30+1.48*math.cos(a)))
        cross += [(x+s*.10,z-.10) for x,z in reversed(cross)]
        rings=[[(x,y,z) for x,z in cross] for y in (y0,y1)]
        loft('Capsule armor petal',rings,armor,n,.025)
        for y in (y0+.08,y1-.08):
            for k in range(10):
                a=k*math.pi/20;b=(k+1)*math.pi/20
                beam('Capsule strengthening hoop',(-s*(1.45-1.48*math.sin(a)),y,.30+1.51*math.cos(a)),(-s*(1.45-1.48*math.sin(b)),y,.30+1.51*math.cos(b)),.042,edge,n)
    box('Capsule faction belt',(s*.035,.82,.65),(.045,4.1,.26),team,n,.018)
    for y in (-.7,2.8):cylinder('Shell hinge',(0,y,.02),.16,.45,steel,n,'Y',16,0)
# Six overlapping floor leaves slide along permanent telescopic chassis rails.
# Narrow plates are genuinely narrow when packed; none changes scale.
for s in (-1,1):
    parent='Hull'
    for k in range(3):
        n=f'Deck_{s}_{k}'
        joint(n,parent,closed=(s*(.06 if k else .10),0,.11 if k else .44),opened=(s*(2.18 if k else 2.22),0,-.04 if k else .29),start=3+k*3,end=28+k*4)
        box('Nested armored floor',(0,0,0),(2.32,8.18,.13),armor,n,.025)
        for y in (-3.48,3.48):box('Sliding box rail',(-s*.35,y,-.13),(2.6,.26,.22),steel,n,.025)
        for y in (-2.6,0,2.6):panel_details(0,y,.08,1.93,2.22,n)
        for y in (-3.75,3.75):
            for x in (-.82,.82):cylinder('Floor tie down',(x,y,.10),.07,.04,edge,n,vertices=8,rad=0)
        parent=n
    # Front and rear extensions stay nested under each side's last floor leaf.
    for stage in range(3):
      for sy in (-1,1):
        n=f'Apron_{s}_{stage}_{sy}'
        joint(n,f'Deck_{s}_{stage}',closed=(0,sy*1.62,-.08),opened=(0,sy*5.45,-.08),start=17,end=43)
        box('Apron cassette',(0,0,0),(2.32,3.0,.13),armor,n,.025)
        for x in (-.85,.85):box('Apron guide',(x,-sy*1.55,-.1),(.16,3.4,.16),steel,n,.01)
        for i in (-.65,.65):panel_details(0,i,.08,1.95,1.15,n)
    # Four front/rear stabilizers are attached to the outer deck; they do not fly.
    for sy in (-1,1):
        n=f'Jack_{s}_{sy}'
        joint(n,parent,closed=(s*.85,sy*3.6,.24),opened=(s*.85,sy*3.6,.01),start=15,end=32)
        cylinder('Hydraulic foot',(0,0,0),.37,.14,steel,n,vertices=12,rad=.02)
        cylinder('Chrome jack',(0,0,.26),.095,.50,edge,n,vertices=12,rad=0)
        cylinder('Jack housing',(0,0,.48),.17,.35,armor,n,vertices=12,rad=.015)
# Four corner armor wings. Each is attached to an outer floor carriage. The
# inclined armor is a rigid bent shell, with complete back faces and hinge pins.
for sx in (-1,1):
    for sy in (-1,1):
        carrier=f'CornerRail_{sx}_{sy}'
        joint(carrier,closed=(sx*1.45,sy*1.38,2.25),opened=(sx*6.12,sy*3.18,.43),start=6,end=36)
        # Persistent telescopic connectors; three overlapping sections span the travel.
        for j in range(3):
            r=f'CornerLink_{sx}_{sy}_{j}'
            joint(r,closed=(sx*.10,sy*1.38,.36+j*.055),opened=(sx*(1.25+j*1.78),sy*3.18,.21+j*.055),start=4+j*3,end=35)
            box('Corner guide',(0,0,0),(2.6,.22,.18),steel,r,.02)
        n=f'ArmorWing_{sx}_{sy}'
        joint(n,carrier,rotation=(0,-sx*math.pi/2,0),turn=(0,0,0),start=25,end=55)
        # local x points outward; profile slopes inward toward the roof.
        profile=[(0,0),(-sx*.15,1.05),(-sx*1.70,3.05),(-sx*2.12,3.10),(-sx*.52,1.00),(-sx*.42,0)]
        loft('Sloping perimeter armor', [[(x,y,z) for x,z in profile] for y in (-2.36,2.36)],concrete,n,.045)
        for y in (-1.96,1.96):
            beam('Armor spine',(sx*.01,y,.18),(-sx*1.58,y,2.96),.15,trim,n)
            beam('Faction inlay',(-sx*.05,y,.43),(-sx*1.42,y,2.76),.072,team,n)
        for y in (-1.78,1.78):
            box('Faction stripe surround',(-sx*.89,y,2.10),(2.62,.63,.10),edge,n,.028,rotation=(0,sx*.91,0))
            box('Broad faction armor inlay',(-sx*.85,y,2.14),(2.35,.36,.11),team,n,.02,rotation=(0,sx*.91,0))
        for y in (-.8,.8):
            # Plates follow the slope instead of floating in front of it.
            o=box('Removable sloped armor',(-sx*.96,y,2.05),(2.06,1.39,.10),armor,n,.025,rotation=(0,sx*.64,0))
        for y in (-2.3,0,2.3):cylinder('Wing hinge',(0,y,.025),.14,.42,edge,n,'Y',16,0)
        # A roof lip folds inward on a second real hinge. It covers wall seams.
        roof=f'RoofWing_{sx}_{sy}'
        joint(roof,n,closed=(-sx*1.94,0,3.08),rotation=(0,-sx*math.pi/2,0),turn=(0,0,0),start=45,end=66)
        box('Shoulder roof lip',(-sx*.70,0,.05),(1.57,4.75,.16),armor,roof,.04)
        for y in (-1.35,1.35):fan(-sx*.65,y,.17,.43,roof)
# Front/rear wall cassettes rise from their own longitudinal guides.
for sy in (-1,1):
    for sx in (-1,1):
        n=f'EndRail_{sx}_{sy}'
        joint(n,closed=(sx*.14,sy*2.70,1.78),opened=(sx*3.05,sy*5.58,.39),start=9,end=37)
        box('End wall runner',(0,-sy*1.2,-.12),(1.3,3.2,.20),steel,n,.025)
        w=f'EndWall_{sx}_{sy}'
        joint(w,n,rotation=(sy*math.pi/2,0,0),turn=(0,0,0),start=27,end=56)
        for half in (-1,1):
            leaf=f'EndLeaf_{sx}_{sy}_{half}'
            joint(leaf,w,closed=(0,0,0),opened=(half*1.06,0,0),start=30,end=57)
            rings=[]
            for x in (-1.06,1.06):rings.append([(x,0,0),(x,-sy*.08,1.0),(x,-sy*1.25,3.13),(x,-sy*1.55,3.13),(x,-sy*.40,.8),(x,-sy*.32,0)])
            loft('End sloped bulkhead',rings,concrete,leaf,.045)
            beam('End wall brace',(0,-sy*.06,.22),(0,-sy*1.19,2.99),.13,trim,leaf)
            beam('End faction stripe',(0,-sy*.19,.52),(0,-sy*1.10,2.78),.065,team,leaf)
            if sy<0:panel_details(0,-.48,1.5,.85,.66,leaf,True)
# Central side wall closes the gap between the corner armor wings.
for sx in (-1,1):
    rail=f'SideBridgeRail_{sx}'
    joint(rail,closed=(sx*1.45,0,2.25),opened=(sx*6.12,0,.43),start=8,end=38)
    n=f'SideBridge_{sx}'
    joint(n,rail,rotation=(0,-sx*math.pi/2,0),turn=(0,0,0),start=29,end=56)
    profile=[(0,0),(-sx*.15,1.05),(-sx*1.70,3.05),(-sx*2.12,3.1),(-sx*.52,1.),(-sx*.42,0)]
    loft('Central side armor', [[(x,y,z) for x,z in profile] for y in (-.87,.87)],concrete,n,.045)
    for y in (-.70,.70):beam('Central armor ribs',(0,y,.20),(-sx*1.56,y,2.99),.13,trim,n)
    cylinder('Auxiliary turbine',(sx*.06,0,.90),.58,.17,edge,n,'X',24,.02)
    cylinder('Turbine dark inset',(sx*.16,0,.90),.46,.06,black,n,'X',24,0)
    for j in range(5):box('Turbine louvre',(sx*.22,0,.90+(j-2)*.16),(.045,.77,.035),steel,n,0)
# Apron middle telescopes lengthwise out of the original chassis.
for sy in (-1,1):
    n=f'CenterApron_{sy}'
    joint(n,closed=(0,sy*1.55,.28),opened=(0,sy*5.42,.12),start=12,end=43)
    box('Center entry apron',(0,0,0),(2.75,3.12,.15),armor,n,.035)
    panel_details(0,0,.09,2.30,2.5,n)
# Central rising platform: short nested leaves provide an unbroken roof around
# the column while the perimeter leaves lock over its outer edge.
joint('RoofLift',closed=(0,0,.96),opened=(0,0,3.51),start=28,end=63)
box('Core roof',(0,0,0),(2.7,8.75,.20),armor,'RoofLift',.05)
for s in (-1,1):
    for j in range(2):
        n=f'RoofSlide_{s}_{j}'
        joint(n,'RoofLift',closed=(s*.12,0,-.12-j*.06),opened=(s*(2.05+j*1.85),0,-.04-j*.06),start=36+j*3,end=65+j*3)
        box('Sliding upper deck',(0,0,0),(2.15,8.75,.17),armor,n,.04)
        for y in (-2.8,0,2.8):panel_details(0,y,.10,1.87,2.24,n)
        for sy in (-1,1):box('Faction deck fascia',(0,sy*4.395,-.04),(1.66,.05,.19),team,n,.018)
# Cab becomes the entry mechanism; this gate unfolds in front of the tucked cab.
joint('EntryRail',closed=(0,-2.90,.65),opened=(0,-5.72,.39),start=18,end=45)
joint('EntryGate','EntryRail',rotation=(math.pi/2,0,0),turn=(0,0,0),start=37,end=61)
box('Entry black recess',(0,0,.81),(1.45,.12,1.54),black,'EntryGate',.025)
for sx in (-1,1):box('Door jamb',(sx*.85,-.05,.82),(.26,.35,1.64),trim,'EntryGate',.05)
box('Entry lintel',(0,-.07,1.69),(1.94,.40,.23),trim,'EntryGate',.05)
for x in (-.39,0,.39):box('Door reinforcement',(x,-.075,.80),(.09,.075,1.48),steel,'EntryGate',.01)
box('Entry faction lamp',(0,-.29,1.70),(.77,.03,.08),team,'EntryGate',.015)
joint('EntryHood','EntryRail',closed=(0,0,1.62),rotation=(math.pi/2,0,0),turn=(0,0,0),start=42,end=65)
loft('Entry armored hood',[[(-1.04,y,z),(1.04,y,z),(1.04,y+.18,z),(-1.04,y+.18,z)] for y,z in ((0,.03),(1.57,1.94))],concrete,'EntryHood',.035)
box('Door upper fascia',(0,.06,.11),(1.68,.11,.20),team,'EntryHood',.025)
# Rear central service wall closes the back; it nests inside the front gate cassette.
joint('RearCenterRail',closed=(0,2.65,1.8),opened=(0,5.58,.39),start=12,end=40)
joint('RearCenterWall','RearCenterRail',rotation=(math.pi/2,0,0),turn=(0,0,0),start=30,end=60)
loft('Rear central bulkhead',[[(-1.03,y,z),(1.03,y,z),(1.03,y-.18,z),(-1.03,y-.18,z)] for y,z in ((0,0),(-.08,1.0),(-1.25,3.13))],concrete,'RearCenterWall',.035)
# TELESCOPIC COLUMN: hollow outer sleeve, nested lattice, head, yaw and boom.
# All four children physically inherit the lift instead of separately flying up.
joint('TowerSleeve',closed=(0,.15,1.02),opened=(0,.72,3.64),start=32,end=62)
hollow('Octagonal lift sleeve',1.43,1.20,1.65,concrete,'TowerSleeve',8)
for z in (.06,1.59):
    cylinder('Sleeve rim',(0,0,z),1.52,.17,trim,'TowerSleeve',vertices=8,rad=.04)
for i in range(8):
    a=(i+.5)*math.tau/8;x,y=1.34*math.cos(a),1.34*math.sin(a)
    box('Sleeve faction inset',(x,y,.79),(.47,.05,1.13),team,'TowerSleeve',.015,rotation=(0,0,a-math.pi/2))
    box('Sleeve corner rib',(1.40*math.cos(i*math.tau/8),1.40*math.sin(i*math.tau/8),.83),(.13,.13,1.46),edge,'TowerSleeve',.015)
for j in range(2):
    n=f'Mast_{j}';parent='TowerSleeve' if j==0 else 'Mast_0'
    joint(n,parent,closed=(0,0,.08),opened=(0,0,1.39),start=43+j*7,end=69+j*7)
    rr=.93-j*.18
    for x in (-rr,rr):
        for y in (-rr,rr):box('Lift mast post',(x,y,.79),(.14,.14,1.66),edge,n,.015)
    for z in (.05,1.53):
        for s in (-1,1):
            box('Mast crossrail',(s*rr,0,z),(.14,rr*2+.12,.13),steel,n,.012)
            box('Mast crossrail',(0,s*rr,z),(rr*2+.12,.14,.13),steel,n,.012)
    for s in (-1,1):
        beam('Lattice diagonal',(-rr,s*rr,.14),(rr,s*rr,1.46),.06,edge,n)
        beam('Lattice diagonal',(s*rr,-rr,.14),(s*rr,rr,1.46),.06,edge,n)
    cylinder('Central lift piston',(0,0,.70),.15,.94,steel,n,vertices=12,rad=0)
joint('CraneHead','Mast_1',closed=(0,0,.35),opened=(0,0,1.61),start=56,end=80)
loft('Counterweight machinery',[rect_ring(1.25,-.99,1.08,.20,.00),rect_ring(1.25,-.99,1.08,.20,.82),rect_ring(1.03,-.82,.88,.20,1.04)],armor,'CraneHead',.055)
for sx in (-1,1):
    for y in (-.56,-.18,.20,.58):box('Head service vent',(sx*1.27,y,.44),(.04,.16,.49),black,'CraneHead',0)
    box('Head faction panel',(sx*1.3,.0,.18),(.03,1.47,.13),team,'CraneHead',.01)
fan(.27,.2,1.08,.48,'CraneHead')
# Boom stays attached throughout its yaw; distal segment telescopes from inside.
joint('BoomYaw','CraneHead',closed=(0,0,.78),rotation=(0,0,-math.pi/2),turn=(0,0,0),start=66,end=87)
box('Boom swivel',(0,0,0),(1.05,1.20,.56),steel,'BoomYaw',.07)
joint('BoomHinge','BoomYaw',closed=(-.34,0,.12),rotation=(0,0,0),turn=(0,.17,0),start=71,end=90)
loft('Main box boom',[[(-3.5,-.34,-.16),(-3.5,.34,-.16),(.17,.50,-.24),(.17,-.50,-.24)],[(-3.5,-.34,.44),(-3.5,.34,.44),(.17,.50,.46),(.17,-.50,.46)]],armor,'BoomHinge',.04)
for x in (-.9,-1.85,-2.8):
    for s in (-1,1):box('Boom faction band',(x,s*.425,.13),(.24,.07,.48),team,'BoomHinge',.015)
joint('BoomExtension','BoomHinge',closed=(-1.34,0,.10),opened=(-4.14,0,.10),start=76,end=90)
box('Telescopic crane tip',(-.40,0,.0),(2.58,.55,.40),panel,'BoomExtension',.045)
box('Crane tip cap',(-1.71,0,0),(.18,.65,.51),edge,'BoomExtension',.04)
box('Crane tip faction badge',(-1.82,0,0),(.04,.42,.30),team,'BoomExtension',.01)
cylinder('Cable pulley',(-1.42,0,.24),.17,.40,steel,'BoomExtension','Y',16,0)
# A folded lifting hook lowers only after the boom has cleared the roof.
joint('Hook','BoomExtension',closed=(-1.45,0,.15),opened=(-1.45,0,-.70),start=84,end=90)
beam('Hook cable',(0,0,0),(0,0,.9),.018,steel,'Hook')
cylinder('Hook block',(0,0,-.05),.14,.22,yellow,'Hook',vertices=8,rad=0)
beam('Hook bent lower',(0,0,-.15),(.12,0,-.30),.038,steel,'Hook')
beam('Hook end',(.12,0,-.30),(.23,0,-.17),.038,steel,'Hook')

# Separate architectural equipment module keeps the mechanical chassis rig small.
from types import SimpleNamespace
sys.path.insert(0,str(Path(__file__).resolve().parent))
from yard_equipment import build_yard_equipment
facilities=build_yard_equipment(SimpleNamespace(
    joint=joint,box=box,cylinder=cylinder,beam=beam,mesh=mesh,fan=fan,
    material=material,weather=weather,
    materials=SimpleNamespace(armor=armor,edge=edge,panel=panel,steel=steel,
                              black=black,team=team,yellow=yellow)))

# Bake each joint as a rigid transform. No animated scale or mesh visibility.
for group,objs in list(parts.items()):
    for o in objs:
        uv=o.data.uv_layers.active or o.data.uv_layers.new(name='UVMap')
        for poly in o.data.polygons:
            axes=[a for a in range(3) if a!=max(range(3),key=lambda a:abs(poly.normal[a]))]
            for li in poly.loop_indices:
                v=o.data.vertices[o.data.loops[li].vertex_index].co+o.location
                uv.data[li].uv=(v[axes[0]]*.28,v[axes[1]]*.28)
        bpy.context.view_layer.objects.active=o
        for mod in list(o.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:o.select_set(True)
    bpy.context.view_layer.objects.active=objs[0];bpy.ops.object.join();o=bpy.context.object
    o.parent=nodes[group]  # keep local geometry, do not preserve world pose
    o.name=group+'_geometry'
for name,d in rig.items():
    o=nodes[name]
    for f in range(91):
        t=max(0,min(1,(f-d['start'])/max(1,d['end']-d['start'])));t=t*t*(3-2*t)
        o.location=Vector(d['closed']).lerp(Vector(d['opened']),t)
        o.rotation_euler=tuple(a+(b-a)*t for a,b in zip(d['rotation'],d['turn']))
        if name!='Hull':
            o.keyframe_insert(data_path='location',frame=f);o.keyframe_insert(data_path='rotation_euler',frame=f)
    if name!='Hull':
        a=o.animation_data.action;a.name='Deploy_'+name;o.animation_data.action=None
        tr=o.animation_data.nla_tracks.new();tr.name='Deploy';tr.strips.new('Deploy',0,a)
scene.frame_start=0;scene.frame_end=90;scene.frame_set(0)
bpy.ops.object.select_all(action='SELECT');bpy.context.view_layer.objects.active=nodes['Hull']
bpy.ops.export_scene.gltf(filepath=str(OUT/'mcv.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_force_sampling=True,export_apply=True)
(OUT/'contract.json').write_text(json.dumps({'revision':4,'facilities':facilities,'clip':'Deploy','authoringSeconds':3,'runtimeSeconds':.8,'worldUnitsPerMetre':20,'modelScale':1.65,'heading':'+Z','up':'+Y','constantScale':True,'settledYard':'cached exact Deploy endpoint','rig':rig,'assembly':'rigid joints with nested hidden cassettes'},indent=2))
def aim(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
for name,loc,power,size in [('Key',(-8,-12,23),5500,12),('Fill',(12,-3,17),1800,10),('Rim',(0,10,20),2200,10)]:
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.size=size;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=loc;aim(o,(0,0,3))
d=bpy.data.cameras.new('Review');cam=bpy.data.objects.new('Review',d);scene.collection.objects.link(cam);cam.location=(25,-25,23.3);aim(cam,(0,0,3));d.type='ORTHO';d.ortho_scale=24;scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=16;scene.cycles.use_denoising=True
scene.render.resolution_x=900;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.world.color=(.25,.25,.25);scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'mcv.blend'))
if '--review' in sys.argv:
    for f in (0,15,30,45,60,75,90):
        scene.frame_set(f);scene.render.filepath=str(OUT/f'mechanical-{f:02}.png');bpy.ops.render.render(write_still=True)
print('MCV_MECHANICAL_COMPLETE',flush=True)
