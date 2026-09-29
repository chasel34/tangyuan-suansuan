# 架构

零依赖的原生 ES Modules，不需要构建。`app/index.html` 加载 `js/main.js`，其他模块由它引入。

## 模块

**纯逻辑**（不碰 DOM，node 测试可以直接 import）

| 模块 | 职责 |
|---|---|
| `skills.js` | 38 个技能：id、名称、年级、册、系统、前提、输入形式 |
| `problems.js` | 按技能生成题目和版面（横式、竖式、除法竖式、小数、分数），并产出每一步的合法答案 |
| `engine.js` | 判定：按键后检查"已输入 + 本键"是否仍是某组合法答案的前缀 |
| `session.js` | 一局的出题顺序：按"上册 → 下册、前提深度"排序，同一局按题面文字去重；加时赛 `planExtra`（第 7 题起循环下一年级前 4 个技能） |
| `scoring.js` | 得分、甜度、连击、演出强度 E |
| `showplan.js` | 演出规则：按 E 选粒子种类 `burstKinds`、连击热度 `feverLevel`、连击大奖图案 `jackpotSymbol`、听牌条件 `reachOn`、落格印章样式 `stampLook`、空闲跳间隔 `idleGap`、行进人数 `paradeCount`、蒸笼喷涌规模 `gushPlan` |
| `perks.js` | 经验、等级、三选一加成 |
| `merge.js` | 观众合成规则 |
| `chest.js` | 蒸笼档位 `chestTier()`，是纯函数 |
| `collection.js` | 收藏品列表和解锁顺序 |
| `progress.js` | 成长记录：每个技能的练习历史（签名、最近 6 题、最近 30 题用时、60 天日汇总、最早 3 题）、掌握、生锈、跨局去重 `makeFresh`、擦亮旧技能的出题替换 `withRust`（技能按本局年级过滤 `rustyFor`）。数据结构写在文件顶部注释里 |
| `mistakes.js` | 错题本：加入（去重、最多 40 题）、错题再练取题、移出。数据结构写在文件顶部注释里 |
| `growth.js` | "进步了！"（今天和以前的日汇总、最早 3 题比较）和时间胶囊（选题、放置、做完后的比较），以及生成调试数据的函数。所有函数都把"今天"作为参数 |
| `daily.js` | 今日小目标、连续练习天数、补签卡：日期计算（`dayKey`/`localDay`/`addDays`/`daysBetween`，按 UTC 算日期差，`progress.js`、`growth.js` 也用这几个）、得卡、补签提示的条件、没回答就练习时保留原来的连续（`held`）、首页显示的天数 `streakView`、接上、拒绝。所有函数都把"今天"作为参数。数据结构写在文件顶部注释里 |
| `cn.js` | 中文数字、数位名称、乘法口诀 |
| `rng.js` | 可设种子的随机数（mulberry32） |

**浏览器端**

