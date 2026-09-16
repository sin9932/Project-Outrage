"""Create review media from actual architecture / mcv-art browser captures."""
from pathlib import Path
from PIL import Image

root=Path('docs')
Image.open(root/'architecture-together.png').crop((130,145,1050,725)).save(root/'architecture-in-game.png')
frames=[Image.open(root/f'yard-full-{i:02}.png').convert('RGB')
        .crop((65,170,615,590)).resize((440,336)) for i in range(0,49,2)]
atlas=Image.new('RGB',(440*7,336))
for col,index in enumerate((0,4,8,12,16,20,24)):
    atlas.paste(frames[index],(col*440,0))
palette=atlas.quantize(colors=256)
indexed=[im.quantize(palette=palette,dither=Image.Dither.NONE) for im in frames]
sequence=indexed+indexed[-2::-1]
durations=[30,40,30]*16+[600]
durations[0]+=500;durations[24]+=900
sequence[0].save(root/'mcv-full-footprint.gif',save_all=True,
                 append_images=sequence[1:],duration=durations,loop=0,optimize=True)
print('Actual in-game comparison and 0.8 second MCV deployment GIF ready.')
