# 调试与测量

## URL 参数

| 参数 | 作用 |
|---|---|
| `?seed=123` | 固定出题用的随机数和 `?demo` 的失误；粒子等视觉随机不固定 |
| `?count=6\|10\|14` | 本局题数，不写入设置 |
| `?grade=1\|2\|3` | 直接选年级 |
| `?skill=<id>` | 基本题和加时赛都只出这一个技能 |
| `?speed=0.2` | 全局时间倍率。动画、计时、演示节奏、BGM 一起变快或变慢 |
| `?demo` | 自动答题，带少量失误，跑完一整局（按 Esc 停止） |
| `?jump=finale\|result\|extra\|levelup\|chest\|merge\|collection` | 直接跳到对应的时刻，用假数据填充。`chest` 可以加 `&tier=0..4` 指定档位 |
| `?freezeAt=1500` | 游戏时间到 1500ms 时冻结，方便截图 |
| `?fps` | 在左下角显示 FPS、帧耗时 p95、粒子数、画质档位 |
| `?quality=0..3` | 固定画质档位 |

`?demo`、`?skill`、`?jump` 的局不计入今日小目标，也不保存奖品，也不写成长记录、错题本和结算记录（`tangyuan:records`），不出时间胶囊，结算页不显示"进步了"。`?demo`、`?jump` 打开的首页不出补签提示。是不是调试局在开局时定下（`initSession` 里的 `S.debug`，`state.growth.recording` 就是它的反面）：`?demo` 局中按 Esc 停掉演示，剩下的题仍不记；`?demo` 页面停掉演示后手动再开一局也仍是调试局（和补签提示的判断一致，都用 `demoOn()` = `P.demo || S.demo`）。控制台 `__game.setDemo(true)` 从下一局起算调试局。
`?seed` 局照常写成长记录，但出题不读它（不跨局去重、不替换擦亮旧技能的题、不出时间胶囊），结算页也不显示"进步了"，同一个种子总是出同样的题。

## `window.__game`

- `state`：当前状态，包括这些字段：
  - 流程：`screen`、`mode`、`problemNo`、`step`
  - 连击与甜度：`combo`、`maxCombo`、`sweetness`、`E`
  - 答题：`firstTryRate`、`cellMisses`、`hintLevel`
  - M2：`xp`、`level`、`perks`、`comboMult`、`members`、`chestTier`、`lastChest`、`collection`、`overlay`
  - 性能：`particles`（前后两层合计）、`particlesBack`、`particlesFront`、`quality`
  - 演出：`reach`（是否在听牌）、`fever`（连击热度 0～4）
- `problem`：当前题目，包括题面、全部合法答案、已输入内容、下一步可以接受的 token、第三级和第四级提示。
- `generate(skillId, n, seed)`：批量出题，用来做校验。
- `skills`：技能列表。
- 操作：
  - 答题：`press(key)`、`solveStep()`、`wrongStep()`
  - 流程：`start()`、`startExtra(force)`、`toTitle()`、`jump(name)`
  - 演示与冻结：`setDemo(on)`、`freeze()`、`unfreeze()`、`freezeAfter(ms)`
- 成长记录（`progress.js`，`tangyuan:progress`）：
  - `state.growth`：`recording`（这局是否记录）、`useHistory`（出题是否读成长记录）、`rustIndex` / `rustSkill`（擦亮旧技能在第几题，-1 表示没有）、`newMastered`（本段新掌握的技能）、`qMisses`、`qMs`（当前题已用时）
  - 查询：`progress()`（整个记录的副本）、`rusty()`（全部年级里最旧的最多 3 个生锈技能，最旧的在前；某个年级的候选另按年级过滤后再取 3 个）
  - 会写 localStorage：`fakeRust(n = 2, days = 30, grade)` 把该年级前 n 个技能设为已掌握，再把它们的所有时间往前挪 days 天，首页马上显示"有 N 个技能生锈了"（按首页选中的年级数：不高于它的生锈技能里最旧的最多 3 个），下一局前 2 题里有擦亮题（这个技能本来就是第 1 题时标签在第 1 题，否则第 2 题）；`ageSkills(ids, days)` 把这些技能的所有时间（掌握、最近第一次就答对、最早 3 题、每题记录、日汇总）往前挪；`masterSkills(ids)`；`resetProgress()`
  - 例：首页控制台 `__game.fakeRust(2, 30, 1)`，然后开始练习
