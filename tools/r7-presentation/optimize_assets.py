"""Keep exact RGBA pixels. Keep original PNG if WebP fails or is larger."""
from pathlib import Path
from PIL import Image
import io
def optimize(root):
    before=after=converted=0
    for path in sorted(Path(root).rglob('*.png')):
        if path.parent.name not in ('playback','students','teacher'):continue
        raw=path.read_bytes();before+=len(raw)
        with Image.open(io.BytesIO(raw)) as png:
            if getattr(png,'n_frames',1)!=1:after+=len(raw);continue
            original=png.convert('RGBA')
            buf=io.BytesIO()
            original.save(buf,'WEBP',lossless=True,quality=75,method=3,exact=True)
        candidate=buf.getvalue()
        if len(candidate)>=len(raw):after+=len(raw);continue
        with Image.open(io.BytesIO(candidate)) as webp:
            if webp.size!=original.size or webp.convert('RGBA').tobytes()!=original.tobytes():
                after+=len(raw);continue
        dest=path.with_suffix('.webp')
        if dest.exists():raise ValueError('asset collision')
        dest.write_bytes(candidate);path.unlink()
        after+=len(candidate);converted+=1
    print(f'Lossless presentation: {converted} images, {before} -> {after} bytes, exact RGBA match')
    return before,after,converted
