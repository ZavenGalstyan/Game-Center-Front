"""
Ultimate MMA Championship 3D — texture prep for tools/buildAssets.mjs.

    python3 prepImages.py <Universal Base Characters[Standard] dir> <out dir>

Converts the CC0 Quaternius "Universal Base Characters" textures (2048² PNG)
into compact 1024² / 512² JPEGs for the browser:

  body_light.jpg / body_dark.jpg  albedo (light / dark skin)
  body_n.jpg                      tangent-space normal map (muscle detail)
  body_mr.jpg                     metallicRoughness slot, repurposed:
                                    G = roughness (from the asset)
                                    B = 0 (no metal)
                                    R = shorts mask (1 where the albedo is the
                                        neutral grey underwear area) — the game
                                        shader recolours that area as fight shorts
  hair_c.jpg / hair_n.jpg         hair / brow albedo + normal
  eye_c.jpg                       iris texture
"""
import sys
from PIL import Image, ImageFilter

src, out = sys.argv[1], sys.argv[2]
B = f"{src}/Base Characters/Godot - UE"
T = f"{src}/Base Characters/Textures"


def save(im, name, size, q=88):
    im.convert("RGB").resize((size, size), Image.LANCZOS).save(f"{out}/{name}", quality=q, optimize=True)


light = Image.open(f"{T}/T_Superhero_Male_Ligh.png").convert("RGB")
dark = Image.open(f"{B}/T_Superhero_Male_Dark.png").convert("RGB")
save(light, "body_light.jpg", 1024)
save(dark, "body_dark.jpg", 1024)
save(Image.open(f"{B}/T_Superhero_Male_Normal.png"), "body_n.jpg", 1024, 92)

# Shorts mask: the underwear islands are painted neutral grey (R≈G≈B), skin is
# strongly orange. Low saturation + mid/high value → shorts.
hsv = light.convert("HSV")
h, s, v = hsv.split()
mask = Image.eval(s, lambda x: 255 if x < 40 else 0)
vmask = Image.eval(v, lambda x: 255 if x > 90 else 0)
mask = Image.composite(mask, Image.new("L", mask.size, 0), vmask)
mask = mask.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(2))
rough = Image.open(f"{B}/T_Superhero_Male_Roughness.png").convert("RGB").split()[1]
zero = Image.new("L", mask.size, 0)
save(Image.merge("RGB", (mask, rough, zero)), "body_mr.jpg", 1024, 92)

save(Image.open(f"{B}/T_Hair_1_BaseColor.png"), "hair_c.jpg", 512)
save(Image.open(f"{B}/T_Hair_1_Normal.png"), "hair_n.jpg", 512)
save(Image.open(f"{B}/T_Eye_Brown.png"), "eye_c.jpg", 256)
print("ok")
