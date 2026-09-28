#!/bin/sh
# 按 app/ 里实际出现的字符裁剪站酷快乐体，输出 woff2。改了界面文案后重新运行。
# 依赖 uv（uvx 临时拉取 fonttools，不改系统环境）。
set -e
cd "$(dirname "$0")/.."
SRC=tools/fonts-src/ZCOOLKuaiLe-Regular.ttf
OUT=app/fonts/zcool-kuaile.woff2
CHARS=$(mktemp)
# 收集 app/ 下 html/js/css 的所有字符，另加可打印 ASCII 和常用全角标点
python3 - "$CHARS" <<'PY'
import sys, pathlib
chars = set(chr(c) for c in range(0x20, 0x7f))
chars |= set("，。！？：；、（）《》「」“”‘’…—·×÷−＋＝□△○√≈％")
for p in pathlib.Path("app").rglob("*"):
    if p.suffix in {".html", ".js", ".css", ".json"}:
        chars |= set(p.read_text(encoding="utf-8"))
chars = {c for c in chars if c.isprintable()}
open(sys.argv[1], "w", encoding="utf-8").write("".join(sorted(chars)))
print(len(chars), "chars")
PY
uvx --from fonttools --with brotli pyftsubset "$SRC" --text-file="$CHARS" \
  --flavor=woff2 --layout-features='*' --output-file="$OUT"
rm -f "$CHARS"
ls -l "$OUT"
