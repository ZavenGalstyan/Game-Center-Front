"""
Neon Mercenary — texture prep for tools/buildAssets.mjs (offline, not shipped).

    python3 prepImages.py <Universal Base Characters[Standard] dir> <out dir>

Converts the CC0 Quaternius "Universal Base Characters" 2048² PNG textures into
compact JPEGs: male/female light + dark skin albedo, tangent normals, a
metallicRoughness map (G = roughness, B = 0), hair and eye textures.
"""
import sys
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
B = f"{src}/Base Characters/Godot - UE"
T = f"{src}/Base Characters/Textures"


def save(im, name, size, q=86):
    im.convert("RGB").resize((size, size), Image.LANCZOS).save(f"{out}/{name}", quality=q, optimize=True)


save(Image.open(f"{T}/T_Superhero_Male_Ligh.png"), "m_light.jpg", 1024)
save(Image.open(f"{B}/T_Superhero_Male_Dark.png"), "m_dark.jpg", 1024)
save(Image.open(f"{B}/T_Superhero_Male_Normal.png"), "m_n.jpg", 1024, 90)
save(Image.open(f"{T}/T_Superhero_Female_Light_BaseColor.png"), "f_light.jpg", 1024)
save(Image.open(f"{B}/T_Superhero_Female_Dark_BaseColor.png"), "f_dark.jpg", 1024)
save(Image.open(f"{B}/T_Superhero_Female_Normal.png"), "f_n.jpg", 1024, 90)
for g, f in (("m", "Male"), ("f", "Female")):
    r = Image.open(f"{B}/T_Superhero_{f}_Roughness.png").convert("RGB").split()[1]
    z = Image.new("L", r.size, 0)
    save(Image.merge("RGB", (z, r, z)), f"{g}_mr.jpg", 512, 90)
save(Image.open(f"{B}/T_Hair_1_BaseColor.png"), "hair1_c.jpg", 512)
save(Image.open(f"{B}/T_Hair_1_Normal.png"), "hair1_n.jpg", 512)
save(Image.open(f"{B}/T_Hair_2_BaseColor.png"), "hair2_c.jpg", 512)
save(Image.open(f"{B}/T_Hair_2_Normal.png"), "hair2_n.jpg", 512)
save(Image.open(f"{B}/T_Eye_Brown.png"), "eye_c.jpg", 256)
print("ok")
