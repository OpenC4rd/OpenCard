"""OpenCard「蓝图 × 实例覆写」解释动画。

过程化搭建 Blender 场景并用 Cycles 渲染。用法见 render.sh：

    Blender -b -P build_scene.py -- --quality stills|preview|final [--frames 1,48,...]

隐喻：蓝图 = 卡牌本体；实例 = 盖在蓝图上方的透明玻璃，只在覆写的字段上贴修正带。
"""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
FONT_PATH = "/System/Library/Fonts/STHeiti Medium.ttc"
FPS = 24

# 分镜时间表（秒）。改节奏只改这里与下方 keyframe 时间点。
SHOTS = [
    ("blueprint", 0.0, 3.0),
    ("glass_drop", 3.0, 7.0),
    ("side_to_front", 7.0, 10.0),
    ("many_instances", 10.0, 14.0),
    ("blueprint_edit", 14.0, 17.0),
    ("reset", 17.0, 20.0),
    ("outro", 20.0, 22.0),
]
DURATION = SHOTS[-1][2]
STILL_SECONDS = [2.0, 6.5, 8.1, 10.0, 13.0, 16.5, 19.7, 21.5]

QUALITY = {
    "stills": dict(res=(1920, 1080), samples=64),
    "preview": dict(res=(960, 540), samples=16),
    "final": dict(res=(1920, 1080), samples=128),
}

# 卡牌尺寸
CARD_W, CARD_H = 5.0, 7.0
GLASS_W, GLASS_H = 5.3, 7.3
GAP_OPEN, GAP_CLOSED = 0.9, 0.15
STACK_SPACING = 6.6

# 卡面字段布局：(中心 x, 中心 y, 宽, 高)
NAME_BOX = (0.0, 2.75, 4.1, 0.72)
ART_BOX = (0.0, 0.75, 4.1, 2.9)
ATTACK_POS = (-1.55, -1.2)
ATTACK_R = 0.42
DESC_BOX = (0.0, -2.45, 4.1, 1.2)


def f(seconds):
    return int(round(seconds * FPS)) + 1


def srgb(hex_str):
    h = hex_str.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return (*lin, 1.0)


# ---------------------------------------------------------------- 基础工具

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def set_input(node, name, value):
    if name in node.inputs:
        node.inputs[name].default_value = value


def principled(name, color, roughness=0.5, **inputs):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    set_input(bsdf, "Base Color", srgb(color) if isinstance(color, str) else color)
    set_input(bsdf, "Roughness", roughness)
    for key, value in inputs.items():
        set_input(bsdf, key.replace("_", " "), value)
    return mat


def fade_emission(name, color):
    """可淡入淡出的自发光材质；返回 (material, mix 节点)。"""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    mix = nt.nodes.new("ShaderNodeMixShader")
    transparent = nt.nodes.new("ShaderNodeBsdfTransparent")
    emission = nt.nodes.new("ShaderNodeEmission")
    emission.inputs["Color"].default_value = srgb(color)
    emission.inputs["Strength"].default_value = 1.0
    nt.links.new(transparent.outputs[0], mix.inputs[1])
    nt.links.new(emission.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs[0])
    mix.inputs["Fac"].default_value = 0.0
    return mat, mix


def link(obj, parent=None, location=(0, 0, 0)):
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = parent
    obj.location = location
    return obj


