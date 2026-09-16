"""Operational equipment for the deployable construction yard.

All geometry is local to rigid joints. Equipment rides the existing deck/roof
carriages; cabin walls hinge and their roof rises on telescopic posts. No runtime
visibility or scale trick is required. Coordinates are Blender metres/Z-up.
"""
import math

def build_yard_equipment(a):
    box,cyl,beam,joint=a.box,a.cylinder,a.beam,a.joint
    m=a.materials
    olive=a.material('Workshop | olive enamel',(.125,.155,.125),.32,.69)
    cabin=a.material('Control cabin | warm enamel',(.25,.255,.20),.30,.63)
    cargo=a.material('Cargo | dark painted steel',(.095,.12,.11),.4,.69)
    windows=a.material('Control cabin | blue smoked glazing',(.013,.048,.065),.5,.22)
    worklight=a.material('Worklight | warm diffuser',(.85,.76,.47),.05,.24)
    bs=worklight.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Emission Color'].default_value=(.72,.53,.21,1)
    bs.inputs['Emission Strength'].default_value=.5
    a.weather(olive,131);a.weather(cabin,132);a.weather(cargo,133)

    def rail(name,parent,opened,closed=(0,1.3,.18),start=37,end=67):
        joint(name,parent,closed=closed,opened=opened,start=start,end=end)

    def enclosure(name,parent,location,w,length,h,mat,control=False):
        # Two unequal architectural masses. The side/end leaves fit inside the
        # capsule when horizontal, rather than hiding a full-size finished box.
        rail(name,parent,location)
        box(name+' floor',(0,0,.055),(w+.12,length+.12,.14),m.steel,name,.025)
        for sx in (-1,1):
            box('Container mounting skid',(sx*w*.37,0,-.06),(.19,length*.88,.20),m.steel,name,.02)
            for sy in (-1,1):
                box('Fixed roof lift sleeve',(sx*(w/2-.10),sy*(length/2-.11),.31),(.14,.14,.63),m.steel,name,.02)
        for side in (-1,1):
            sidewall=name+f'_Side_{side}'
            joint(sidewall,name,closed=(side*w/2,0,.12),rotation=(0,-side*math.pi/2,0),turn=(0,0,0),start=55,end=78)
            box('Corrugated side wall',(0,0,h*.49),(.10,length,h*.98),mat,sidewall,.018)
            # Strong ribs read at gameplay zoom, not only in a model close-up.
            for j in range(int(length/.30)+1):
                y=-length*.46+j*(length*.92/int(length/.30))
                box('Container corrugation',(side*.073,y,h*.50),(.07,.060,h*.84),m.edge,sidewall,.008)
            for z in (.10,h-.04):box('Container wall rail',(side*.01,0,z),(.18,length+.06,.13),m.edge,sidewall,.022)
            box('Lower faction identification',(side*.13,0,.24),(.035,length*.75,.12),m.team,sidewall,.008)
            if control and side==1:
                box('Side console window',(side*.136,-.10,h*.69),(.034,length*.57,.38),windows,sidewall,.018)
                box('Side window top trim',(side*.16,-.1,h*.69+.21),(.035,length*.63,.05),m.edge,sidewall,0)
        for sy in (-1,1):
            end=name+f'_End_{sy}'
            joint(end,name,closed=(0,sy*length/2,.15),rotation=(sy*math.pi/2,0,0),turn=(0,0,0),start=57,end=80)
            box('Container end wall',(0,0,h*.48),(w,.095,h*.96),mat,end,.022)
            for sx in (-1,1):box('Corner casting',(sx*(w/2-.045),sy*.01,h*.5),(.15,.18,h+.04),m.edge,end,.025)
            if control and sy==-1:
                box('Control cabin panoramic glass',(-.20,-.068,h*.71),(w*.71,.033,.41),windows,end,.016)
                for x in (-w*.36,-.23,w*.2):box('Glazing mullion',(x,-.095,h*.71),(.045,.04,.44),m.edge,end,0)
                box('Cabin door',(w*.31,-.072,h*.34),(w*.27,.045,h*.60),m.panel,end,.012)
                box('Cabin handle',(w*.39,-.111,h*.37),(.025,.055,.15),m.edge,end,.01)
                box('Door step',(w*.31,-.26,.05),(w*.35,.50,.10),m.steel,end,.018)
                box('Window sunshade',(-.20,-.24,h*.96),(w*.81,.42,.11),m.edge,end,.025)
            elif sy==-1:
                for sx in (-1,1):
                    box('Workshop double door',(sx*w*.23,-.066,h*.49),(w*.43,.042,h*.80),m.panel,end,.012)
                    cyl('Door locking rod',(sx*w*.18,-.103,h*.49),.027,h*.76,m.edge,end,vertices=8,rad=0)
                    for z in (h*.20,h*.75):box('Door hinge',(sx*w*.42,-.111,z),(.12,.055,.07),m.edge,end,.008)
                box('Workshop warning plate',(w*.27,-.103,h*.69),(.26,.026,.18),m.yellow,end,.01)
        # Nested roof support posts remain connected while their roof lifts.
        maxtravel=h-.61
        for step in range(2):
            n=name+f'_RoofRiser_{step}';par=name if step==0 else name+'_RoofRiser_0'
            joint(n,par,closed=(0,0,.02),opened=(0,0,maxtravel/2),start=47+step*3,end=70+step*3)
            for sx in (-1,1):
                for sy in (-1,1):
                    box('Telescopic cabin corner',(sx*(w/2-.10),sy*(length/2-.11),.31),(.10-step*.025,.10-step*.025,.63),m.edge,n,.012)
        roof=name+'_Roof'
        joint(roof,name+'_RoofRiser_1',closed=(0,0,.61))
        box('Raised container roof',(0,0,.035),(w+.20,length+.20,.14),m.armor,roof,.04)
        for y in (-length*.38,0,length*.38):box('Roof cross rib',(0,y,.13),(w+.05,.06,.07),m.edge,roof,.012)
        for sx in (-1,1):
            for sy in (-1,1):cyl('Lifting eye',(sx*w*.40,sy*length*.40,.15),.055,.04,m.steel,roof,vertices=8,rad=0)
        if control:
            # Small roof ventilation unit; the nearby radar is the tall feature.
            box('Cabin air conditioner',(-.34,.43,.34),(.81,.66,.42),m.panel,roof,.04)
            a.fan(-.34,.43,.58,.25,roof)
            for j in range(4):box('Air conditioner louvre',(-.34,-.012,.24+j*.065),(.59,.025,.03),m.steel,roof,0)
        return name

    # The crane corridor remains clear. Camera is +X/-Y; the windowed cabin and
    # rear radar read on the right, the longer workshop reads behind the mast.
    enclosure('Workshop','RoofSlide_-1_0',(-.86,1.69,.21),2.15,3.65,1.72,olive)
    enclosure('ControlCabin','RoofSlide_1_0',(.84,-2.15,.21),2.14,2.56,1.38,cabin,control=True)

    # Short mechanical plant provides a low third mass in the front-left corner.
    rail('UtilityPlant','RoofSlide_-1_0',(-.88,-2.45,.18),closed=(0,1.22,.17),start=39,end=69)
    n='UtilityPlant'
    box('Generator plinth',(0,0,.06),(2.08,1.66,.15),m.steel,n,.025)
    for sx in (-1,1):box('Plant mounting skid',(sx*.69,0,-.06),(.19,1.44,.18),m.steel,n,.02)
    box('Generator enclosure',(-.18,0,.48),(1.56,1.42,.74),m.panel,n,.075)
    for y in (-.39,.39):a.fan(-.23,y,.91,.32,n)
    box('Generator dark grille',(-.18,-.735,.48),(1.17,.035,.43),m.black,n,.018)
    for j in range(5):box('Generator front louvre',(-.18,-.774,.31+j*.084),(1.10,.04,.035),m.edge,n,0)
    box('Generator switchgear',(.77,.20,.47),(.42,.73,.68),olive,n,.035)
    box('Generator switch panel',(.80,-.19,.51),(.28,.02,.24),m.black,n,.01)
    for x in (.72,.82,.92):cyl('Status lamp',(x,-.212,.55),.023,.025,worklight,n,'Y',8,0)
    for sy in (-1,1):
        # Short, chunky U pipes join the plant to the deck instead of floating.
        p0=(.42,sy*.58,.68);p1=(.91,sy*.58,.68);p2=(1.00,sy*.58,.39);p3=(1.00,sy*.58,.13)
        for p,q in zip((p0,p1,p2),(p1,p2,p3)):beam('Plant service pipe',p,q,.09,m.edge,n)
        cyl('Pipe flange',(1.0,sy*.58,.17),.14,.07,m.steel,n,vertices=12,rad=.008)

    # Roof access is visible around the equipment. Railings fold down onto their
    # carriage while packed, so the vehicle does not acquire permanent fencework.
    for s in (-1,1):
        for j in range(2):
            parent=f'RoofSlide_{s}_{j}'
            box('Service walkway',(0,-3.94,.18),(1.92,.62,.08),m.steel,parent,.014)
            for k in range(9):box('Walkway grating',(-.82+k*.205,-3.94,.23),(.045,.54,.025),m.edge,parent,0)
            for sy in (-1,1):
                n=f'RoofGuard_{s}_{j}_{sy}'
                joint(n,parent,closed=(0,sy*4.17,.22),rotation=(sy*math.pi/2,0,0),turn=(0,0,0),start=66,end=85)
                for x in (-.88,.88):beam('Guardrail stanchion',(x,0,0),(x,0,.72),.035,m.edge,n)
                for z in (.37,.72):beam('Guardrail tube',(-.88,0,z),(.88,0,z),.031,m.edge,n)

    # Fold-up communications platform. The dish has an actual concave front,
    # rear skin, strengthening ribs, feed horn and two nested mast sections.
    rail('RadarBase','RoofSlide_1_0',(1.12,2.53,.21),closed=(0,1.25,.18),start=42,end=70)
    box('Radar mounting plate',(0,0,.065),(1.59,1.44,.15),m.steel,'RadarBase',.06)
    for sx in (-1,1):box('Radar mounting skid',(sx*.49,0,-.055),(.18,1.30,.20),m.steel,'RadarBase',.02)
    cyl('Radar pedestal',(0,0,.27),.44,.45,m.armor,'RadarBase',vertices=16,rad=.035)
    cyl('Radar pedestal band',(0,0,.35),.452,.12,m.team,'RadarBase',vertices=16,rad=.012)
    joint('RadarMast','RadarBase',closed=(0,0,.24),opened=(0,0,.81),start=66,end=80)
    cyl('Radar lift piston',(0,0,.0),.16,.76,m.edge,'RadarMast',vertices=12,rad=.012)
    box('Radar yoke',(0,0,.26),(.62,.42,.27),m.panel,'RadarMast',.045)
    joint('RadarDish','RadarMast',closed=(0,0,.41),rotation=(0,0,0),turn=(1.08,0,-.34),start=74,end=88)
    n='RadarDish';radius=.93;segments=28;rings=(.20,.47,.72,.93)
    verts=[(0,0,0)];faces=[]
    for r in rings:
        verts.extend((r*math.cos(k*math.tau/segments),r*math.sin(k*math.tau/segments),.22*(r/radius)**2) for k in range(segments))
    for k in range(segments):faces.append((0,1+k,1+(k+1)%segments))
    for ring in range(3):
        for k in range(segments):
            a0=1+ring*segments+k;a1=1+ring*segments+(k+1)%segments
            faces.append((a0,a0+segments,a1+segments,a1))
    a.mesh('Radar parabolic reflector',verts,faces,m.armor,n)
    # Backplate has reversed faces and constant thickness, visible while folded.
    a.mesh('Radar reflector back',[(x,y,z-.055) for x,y,z in verts],[tuple(reversed(f)) for f in faces],m.panel,n)
    for k in range(segments):
        t0=k*math.tau/segments;t1=(k+1)*math.tau/segments
        beam('Dish rolled rim',(radius*math.cos(t0),radius*math.sin(t0),.22),(radius*math.cos(t1),radius*math.sin(t1),.22),.035,m.edge,n)
    for k in range(4):
        t=k*math.tau/4
        beam('Radar feed support',(.78*math.cos(t),.78*math.sin(t),.18),(0,0,.61),.023,m.steel,n)
        beam('Dish rear brace',(.10*math.cos(t),.10*math.sin(t),-.07),(.85*math.cos(t),.85*math.sin(t),.12),.029,m.edge,n)
    cyl('Radar feed horn',(0,0,.65),.105,.17,m.black,n,vertices=12,rad=.012)
    cyl('Radar sensor cap',(0,0,.74),.092,.025,windows,n,vertices=12,rad=0)

    # Two asymmetrical folding light masts bracket the installation.
    for s,sy in ((-1,-1),(1,1)):
        n=f'WorklightMast_{s}'
        joint(n,f'RoofSlide_{s}_1',closed=(0,sy*3.32,.24),opened=(0,sy*4.10,.24),rotation=(sy*math.pi/2,0,0),turn=(0,0,0),start=66,end=86)
        cyl('Light mast foot',(0,0,.05),.14,.12,m.steel,n,vertices=12,rad=.01)
        beam('Worklight pole',(0,0,0),(0,0,1.27),.044,m.edge,n)
        beam('Lamp support bar',(-.38,0,1.25),(.38,0,1.25),.04,m.steel,n)
        for x in (-.28,.28):
            box('Floodlight housing',(x,0,1.32),(.40,.25,.32),m.steel,n,.04)
            box('Floodlight diffuser',(x,-.138,1.32),(.31,.02,.22),worklight,n,.023)

    # Loaded ground aprons: all supplies ride real sliding floor cassettes.
    def crate(name,pos,size,parent):
        x,y,z=pos;w,d,h=size
        box(name,(x,y,z+h/2),(w,d,h),cargo,parent,.035)
        for sx in (-1,1):
            box('Crate edge',(x+sx*(w/2-.045),y-d/2-.01,z+h/2),(.065,.045,h),m.edge,parent,.008)
            box('Crate lid band',(x+sx*w*.26,y,z+h+.025),(.075,d+.04,.045),m.edge,parent,.008)
        box('Shipping label',(x,y-d/2-.031,z+h*.58),(w*.27,.018,h*.27),m.yellow,parent,.004)
        box('Crate lid',(x,y,z+h),(w+.03,d+.03,.075),m.panel,parent,.018)
    n='MaterialsPallet';joint(n,'Apron_-1_1_-1',closed=(0,-.88,.12))
    for x in (-.63,0,.63):box('Pallet runner',(x,0,.035),(.15,.76,.11),m.steel,n,.012)
    for y in (-.28,0,.28):box('Pallet deck',(0,y,.11),(1.80,.20,.09),m.edge,n,.012)
    crate('Large shipping crate',(-.42,0,.15),(.83,.69,.58),n)
    crate('Tooling crate',(.48,0,.15),(.72,.66,.46),n)
    crate('Stacked spare parts',(-.40,.03,.78),(.61,.54,.33),n)
    n='BeamRack';joint(n,'Apron_1_1_-1',closed=(0,-.88,.12))
    for x in (-.68,.68):box('Beam rack support',(x,0,.13),(.17,.80,.25),m.steel,n,.018)
    for row in range(2):
        for j in range(3):
            z=.31+row*.18;y=(j-1)*.22
            box('Stock I beam web',(0,y,z),(1.73,.035,.16),m.steel,n,.002)
            for zz in (-.08,.08):box('Stock I beam flange',(0,y,z+zz),(1.73,.16,.04),m.edge,n,.004)
    for x in (-.5,.5):box('Beam bundle strap',(x,0,.61),(.085,.65,.045),m.yellow,n,.008)
    n='ServiceDrums';joint(n,'Apron_-1_0_-1',closed=(0,-.81,.13))
    for x in (-.35,.35):
        cyl('Service drum',(x,0,.41),.29,.76,olive,n,vertices=20,rad=.018)
        for z in (.06,.74):cyl('Drum rolled rim',(x,0,z),.31,.065,m.edge,n,vertices=20,rad=.008)
        cyl('Drum faction band',(x,0,.37),.299,.15,m.team,n,vertices=20,rad=0)
        cyl('Drum filler cap',(x+.12,0,.81),.055,.025,m.steel,n,vertices=8,rad=0)

    # Small access steps and a side ladder make the occupied cabin read as a
    # building. They fold with the existing end bulkhead, not through the roof.
    n='AccessLadder';joint(n,'EndLeaf_1_-1_1',closed=(.24,-.08,.08))
    for x in (-.26,.26):beam('Ladder rail',(x,-.12,.12),(x,1.25,2.96),.035,m.edge,n)
    for j in range(9):
        t=j/8;beam('Ladder rung',(-.27,-.12+t*1.37,.12+t*2.84),(.27,-.12+t*1.37,.12+t*2.84),.033,m.edge,n)

    return ['Workshop','ControlCabin','UtilityPlant','RadarDish','MaterialsPallet','BeamRack','ServiceDrums','WorklightMast_-1']
