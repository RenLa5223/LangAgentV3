# -*- coding: utf-8 -*-
"""
LangAgent 品牌图标生成器
读取源图片 → 圆角遮罩裁剪 → 按 Tauri 规范生成全尺寸图标集
"""
import os
import sys
from PIL import Image, ImageDraw


def create_rounded_mask(size: tuple[int, int], radius: int) -> Image.Image:
    """创建圆角矩形遮罩（RGBA 模式，圆角区域为 255，外部透明）"""
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    w, h = size

    # 绘制主体矩形
    draw.rectangle([radius, 0, w - radius, h], fill=255)
    draw.rectangle([0, radius, w, h - radius], fill=255)

    # 绘制四个圆角
    for cx, cy in [
        (radius, radius),
        (w - radius - 1, radius),
        (radius, h - radius - 1),
        (w - radius - 1, h - radius - 1),
    ]:
        draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=255)

    return mask


def round_corners(img: Image.Image, radius_ratio: float = 0.18) -> Image.Image:
    """
    对 RGBA 图像施加圆角遮罩。
    radius_ratio: 圆角半径占图像短边的比例（默认 18%）
    """
    img = img.convert("RGBA")
    w, h = img.size
    radius = int(min(w, h) * radius_ratio)
    mask = create_rounded_mask((w, h), radius)
    result = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    result.paste(img, (0, 0), mask)
    return result


def main():
    # ==== 路径 ====
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    icons_dir = os.path.join(root, "src-tauri", "icons")
    source_path = "C:/Users/YuAn5/Pictures/LangAgent.jpg"

    if not os.path.exists(source_path):
        print(f"[ERROR] 源图标不存在: {source_path}")
        sys.exit(1)

    os.makedirs(icons_dir, exist_ok=True)

    # ==== 处理流程 ====
    print(f"[1/4] 加载源图标: {source_path}")
    img = Image.open(source_path)

    # 裁剪为正方形（取中心）
    w, h = img.size
    if w != h:
        side = min(w, h)
        left = (w - side) // 2
        top = (h - side) // 2
        img = img.crop((left, top, left + side, side))
        print(f"      裁剪为正方形: {side}x{side}")

    print(f"[2/4] 应用圆角遮罩 (原图 {img.size})")
    img_rounded = round_corners(img, radius_ratio=0.18)

    # ==== 导出 ====
    sizes = {
        "32x32.png": 32,
        "128x128.png": 128,
        "128x128@2x.png": 256,
    }

    print(f"[3/4] 缩放并导出 PNG 图标集 → {icons_dir}/")
    for filename, target_size in sizes.items():
        resampled = img_rounded.resize((target_size, target_size), Image.LANCZOS)
        out_path = os.path.join(icons_dir, filename)
        resampled.save(out_path, "PNG")
        print(f"      {filename} ({target_size}x{target_size})")

    # 生成 ICO（含多个尺寸）
    print("[4/4] 导出 icon.ico")
    ico_path = os.path.join(icons_dir, "icon.ico")
    ico_main = img_rounded.resize((256, 256), Image.LANCZOS)
    ico_main.save(ico_path, format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

    # 验证
    for filename in ["32x32.png", "128x128.png", "128x128@2x.png", "icon.ico"]:
        path = os.path.join(icons_dir, filename)
        size_kb = os.path.getsize(path) / 1024
        print(f"      {filename} — {size_kb:.1f} KB")

    print(f"\n[DONE] 全部图标已生成到 {icons_dir}/")


if __name__ == "__main__":
    main()
