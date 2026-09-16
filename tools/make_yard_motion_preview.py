"""Turn the actual mcv-art.browser.cjs captures into a deployment review GIF.

Run from repository root. Captures must use docs/yard-motion as their prefix.
The moving segments preserve the game's 0.8 second deployment duration.
"""
from pathlib import Path
from PIL import Image

root = Path('docs')
frames = [Image.open(root / f'yard-motion-{i:02}.png').convert('RGB')
          .crop((130, 235, 560, 545)) for i in range(0, 49, 2)]
# One palette keeps the stationary terrain stable across the entire animation.
atlas = Image.new('RGB', (430 * 7, 310))
for col, index in enumerate((0, 4, 8, 12, 16, 20, 24)):
    atlas.paste(frames[index], (col * 430, 0))
palette = atlas.quantize(colors=256)
indexed = [f.quantize(palette=palette, dither=Image.Dither.NONE) for f in frames]
sequence = indexed + indexed[-2::-1]
# GIF delays use 10 ms ticks: 30 + 40 + 30 ms per three intervals.
durations = [30, 40, 30] * 8 + [30, 40, 30] * 8 + [600]
durations[0] += 500
durations[24] += 900
sequence[0].save(root / 'mcv-deploy-refined.gif', save_all=True,
                 append_images=sequence[1:], duration=durations,
                 loop=0, optimize=True)
frames[-1].save(root / 'yard-proportions-in-game.png')
print('MCV deployment GIF and final in-game yard captured.')
