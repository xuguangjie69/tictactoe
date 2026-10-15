"""
生成井字棋图标 + 466×466 视觉预览图（无真机时先自查美观度）
用法：python tools/preview.py

🔴 关键纪律：预览图的坐标必须与 index.ux 的度量**同源**。
   第一版预览图画的是绝对定位坐标，.ux 改成 flex 流式后就全对不上了，
   于是预览图"看起来很美"但真机散架。
   现在做法：M() 从 index.ux 的 style 块正则抠出真实尺寸 → 与下方硬编码常量比对，
   不一致直接 sys.exit 失败。改 .ux 必须同步改这里，改完不一致会立刻报错。
"""
import os
import re
import sys
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
IMG_DIR = os.path.join(ROOT, 'src', 'assets', 'images')
UX = os.path.join(ROOT, 'src', 'pages', 'Index', 'index.ux')

BG_TOP = (14, 21, 36)
BG_BOT = (19, 28, 48)
BOARD = (27, 39, 64)
SUB = (36, 51, 79)
LINE = (46, 62, 96)
CELL = (34, 48, 78)
GOLD = (245, 193, 94)
CYAN = (91, 200, 245)
TXT = (245, 240, 225)
SOFT = (198, 210, 230)
DIM = (124, 139, 168)
INK = (26, 20, 8)


def M(name, prop):
    """从 index.ux 的 style 块抠出 .class 的属性值（唯一真源）"""
    src = open(UX, encoding='utf-8').read()
    blk = re.search(r'\.' + re.escape(name) + r'\s*\{([^}]*)\}', src)
    if not blk:
        sys.exit('度量校验失败：index.ux 里找不到 .' + name)
    mm = re.search(r'(^|;)\s*' + prop + r'\s*:\s*([0-9]+)px', blk.group(1))
    if not mm:
        sys.exit('度量校验失败：.' + name + ' 没有 ' + prop)
    return int(mm.group(2))


# —— 布局常量：左边是从 .ux 抠出来的真值，右边是硬编码；不一致即失败 ——
CELL_W, CELL_H = M('cell', 'width'), M('cell', 'height')
CELL_GAP = int(re.search(r'margin-left\s*:\s*([0-9]+)px',
                         re.search(r'\.cell\s*\{[^}]*\}', open(UX, encoding='utf-8').read()).group(0)).group(1))
BOARD_W = int(re.search(r'w-\[([0-9]+)px\] h-\[([0-9]+)px\].*?bg-board',
                        open(UX, encoding='utf-8').read()).group(2))
ROW_W = int(re.search(r'\.row-cell\s*\{[^}]*width\s*:\s*([0-9]+)px',
                      open(UX, encoding='utf-8').read()).group(1))
BOARD_PAD = int(re.search(r'px-\[([0-9]+)px\].*?bg-board',
                          open(UX, encoding='utf-8').read()).group(1))
# 🔴 宽度账：.cell 左右各有 margin，一行三格真实占 3×W + 3×2×GAP（含首尾 margin，不能只算 2 个间隙）
span = CELL_W * 3 + CELL_GAP * 2 * 3
avail = ROW_W
if span > avail:
    sys.exit('度量校验失败：棋盘一行三格占 %dpx，超出 .row-cell 可用宽 %dpx（第三列会被挤出面板）'
             % (span, avail))
if avail + BOARD_PAD * 2 != BOARD_W:
    sys.exit('度量校验失败：.row-cell(%d) + padding(%d×2) != 棋盘宽(%d)'
             % (ROW_W, BOARD_PAD, BOARD_W))
step = CELL_W + CELL_GAP * 2
# 模式行 / 难度行：同样从 index.ux 抠真值，预览图才不会和页面脱节
MODE_W, MODE_H = M('btn-mode', 'width'), M('btn-mode', 'height')
MODE_GAP = M('col-mode', 'margin-left')
DIFF_W, DIFF_H = M('btn-diff', 'width'), M('btn-diff', 'height')
DIFF_GAP = M('col-diff', 'margin-left')
UNSEL = (174, 187, 212)


def grad_bg(w, h):
    im = Image.new('RGB', (w, h), BG_TOP)
    d = ImageDraw.Draw(im)
    for y in range(h):
        t = y / max(1, h - 1)
        d.line([(0, y), (w, y)],
               fill=tuple(int(BG_TOP[i] + (BG_BOT[i] - BG_TOP[i]) * t) for i in range(3)))
    return im


def font(size):
    for p in (r'C:\Windows\Fonts\msyhbd.ttc', r'C:\Windows\Fonts\msyh.ttc',
              r'C:\Windows\Fonts\simhei.ttf'):
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()


def ctext(d, cx, cy, s, f, fill):
    l, t, r, b = d.textbbox((0, 0), s, font=f)
    d.text((cx - (r - l) / 2 - l, cy - (b - t) / 2 - t), s, font=f, fill=fill)


