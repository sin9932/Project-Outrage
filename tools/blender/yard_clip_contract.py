"""Make optimized Deploy/Work GLB clips explicitly describe the same pose.

Blender removes channels that stay constant inside an individual clip. Keep
that useful optimization, then restore only the missing channels as two-key
constants. Values come from authored animation endpoints, never guessed rests.
Run directly to repair an already exported model: python yard_clip_contract.py MODEL.glb
"""
import json
import math
from pathlib import Path
import struct
import sys


_JSON = 0x4E4F534A
_BIN = 0x004E4942
_WIDTH = {'SCALAR': 1, 'VEC3': 3, 'VEC4': 4}


def _read_glb(path):
    raw = Path(path).read_bytes()
    if len(raw) < 20:
        raise ValueError('Truncated GLB')
    magic, version, length = struct.unpack_from('<III', raw)
    if magic != 0x46546C67 or version != 2 or length != len(raw):
        raise ValueError('Expected a complete GLB 2.0 file')
    chunks = []
    offset = 12
    while offset < len(raw):
        size, kind = struct.unpack_from('<II', raw, offset)
        offset += 8
        if size % 4 or offset+size > len(raw):
            raise ValueError('Invalid GLB chunk alignment or length')
        chunks.append((kind, raw[offset:offset+size]))
        offset += size
    if [kind for kind, _ in chunks] != [_JSON, _BIN]:
        raise ValueError('Expected one embedded JSON chunk and one BIN chunk')
    doc = json.loads(chunks[0][1].decode('utf8'))
    buffers = doc.get('buffers', [])
    if len(buffers) != 1 or buffers[0].get('uri') is not None:
        raise ValueError('Expected one embedded buffer')
    size = buffers[0]['byteLength']
    if size > len(chunks[1][1]) or len(chunks[1][1])-size > 3:
        raise ValueError('Embedded buffer length does not match BIN chunk')
    return doc, bytearray(chunks[1][1][:size])


def _values(doc, binary, index):
    accessor = doc['accessors'][index]
    if accessor.get('componentType') != 5126 or accessor['type'] not in _WIDTH:
        raise ValueError('Animation channels must use float SCALAR/VEC3/VEC4 accessors')
    if accessor.get('sparse') or accessor.get('normalized'):
        raise ValueError('Sparse/normalized animation accessors are not supported')
    view = doc['bufferViews'][accessor['bufferView']]
    if view.get('buffer', 0) != 0:
        raise ValueError('Animation data must be in embedded buffer 0')
    width = _WIDTH[accessor['type']]
    start = view.get('byteOffset', 0)+accessor.get('byteOffset', 0)
    stride = view.get('byteStride', width*4)
    count = accessor['count']
    end = start+(count-1)*stride+width*4
    if count < 1 or stride < width*4 or end > view.get('byteOffset', 0)+view['byteLength']:
        raise ValueError('Animation accessor exceeds its buffer view')
    result = [struct.unpack_from('<'+'f'*width, binary, start+i*stride) for i in range(count)]
    if any(not math.isfinite(v) for row in result for v in row):
        raise ValueError('Animation contains nonfinite values')
    return result


def _channels(doc, binary, animation):
    result = {}
    duration = 0.
    for channel in animation.get('channels', []):
        target = channel['target']
        key = (target['node'], target['path'])
        node = doc['nodes'][key[0]]
        if key[1] not in ('translation', 'rotation'):
            raise ValueError('Yard animations may only contain translation and rotation')
        if 'mesh' in node or 'skin' in node or not node.get('name') or node['name'].endswith('_geometry'):
            raise ValueError('Yard animation must target named rig joints, not geometry')
        if key in result:
            raise ValueError('Duplicate animation target channel')
        sampler = animation['samplers'][channel['sampler']]
        if sampler.get('interpolation', 'LINEAR') not in ('LINEAR', 'STEP'):
            raise ValueError('Expected LINEAR or STEP rigid animation samples')
        times = _values(doc, binary, sampler['input'])
        values = _values(doc, binary, sampler['output'])
        width = 4 if key[1] == 'rotation' else 3
        if any(len(row) != 1 for row in times) or any(len(row) != width for row in values):
            raise ValueError('Animation sampler accessor dimensions do not match target')
        if len(times) != len(values) or abs(times[0][0]) > 1e-6:
            raise ValueError('Animation must begin at time zero with matched sample counts')
        if any(b[0] <= a[0] for a, b in zip(times, times[1:])):
            raise ValueError('Animation sample times must increase')
        duration = max(duration, times[-1][0])
        result[key] = values
    if duration <= 0:
        raise ValueError('Animation has no positive duration')
    return result, duration