def empty(name, parent=None, location=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_size = 0.3
    return link(obj, parent, location)


def finish_mesh(name, bm, mat, bevel=0.0):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for poly in me.polygons:
        poly.use_smooth = True
    if hasattr(me, "set_sharp_from_angle"):
        me.set_sharp_from_angle(angle=math.radians(35))
    me.materials.append(mat)
    obj = bpy.data.objects.new(name, me)
    if bevel > 0:
        mod = obj.modifiers.new("Bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 4
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(40)
        mod.harden_normals = False
    return obj


def rounded_slab(name, w, h, t, r, mat, parent=None, location=(0, 0, 0), bevel=0.0, seg=10):
    """圆角矩形厚板，中心在原点。"""
    r = min(r, w / 2 - 1e-3, h / 2 - 1e-3)
    pts = []
    corners = [(w / 2 - r, h / 2 - r, 0), (-(w / 2 - r), h / 2 - r, 90),
               (-(w / 2 - r), -(h / 2 - r), 180), (w / 2 - r, -(h / 2 - r), 270)]
    for cx, cy, start in corners:
        for i in range(seg + 1):
            a = math.radians(start + 90 * i / seg)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    bm = bmesh.new()
    bottom = [bm.verts.new((x, y, -t / 2)) for x, y in pts]
    top = [bm.verts.new((x, y, t / 2)) for x, y in pts]
    bm.faces.new(list(reversed(bottom)))
    bm.faces.new(top)
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((bottom[i], bottom[j], top[j], top[i]))
    obj = finish_mesh(name, bm, mat, bevel)
    return link(obj, parent, location)


def disc(name, radius, t, mat, parent=None, location=(0, 0, 0), bevel=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=64, radius1=radius, radius2=radius, depth=t)
    obj = finish_mesh(name, bm, mat, bevel)
    return link(obj, parent, location)


_font = None


def text(name, body, size, mat, parent=None, location=(0, 0, 0), extrude=0.005, align="CENTER", bold_offset=0.0):
    global _font
    if _font is None:
        _font = bpy.data.fonts.load(FONT_PATH)
    curve = bpy.data.curves.new(name, "FONT")
    curve.body = body
    curve.font = _font
    curve.size = size
    curve.align_x = align
    curve.align_y = "CENTER"
    curve.extrude = extrude
    curve.materials.append(mat)
    obj = bpy.data.objects.new(name, curve)
    return link(obj, parent, location)


def key(obj, path, seconds, value, index=-1):
    setattr(obj, path, value) if index < 0 else getattr(obj, path).__setitem__(index, value)
    obj.keyframe_insert(path, frame=f(seconds), index=index)


def key_socket(socket, seconds, value):
    socket.default_value = value
    socket.keyframe_insert("default_value", frame=f(seconds))


def key_scale(obj, seconds, s):
    key(obj, "scale", seconds, (s, s, s) if isinstance(s, (int, float)) else s)


HIDDEN = 1e-4


def no_ray_shadow(obj):
    obj.visible_shadow = False


def hud_only(obj):
    for attr in ("visible_shadow", "visible_diffuse", "visible_glossy",
                 "visible_transmission", "visible_volume_scatter"):
        setattr(obj, attr, False)


# ---------------------------------------------------------------- 材质

def build_materials():
    m = {}
    m["frame"] = principled("Frame", "#2F5D9F", 0.45)
    m["paper"] = principled("Paper", "#F5F1E8", 0.7)
    m["bar"] = principled("Bar", "#E4DCCB", 0.65)
    m["art"] = principled("Art", "#F3C28E", 0.6)
    m["sun"] = principled("Sun", "#E8703A", 0.5)
    m["hill"] = principled("Hill", "#C9573A", 0.6)
    m["ink"] = principled("Ink", "#2A2723", 0.6)
    m["white_ink"] = principled("WhiteInk", "#FFFFFF", 0.3)
    m["tape"] = principled("Tape", "#F6F5F0", 0.5, Coat_Weight=0.1)
    m["pen"] = principled("Pen", "#D12626", 0.3)
    m["glass"] = principled(
        "LiquidGlass", (0.98, 0.99, 1.0, 1.0), 0.015,
        Transmission_Weight=1.0, IOR=1.45, Dispersion=0.2,
        Coat_Weight=0.2, Thin_Film_Thickness=180.0, Thin_Film_IOR=1.33,
    )
    return m


# ---------------------------------------------------------------- 物体

def build_blueprint(m, parent):
    """蓝图卡牌。返回描述文字对象 (旧, 新) 以便做蓝图改动动画。"""
    root = empty("Blueprint", parent)
    rounded_slab("BP.Base", CARD_W, CARD_H, 0.1, 0.35, m["frame"], root, bevel=0.02)
    rounded_slab("BP.Panel", CARD_W - 0.5, CARD_H - 0.5, 0.02, 0.2, m["paper"], root, (0, 0, 0.06))
    z_el, z_txt = 0.08, 0.094

    x, y, w, h = NAME_BOX
    rounded_slab("BP.NameBar", w, h, 0.02, 0.12, m["bar"], root, (x, y, z_el))
    text("BP.Name", "火焰精灵", 0.42, m["ink"], root, (x, y, z_txt))

    x, y, w, h = ART_BOX
    rounded_slab("BP.Art", w, h, 0.02, 0.12, m["art"], root, (x, y, z_el))
    disc("BP.Sun", 0.5, 0.012, m["sun"], root, (x + 1.0, y + 0.6, z_el + 0.012))
    disc("BP.Hill", 0.9, 0.012, m["hill"], root, (x - 0.85, y - 0.45, z_el + 0.014))

    disc("BP.AttackBadge", ATTACK_R, 0.04, m["frame"], root, (*ATTACK_POS, z_el + 0.03), bevel=0.01)
    text("BP.Attack", "3", 0.46, m["white_ink"], root, (*ATTACK_POS, z_el + 0.056))

    x, y, w, h = DESC_BOX
    rounded_slab("BP.DescBox", w, h, 0.02, 0.12, m["bar"], root, (x, y, z_el))
    old = text("BP.Desc", "造成 2 点伤害", 0.3, m["ink"], root, (x, y, z_txt))
    new = text("BP.Desc2", "造成 4 点伤害", 0.3, m["ink"], root, (x, y, z_txt))
    new.scale = (1, HIDDEN, 1)
    return root, old, new


def build_patch(m, glass, name, cx, cy, w, h, value, size):
    """修正带：枢轴在左边缘，方便做“贴上 / 揭掉”。"""
    top = 0.075
    pivot = empty(f"{name}.Pivot", glass, (cx - w / 2, cy, top))
    tape = rounded_slab(f"{name}.Tape", w, h, 0.05, 0.08, m["tape"], pivot, (w / 2, 0, 0.026), bevel=0.008)
    label = text(f"{name}.Value", value, size, m["pen"], pivot, (w / 2, 0, 0.054))
    for obj in (tape, label):
        obj.visible_shadow = True
    return pivot


def build_instance(m, parent, overrides):
    glass = empty("Glass", parent, (0, 0, GAP_OPEN))
    pane = rounded_slab("Glass.Pane", GLASS_W, GLASS_H, 0.15, 0.45, m["glass"], glass, bevel=0.05)
    no_ray_shadow(pane)
    patches = {}
    for field, value in overrides.items():
        if field == "name":
            x, y, w, h = NAME_BOX
            patches[field] = build_patch(m, glass, "Patch.Name", x, y, w, h, value, 0.42)
        elif field == "attack":
            d = ATTACK_R * 2 + 0.12
            patches[field] = build_patch(m, glass, "Patch.Attack", *ATTACK_POS, d, d, value, 0.5)
    return glass, patches


def build_stack(m, name, x, overrides):
    root = empty(name, None, (x, 0, 0))
    bp, old, new = build_blueprint(m, root)
    glass, patches = build_instance(m, root, overrides)
    return dict(root=root, blueprint=bp, desc_old=old, desc_new=new, glass=glass, patches=patches)


def build_lights():
    target = Vector((0, 0, 0))
    for name, loc, energy, size in [
        ("Key", (-6, -5, 14), 2600, 9),
        ("Fill", (9, -7, 6), 900, 12),
        ("Rim", (2, 11, 4), 1400, 6),
    ]:
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.size = size
        obj = bpy.data.objects.new(name, data)
        obj.location = loc
        obj.rotation_euler = (target - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        bpy.context.scene.collection.objects.link(obj)


def build_world():
    world = bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    mix = nt.nodes.new("ShaderNodeMixShader")
    path = nt.nodes.new("ShaderNodeLightPath")
    flat = nt.nodes.new("ShaderNodeBackground")
    flat.inputs["Color"].default_value = srgb("#E2E6EC")
    flat.inputs["Strength"].default_value = 1.0
    env = nt.nodes.new("ShaderNodeBackground")
    env.inputs["Strength"].default_value = 0.8
    # 影棚式渐变环境：上亮下灰，玻璃只反射柔和的明暗过渡。
    coord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.2
    ramp.color_ramp.elements[0].color = srgb("#A0A6B2")
    ramp.color_ramp.elements[1].position = 0.8
    ramp.color_ramp.elements[1].color = (1.1, 1.1, 1.1, 1.0)
    remap = nt.nodes.new("ShaderNodeMapRange")
    remap.inputs["From Min"].default_value = -1.0
    nt.links.new(coord.outputs["Generated"], sep.inputs[0])
    nt.links.new(sep.outputs["Z"], remap.inputs["Value"])
    nt.links.new(remap.outputs["Result"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], env.inputs["Color"])
    nt.links.new(env.outputs[0], mix.inputs[1])
    nt.links.new(flat.outputs[0], mix.inputs[2])
    nt.links.new(path.outputs["Is Camera Ray"], mix.inputs["Fac"])
    nt.links.new(mix.outputs[0], out.inputs[0])


def build_camera():
    # 目标点略低于卡牌中心，给底部字幕留出空间。
    rig = empty("CameraRig", None, (0, -0.55, 0))
    data = bpy.data.cameras.new("Camera")
    data.type = "ORTHO"
    data.ortho_scale = 18
    data.clip_start = 0.1
    data.clip_end = 200
    cam = bpy.data.objects.new("Camera", data)
    link(cam, rig, (0, 0, 40))
    bpy.context.scene.camera = cam

    hud = empty("HUD", cam, (0, 0, -2))
    for i in range(3):
        fc = hud.driver_add("scale", i)
        drv = fc.driver
        drv.type = "SCRIPTED"
        var = drv.variables.new()
        var.name = "o"
        var.targets[0].id_type = "CAMERA"
        var.targets[0].id = data
        var.targets[0].data_path = "ortho_scale"
        drv.expression = "o / 18"
    return rig, data, hud


def subtitle(hud, body, start, end, size=0.5, y=-3.45):
    mat, mix = fade_emission(f"Sub.{body}", "#11141A")
    obj = text(f"Sub.{body}", body, size, mat, hud, (0, y, 0), extrude=0.0)
    hud_only(obj)
    sock = mix.inputs["Fac"]
    key_socket(sock, start - 0.01, 0.0)
    key_socket(sock, start, 0.0)
    key_socket(sock, start + 0.35, 1.0)
    key_socket(sock, end - 0.35, 1.0)
    key_socket(sock, end, 0.0)
    return obj


def side_label(body, x, z, align, start, end):
    mat, mix = fade_emission(f"Label.{body}", "#202530")
    obj = text(f"Label.{body}", body, 0.38, mat, None, (x, -3.9, z), extrude=0.0, align=align)
    obj.rotation_euler = (math.radians(90), 0, 0)
    hud_only(obj)
    sock = mix.inputs["Fac"]
    key_socket(sock, start, 0.0)
    key_socket(sock, start + 0.3, 1.0)
    key_socket(sock, end - 0.3, 1.0)
    key_socket(sock, end, 0.0)


# ---------------------------------------------------------------- 动画

ISO_A = (math.radians(55), 0, math.radians(30))
ISO_ROW = (math.radians(45), 0, 0)
SIDE = (math.radians(90), 0, 0)
FRONT = (0, 0, 0)


def animate_camera(rig, cam):
    for t, rot, ortho in [
        (0.0, FRONT, 18), (3.0, FRONT, 18),
        (5.0, ISO_A, 18), (7.0, ISO_A, 17),
        (7.8, SIDE, 12), (8.7, SIDE, 12),
        (9.8, FRONT, 18), (10.3, FRONT, 18),
        (11.8, ISO_ROW, 25), (17.0, ISO_ROW, 24),
        (18.3, FRONT, 18), (22.0, FRONT, 18),
    ]:
        key(rig, "rotation_euler", t, rot)
        cam.ortho_scale = ortho
        cam.keyframe_insert("ortho_scale", frame=f(t))


def apply_tape(pivot, start, length=0.6):
    key(pivot, "scale", start - 0.01, (HIDDEN, 1, 1))
    key(pivot, "scale", start, (HIDDEN, 1, 1))
    key(pivot, "scale", start + length, (1, 1, 1))


def peel_tape(pivot, start):
    key(pivot, "rotation_euler", start, (0, 0, 0))
    key(pivot, "location", start, tuple(pivot.location))
    key(pivot, "scale", start + 0.6, (1, 1, 1))
    key(pivot, "rotation_euler", start + 0.8, (0, math.radians(-130), 0))
    lifted = pivot.location.copy()
    lifted.z += 0.8
    key(pivot, "location", start + 0.8, tuple(lifted))
    key(pivot, "scale", start + 1.0, (HIDDEN, HIDDEN, HIDDEN))


def animate_glass_z(glass, points):
    for t, z in points:
        key(glass, "location", t, (0, 0, z))


def animate(m, rig, cam, hud, a, b, c):
    animate_camera(rig, cam)

    # ② 玻璃落下并贴修正带
    key_scale(a["glass"], 0.0, HIDDEN)
    key_scale(a["glass"], 3.2, HIDDEN)
    key_scale(a["glass"], 3.8, 1)
    animate_glass_z(a["glass"], [
        (3.2, 5.0), (4.6, GAP_OPEN),
        (8.8, GAP_OPEN), (9.8, GAP_CLOSED),
        (10.3, GAP_CLOSED), (11.3, GAP_OPEN),
        (17.2, GAP_OPEN), (18.2, GAP_CLOSED),
    ])
    apply_tape(a["patches"]["name"], 5.0)
    apply_tape(a["patches"]["attack"], 5.7, 0.4)

    # ④ 另外两份实例出现（同一张蓝图）
    for stack, t_in in ((b, 10.6), (c, 11.0)):
        key_scale(stack["root"], 0.0, HIDDEN)
        key_scale(stack["root"], t_in, HIDDEN)
        key_scale(stack["root"], t_in + 0.7, 1)
        for pivot in stack["patches"].values():
            key_scale(pivot, 0.0, HIDDEN)
            key_scale(pivot, t_in + 0.9, HIDDEN)
            apply_tape(pivot, t_in + 0.9, 0.5)
        key_scale(stack["root"], 17.0, 1)
        key_scale(stack["root"], 17.6, HIDDEN)

    # ⑤ 蓝图改动：边框配色与描述同时作用于所有实例
    frame_color = m["frame"].node_tree.nodes["Principled BSDF"].inputs["Base Color"]
    key_socket(frame_color, 14.6, srgb("#2F5D9F"))
    key_socket(frame_color, 15.4, srgb("#D9822B"))
    for stack in (a, b, c):
        key(stack["desc_old"], "scale", 14.7, (1, 1, 1))
        key(stack["desc_old"], "scale", 14.95, (1, HIDDEN, 1))
        key(stack["desc_new"], "scale", 14.95, (1, HIDDEN, 1))
        key(stack["desc_new"], "scale", 15.2, (1, 1, 1))

    # ⑥ 重置：揭掉攻击力修正带
    peel_tape(a["patches"]["attack"], 18.5)

    # 字幕
    subtitle(hud, "蓝图·完整的卡牌", 0.4, 3.0)
    subtitle(hud, "实例·只记录改动", 3.8, 7.0)
    subtitle(hud, "正面看 = 渲染结果", 9.0, 10.4)
    subtitle(hud, "一张蓝图·多个实例", 10.8, 14.1)
    subtitle(hud, "未覆写处·跟随蓝图", 14.4, 17.0)
    subtitle(hud, "重置·揭掉修正", 17.8, 20.1)
    subtitle(hud, "OpenCard", 20.4, DURATION + 1, size=0.7)

    # ③ 侧视图层级标注
    side_label("蓝图", 2.95, 0.0, "LEFT", 7.9, 8.9)
    side_label("实例玻璃", 2.95, GAP_OPEN, "LEFT", 7.9, 8.9)
    side_label("覆写", -2.95, GAP_OPEN + 0.12, "RIGHT", 7.9, 8.9)


# ---------------------------------------------------------------- 渲染设置

def configure_render(quality):
    scene = bpy.context.scene
    q = QUALITY[quality]
    scene.render.engine = "CYCLES"
    scene.render.resolution_x, scene.render.resolution_y = q["res"]
    scene.render.resolution_percentage = 100
    scene.render.fps = FPS
    scene.frame_start = 1
    scene.frame_end = f(DURATION) - 1
    scene.cycles.samples = q["samples"]
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 16
    scene.cycles.transmission_bounces = 16
    scene.cycles.transparent_max_bounces = 16
    scene.cycles.caustics_reflective = False
    scene.cycles.caustics_refractive = False
    scene.view_settings.view_transform = "Standard"

    scene.render.image_settings.file_format = "PNG"

    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "METAL"
    prefs.refresh_devices()
    for d in prefs.devices:
        d.use = True
    scene.cycles.device = "GPU"


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    opts = {"quality": "stills", "frames": None, "save": False}
    i = 0
    while i < len(argv):
        if argv[i] == "--quality":
            opts["quality"] = argv[i + 1]
            i += 2
        elif argv[i] == "--frames":
            opts["frames"] = [int(x) for x in argv[i + 1].split(",")]
            i += 2
        elif argv[i] == "--save":
            opts["save"] = True
            i += 1
        else:
            i += 1
    return opts


def main():
    opts = parse_args()
    reset_scene()
    m = build_materials()
    build_world()
    build_lights()
    rig, cam, hud = build_camera()
    a = build_stack(m, "StackA", 0.0, {"name": "冰霜精灵", "attack": "5"})
    b = build_stack(m, "StackB", -STACK_SPACING, {"name": "雷电精灵"})
    c = build_stack(m, "StackC", STACK_SPACING, {"attack": "1"})
    animate(m, rig, cam, hud, a, b, c)
    configure_render(opts["quality"])

    scene = bpy.context.scene
    if opts["save"]:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "out", "scene.blend"))

    quality = opts["quality"]
    out_dir = os.path.join(HERE, "out", quality)
    os.makedirs(out_dir, exist_ok=True)
    if quality == "stills" or opts["frames"]:
        frames = opts["frames"] or [f(s) for s in STILL_SECONDS]
        for frame in frames:
            scene.frame_set(frame)
            scene.render.filepath = os.path.join(out_dir, f"frame_{frame:04d}.png")
            bpy.ops.render.render(write_still=True)
    else:
        scene.render.filepath = os.path.join(out_dir, "frame_")
        scene.render.use_overwrite = False
        scene.render.use_placeholder = True
        bpy.ops.render.render(animation=True)


if __name__ == "__main__":
    main()
