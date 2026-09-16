"""Rigid, deployable machinery hall and integrated construction-yard facilities.

Coordinates are local Blender metres (+Z up). Every visible assembly has a
permanent hinge/slide parent; packed internals intentionally nest. The dominant
barrel-vault hall uses four connected half-arches, not a scaled finished shell.
"""
import math


def build_yard_equipment(a):
    box,cyl,beam,joint=a.box,a.cylinder,a.beam,a.joint
    m=a.materials
    glazing=a.material('Command | continuous blue glazing',(.018,.065,.105),.55,.22)
    sensor=a.material('Sensors | graphite ceramic',(.018,.039,.062),.45,.43)
    cyan=a.material('Status | restrained cyan',(.10,.49,.60),.12,.28)
    p=cyan.node_tree.nodes.get('Principled BSDF')
    p.inputs['Emission Color'].default_value=(.04,.30,.40,1)
    p.inputs['Emission Strength'].default_value=.45
    ivory=a.material('Worklight | inset ivory',(.71,.77,.72),.10,.24)

    def slab(name,w,length,z0,z1,mat,group,cut=.16):
        return a.loft(name,[a.rect_ring(w/2,-length/2,length/2,cut,z0),
                            a.rect_ring(w/2,-length/2,length/2,cut,z1)],mat,group,.025)

    def surface(name,points,thickness,mat,group):
        # Closed thin shell: backs remain visible during folding.
        v=list(points)+[(x,y,z-thickness) for x,y,z in points]
        n=len(points);f=[tuple(range(n)),tuple(reversed(range(n,n*2)))]
        f += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
        return a.mesh(name,v,f,mat,group,.015)

    # DOMINANT MACHINERY HALL: 4.1 m across, 5.3 m long, 3 m above the
    # foundation roof. Four longitudinally nested half-arches meet at the ridge.
    # Their hinges are children of the side wall, so every roof section remains
    # attached throughout the double-fold into the original truck capsule.
    hall='Workshop'
    joint(hall,'RoofSlide_1_0',closed=(0,1.40,-.55),opened=(.75,1.35,.07),start=35,end=66)
    halfwidth=2.05;sideheight=1.38;rise=1.62;seglen=2.65
    for longitudinal in (-1,1):
        seg=f'WorkshopSegment_{longitudinal}'
        joint(seg,hall,closed=(0,0,0),opened=(0,longitudinal*seglen/2,0),start=39,end=69)
        for s in (-1,1):
            floor=f'WorkshopFloor_{longitudinal}_{s}'
            joint(floor,seg,closed=(s*.05,0,.08),opened=(s*1.025,0,.08),start=38,end=67)
            box('Hall sliding foundation',(0,0,0),(2.17,2.73,.18),m.panel,floor,.045)
            for y in (-.94,.94):box('Hall foundation runner',(0,y,-.12),(2.21,.15,.17),m.steel,floor,.018)
            side=f'WorkshopSide_{longitudinal}_{s}'
            joint(side,seg,closed=(s*.60,0,.12),opened=(s*halfwidth,0,.12),
                  rotation=(0,-s*math.pi/2,0),turn=(0,0,0),start=42,end=74)
            box('Hall continuous lower wall',(0,0,sideheight*.5),(.15,2.71,sideheight),m.panel,side,.035)
            for y in (-1.12,1.12):
                box('Hall load bearing buttress',(s*.065,y,sideheight*.48),(.24,.24,sideheight+.08),m.armor,side,.05)
            box('Hall broad faction waist',(s*.105,0,.95),(.055,2.26,.32),m.team,side,.018)
            box('Hall service recess',(s*.116,0,.43),(.045,2.09,.49),sensor,side,.022)
            for y in (-.74,-.25,.25,.74):
                box('Hall service cassette',(s*.16,y,.44),(.10,.42,.39),m.edge,side,.025)
            for z in (.10,1.34):box('Hall structural sill',(s*.04,0,z),(.23,2.76,.17),m.edge,side,.022)
            roof=f'WorkshopVault_{longitudinal}_{s}'
            joint(roof,side,closed=(0,0,sideheight),rotation=(0,s*math.pi,0),turn=(0,0,0),start=57,end=84)
            def arc(angle):
                return (-s*halfwidth*(1-math.cos(angle)),rise*math.sin(angle))
            for k in range(6):
                x0,z0=arc(k*math.pi/12);x1,z1=arc((k+1)*math.pi/12)
                points=[(x0,-1.36,z0),(x0,1.36,z0),(x1,1.36,z1),(x1,-1.36,z1)]
                surface('Vault armored facet',points if s>0 else list(reversed(points)),.10,m.armor,roof)
                # Broad upper faction panels and dark shoulder cooling bands.
                if k in (3,4):
                    points=[(x0,-.91,z0+.02),(x0,.91,z0+.02),(x1,.91,z1+.02),(x1,-.91,z1+.02)]
                    surface('Vault faction roof panel',points if s>0 else list(reversed(points)),.035,m.team,roof)
                if k==1:
                    points=[(x0,-1.02,z0+.025),(x0,1.02,z0+.025),(x1,1.02,z1+.025),(x1,-1.02,z1+.025)]
                    surface('Vault recessed radiator band',points if s>0 else list(reversed(points)),.035,sensor,roof)
                    for y in (-.82,-.41,0,.41,.82):beam('Radiator transverse rib',(x0,y,z0+.055),(x1,y,z1+.055),.035,m.edge,roof)
            for y in (-1.33,1.33):
                for k in range(6):
                    x0,z0=arc(k*math.pi/12);x1,z1=arc((k+1)*math.pi/12)
                    beam('Vault structural arch',(x0,y,z0+.055),(x1,y,z1+.055),.078,m.edge,roof)
            for y in (-.96,.96):cyl('Vault eave hinge',(0,y,0),.13,.31,m.edge,roof,'Y',12,.015)

    # Solid front/rear vault closures telescope in overlapping 0.78 m courses.
    # Each half is only 2.05 m wide when packed. Upper courses follow the true
    # arched profile, so the endpoint has neither a rectangular cap nor a gap.
    for sy in (-1,1):
        end=f'WorkshopEnd_{sy}'
        joint(end,hall,closed=(0,0,.10),opened=(0,sy*2.655,.12),start=42,end=72)
        for sx in (-1,1):
            leaf=f'WorkshopEndHalf_{sy}_{sx}'
            joint(leaf,end,closed=(sx*.05,0,0),opened=(sx*halfwidth/2,0,0),start=44,end=73)
            for course in range(4):
                zbase=course*.75;n=f'WorkshopBulkhead_{sy}_{sx}_{course}'
                joint(n,leaf,closed=(0,0,course*.045),opened=(0,0,zbase),start=50+course*3,end=76+course*2)
                extent=halfwidth if zbase<=sideheight else halfwidth*math.sqrt(max(0,1-((zbase-sideheight)/rise)**2))
                g0,g1=(0,extent) if sx>0 else (-extent,0)
                # The front lower courses frame a real cargo opening. The
                # shutter below closes this aperture instead of covering a wall.
                if sy==-1 and course<2:
                    if sx<0:g1=-1.65
                    else:g0=.15
                xs=[g0+(g1-g0)*i/12-sx*halfwidth/2 for i in range(13)]
                upper=[];lower=[]
                for x in xs:
                    gx=x+sx*halfwidth/2
                    height=sideheight+rise*math.sqrt(max(0,1-(gx/halfwidth)**2))
                    low=min(height,zbase);high=min(height,zbase+.80)
                    lower.append((x,sy*.06,low-zbase))
                    upper.append((x,sy*.06,high-zbase))
                polygon=lower+list(reversed(upper))
                if sy>0:polygon.reverse()
                # Extrusion along Y instead of Z, preserving the curved front.
                v=polygon+[(x,y-sy*.11,z) for x,y,z in polygon];count=len(polygon)
                faces=[tuple(range(count)),tuple(reversed(range(count,count*2)))]
                faces += [(i,(i+1)%count,(i+1)%count+count,i+count) for i in range(count)]
                a.mesh('Vault end closure',v,faces,m.panel,n,.012)
                if sy==-1:
                    # Large segmented rolling service shutter, shared by both
                    # halves; its horizontal rhythm reads at normal game zoom.
                    usable=.78 if course<2 else (.64 if course==2 else .29)
                    for j in range(3):
                        zz=.12+j*.20
                        if zz<usable:
                            global_z=zbase+zz+.07
                            limit=halfwidth if global_z<=sideheight else halfwidth*math.sqrt(max(0,1-((global_z-sideheight)/rise)**2))
                            if course<2:
                                width=max(.08,g1-g0-.14);center=(g0+g1)/2-sx*halfwidth/2
                            else:
                                width=max(.08,limit-.18);center=sx*(limit/2-halfwidth/2)
                            box('Machinery hall shutter louvre',(center,-.095,zz),(width,.075,.11),m.edge,n,.018)
                    if course==0:box('Hall front sill',((g0+g1)/2-sx*halfwidth/2,-.12,.08),(g1-g0,.15,.14),m.edge,n,.018)
                elif course<2:
                    for x in (-.72,.72):box('Rear service rib',(x,sy*.115,.35),(.12,.09,.62),m.edge,n,.02)

    # Two rigid shutter courses telescope into the header during cargo work.
    # Their independent Deploy joints still stow inside the MCV capsule.
    for course in range(2):
        n=f'WarehouseShutter_{course}'
        joint(n,'WorkshopEnd_-1',closed=(0,-.17,.10+course*.05),
              opened=(-.75,-.17,.39+course*.75),start=53+course*3,end=80+course*2)
        box('Warehouse rolling shutter',(0,0,0),(1.80,.12,.78),m.panel,n,.015)
        for z in (-.25,0,.25):box('Shutter horizontal rib',(0,-.074,z),(1.74,.06,.045),m.edge,n,.008)
        if course==0:box('Cargo shutter lower rail',(0,-.07,-.35),(1.79,.08,.09),m.edge,n,.012)
    n='WarehousePortal'
    joint(n,'WorkshopEnd_-1',closed=(0,-.19,.10),opened=(-.75,-.19,.02),start=50,end=79)
    for x in (-.98,.98):
        box('Cargo door structural jamb',(x,0,.79),(.13,.23,1.68),m.edge,n,.025)
        box('Cargo door recessed marker',(x,-.125,1.02),(.045,.03,.44),cyan,n,.008)
    box('Cargo door recessed header',(0,0,1.65),(2.10,.30,.20),m.edge,n,.03)
    box('Cargo threshold',(0,-.025,.025),(1.92,.37,.07),m.steel,n,.012)

    # FRONT COMMAND WEDGE. Its dark band and armored brow continue around the
    # front/right corners. Inclined faces fold flat and nest under a rising cap.
    name='ControlCabin';w=1.80;length=2.45;h=1.42
    joint(name,'RoofSlide_1_0',closed=(0,1.4,.10),opened=(1.80,-3.10,.08),start=38,end=68)
    slab('Command armored foundation',w+.16,length+.16,-.06,.13,m.edge,name,.23)
    for sx in (-1,1):
        box('Command foundation skid',(sx*.72,0,-.11),(.19,2.11,.20),m.steel,name,.02)
        for sy in (-1,1):box('Fixed command lift sleeve',(sx*.75,sy*.86,.32),(.16,.16,.67),m.steel,name,.018)
    bottom=a.rect_ring(w/2,-length/2,length/2,.24,0)
    top=a.rect_ring(w/2-.24,-length/2+.20,length/2-.20,.20,h)
    for kind,edges,origin,rot in [
        ('Front',(0,),(0,-length/2,.13),(-math.pi/2,0,0)),
        ('Right',(1,2,3),(w/2,0,.13),(0,-math.pi/2,0)),
        ('Rear',(4,),(0,length/2,.13),(math.pi/2,0,0)),
        ('Left',(5,6,7),(-w/2,0,.13),(0,math.pi/2,0))]:
        n=name+kind;joint(n,name,closed=origin,rotation=rot,turn=(0,0,0),start=54,end=80)
        ox,oy,_=origin
        for edge in edges:
            j=(edge+1)%8
            b0,b1=bottom[edge],bottom[j];t0,t1=top[edge],top[j]
            dx=b1[0]-b0[0];dy=b1[1]-b0[1];ll=math.hypot(dx,dy);nx,ny=dy/ll,-dx/ll
            def face(fr0,fr1,out=0):
                pts=[]
                for v,t,f in ((b0,t0,fr0),(b1,t1,fr0),(b1,t1,fr1),(b0,t0,fr1)):
                    pts.append((v[0]+(t[0]-v[0])*f-ox+nx*out,v[1]+(t[1]-v[1])*f-oy+ny*out,h*f))
                return pts
            outer=face(0,1);inner=[(x-nx*.11,y-ny*.11,z) for x,y,z in outer]
            a.mesh('Command inclined armor',outer+inner,[(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],m.armor,n,.022)
            surface('Continuous command glazing',face(.51,.77,.022),.022,glazing,n)
            surface('Integrated command brow',face(.80,.96,.062),.035,m.edge,n)
            surface('Command faction lower band',face(.18,.28,.033),.022,m.team,n)
    travel=h-.59
    for step in range(2):
        n=f'CommandRoofRiser_{step}';parent=name if step==0 else 'CommandRoofRiser_0'
        joint(n,parent,closed=(0,0,.018),opened=(0,0,travel/2),start=48+step*3,end=72+step*3)
        for sx in (-1,1):
            for sy in (-1,1):box('Command roof piston',(sx*.75,sy*.86,.31),(.11-step*.025,.11-step*.025,.64),m.edge,n,.015)
    joint('ControlCabinRoof','CommandRoofRiser_1',closed=(0,0,.65))
    slab('Command continuous armor cap',1.52,2.19,-.015,.18,m.armor,'ControlCabinRoof',.23)
    slab('Command roof inset',1.23,1.69,.185,.23,m.panel,'ControlCabinRoof',.20)
    for x in (-.45,.45):box('Command cooling fin',(x,.35,.265),(.18,.61,.055),m.edge,'ControlCabinRoof',.012)

    # LEFT REAR POWER SPINE: paired telescopic cylinders, armored lower housings
    # and two upright thermal fins. These replace the freestanding generator box.
    n='UtilityPlant'
    joint(n,'RoofSlide_-1_0',closed=(0,1.4,.10),opened=(-.95,2.30,.10),start=38,end=69)
    slab('Power spine foundation',2.23,1.88,-.06,.18,m.panel,n,.27)
    for sx in (-1,1):
        box('Power spine skid',(sx*.72,0,-.10),(.18,1.56,.17),m.steel,n,.02)
        x=sx*.59
        cyl('Power column armored base',(x,-.10,.40),.48,.49,m.edge,n,vertices=12,rad=.035)
        cyl('Power column faction collar',(x,-.10,.30),.493,.16,m.team,n,vertices=12,rad=.018)
        cyl('Fixed turbine sleeve',(x,-.10,.88),.38,.92,m.armor,n,vertices=16,rad=.025)
        for k in range(8):
            angle=k*math.tau/8
            box('Power sleeve graphite flute',(x+.38*math.cos(angle),-.10+.38*math.sin(angle),.88),(.09,.09,.69),m.panel,n,.014)
        topname=f'PowerColumn_{sx}'
        joint(topname,n,closed=(x,-.10,.43),opened=(x,-.10,1.21),start=58,end=81)
        cyl('Power telescopic inner column',(0,0,.29),.29,.81,m.edge,topname,vertices=16,rad=.02)
        cyl('Power emitter cap',(0,0,.73),.44,.25,m.armor,topname,vertices=12,rad=.035)
        cyl('Power emitter faction belt',(0,0,.65),.447,.11,m.team,topname,vertices=12,rad=.012)
        a.fan(0,0,.87,.31,topname)
        fin=f'ThermalFin_{sx}'
        joint(fin,n,closed=(sx*.63,.71,.20),rotation=(math.pi/2,0,0),turn=(0,0,0),start=61,end=84)
        # Folded fin ends at packed Y≈0, entirely inside the capsule.
        verts=[(-.27,-.10,0),(.27,-.10,0),(.22,-.10,2.14),(-.15,-.10,2.30),
               (-.27,.10,0),(.27,.10,0),(.22,.10,2.14),(-.15,.10,2.30)]
        a.mesh('Tall armored thermal fin',verts,[(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],m.edge,fin,.035)
        box('Thermal fin faction field',(0,-.118,1.28),(.34,.025,1.64),m.team,fin,.014)
        for z in (.57,.91,1.25,1.59):box('Thermal fin radiator',(0,.125,z),(.33,.045,.17),sensor,fin,.012)

    # INTEGRATED FRONT-LEFT SENSOR BAY. A substantial armored lid opens before the
    # yoke rises and the segmented phased array tilts into its operating pose.
    n='RadarBase'
    joint(n,'RoofSlide_-1_1',closed=(0,1.45,.12),opened=(-.75,-3.30,.13),start=42,end=70)
    slab('Sensor bay armor',1.86,1.89,-.05,.22,m.edge,n,.25)
    for sx in (-1,1):
        box('Sensor mounting skid',(sx*.60,0,-.11),(.18,1.62,.19),m.steel,n,.02)
        box('Sensor bay raised cheek',(sx*.80,0,.34),(.21,1.53,.41),m.armor,n,.075)
    box('Sensor bay dark well',(0,0,.245),(1.33,1.45,.055),sensor,n,.03)
    joint('RadarBayLid',n,closed=(0,.79,.43),rotation=(0,0,0),turn=(-1.74,0,0),start=61,end=77)
    box('Sensor folding armored lid',(0,-.72,0),(1.65,1.57,.15),m.armor,'RadarBayLid',.065)
    box('Sensor lid faction center',(0,-.72,.087),(1.08,1.16,.035),m.team,'RadarBayLid',.025)
    cyl('Sensor fixed piston',(0,0,.49),.22,.70,m.edge,n,vertices=12,rad=.025)
    joint('RadarMast',n,closed=(0,-.08,.25),opened=(0,-.08,.99),start=69,end=83)
    cyl('Sensor yoke piston',(0,0,0),.14,.66,m.armor,'RadarMast',vertices=12,rad=.014)
    for sx in (-1,1):box('Sensor substantial yoke',(sx*.49,0,.22),(.14,.25,.49),m.edge,'RadarMast',.03)
    cyl('Sensor tilt axle',(0,0,.39),.12,1.16,m.edge,'RadarMast','X',12,.018)
    joint('RadarDish','RadarMast',closed=(0,0,.42),rotation=(0,0,0),turn=(1.02,0,-.18),start=77,end=89)
    slab('Phased array faceted back',1.61,1.08,-.10,.06,m.edge,'RadarDish',.20)
    slab('Phased array ceramic surround',1.48,.95,.055,.13,m.armor,'RadarDish',.18)
    for x in (-.45,0,.45):
        for y in (-.225,.225):
            box('Phased array sensor segment',(x,y,.153),(.39,.37,.06),sensor,'RadarDish',.045)
            box('Phased array recessed core',(x,y,.19),(.25,.23,.025),m.panel,'RadarDish',.025)
    box('Sensor active status slit',(0,-.42,.16),(.68,.04,.025),cyan,'RadarDish',.01)

    # GROUND LOGISTICS: protected cassettes on existing sliding aprons. Their
    # independent longitudinal guides pack them under the rear capsule rather
    # than leaving crates/barrels outside the truck silhouette.
    def cargo_root(name,parent,opened_y=-.88):
        joint(name,parent,closed=(0,3.03,.16),opened=(0,opened_y,.16),start=23,end=50)
        slab('Logistics cassette armored pallet',1.90,.89,-.04,.14,m.edge,name,.16)
        for x in (-.65,.65):box('Logistics runner',(x,0,-.11),(.16,.79,.17),m.steel,name,.02)
    cargo_root('MaterialsPallet','Apron_-1_1_-1')
    n='MaterialsPallet'
    box('Protected modular supply magazine',(0,.01,.49),(1.75,.77,.69),m.armor,n,.085)
    box('Supply magazine black opening',(0,-.395,.48),(1.49,.035,.44),sensor,n,.025)
    for x in (-.48,0,.48):
        box('Interlocked supply cartridge',(x,-.428,.48),(.42,.10,.34),m.panel,n,.025)
        box('Cartridge identification',(x,-.49,.54),(.20,.025,.08),m.team,n,.008)
    box('Supply magazine integrated brow',(0,-.40,.85),(1.89,.26,.17),m.edge,n,.035)
    cargo_root('BeamRack','Apron_1_1_-1')
    n='BeamRack'
    for x in (-.77,.77):box('Stock cassette armor cheek',(x,0,.42),(.22,.85,.69),m.armor,n,.055)
    for row in range(3):
        z=.22+row*.16
        for y in (-.18,.13):
            box('Captured stock beam',(0,y,z),(1.42,.16,.10),m.edge,n,.012)
    box('Stock cassette bridge',(0,.01,.74),(1.73,.87,.18),m.panel,n,.035)
    box('Stock cassette faction badge',(0,-.446,.75),(.65,.035,.12),m.team,n,.01)
    cargo_root('ServiceDrums','Apron_-1_0_-1',-.81)
    n='ServiceDrums'
    for x in (-.39,.39):
        cyl('Protected service canister',(x,0,.43),.26,.70,m.panel,n,'Y',12,.018)
        cyl('Service canister armored end',(x,-.37,.43),.28,.11,m.armor,n,'Y',12,.018)
        cyl('Service canister locking hub',(x,-.438,.43),.12,.055,m.edge,n,'Y',12,.01)
    box('Service canister top armor',(0,0,.75),(1.66,.83,.17),m.edge,n,.045)

    # Inset low worklights continue the armor edge. Legacy node names remain
    # stable for asset contract consumers, but the tall fence/pole clutter is gone.
    for s in (-1,1):
        n=f'WorklightMast_{s}'
        joint(n,f'RoofSlide_{s}_1',closed=(0,1.5,.12),opened=(0,-3.88,.13),start=58,end=83)
        box('Integrated perimeter light housing',(0,0,.15),(1.70,.31,.28),m.edge,n,.055)
        box('Recessed perimeter worklight',(0,-.17,.16),(1.16,.025,.085),ivory,n,.01)
        for x in (-.65,.65):box('Perimeter light armor cheek',(x,-.08,.17),(.24,.31,.27),m.armor,n,.035)

    return ['Workshop','ControlCabin','UtilityPlant','RadarDish','MaterialsPallet','BeamRack','ServiceDrums','WorklightMast_-1']
