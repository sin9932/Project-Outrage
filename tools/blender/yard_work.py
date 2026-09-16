"""Rigid construction-yard logistics action, in Blender metres (+Z up).

The separate Work clip starts and finishes at the exact Deploy endpoint. The
crane has a level two-jaw spreader and four overlapping, fixed-length hoist
sections. The cargo follows the spreader during its lift, then a receiving
conveyor carries it through the warehouse shutter. Its replenishment route is
inside the opaque chassis: no mesh visibility, alpha or animated scale changes.
"""
import math


WORK_FRAMES = 96
WORK_SECONDS = 3.2
PICK = (-.65, -5.15, 2.965)
LAND = (2.05, -2.10, 2.965)
CRANE_BASE = (-2.25, -1.65, 6.54)
SECTION_LENGTH = 1.70
GRIP_OFFSET = .635
REQUIRED_NODES = ('WorkGimbal', 'WorkGripper', 'WorkJaw_-1', 'WorkJaw_1',
                  'WorkContainer', 'WarehouseShutter_0', 'WarehouseShutter_1')


def _smooth(t):
    t = max(0., min(1., t))
    return t*t*(3.-2.*t)


def _mix(a, b, t):
    return a+(b-a)*t


def _track(frame, points):
    if frame <= points[0][0]:
        return points[0][1]
    for (fa, a), (fb, b) in zip(points, points[1:]):
        if frame <= fb:
            return _mix(a, b, _smooth((frame-fa)/(fb-fa)))
    return points[-1][1]


def _reach(point, pitch):
    dx, dy = point[0]-CRANE_BASE[0], point[1]-CRANE_BASE[1]
    radius = math.hypot(dx, dy)
    yaw = math.atan2(dy, dx)+math.pi
    extension = (radius-.34+.10*math.sin(pitch))/math.cos(pitch)-1.45
    return yaw, pitch, extension


def _tip(yaw, pitch, extension):
    reach = .34+(extension+1.45)*math.cos(pitch)-.10*math.sin(pitch)
    return (CRANE_BASE[0]-reach*math.cos(yaw),
            CRANE_BASE[1]-reach*math.sin(yaw),
            CRANE_BASE[2]+(extension+1.45)*math.sin(pitch)+.10*math.cos(pitch))