def _same(a, b, path):
    error = max(abs(x-y) for x, y in zip(a, b))
    if path == 'rotation':
        # q and -q encode the same orientation.
        error = min(error, max(abs(x+y) for x, y in zip(a, b)))
    return error <= 2e-5


def _append_accessor(doc, binary, rows, kind):
    binary.extend(b'\0'*(-len(binary) % 4))
    offset = len(binary)
    flat = [value for row in rows for value in row]
    binary.extend(struct.pack('<'+'f'*len(flat), *flat))
    views = doc.setdefault('bufferViews', [])
    view = len(views)
    views.append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(flat)*4})
    accessor = {'bufferView': view, 'componentType': 5126, 'count': len(rows), 'type': kind}
    if kind == 'SCALAR':
        accessor.update(min=[min(flat)], max=[max(flat)])
    index = len(doc['accessors'])
    doc['accessors'].append(accessor)
    return index


def normalize_yard_clips(path):
    """Validate endpoints, fill missing constant channels, and atomically save."""
    path = Path(path)
    doc, binary = _read_glb(path)
    animations = doc.get('animations', [])
    if len(animations) != 2 or {a.get('name') for a in animations} != {'Deploy', 'Work'}:
        raise ValueError('Expected exactly Deploy and Work animation clips')
    by_name = {a['name']: a for a in animations}
    deploy, deploy_seconds = _channels(doc, binary, by_name['Deploy'])
    work, work_seconds = _channels(doc, binary, by_name['Work'])
    if abs(deploy_seconds-3.) > 1e-5 or abs(work_seconds-3.2) > 1e-5:
        raise ValueError('Unexpected Deploy/Work duration')
    union = set(deploy) | set(work)
    for key in union:
        if key in work and not _same(work[key][0], work[key][-1], key[1]):
            raise ValueError('Work does not return to its starting pose: '+str(key))
        if key in deploy and key in work:
            if not _same(deploy[key][-1], work[key][0], key[1]):
                raise ValueError('Work starts outside Deploy endpoint: '+str(key))
    added = {}
    for name, channels, seconds in [('Deploy', deploy, deploy_seconds), ('Work', work, work_seconds)]:
        missing = sorted(union-set(channels))
        added[name] = len(missing)
        if not missing:
            continue
        clip = by_name[name]
        times = _append_accessor(doc, binary, [(0.,), (seconds,)], 'SCALAR')
        for key in missing:
            value = work[key][0] if name == 'Deploy' else deploy[key][-1]
            output = _append_accessor(doc, binary, [value, value], 'VEC4' if key[1] == 'rotation' else 'VEC3')
            sampler = len(clip['samplers'])
            clip['samplers'].append({'input': times, 'output': output, 'interpolation': 'LINEAR'})
            clip['channels'].append({'sampler': sampler, 'target': {'node': key[0], 'path': key[1]}})
    if any(added.values()):
        doc['buffers'][0]['byteLength'] = len(binary)
        encoded = json.dumps(doc, separators=(',', ':'), ensure_ascii=False).encode('utf8')
        encoded += b' '*(-len(encoded) % 4)
        binary.extend(b'\0'*(-len(binary) % 4))
        total = 12+8+len(encoded)+8+len(binary)
        data = (struct.pack('<III', 0x46546C67, 2, total)+
                struct.pack('<II', len(encoded), _JSON)+encoded+
                struct.pack('<II', len(binary), _BIN)+binary)
        temporary = path.with_name(path.name+'.pose-contract.tmp')
        temporary.write_bytes(data)
        temporary.replace(path)
    return {'channelsPerClip': len(union), 'addedChannels': added,
            'deploySeconds': deploy_seconds, 'workSeconds': work_seconds}


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('Usage: python yard_clip_contract.py MODEL.glb')
    print(json.dumps(normalize_yard_clips(sys.argv[1]), sort_keys=True))
