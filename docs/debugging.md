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
