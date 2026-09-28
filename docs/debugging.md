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

`?demo`、`?skill`、`?jump` 的局不计入今日小目标，也不保存奖品。

## `window.__game`

- `state`：当前状态，包括这些字段：
  - 流程：`screen`、`mode`、`problemNo`、`step`
  - 连击与甜度：`combo`、`maxCombo`、`sweetness`、`E`
  - 答题：`firstTryRate`、`cellMisses`、`hintLevel`
  - M2：`xp`、`level`、`perks`、`comboMult`、`members`、`chestTier`、`lastChest`、`collection`、`overlay`
  - 性能：`particles`、`quality`
- `problem`：当前题目，包括题面、全部合法答案、已输入内容、下一步可以接受的 token、第三级和第四级提示。
- `generate(skillId, n, seed)`：批量出题，用来做校验。
- `skills`：技能列表。
- 操作：
  - 答题：`press(key)`、`solveStep()`、`wrongStep()`
  - 流程：`start()`、`startExtra(force)`、`toTitle()`、`jump(name)`
  - 演示与冻结：`setDemo(on)`、`freeze()`、`unfreeze()`、`freezeAfter(ms)`
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