- 时间胶囊、进步了（`growth.js`）：
  - `state.growth` 里还有 `capsuleIndex`（-1 表示这局没有）、`capsule`、`capsuleNews`（做完后的比较）、`capsuleDay`（今天是否已出过）、`gains`（上一次结算页的"进步了"）
  - 查询：`capsulePick()`（下一局会出的胶囊）、`improvements(skills)`（这些技能现在的"进步了"，默认本局的技能）
  - 会写 localStorage：`fakeCapsule(skill, days = 35)` 把这个技能的最早 3 题换成 days 天前做的新题（慢、第 2 题错 2 次）、设为已掌握（不生锈），并清掉"今天已出过胶囊"，下一局按年级（题数 ≥ 4）就有胶囊；`capsuleNow(skill, days)` 做同样的事并马上开一局，胶囊是第 1 题（只有这个入口不按位置规则）。两个入口都只是写数据，出哪道胶囊仍按规则取"最旧的未用题"：如果别的技能有更早的未用题，出的是那一题，不一定是传入的技能（返回值 `capsulePick()` 就是实际会出的那道）；用 `resetProgress()` 后再调用就一定是传入的技能。另外 `capsuleNow` 那局如果擦亮题也在第 1 题（生锈技能本来就是第 1 题），保留擦亮题、不出胶囊；`resetCapsuleDay()`；`fakeGains(grade)` 给这个年级的全部技能（和生锈技能）写一个更慢或第一次就答对更少的过去日子（3 天前或 25 天前）和今天已做的 2 题，这局再做 1 题就会出现"进步了"（会覆盖这些技能 25 天以内的日汇总）
  - 例：首页控制台 `__game.capsuleNow('g1b-vadd2')` 立刻看到胶囊；`__game.fakeGains(1)` 后开一局 1 年级，结算页有 3 行"进步了"
  - 结算页内容最多的情况：`__game.fakeRust(2, 30, 1); __game.fakeGains(1); __game.fakeMistakes(3); __game.fakeCapsule('g1a-add10', 40); __game.nearMastery(1)`（没掌握的技能再第一次就答对一题就掌握），然后全对做完一局 10 题
- 状态里还有：`kind`（`'grade'` 按年级 / `'review'` 错题再练；`mode` 仍是 `basic`/`extra`）、`review`（错题再练时的 `{ keys, cleared }`）、`mistakes`（错题本题数）
- 错题本（`mistakes.js`，`tangyuan:mistakes`）：
  - 查询：`mistakes()`（每条的 `key`、`skill`、`day`、`text`、`kind`）
  - 会写 localStorage：`fakeMistakes(n = 6, skills)` 生成 n 道题放进错题本，默认技能依次是竖式加法、除法竖式、分数、竖式乘法、□ 填空、小数、商……余、横式，所以一局错题再练能看到全部版面；`clearMistakes()`
  - 操作：`startReview()`（和首页"错题再练"按钮一样）
  - 例：首页控制台 `__game.fakeMistakes(8)`，然后点"错题再练 8 题"
- 今日小目标、补签卡（`daily.js`，`tangyuan:daily`）：
  - `state.today` 是存储的状态加 `shownStreak`、`pending`；等待补签时首页显示原来的天数（`shownStreak`）和"待补签"（`pending: true`）。没回答就开始练习后 `streak` 是今天的 1，原来的那段在 `held`
  - 查询：`daily()`（存储的状态，加上 `shownStreak`、`pending`、今天会不会自动弹出的 `offer`、能不能补签的 `entry`）
  - 会写 localStorage：`fakeMissed(days = 2, streak = 5, cards)` 把最后练习日设为 days 天前、连续 streak 天，清掉"今天已提示"和 `held`，然后回到首页；满足条件时"开始练习"下面马上出现补签卡（`days = 2` 是断 1 天，`days = 3` 是断 2 天，需要 2 张卡）；`setCards(n)`
  - 例：首页控制台 `__game.fakeMissed(3, 6, 2)`：断 2 天、有 2 张卡，提示"有 2 天没有练习。用 2 张补签卡接上 6 天连续练习？"。不回答直接开始练习、做一题再回首页：补签卡收起，连续天数显示 6 和"待补签"，点它再展开，接上后是 7
- 清除全部记录：设置 →"清除全部记录"→"继续"→"清除"。纯函数 `store.wipePrefixed(storage)` 可以在 node 里用假对象测（`tests/store.test.mjs`）。浏览器里验证：清除后 `Object.keys(localStorage)` 只剩非 `tangyuan:` 的键和默认的 `tangyuan:settings`
- M2 相关：
  - 查询：`chestTier(stats)`、`chestGoals(stats)`、`nextReward(tier, owned)`、`perkChoices(i, taken)`、`levelOf(xp)`
  - 操作：`pickPerk(i)`
  - 会写 localStorage：`grantAll()`、`resetCollection()`、`equip(id)`

