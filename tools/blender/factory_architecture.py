"""Long barrel-vault factory, end-loading +X, authored inside a 4x3 tile pad.

The supplied RA2 reference governs the silhouette: a long arched production
hall, openable longitudinal roof halves, end portal/ramp, rear control plant.
Blender axes: +Z up, +X dispatch; world +X is screen-right/down.
"""
import math


def build(a):
    box, cyl, mesh = a.box, a.cylinder, a.mesh
    armor, edge, panel, team = a.armor, a.edge, a.panel, a.team
    steel, black, trim, roofmat = a.steel, a.black, a.trim, a.roofmat

    def arch(name, x0, x1, y0, y1, z0, z1, mat, group, segments=20):
        # A hollow elliptical arch extrusion with inner and outer surfaces.
        verts = []
        for x in (x0, x1):
            for ry, rz in ((y0, z0), (y1, z1)):
                verts += [(x, ry * math.cos(i*math.pi/segments),
                           2.6 + rz*math.sin(i*math.pi/segments))
                          for i in range(segments+1)]
        n=segments+1; faces=[]
        for i in range(segments):
            faces += [(i,i+1,2*n+i+1,2*n+i),
                      (n+i,3*n+i,3*n+i+1,n+i+1),
                      (i,n+i,n+i+1,i+1),
                      (2*n+i,2*n+i+1,3*n+i+1,3*n+i)]
        faces += [(0,2*n,3*n,n),(n-1,2*n-1,4*n-1,3*n-1)]
        return mesh(name,verts,faces,mat,group,.025)

    def roof_patch(name,x0,x1,t0,t1,mat,group,raise_by=0):
        verts=[]
        for x in (x0,x1):
            for r in (0,-.17):
                for t in (t0,t1):
                    verts.append((x,(6.45+r)*math.cos(t),
                                  2.6+(6.35+r)*math.sin(t)+raise_by))
        return mesh(name,verts,[(0,1,5,4),(2,6,7,3),(0,4,6,2),
                               (1,3,7,5),(0,2,3,1),(4,5,7,6)],mat,group,.018)

    # Pad nearly fills 440 x 330 world units, without a broad empty parking slab.
    box('Integrated factory foundation',(0,0,.10),(21.9,16.35,.20),roofmat,'Hull',.10)
    box('Indoor vehicle lane',(.4,0,.28),(19.9,12.7,.32),steel,'Floor',.025)
    for y in (-4.7,4.7):
        box('Inset lane guide',(.2,y,.455),(19.1,.06,.025),a.yellow,'Floor',0)
    for x in (-6,-2,2,6):
        box('Floor drainage channel',(x,0,.465),(.075,11.9,.02),black,'Floor',0)

    # Short armored lower walls, not the former tall box-shaped warehouse.
    for side in (-1,1):
        group='WallL' if side<0 else 'WallR'
        box('Hall graphite sill',(-.70,side*6.35,1.30),(20.0,.55,2.30),panel,group,.12)
        box('Faction lower band',(-.7,side*6.66,1.77),(19.7,.08,.40),team,group,.015)
        box('Foot armor molding',(-.7,side*6.70,.50),(20.0,.43,.40),edge,group,.06)
        for x in (-9.8,-5.2,-.6,4.0,8.4):
            box('Angled structural foot',(x,side*6.73,1.17),(.65,1.30,2.24),trim,group,.08,
                rotation=(side*.11,0,0))
            box('Pier machined face',(x,side*7.31,1.07),(.37,.055,1.02),armor,group,.045)
            cyl('Pier foundation lock',(x,side*7.00,.27),.17,.12,steel,group,vertices=8)
        for x in (-6,-2,2,6):
            box('Recessed wall intake',(x,side*6.67,.99),(2.2,.08,.66),black,group,.045)
            for z in (.79,.94,1.09,1.24):
                box('Intake louvre',(x,side*6.74,z),(2.0,.065,.035),edge,group,.01)
        # Hinge rails belong to the fixed frame, while roof skins open as leaves.
        cyl('Longitudinal roof hinge',(-.5,side*6.40,2.6),.16,19.8,steel,'RoofFrame',axis='X')

    # Ten curved armor bays and curved team-color panels share the yard palette.
    for side in (-1,1):
        group='RoofL' if side<0 else 'RoofR'
        begin,end=(math.pi/2,math.pi) if side<0 else (0,math.pi/2)
        for bay in range(5):
            x0=-10.3+bay*3.94; x1=x0+3.81
            for k in range(8):
                t0=begin+(end-begin)*k/8; t1=begin+(end-begin)*(k+1)/8
                roof_patch('Vault ceramic armor',x0,x1,t0,t1,armor,group)
            for k in range(2,5):
                t0=begin+(end-begin)*(k+.06)/8; t1=begin+(end-begin)*(k+.94)/8
                roof_patch('Vault broad faction insert',x0+.38,x1-.38,t0,t1,team,group,.035)
            for x in (x0+.07,x1-.02):
                for k in range(8):
                    roof_patch('Vault dark reinforcement rib',x,x+.12,
                               begin+(end-begin)*k/8,begin+(end-begin)*(k+1)/8,edge,group,.12)
            for x in (x0+.42,x1-.42):
                box('Roof maintenance clasp',(x,side*6.49,2.95),(.19,.18,.43),trim,group,.025)

    # Arched portal is at the END of the long hall, as in the supplied reference.
    arch('Front armored arch',8.50,9.22,6.85,5.92,6.76,5.82,edge,'Front')
    arch('Front silver arch facing',9.22,9.38,6.70,6.27,6.59,6.15,armor,'Front')
    arch('Portal inner reveal',8.30,9.34,5.95,5.76,5.85,5.64,steel,'Front')
    for side in (-1,1):
        box('Portal base column',(8.99,side*6.37,1.50),(1.20,1.22,2.72),edge,'Front',.14)
        box('Portal silver cheek',(9.62,side*6.36,1.60),(.12,.67,2.17),armor,'Front',.08)
        box('Portal direction lamp',(9.72,side*6.36,2.23),(.05,.31,.62),a.light,'Front',.035)
        box('Portal faction badge',(9.73,side*6.36,.79),(.055,.58,.39),team,'Front',.035)
        # Low guide rails leave the full arched mouth unobstructed.
        box('Ramp low guide',(11.03,side*5.76,.54),(3.10,.24,.47),edge,'Ramp',.07)
        cyl('Ramp beacon',(12.52,side*5.76,.92),.13,.31,a.light,'Ramp',vertices=12)
    # A straight roller cassette sits below the arch crown. Curved fixed
    # spandrels fill the rest of the portal, so a rolled shutter cannot leave
    # long floating slats poking through the curved roof.
    for side in (-1,1):
        ys=[side*(4.12+(5.76-4.12)*i/8) for i in range(9)]
        points=[(y,.40) for y in ys]+[(y,2.6+5.64*math.sqrt(max(0,1-(y/5.76)**2))) for y in reversed(ys)]
        verts=[(x,y,z) for x in (8.38,8.83) for y,z in points];n=len(points)
        mesh('Portal curved side infill',verts,[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],edge,'Front',.015)
    points=[(-4.12,6.43),(4.12,6.43)]+[(4.12-8.24*i/16,2.6+5.64*math.sqrt(1-((4.12-8.24*i/16)/5.76)**2)) for i in range(17)]
    n=len(points);mesh('Portal upper curved infill',[(x,y,z) for x in (8.38,8.83) for y,z in points],[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],panel,'Front',.015)
    box('Roller cassette lintel',(8.93,0,6.55),(.51,8.66,.38),edge,'Front',.08)
    for y in (-2.7,0,2.7):box('Portal worklight',(9.21,y,6.54),(.04,1.45,.10),a.light,'Front',.018)
    box('Rolling shutter',(8.60,0,3.44),(.25,8.18,5.98),panel,'Door',.025)
    for z in [0.65+i*.29 for i in range(20)]:
        box('Shutter narrow slat',(8.755,0,z),(.065,8.14,.065),steel,'Door',.01)
    mesh('Vehicle ramp',[(8.7,-5.6,.45),(12.8,-5.6,.05),(12.8,5.6,.05),(8.7,5.6,.45),
                        (8.7,-5.6,0),(12.8,-5.6,0),(12.8,5.6,0),(8.7,5.6,0)],
         [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],steel,'Ramp',.025)
    for i in range(13):
        x=8.95+i*.29;z=.45-(x-8.7)*.0976
        for y in (-2.85,2.85):box('Ramp traction strip',(x,y,z+.045),(.07,4.85,.055),trim,'Ramp',.01)

    # Rear bulkhead and an asymmetrical control/utility cluster distinguish the
    # factory from a second construction yard without changing faction styling.
    arch('Rear curved bulkhead',-10.72,-10.46,6.43,.02,6.32,.02,panel,'Rear')
    box('Rear lower wall',(-10.59,0,1.43),(.45,12.65,2.55),panel,'Rear',.055)
    box('Rear service plinth',(-9.55,0,.45),(2.65,15.7,.70),edge,'Equipment',.10)
    box('Rear command tower',(-9.16,-4.43,4.52),(2.77,3.32,7.68),a.concrete,'Equipment',.20)
    for z in (1.15,5.20,7.78):
        box('Command tower ceramic collar',(-9.16,-4.43,z),(2.94,3.48,.40),armor,'Equipment',.08)
    box('Command tower glazing',(-9.16,-6.13,6.51),(2.24,.065,1.10),black,'Equipment',.03)
    for x in (-9.89,-9.16,-8.43):
        box('Command glazing mullion',(x,-6.18,6.51),(.08,.09,1.12),trim,'Equipment',.01)
    box('Command faction identifier',(-9.16,-6.14,3.62),(1.85,.06,1.85),team,'Equipment',.09)
    cyl('Control radar turret',(-9.16,-4.43,8.17),1.10,.44,edge,'Equipment')
    cyl('Radar ceramic rim',(-9.16,-4.43,8.46),1.02,.14,armor,'Equipment')
    box('Radar support',(-9.16,-4.43,9.0),(.23,.30,1.0),steel,'Equipment',.025)
    box('Rear command radar',(-9.16,-4.24,9.65),(1.75,.18,1.25),panel,'Equipment',.08,rotation=(.30,0,0))
    for x in (-9.70,-9.16,-8.62):
        box('Radar sensor segment',(x,-4.42,9.62),(.43,.07,.95),trim,'Equipment',.025,rotation=(.30,0,0))
    cyl('Communication mast',(-9.7,-3.4,9.05),.045,2.35,steel,'Equipment',vertices=8)
    for y in (.25,3.25,6.20):
        box('Rear power cassette',(-9.44,y,2.12),(2.43,2.47,3.17),a.concrete,'Equipment',.16)
        box('Power cassette silver lid',(-9.44,y,3.73),(2.49,2.52,.27),armor,'Equipment',.065)
        cyl('Cooling fan recess',(-9.44,y,3.91),.77,.09,black,'Equipment')
        for k in range(5):box('Cooling fan blade',(-9.44,y,3.98),(.14,1.25,.06),steel,'Equipment',.012,rotation=(0,0,k*math.pi/5))
        cyl('Cooling fan hub',(-9.44,y,4.03),.18,.12,edge,'Equipment')
        box('Power cassette faction belt',(-10.69,y,2.88),(.065,1.93,.40),team,'Equipment',.018)
    # Mounted service lockers and crates stay clear of the production lane.
    for x in (-5.8,-3.9):
        box('Attached service locker',(x,-7.31,1.10),(1.58,1.26,1.34),a.concrete,'WallL',.09)
        box('Locker inset',(x,-7.96,1.11),(1.21,.045,.82),panel,'WallL',.03)
        box('Locker handle',(x+.36,-8.0,1.1),(.06,.065,.31),armor,'WallL',.012)
    for side in (-1,1):
        box('Interior maintenance station',(-6.4,side*5.3,1.02),(2.1,1.02,1.22),edge,'Floor',.08)

    # Keep the 19.6 m packed MCV within the 20 m production chamber. The
    # portal stays inside the end tile; rear equipment sits beside the lane.
    from mathutils import Matrix
    for group in ('Front','Door','Ramp'):
        for obj in a.parts[group]:obj.location.x += .9
    command_prefixes=('Rear command','Command','Control radar','Radar','Communication')
    power_prefixes=('Rear power','Power cassette','Cooling fan')
    for obj in a.parts['Equipment']:
        if obj.name.startswith(command_prefixes):
            obj.location.y -= 2.0
            if obj.name.startswith('Rear command tower'):
                obj.scale.z *= 1.30; obj.location.z += 1.15
            elif obj.location.z >= 5.0:obj.location.z += 2.30
        elif obj.name.startswith(power_prefixes):
            # The rear fan bank folds around the far shoulder of the hall.
            pivot=Matrix.Translation((-9.05,6.65,0)) @ Matrix.Rotation(-math.pi/2,4,'Z') @ Matrix.Translation((9.44,0,0))
            obj.matrix_world=pivot @ obj.matrix_world

    return {'revision':3,'worldUnitsPerMetre':20,'footprint':[4,3],
            'modelYaw':0,'exitHeading':0,'exitLocal':[9.62,0,0],
            'roofAxis':'x','buildSeconds':1.6,
            'style':'long barrel vault with end portal and rear control plant',
            'groundBoundsMetres':[-10.95,-8.175,10.95,8.175]}
