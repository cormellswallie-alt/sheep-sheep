"""把 calibrate.js 的模拟结果拟合成游戏内难度表（单调递增），并写回 level.js。
score = 100 × (1 − 0.2×高手通关率 − 0.2×高手清牌比例 − 0.3×大众通关率 − 0.3×大众清牌比例)
"""
import json, re, sys, math

src = sys.argv[1] if len(sys.argv) > 1 else '/tmp/cal.log'
rows = []
for l in open(src):
    try:
        rows.append(json.loads(l))
    except Exception:
        pass
rows.sort(key=lambda r: r['lv'])

def pava(y):
    # 保序回归（非降）
    blocks = [[v, 1] for v in y]
    i = 0
    while i < len(blocks) - 1:
        if blocks[i][0] > blocks[i + 1][0] + 1e-9:
            v = (blocks[i][0] * blocks[i][1] + blocks[i + 1][0] * blocks[i + 1][1]) / (blocks[i][1] + blocks[i + 1][1])
            blocks[i] = [v, blocks[i][1] + blocks[i + 1][1]]
            del blocks[i + 1]
            if i > 0:
                i -= 1
        else:
            i += 1
    out = []
    for v, c in blocks:
        out += [v] * c
    return out

raw = [100 * (1 - 0.2 * r['expertPass'] / 100 - 0.2 * r['expertProg'] / 100
              - 0.3 * r['casualPass'] / 100 - 0.3 * r['casualProg'] / 100) for r in rows]
score = pava(raw)
# 严格递增：每关至少比上一关 +0.3
for i in range(1, len(score)):
    score[i] = max(score[i], score[i - 1] + (0.3 if i >= 10 else 2.0))
score[0] = 1.0
passes = pava([-r['expertPass'] for r in rows])
passes = [-p for p in passes]
for i in range(1, len(passes)):
    passes[i] = min(passes[i], passes[i - 1])
# 0% 的关卡按趋势外推，保留“极小但非零”的通关率
last_pos = max(i for i, p in enumerate(passes) if p > 0)
for i in range(last_pos + 1, len(passes)):
    passes[i] = passes[last_pos] * math.exp(-(i - last_pos) / 3)

def mono_dec(vals):
    v = pava([-x for x in vals]); v = [-x for x in v]
    for i in range(1, len(v)):
        v[i] = min(v[i], v[i - 1])
    lp = max([i for i, x in enumerate(v) if x > 0] or [0])
    for i in range(lp + 1, len(v)):
        v[i] = v[lp] * math.exp(-(i - lp) / 3)
    return v
casual = mono_dec([r['casualPass'] for r in rows])
cas = [0] + [round(p, 4) for p in casual]
tiles = [0] + [r['tiles'] for r in rows]
print('CASUAL', cas)

# 映射到 0~100 的“难度指数”：高难区间更细腻
diff = [0] + [round(100 * (1 - (1 - s / 100) ** 1.8), 1) for s in score]
# 1~10 关：每关至少 +5（大幅跃升）；11 关起用渐近曲线平滑拟合（每关小幅递增）
d = diff[1:]
for i in range(1, min(10, len(d))):
    d[i] = max(d[i], d[i - 1] + 5)
base = d[9]
best = None
for tau10 in range(50, 1200, 5):
    tau = tau10 / 10
    err = sum((base + (99.9 - base) * (1 - math.exp(-(i - 9) / tau)) - d[i]) ** 2 for i in range(10, len(d)))
    if best is None or err < best[0]:
        best = (err, tau)
TAU = best[1]
for i in range(10, len(d)):
    d[i] = round(base + (99.9 - base) * (1 - math.exp(-(i - 9) / TAU)), 1)
diff = [0] + [round(x, 1) for x in d]
print('TAU', TAU)
pas = [0] + [round(p, 3) for p in passes]
print('DIFF', diff)
print('PASS', pas)

p = '/var/minis/workspace/sheep/app/src/main/assets/level.js'
s = open(p).read()
s = re.sub(r'const DIFF_TABLE = \[[^\]]*\];[^\n]*', 'const DIFF_TABLE = ' + json.dumps(diff) + ';  // tools/fit_diff.py 生成', s)
s = re.sub(r'const PASS_TABLE = \[[^\]]*\];[^\n]*', 'const PASS_TABLE = ' + json.dumps(pas) + ';  // AI 高手通关率 %', s)
if 'const CASUAL_TABLE' not in s:
    s = s.replace('const TIERS = [', 'const CASUAL_TABLE = [];\nconst TILES_TABLE = [];\nconst TIERS = [', 1)
s = re.sub(r'const CASUAL_TABLE = \[[^\]]*\];[^\n]*', 'const CASUAL_TABLE = ' + json.dumps(cas) + ';  // AI 大众通关率 %', s)
s = re.sub(r'const TILES_TABLE = \[[^\]]*\];[^\n]*', 'const TILES_TABLE = ' + json.dumps(tiles) + ';  // 每关牌数（种子 = 关卡号）', s)
s = re.sub(r'const DIFF_TAU = [0-9.]+;[^\n]*', 'const DIFF_TAU = ' + str(TAU) + ';  // 10 关后渐近曲线时间常数', s)
open(p, 'w').write(s)