## 测试

```sh
node --test tests/          # 单元测试：生成器、判定、提示、chestTier 的确定性、合成、解锁顺序
node playtest/verify.mjs    # 试玩方写的独立校验，不要修改它
```

`verify.mjs` 用自己的算法从题面重新算答案，逐项核对：输入顺序、进位"1"和退位点的位置、除法竖式的每一轮、余数范围、提示里的算式、数值范围、整局重复。

## 性能测量

`tools/perf/` 下是一组无头 Chrome 脚本（纯 CDP，需要 Node 24 自带的 WebSocket）。每次都用全新的配置目录冷启动，不影响你正在用的浏览器。

```sh
cd tools/perf && mkdir -p out
node bench.mjs desktop 42   # 冷启动跑一局 ?demo，按阶段统计帧间隔（mobile 为 414×860 + CPU 4 倍降速）
node keylat.mjs desktop 80  # 按键 → 下一次绘制的延迟（Event Timing）
./suite.sh                  # 桌面 5 次 + 手机 3 次 + 按键延迟
```

当前目标：
- 桌面 1440×900@2 冷启动一局：超过 20ms 的帧不多于 2 帧，没有超过 100ms 的帧。
- 按键到数字可见：p95 ≤ 50ms。
- 手机 4 倍降速：帧耗时 p95 ≤ 20ms。

历次数据见 `NOTES-impl.md` 的"性能优化"一节。

### 在正在使用的 Chrome 中对照测试

无头 Chrome 的刷新率、GPU 后端和扩展环境可能与日常使用的 Chrome 不同。遇到实机卡顿时，先保留修改前的静态文件，再使用本地采样服务：

```sh
baseline_dir=$(mktemp -d /tmp/tangyuan-perf.XXXXXX)
cp -R app "$baseline_dir/app"
python3 tools/perf/live-server.py --before "$baseline_dir/app"
```

修改代码后，在同一个 Chrome 标签页依次打开以下地址，保持窗口可见，等待右上角显示“已保存”再切换：

```text
http://localhost:8733/before/?perf=before-native&seconds=75&demo&count=6&grade=3&seed=7
http://localhost:8733/after/?perf=after-native&seconds=75&demo&count=6&grade=3&seed=7
```

服务只监听 `127.0.0.1`，结果写入 `tools/perf/out/live-*.json`。采样脚本仅由此服务注入，不进入正式游戏。它记录帧间隔、长任务、长动画帧及其脚本归因、页面可见性、首屏绘制、交互事件、流程阶段、窗口尺寸和实际 WebGL 渲染器。

- `?demo` 用于重复覆盖基本答题、升级、结算、开箱和加时赛；自动答题不产生真实输入事件，不能据此报告 INP。移除 `demo`，实际操作键盘或触屏，才可比较 `events` 中的交互延迟。
- `seconds` 为前台累计采样秒数（10–240，默认 60）；切到后台时暂停自动演示及采样计时，点击右上角按钮可以提前保存。完整加时赛结束需留出额外时间。
- 加 `&profile` 可采集粒子、背景、角色、音频方法中超过 5ms 的调用；这类诊断运行应与不带 profiler 的对照数据分开。
- 低性能模拟：在真实 Chrome 的开发者工具里设置相同的手机尺寸与 CPU 降速倍率，再分别测试 before/after。CPU 降速不能模拟手机 GPU、温控和内存限制。
- 对照时保持视口、刷新率、前台状态、音频状态和降速设置一致；记录多次结果。不要将不同设备模式的数据直接计算为优化百分比。
- `summary` 排除首次前台动画帧后的 2.5 秒，启动数据仍保存在原始数组中。出现 `hidden: true` 的运行应重新测量，不用于严格对照。帧间隔来自 `requestAnimationFrame`，不是 GPU 实际呈现帧的计数。Event Timing 有最小报告阈值，未报告的交互不能当作耗时为零。


### 2026-09-30：真实 Chrome 性能排查

环境：用户正在使用的 Chrome 154、Apple M4 / ANGLE Metal。桌面视口 1920×963、DPR 2；手机模拟 414×860、DPR 2，CPU 在 DevTools 中手动设为 4× / 6×，网络不降速。原浏览器扩展保持启用。主要结论来自有窗口的真实 Chrome，无头测试仅作辅助，不混入下表。