def rrect(d, box, r, fill=None, outline=None, width=1):
    d.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)


def mark(d, box, who):
    """画棋子：先画棋子，再由调用方叠高亮环，避免环盖住棋子"""
    x0, y0, x1, y1 = box
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    if who == 'x':
        r = min(x1 - x0, y1 - y0) * 0.30
        d.line([(cx - r, cy - r), (cx + r, cy + r)], fill=GOLD, width=7)
        d.line([(cx + r, cy - r), (cx - r, cy + r)], fill=GOLD, width=7)
    else:
        r = min(x1 - x0, y1 - y0) * 0.30
        d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=CYAN, width=7)


# ---------------- 图标 114×114 ----------------
def make_icon():
    S = 114
    im = Image.new('RGB', (S, S), BG_TOP)
    d = ImageDraw.Draw(im)
    for y in range(S):
        t = y / (S - 1)
        d.line([(0, y), (S, y)],
               fill=tuple(int(BG_TOP[i] + (BG_BOT[i] - BG_TOP[i]) * t) for i in range(3)))
    pad, gap = 10, 6
    cs = (S - pad * 2 - gap * 2) // 3
    for r in range(3):
        for c in range(3):
            x = pad + c * (cs + gap)
            y = pad + r * (cs + gap)
            rrect(d, (x, y, x + cs, y + cs), 10, fill=CELL)
    mark(d, (pad, pad, pad + cs, pad + cs), 'x')                       # 左上 X
    mark(d, (pad + cs + gap, pad + cs + gap,
             pad + 2 * (cs + gap), pad + 2 * (cs + gap)), 'o')          # 中 O
    mark(d, (pad + 2 * (cs + gap), pad, pad + 3 * cs + gap * 2, pad + cs), 'x')  # 右上 X
    os.makedirs(IMG_DIR, exist_ok=True)
    p = os.path.join(IMG_DIR, 'logo.png')
    im.save(p)
    print('图标 ->', p)


# ---------------- 预览 466×466 ----------------
def draw_board(d, top, marks=None, wins=None):
    """按 .ux 度量画棋盘，返回棋盘 box"""
    marks = marks or {}
    wins = wins or set()
    bx0 = (466 - BOARD_W) / 2
    by0 = top
    rrect(d, (bx0, by0, bx0 + BOARD_W, by0 + BOARD_W), 20,
          fill=BOARD, outline=LINE, width=2)
    step = CELL_W + CELL_GAP * 2
    for i in range(9):
        r_, c_ = divmod(i, 3)
        x0 = bx0 + BOARD_PAD + c_ * step
        y0 = by0 + BOARD_PAD + r_ * step
        box = (x0, y0, x0 + CELL_W, y0 + CELL_H)
        rrect(d, box, 14, fill=CELL)
        if i in marks:
            mark(d, box, marks[i])
        if i in wins:
            rrect(d, (x0 + 1, y0 + 1, x0 + CELL_W - 1, y0 + CELL_H - 1), 14,
                  outline=GOLD, width=3)
    return (bx0, by0, bx0 + BOARD_W, by0 + BOARD_W)


def menu(w, h, duo=False):
    """菜单。duo=True 画双人模式（无难度行，说明卡换文案）。"""
    im = grad_bg(w, h)
    d = ImageDraw.Draw(im)
    c = w / 2
    ctext(d, c, 40, '井字棋', font(34), TXT)
    ctext(d, c, 66, '三子连线 · 先手执 X', font(14), DIM)

    # —— 模式行：与 index.ux 的 .row-mode / .btn-mode / .ring-mode 同源 ——
    ctext(d, c, 100, '选择模式', font(15), CYAN)
    total = MODE_W * 2 + MODE_GAP * 2 * 2
    x0 = c - total / 2
    for i, name in enumerate(['人机对战', '双人模式']):
        x = x0 + i * (MODE_W + MODE_GAP * 2)
        sel = (i == 1) if duo else (i == 0)
        rrect(d, (x, 124, x + MODE_W, 124 + MODE_H), 22,
              fill=BOARD, outline=GOLD if sel else None, width=2)
        ctext(d, x + MODE_W / 2, 124 + MODE_H / 2, name, font(17),
              GOLD if sel else UNSEL)

    y = 124 + MODE_H + 18          # 168 → 186
    pw = 300
    px = c - pw / 2

    if duo:
        rrect(d, (px, y, px + pw, y + 96), 14, outline=LINE, width=1)
        for k, s in enumerate(['同桌轮流落子 · 一人 X 一人 O',
                               'X 先手 · 先连成三子者获胜',
                               '无电脑参与 · 面对面对弈']):
            ctext(d, c, y + 20 + k * 20, s, font(13), DIM)
        y += 96 + 18
        ctext(d, c, y, '双人模式不计战绩', font(14), CYAN)
        y += 22
        rrect(d, (c - 110, y, c + 110, y + 44), 22, fill=GOLD)
        ctext(d, c, y + 22, '开始对局', font(20), INK)
        return im

    # —— 人机：难度行 + 说明卡 + 战绩 ——
    ctext(d, c, y, '选择难度', font(15), CYAN)
    y += 24
    total = DIFF_W * 3 + DIFF_GAP * 2 * 3
    x0 = c - total / 2
    for i, name in enumerate(['简单', '普通', '困难']):
        x = x0 + i * (DIFF_W + DIFF_GAP * 2)
        sel = (i == 1)
        rrect(d, (x, y, x + DIFF_W, y + DIFF_H), 22,
              fill=BOARD, outline=GOLD if sel else None, width=2)
        ctext(d, x + DIFF_W / 2, y + DIFF_H / 2, name, font(19),
              GOLD if sel else UNSEL)
    y += DIFF_H + 18
    rrect(d, (px, y, px + pw, y + 96), 14, outline=LINE, width=1)
    for k, s in enumerate(['简单 · 随手棋，入门练手',
                           '普通 · 会堵线，偶尔露破绽',
                           '困难 · 算尽每一步，几乎不输']):
        ctext(d, c, y + 20 + k * 20, s, font(13), DIM)
    y += 96 + 18
    ctext(d, c, y, '战绩 2胜 1负 0平', font(14), CYAN)
    y += 22
    rrect(d, (c - 110, y, c + 110, y + 44), 22, fill=GOLD)
    ctext(d, c, y + 22, '开始对局', font(20), INK)
    return im