| 模块 | 职责 |
|---|---|
| `main.js` | 游戏流程、输入、提示，把每个事件转换成画面和声音，以及调试接口和自动演示 |
| `core.js` | 虚拟时钟（`?speed`、冻结、hit-stop）、补间动画、视口尺寸缓存 `VP`、帧统计 |
| `tangyuan.js` | 汤圆吉祥物（SVG）：表情、热气、橡皮管手臂、摔倒 |
| `art.js` | 装扮部件、收藏图标 |
| `bg.js` | WebGL 全屏背景（有 CSS 回退），按 E 在四个关键色之间插值 |
| `fx.js` | Canvas 2D 粒子：纸屑、星星、爱心、闪星、光点、金币、宝石、小汤圆、流光、冲击波、喷泉、吸入、烟花、飘字。游戏里两层：`#fx-back` 在题卡后面；`#fx` 在题卡和键盘上面，但在它们的位置挖洞（`setHoles`），终场 2～3 秒内取消挖洞 |
| `fever.js` | 连击热度灯（屏幕边缘两圈灯泡，只改 opacity）和连击大奖（舞台里的三格老虎机） |
| `stamps.js` | 落格印章：每按对一位，题卡上沿外侧弹出的小印章 |
| `reels.js` | 老虎机滚轮：甜度和连击倍率 |
| `levelup.js` | 升级三选一的遮罩层 |
| `chestshow.js` | 结算页的蒸笼开箱：升档 → 蓄力 → 爆发 → 喷涌 → 揭晓，奖品在开箱前已确定 |
| `collectionui.js` | 收藏页 |
| `audio.js` | Web Audio 合成的 BGM 和音效 |
| `quality.js` | 自适应画质 |
| `store.js` | localStorage，键名前缀 `tangyuan:`；清除全部记录：纯函数 `wipePrefixed(storage, prefix)`（接受类 Storage 对象，先列出键再删，只删前缀键，删除失败不抛异常，node 测试可以直接 import），`clearAllRecords()` 先把 `save()` 锁住（本页之后不再写）再删；读 `tangyuan:progress`、`tangyuan:mistakes`、`tangyuan:daily` 时分别经 `normalizeProgress`、`normalizeMistakes`、`normalizeDaily` 修复损坏数据；今日小目标和补签的读写包装 `daily.js`；`tangyuan:capsule`（`{ lastDay }`，时间胶囊每天一题）用 `loadCapsuleDay`/`saveCapsuleDay` |

## 判定模型

每道题在生成时就给出若干组合法答案，每组是一串 token。现在的 token 都是单个数字，但模型本身支持多字符 token 和多组答案，以后做语文、英语版可以直接用。

按键时的处理：
- 仍是某组答案的前缀：判对，推进一步。
- 不是：判错。错的数字留在格子里，下一次按键覆盖它。

进位"1"、退位点、除法落下的数字、得数的小数点由程序自动显示，孩子不需要输入。

## 渲染分层

从下到上：
1. WebGL 背景
2. 方格纸（静态 CSS 层）
3. 舞台：汤圆、观众、彩旗
4. 粒子 canvas
5. 题卡和键盘
6. 全屏遮罩：升级、开箱、确认框

粒子和震屏都在题卡、键盘下面，所以除了满分终场的 2～3 秒和两个遮罩之外，题目和按键任何时候都不会被盖住。

## 性能约束

这几条是做性能优化时定下来的，改代码时请保持：

- 动画只改 `transform` 和 `opacity`，不要动画 `box-shadow`、`background-position`、`filter` 或尺寸属性。
- 动画循环里不读布局，改用 `core.js` 的 `VP` 缓存和出题时算好的位置。
- 不要每帧改 `:root` 上的 CSS 变量；只写到用到它的元素上，并且只在值变化时才写。
- 画布背板有像素上限：背景按设备像素的 0.5 倍、最多 90 万像素；每块粒子画布最多 240 万像素。
- 粒子上限按画质档位：前层 `partCap` 360/240/150/80，后层 `backCap` 520/340/180/70；蒸笼自己的画布是 `partCap` 的 1.6 倍。超上限时先淘汰装饰粒子，经验宝石保留。
- 题卡和键盘上面不能有特效：前层粒子画布挖洞，印章、连击大奖只放在舞台里（题卡上沿以上），热度灯只在屏幕边缘的空隙里。
- 新特效要加进首页的预热（`main.js`），否则第一次出现时 GPU 编译会造成卡顿。
- `AudioContext` 在页面加载时就创建（处于挂起状态），用户手势时只调用 `resume()`。
- `quality.js` 在连续卡顿时自动降一档画质：背景分辨率、背景帧率、粒子上限、次要装饰（2 档起不出行进，3 档关热度灯和连击大奖）。
- 成长记录在内存里更新，写 localStorage 放到空闲时（`requestIdleCallback`，最多等 1.5 秒）和页面隐藏时，不在答对那一帧里 `JSON.stringify`。全部技能写满时约 350KB。错题本（最多 40 题，约 120KB）用同一个保存队列。

测量方法和历次数据见 [debugging.md](debugging.md) 和 `NOTES-impl.md` 的"性能优化"一节。
