# 汤圆算算

小学数学逐位输入练习游戏。零依赖原生 ES Modules，无构建。需求见 `BRIEF.md`，文档在 `docs/`。

- 运行：`python3 -m http.server 8731 -d app`；改代码后硬刷新
- 测试：`node --test tests/` 和 `node playtest/verify.mjs`，改动后两个都要通过；不要为了让测试通过去改 `verify.mjs`
- 改了界面文案后运行 `./tools/build_fonts.sh`；完整字体在 `tools/fonts-src/`，不能放进 `app/`
- 纯逻辑模块（skills/problems/engine/session/scoring/chest/perks/merge/collection）不碰 DOM，必须能被 node 直接 import
- 数学正确性优先于一切演出；中国写法（进位小"1"、退位点、"厂"形除法、`……` 余数）不能改
- 奖励由表现决定、不用随机数决定结果；只给装扮类奖励；不做付费和无限循环
- 动画只改 `transform`/`opacity`；动画循环里不读布局；新特效要在首页预热
- 浏览器只用 Chrome；只操作自己打开的页面
- 原项目 dopa-drill 只作参考（本地可 clone 到 `ref/`，已 gitignore）；它的吉祥物、名称、logo 不能用