基线是本轮开始时的工作区快照，包含当时已有的未提交优化，并非 Git HEAD。快照保存在 `/tmp/tangyuan-perf-0930/before`；基线 main.js SHA-256 为 `16fe92b69c48cb16aaf6932a824b9b733e66cb317e0adb66f60f0acdb63b93fc`。

本轮修复：

1. 背景 WebGL 缓冲区不再随自适应画质切换而重新分配，只在初次创建或视口变化时调整尺寸。真实 DevTools trace 中 `Backdrop.resize` 的累计采样耗时约 263ms，包含一次约 208ms 的游戏帧任务。低画质仍降低背景绘制频率；固定低画质启动仍使用低分辨率缓冲区。代价是自动降档后保留初始缓冲区的像素数。
2. 经验条闪光复用持有的 Animation 句柄，避免每颗宝石抵达时调用 `getAnimations()` 触发样式刷新。
3. 通关飘字的布局测量移出同步按键处理，并检查局次与页面状态，避免换局后出现过期特效。它仍可能在下一帧触发布局，并未消除所有强制布局。

自动流程固定 `demo&count=6&grade=3&seed=7`，视觉随机数固定种子；桌面每轮 75 秒，手机模拟每轮 45 秒。覆盖答题、升级、基本结算、开箱和加时赛。下表均为前台可见的有效运行，未录制 profiler；排除首次前台帧后最初 2.5 秒，单位 ms。桌面首次 baseline 使用旧版采样时长逻辑，但全程前台；重复对照使用相同新版采样器。所有运行无脚本异常。

| 记录标签 | 帧间隔 p95 | 最大帧间隔 | >50ms 帧数 | >50ms 长任务数 |
| --- | ---: | ---: | ---: | ---: |
| `before-native-2` | 33.3 | 107.9 | 3 | 2 |
| `before-native-repeat` | 25.0 | 91.7 | 2 | 2 |
| `stable-buffer-native` | 24.9 | 50.1 | 1 | 0 |
| `after-native-repeat` | 24.7 | 33.4 | 0 | 0 |
| `before-mobile4` | 17.2 | 117.6 | 2 | 4 |
| `after-mobile4` | 17.1 | 41.6 | 0 | 1 |
| `before-mobile6` | 33.3 | 91.6 | 34 | 24 |
| `before-mobile6-repeat` | 41.8 | 149.6 | 71 | 40 |
| `after-mobile6` | 33.6 | 184.2 | 49 | 30 |
| `after-mobile6-repeat` | 25.9 | 99.2 | 16 | 14 |

桌面两次优化后运行均为 0 长任务；4× 模拟的一组对照消除了 >50ms 帧。6× 条件下原版与优化版均有明显长帧，重复结果区间重叠，不能认定已稳定解决低性能设备卡顿。手机结果与桌面结果不可直接比较：小视口显著减少像素绘制负担。CPU 模拟也不代表真实手机的 GPU、内存、温控或网络状况。

真实键盘补测：在 4×、414×860 模式，分别完成同样的前三题，共 9 个数字键，含短时间连续输入。两版均答对三题且无丢键；下表只统计 keydown，不混入开始按钮与保存按钮点击。

| 记录标签 | 按键样本 | 处理耗时中位数 | 最大处理耗时 | 最大事件到呈现延迟 |
| --- | ---: | ---: | ---: | ---: |
| `before-keys4` | 9 | 24.6 | 67.1 | 224 |
| `after-keys4` | 9 | 26.5 | 45.4 | 272 |

该小样本中最大处理耗时降低，但中位数略高，总交互延迟没有改善，优化后仍达到 272ms。快速连按的排队与后续渲染仍需优化，不能用处理函数耗时替代输入到画面的延迟，也不能把自动演示当作 INP 测试。后续重点应是批量安排布局读取、减少答题反馈期间的主线程及绘制工作，再用更多真人输入样本复核。

原始数据在 `tools/perf/out/live-<标签>-*.json`；诊断 trace 在 `tools/perf/out/native-trace.json.gz`（仅诊断，非计分样本，记录的是缓冲区修复前版本）。这些输出由 gitignore 排除，未提交浏览器 trace。窗口遮挡、功能包装采样、隐藏图层实验的数据均未纳入表中。尝试提升角色 SVG 合成层未观察到收益，已撤回。

回归：`node --test tests/` 127 项通过，`node playtest/verify.mjs` 独立数学校验通过。测试后恢复了 Chrome 无 CPU 降速、关闭手机模拟，在正常应用端口 8731 留下可用页面。