def game(w, h, marks=None, wins=None, turn='你的回合',
         status='你执 X · 困难难度', back='换难度'):
    im = grad_bg(w, h)
    d = ImageDraw.Draw(im)
    c = w / 2
    ctext(d, c, 26, status, font(18), TXT)
    ctext(d, c, 50, turn, font(14), CYAN)
    draw_board(d, 66, marks, wins)
    bw = 124
    x0 = c - (bw * 2 + 6) / 2
    for i, s in enumerate(['重开', back]):
        x = x0 + i * (bw + 6)
        rrect(d, (x, 334, x + bw, 378), 22, fill=SUB)
        ctext(d, x + bw / 2, 356, s, font(18), SOFT)
    return im


def over(w, h, title='你赢了', sub='连成三子 · 干得漂亮', back='换个难度'):
    im = grad_bg(w, h)
    d = ImageDraw.Draw(im)
    c = w / 2
    pw = 300
    px = c - pw / 2
    rrect(d, (px, 120, px + pw, 120 + 226), 20, fill=BOARD, outline=LINE, width=2)
    ctext(d, c, 160, title, font(28), GOLD)
    ctext(d, c, 192, sub, font(14), DIM)
    rrect(d, (c - 120, 214, c + 120, 258), 22, fill=GOLD)
    ctext(d, c, 236, '再来一局', font(19), INK)
    rrect(d, (c - 120, 266, c + 120, 310), 22, fill=SUB)
    ctext(d, c, 288, back, font(17), SOFT)
    return im


def save(im, name):
    p = os.path.join(HERE, 'preview', name)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    im.save(p)
    print('预览 ->', p)
    return p


if __name__ == '__main__':
    print('度量自检：cell %dx%d  间距 %d  棋盘 %d  行宽 %d ✓' %
          (CELL_W, CELL_H, CELL_GAP, BOARD_W, ROW_W))
    print('度量自检：模式行 %dx%d 间距%d   难度行 %dx%d 间距%d ✓' %
          (MODE_W, MODE_H, MODE_GAP, DIFF_W, DIFF_H, DIFF_GAP))
    make_icon()
    out = []
    out.append(save(menu(466, 466), '1_menu.png'))
    out.append(save(game(466, 466, {0: 'x', 3: 'o', 4: 'x', 7: 'o'}), '2_game.png'))
    out.append(save(game(466, 466,
                         {0: 'x', 1: 'x', 2: 'x', 4: 'o', 6: 'o'},
                         {0, 1, 2}, '你赢了'), '3_game_win.png'))
    out.append(save(over(466, 466), '4_over.png'))
    out.append(save(menu(390, 450), '5_square.png'))
    # —— 双人模式（与 index.ux 的模式行 / 双人文案同源）——
    out.append(save(menu(466, 466, duo=True), '6_duo_menu.png'))
    out.append(save(game(466, 466, {0: 'x', 3: 'o', 1: 'x', 4: 'o'},
                         None, '轮到 X 方落子', '双人模式 · X 先手', '换模式'),
                    '7_duo_game.png'))
    out.append(save(over(466, 466, 'X 方胜', '连成三子 · 先手拿下', '换个模式'),
                    '8_duo_over.png'))