def work_pose(frame, rig):
    """Return local transform overrides after all joints take opened/turn.

    Cargo-to-gripper attachment is solved from the same boom transforms, so the
    cargo does not slip through the jaws while the crane slews and telescopes.
    Default endpoint transforms are deliberately used verbatim at both ends.
    """
    if frame <= 0 or frame >= WORK_FRAMES:
        return {}
    pickup = _reach(PICK, .30)
    landing = _reach(LAND, .17)
    yaw = _track(frame, [(0, math.pi/2), (12, pickup[0]), (34, pickup[0]),
                         (52, landing[0]), (74, landing[0]), (94, math.pi/2)])
    pitch = _track(frame, [(0, .17), (12, pickup[1]), (34, pickup[1]),
                           (52, landing[1]), (74, landing[1]), (94, .17)])
    extension = _track(frame, [(0, 3.05), (12, pickup[2]), (34, pickup[2]),
                               (52, landing[2]), (74, landing[2]), (94, 3.05)])
    tip = _tip(yaw, pitch, extension)
    # Approach above the load, lower, close, hoist, carry, set down, and raise.
    pickup_length = _tip(*pickup)[2]-(PICK[2]+GRIP_OFFSET)
    landing_length = _tip(*landing)[2]-(LAND[2]+GRIP_OFFSET)
    if frame < 34:
        length = _track(frame, [(0, SECTION_LENGTH), (12, SECTION_LENGTH),
                               (22, pickup_length), (26, pickup_length),
                               (34, pickup_length-.69)])
    elif frame <= 52:
        length = tip[2]-(PICK[2]+GRIP_OFFSET+.69)
    else:
        length = _track(frame, [(52, landing_length-.69), (60, landing_length),
                               (64, landing_length), (74, SECTION_LENGTH)])
    spacing = (length-SECTION_LENGTH)/3.
    jaw = _track(frame, [(0, .70), (22, .70), (26, .4975),
                         (60, .4975), (64, .70)])
    overrides = {
        'BoomYaw': {'rotation': (0., 0., yaw)},
        'BoomHinge': {'rotation': (0., pitch, 0.)},
        'BoomExtension': {'location': (-extension, 0., .10)},
        'WorkGimbal': {'rotation': (0., -pitch, 0.)},
        'WorkGripper': {'rotation': (0., 0., -yaw)},
    }
    for index in range(1, 4):
        overrides[f'WorkCable_{index}'] = {'location': (0., 0., -spacing)}
    for side in (-1, 1):
        overrides[f'WorkJaw_{side}'] = {'location': (side*jaw, 0., -.08)}
    if frame < 26:
        cargo = PICK
    elif frame <= 60:
        cargo = (tip[0], tip[1], tip[2]-length-GRIP_OFFSET)
    elif frame <= 74:
        cargo = (LAND[0], _track(frame, [(60, LAND[1]), (64, LAND[1]), (74, .70)]), LAND[2])
    elif frame <= 76:
        cargo = (LAND[0], .70, LAND[2])
    elif frame <= 81:
        cargo = (LAND[0], .70, _track(frame, [(76, LAND[2]), (81, 1.15)]))
    elif frame <= 87:
        t = _smooth((frame-81)/6.)
        cargo = (_mix(LAND[0], PICK[0], t), _mix(.70, PICK[1], t), 1.15)
    else:
        cargo = (PICK[0], PICK[1], _track(frame, [(87, 1.15), (96, PICK[2])]))
    overrides['WorkContainer'] = {'location': cargo}
    lid = _track(frame, [(0, 1.35), (28, 1.35), (36, 0.),
                         (80, 0.), (87, 1.35)])
    overrides['WorkSupplyLid'] = {'location': (0., lid, .16)}
    door = _track(frame, [(0, 0.), (46, 0.), (56, 1.), (70, 1.), (76, 0.)])
    for course in range(2):
        name = f'WarehouseShutter_{course}'
        x, y, z = rig[name]['opened']
        overrides[name] = {'location': (x, y, z+door*(1.50-.75*course))}
    return overrides


