"""Weighted rigid-joint deployment: stage overlap, braking and restrained settling.

Authoring remains 90 frames / 3 seconds; gameplay compresses it to 0.8 seconds.
No mesh scaling and no runtime/renderer authority over the mechanical state.
"""
import math

def minimum_jerk(t):
    return t*t*t*(10+t*(-15+6*t))

def fraction(t, profile):
    t=max(0.,min(1.,t))
    if profile=='glide':return minimum_jerk(t)
    # Reach most of the travel early and reserve a long tail for hydraulic braking.
    u=1-(1-t)**(1.65 if profile=='hydraulic' else 1.45)
    v=minimum_jerk(u)
    if profile=='settle' and t>.58:
        s=(t-.58)/.42
        v+=.012*math.sin(math.pi*s)**2
    return v

def configure(rig):
    for name,d in rig.items():
        d['motion']='glide'
        if name.startswith(('Deck_','Apron_','CenterApron_','CornerRail_','CornerLink_')):
            d['start']=max(0,d['start']-2);d['end']=min(50,d['end']+10)
            d['motion']='hydraulic'
        elif name.startswith(('ArmorWing_','EndWall_','EndLeaf_','SideBridge_','RoofWing_')):
            d['start']=max(12,d['start']-6);d['end']=min(75,d['end']+10)
            d['motion']='hydraulic'
        elif name in ('RoofLift','TowerSleeve','Mast_0','Mast_1','CraneHead'):
            d['start']=max(21,d['start']-10);d['end']=min(85,d['end']+5)
            d['motion']='hydraulic'
        elif name.startswith(('Workshop','ControlCabin','UtilityPlant')):
            d['start']=max(31,d['start']-8);d['end']=min(88,d['end']+4)
            d['motion']='glide'
        elif name in ('BoomYaw','BoomHinge','BoomExtension'):
            d['start']={'BoomYaw':53,'BoomHinge':60,'BoomExtension':62}[name]
            d['end']=90
            d['motion']='settle' if name!='BoomExtension' else 'hydraulic'
        elif name in ('RadarDish','ThermalFin_-1','ThermalFin_1'):
            d['start']=max(43,d['start']-7);d['end']=90;d['motion']='settle'