def build_work_equipment(a):
    """Add rigid work equipment before the caller bakes geometry and clips."""
    box, cyl, beam, joint = a.box, a.cylinder, a.beam, a.joint
    m = a.materials
    # The legacy hook remains the named attachment joint, but its hook mesh is
    # superseded by the real level spreader. Delete those four primitives only.
    for obj in list(a.parts.pop('Hook', [])):
        a.remove_object(obj)
    a.rig['Hook'].update(opened=(-1.45, 0., 0.), rotation=(0., 0., 0.), turn=(0., 0., 0.))
    joint('WorkGimbal', 'Hook', rotation=(0., -math.pi/2, 0.),
          turn=(0., -.17, 0.), start=79, end=90)
    cyl('Hoist tip universal axle', (0, 0, 0), .115, .44, m.edge, 'WorkGimbal', 'Y', 12, .01)
    for index in range(4):
        name = f'WorkCable_{index}'
        parent = 'WorkGimbal' if index == 0 else f'WorkCable_{index-1}'
        joint(name, parent)
        # Collinear overlapping cable runs remain fixed length. Only their
        # parent offsets slide, keeping the whole suspension attached.
        beam('Retracting hoist line', (0, 0, .025), (0, 0, -SECTION_LENGTH),
             .027-index*.003, m.steel, name)
    joint('WorkGripper', 'WorkCable_3', closed=(0, 0, -SECTION_LENGTH),
          rotation=(0, math.pi/2, 0), turn=(0, 0, -math.pi/2), start=79, end=90)
    box('Spreader armored crossbar', (0, 0, 0), (1.45, .43, .18), m.edge, 'WorkGripper', .04)
    box('Spreader central actuator', (0, 0, .10), (.47, .44, .17), m.armor, 'WorkGripper', .045)
    box('Spreader identification band', (0, -.231, .02), (.66, .025, .075), m.yellow, 'WorkGripper', .008)
    for side in (-1, 1):
        name = f'WorkJaw_{side}'
        joint(name, 'WorkGripper', closed=(side*.70, 0, -.08))
        box('Sliding gripper jaw', (0, 0, -.18), (.095, .47, .40), m.edge, name, .02)
        box('Container locking pad', (-side*.065, 0, -.355), (.18, .51, .09), m.yellow, name, .015)
        box('Spreader slide piston', (-side*.15, 0, .025), (.32, .17, .11), m.steel, name, .015)

    # A supported loading cassette straddles the core roof and entrance hood.
    # Its rear half is bolted to the core; short diagonal brackets stiffen the
    # cantilever. The small dark collar hides the internal replenishment lift.
    joint('WorkSupplyBay', 'RoofLift', closed=(0, 1.10, -.05),
          opened=(PICK[0], PICK[1], .15), start=42, end=75)
    name = 'WorkSupplyBay'
    box('Loading cassette structural base', (0, .72, -.015), (1.43, 3.00, .15), m.panel, name, .045)
    box('Supply lift dark throat', (0, 0, .075), (1.06, 1.19, .045), m.black, name, .015)
    for side in (-1, 1):
        box('Supply lift armored cheek', (side*.64, 0, .20), (.16, 1.51, .23), m.edge, name, .035)
        box('Cassette lid guide', (side*.66, .77, .13), (.10, 3.02, .16), m.steel, name, .012)
        beam('Loading deck diagonal support', (side*.57, .96, -.10), (side*.57, -.63, -.26), .075, m.edge, name)
        box('Loading deck attachment shoe', (side*.57, 1.43, -.12), (.30, .42, .23), m.edge, name, .025)
    box('Supply cassette front bumper', (0, -.74, .16), (1.43, .17, .26), m.armor, name, .035)
    box('Supply cassette status strip', (0, -.837, .20), (.55, .025, .075), m.yellow, name, .008)
    joint('WorkSupplyLid', name, closed=(0, 0, .16), opened=(0, 1.35, .16), start=76, end=89)
    box('Sliding supply magazine lid', (0, 0, 0), (1.19, 1.30, .075), m.panel, 'WorkSupplyLid', .025)
    for x in (-.41, .41):
        box('Supply lid recessed runner', (x, 0, .045), (.055, 1.10, .02), m.steel, 'WorkSupplyLid', 0)

    joint('WorkContainer', 'Hull', closed=(-.30, 2.0, 1.65), opened=PICK, start=46, end=78)
    name = 'WorkContainer'
    box('Reusable armored cargo container', (0, 0, 0), (.95, 1.10, .75), m.armor, name, .065)
    box('Cargo container recessed lid', (0, 0, .379), (.76, .89, .035), m.panel, name, .035)
    for side in (-1, 1):
        box('Cargo side protective frame', (side*.477, 0, 0), (.035, .92, .48), m.edge, name, .02)
        for y in (-.37, .37):
            box('Cargo grip socket', (side*.498, y, .19), (.042, .15, .14), m.black, name, .01)
        box('Cargo faction identification', (0, side*.558, .04), (.57, .025, .16), m.team, name, .014)
        box('Container stacking foot', (side*.33, 0, -.374), (.15, .96, .09), m.steel, name, .015)
    for y in (-.35, .35):
        box('Container lid reinforcement', (0, y, .407), (.85, .07, .05), m.edge, name, .015)

    joint('WarehouseConveyor', 'Workshop', closed=(0, 0, .55),
          opened=(-.75, -2.20, .10), start=48, end=76)
    name = 'WarehouseConveyor'
    for side in (-1, 1):
        box('Warehouse conveyor continuous rail', (side*.565, 0, .025), (.095, 3.45, .18), m.edge, name, .025)
        box('Conveyor recessed side drive', (side*.613, 0, -.005), (.05, 2.93, .085), m.panel, name, .012)
    box('Conveyor armored receiving nose', (0, -1.76, .015), (1.25, .22, .20), m.edge, name, .035)
    for index in range(14):
        cyl('Conveyor load roller', (0, -1.53+index*.236, .10), .055, 1.04, m.steel, name, 'X', 10, 0)
    return {'clip': 'Work', 'seconds': WORK_SECONDS, 'frames': WORK_FRAMES,
            'nodes': list(REQUIRED_NODES), 'containerMetres': [.95, 1.10, .75],
            'pickup': list(PICK), 'warehouseReceivingPoint': list(LAND),
            'sequence': 'approach, lower, grip, hoist, slew, set down, conveyor intake, return',
            'reset': 'occluded chassis replenishment lift', 'animatedScale': False}
