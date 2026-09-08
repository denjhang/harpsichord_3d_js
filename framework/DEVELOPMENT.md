# Lyre 轻量参数化建模框架 · 开发文档

> 定位：**最适合 AI 驱动的 3D 建模框架**——参数即 JSON，几何即代码，结果即 STL。
> 已验证：本框架导出的 `lyre_body.stl` 可直接导入 Bambu Studio 切片（2026-09-08）。
> 内核：Manifold（wasm）｜渲染：three.js｜依赖全部本地化于 `../lab/node_modules/`

---

## 1. 架构总览

```
lyre.model.json          参数单一来源（尺寸/孔位/轮廓/抽壳/品条）
      │  fetch
      ▼
index.html（UI 层）       params + outline.bezierSegs
      │  src/lyre.build.mjs（内核层）
      │   ① 贝塞尔链采样为点阵（每段 24 点，mm）
      │   ② CrossSection([外圈, 弦窗圈], "NonZero")   ← 内圈反向绕行自动成孔
      │   ③ extrude(thickness)                        ← 实体
      │   ④ offset(-wall).extrude(TH-2*wall) 相减     ← 轻量抽壳（上下+四周壁）
      │   ⑤ cylinder×8 subtract                       ← 圆音孔 + 7 穿弦孔
      │   ⑥ cube.add                                  ← 品条
      ▼
Manifold 实体（强制水密）  ──getMesh()──▶  three.js BufferGeometry
      │                                    ├─ 浏览器实时渲染（H5 UI 组件全套）
      └── STLExporter ──▶ POST /save ──▶ framework/out/lyre_body.stl（无弹窗静默保存）
```

设计原则：
- **JSON 只存参数与建模意图，不存网格**——改参数重算，几何永远一致
- **不使用交互式布尔/拾取**——AI 全程可驱动；用户通过"改 JSON + 点重建"参与
- **每次几何操作都可断言验证**（volume/genus/status），渲染截图仅作最终确认

## 2. 文件清单

| 文件 | 作用 |
|---|---|
| `lyre.model.json` | 参数单一来源。页面内改（JSON 面板）或直接改文件后点"重建" |
| `index.html` | 查看器 + 热床/导航立方体 UI + **模型 JSON 面板**（编辑/校验/导入/导出/回写） |
| `src/lyre.build.mjs` | **几何内核**：`validateModel` / `buildBody(model,{pegHoles})` / `buildPegs` / `pegPositions`，与 UI 解耦，Node 可复用 |
| `server.py` | `python framework/server.py 8765`：静态服务 + `POST /save?name=` 存 out/ + `POST /savemodel` 回写模型文件 |
| `out/` | STL / JSON 副本输出目录（gitignore） |
| `../lab/node_modules/` | manifold-3d + three 本地依赖（npmmirror 安装） |

## 2.5 模型 JSON 导入 / 导出（页面内闭环）

页面左下角"模型 JSON"面板（点标题可折叠），按钮全部**静默无弹窗**：

| 按钮 | 行为 |
|---|---|
| 应用重建 | 文本区 JSON → `validateModel()` 校验 → `buildBody()` 重建；错误红字上屏，不打断页面 |
| 导入文件… | 本地 .json 文件 → 载入文本区并自动重建 |
| 保存到模型文件 | 文本区内容 → `POST /savemodel` 回写 `framework/lyre.model.json`（下次启动生效） |
| 导出副本 | 带时间戳副本 → `framework/out/lyre_*.model.json` |

- 文本区改动未应用时标题旁显示"（未应用修改）"
- **模型 JSON 支持注释（JSONC）**：`//` 行尾/整行注释都会被 `parseModel()` 剥离后解析，
  "保存到模型文件"连注释一起回写——用户可直接读注释调参
- **组件悬停联动**：侧边栏组件行 hover → 3D 对应网格 emissive 高亮（橙）+ JSON 文本框
  自动选中并滚动到对应参数段（PART2KEY 映射：body→outline、pegs→pegs、strings→strings、
  pegHoles→pegHoles）
- 校验覆盖：必填字段、正数约束、bezierSegs 每段 6 数字、units 只支持 mm

### 组件系统（左侧"组件"清单，勾选/取消即生效）

| 组件 | 性质 | 取消勾选的行为 | 进 STL？ |
|---|---|---|---|
| 琴体 | Manifold 实体 | 重建（不渲染琴体） | ✅ 可见即导出 |
| 调音柱孔洞 | 琴体上的布尔穿孔 | **重建几何**（genus 31→17） | ✅（随琴体） |
| 调音柱体 | Manifold 实体（柱身+柱头，×7） | 仅隐藏 | ✅ 可见即导出 |
| 琴弦 | **实体胶囊**（Manifold，仅显示） | 仅隐藏 | ❌ 永不导出 |

**琴弦走线与布尔干涉断言**（`stringPath()` + `buildStrings()`）：
- 走线：出弦孔内锚点 → 品条后缘上方 → 品条顶（留 0.8mm 间隙）→ 柱前表面缠绕（柱头顶面之下）
- ⚠️ 音孔只开面板：有 cavity 时音孔圆柱=顶壁厚+2（`thickness-wall-1` 起，下探入腔、上露出面），
  背板完整封闭（吉他式腔体）；无 cavity 的老模型保持全厚度贯通。
  踩坑：高度只给 wall 会差 2mm 切不透面板（洞"消失"）；验证用 Raycaster 从音孔正上方打射线，
  首中应为腔底 z=wall 而非面板 z=thickness
- 每段 = 两球凸包（`Manifold.hull`）成胶囊；弦是实体，可被布尔检查
- **每次重建都做 `strings.intersect(琴体/调音柱).volume()` 断言，>0.5mm³ 直接报错上屏**
- 穿弦孔 cy 已从 -101.5 移到 **-106**：原位置在品条 footprint 下面，弦出来会撞品条（几何设计冲突）

- 导出 STL = **当前可见的可打印组件合并**（琴体+调音柱），隐藏件自动排除
- 新增参数：`params.pegs{n,gap,r,headR,h,headH,y}`、`params.pegHoles.r`、`params.strings.r`、`params.cavity.top`

### 底部滑块条（视图三件套）
| 滑块 | 实现 |
|---|---|
| 热床透明 | bedMats 逐材质 opacity（0=全透明看穿床底） |
| 装配 | t=1 装配到位 / t=0 解体：调音柱 +90mm、琴弦 +170mm 悬浮（BOM 装配动画，纯 position 不影响布尔） |
| 模拟切片 | `renderer.localClippingEnabled` + 剖切平面保留 z≤h；只剖模型不剖热床；停手 180ms 后在层高处重建 **±45° 正交填充线**（随层高交替方向，仿切片器；`buildInfill(并集,h)`=柱条网格 ∩ 实体并集，橙色显示）——实心区有网格、空腔区透明，一眼分清。滑块旁 −/＋ 按钮按 0.5mm 微调。性能：柱条网格按方向缓存、实体并集每次重建只算一次，拖动时不重算 |

### 自动布尔检查（每次重建必跑）
- 所有可见实体（琴体/调音柱/琴弦）**两两 `intersect().volume()`**，>0.5mm³ 即抛错上屏
- 检查结果显示在 HUD（如 `琴体×琴弦 0.04`），用于抓穿模/干涉类几何错误
- 调音柱孔位与穿弦孔同 x 对齐（`pegPositions()` 共用 gap/n），体现"单一数据源"约束
- 内核与页面解耦后，同一份 JSON 也能在 Node 里跑（`import {buildBody} from "./src/lyre.build.mjs"`）

### AI 直操接口（window.__model，自动化不碰 UI，与按钮共用同一逻辑）

```js
await __model.get()                    // → 当前生效的模型 JSON 文本
await __model.set(text|object)         // 校验+生效+重建 → {ok, info|errors}
__model.json                           // 对象形式的 getter/setter（setter 即 set）
__model.validate(text?)                // → 错误数组（空=通过）
await __model.load("lyre.model.json")  // 从 framework/ 目录载入并重建
await __model.save()                   // 回写 framework/lyre.model.json → {ok, saved}
await __model.exportCopy(name?)        // 副本到 out/（默认带时间戳）→ {ok, saved}
await __exportSTL()                    // 导出 STL 到 out/lyre_body.stl（已有）
```
约定：**所有接口返回 `{ok, ...}` 对象而非抛异常**，自动化脚本靠返回值判断；
非法模型一律被 validate 拦截，绝不让页面进入坏状态。

## 3. 参数模型（lyre.model.json）

```jsonc
{
  "meta":  { "name": "lyre", "units": "mm", "version": 1 },
  "params": {
    "height": 240,          // 琴体总高（打印比例 1:1.35，适配 250 热床）
    "thickness": 20.7,      // 厚度
    "wall": 3.2,            // 腔体壁厚（≥3mm 保证打印强度）
    "soundHole":  { "y": 8.6, "r": 18.5, "cy": -56.5 },        // mm（已换算）
    "stringHoles":{ "cy": -106, "r": 2.2, "n": 7, "gap": 11.4 },
    "cavity":     { "cx": 0, "cy": -56.5, "r": 48 },   // 空腔=音孔周围一圈密闭腔，其余 100% 实心
    "bridge":     { "w": 81, "d": 7.4, "h": 6, "y": -98, "z": 20.7 },
    "window":     { "cx": 0, "cy": 46.9, "rx": 34.0, "ry": 47.3, "SAMPLE": 48 }
  },
  "outline": { "bezierSegs": [[c1x,c1y,c2x,c2y,ex,ey], ...] }  // cm 坐标，与 H5 同源
}
```
- 轮廓 cm → mm 换算在求值器内：`X = v*K`、`Y = (v-16.25)*K`，`K = height/32.5`
- 新增参数：JSON 加字段 → 求值器取用 → 重建即生效

## 4. Manifold JS 绑定速查（全部实测踩坑）

| API | 说明 / 坑 |
|---|---|
| `new CrossSection(contours, fillRule)` | contours = **SimplePolygon[]**；每个 SimplePolygon 是 **`[x,y]` 元组数组**（不是 {x,y} 对象、不是 embind Vector） |
| 孔的绕行 | 内圈**顺时针**（与外圈相反），`"NonZero"` 规则下自动成孔 |
| `cs.offset(-wall, "Round")` | Clipper2 内缩，返回新 CrossSection |
| `cs.extrude(h)` | 沿 +Z 挤出，z 从 0 起 |
| `Manifold.cylinder(h, rLow, rHigh)` | z 从 0 到 h，**不居中**；要贯穿自行 translate |
| `a.subtract(b)` / `a.add(b)` / `a.intersect(b)` | **b 只能是单个 Manifold**，多个要逐个循环 |
| `Manifold.hull([a,b])` | 两球凸包=定向胶囊（弦/缆索建模利器）；**所有 Manifold 必须同一 wasm 实例** |
| `Module()` 多实例坑 | 每次调用 `Module()` 都新建 wasm 实例，**跨实例对象布尔会抛 BindingError**——内核里必须缓存单例（见 lyre.build.mjs 的 `W()`） |
| `m.volume()` / `m.numTri()` / `m.genus()` / `m.status()` | 断言用；status() 是字符串枚举 `"NoError"` |
| `m.getMesh()` | `{vertProperties: Float32Array, triVerts: Uint32Array}` → three BufferGeometry |
| `setMinCircularAngle(6)` | 圆/圆柱细分精度，setup 后设置 |

## 5. 查看器与 UI（H5 组件移植）

- **热床托盘**：canvas 程序贴图（1cm 网格、标牌条、RGB 轴、绿色 01），BoxGeometry 250×250×3
  ⚠️ z-up 场景顶面材质索引是 **4**（+Z）；y-up 才是 2
- **导航立方体**：真 3D 投影六面体，面/棱/角可点击切视角；环绕三角箭头 ±45°；
  弯箭头滚转 ±30°（camera.up 支持 roll）；右下小立方=切换轴十字
  ⚠️ 投影竖直分量取 `r[1]`（深度是 r[2]，抄错会只画一半）
- **光影**：DirectionalLight castShadow（2048 shadowmap，覆盖 ±260）+ PCFSoft；全部模型网格
  castShadow/receiveShadow → 腔体内壁无直射自然变暗；AmbientLight 压到 0.28（高环境光会把
  腔内"提亮"导致假真）+ Hemisphere 0.3；热床 receiveShadow
- **相机**：`target`（H5 要点：热床面与物体中心的中点 = BODY_TOP/4）、
  `fitView()` 半径 = max(床半宽, 物体全高) × 1.18、窗口 resize 自动适配
- **导出**：`STLExporter.parse(mesh)` → `fetch("/save?name=…", {method:"POST", body})`
  静默写盘，**绝不触发浏览器下载弹窗**；失败仅在 HUD 报错

## 6. AI 操作手册（标准工作流）

1. **改参数**：编辑 `framework/lyre.model.json`（或驱动脚本里的 LYRE 对象）
2. **验证**：浏览器刷新（或点"重建"），HUD 读 status/genus/体积；`❌` 信息会直接显示在页面
3. **导出**：POST /save → `framework/out/lyre_body.stl` → 拖进 Bambu Studio 终验
4. **断言优先**：每次几何改动先查 `volume()/genus()/status()`，再看渲染截图

给 AI 的三条铁律（本项目血泪史）：
- 先读官方测试/文档确认 API 形态，再写调用代码
- 关键路径 try/catch 把错误打到页面上（白屏=异常被吞）
- 结果不符预期时，先用包围盒/体积断言定位是哪一步坏了

## 7. 为什么"没有约束"也能出 STL？——两种参数化哲学的对比

第一次接触本框架的人几乎都会问：FreeCAD/SolidWorks/UG 都要画草图、加约束、
全约束才能出图，这里一个约束都没有，怎么直接就出 STL 了？

**1. STL 根本不需要约束——它只需要水密三角形。**
STL 是"三角面片 soup"格式：一堆顶点+面片，连单位、材质、曲率都没有。
切片软件（Bambu/PrusaSlicer/Cura）唯一关心的是：网格封闭、自洽、定向正确。
Manifold 内核的每次布尔输出都在数学上保证水密（NoError 断言），
所以"能出 STL"和"有没有约束"在格式层面就是两个不相干的问题。

**2. 约束的真正作用不是"生成几何"，而是"让人可以交互式地改几何"。**
传统 CAD 的约束求解器解决的问题是：用户随手画了一条歪线，系统怎么知道
"用户想要的是水平线、且与那个圆相切、且长度恰好 42mm"？约束是**人类模糊
意图与精确几何之间的翻译层**。而本框架里没有"随手画"这个环节——每个数字
都直接来自 JSON 参数，不存在歧义，自然不需要翻译。

**3. 本框架不是"没有约束"，而是约束换了一种存在形式。**
- 传统 CAD：约束是**声明式**的（"这两条线平行"，求解器自己找解）；
- 本框架：约束是**过程式**的（写死在 buildBody 的计算顺序里）。
  例如：穿弦孔间距由 `stringHoles.gap` 统一推导（改一个数字 7 个孔联动）；
  壁厚由 `offset(-wall)` 与 `thickness-2*wall` 共享同一参数；
  轮廓缩放系数 K 与一切 mm 尺寸同源。这就是 H5 踩坑记录里说的
  "孔与弦共享同一坐标源——改一处全局联动"，本质就是约束，
  只不过由代码拓扑而不是求解器维护。

**4. 各取所长的代价表。**

| | 传统 CAD（OCCT/Parasolid 内核） | 本框架（Manifold 网格内核） |
|---|---|---|
| 几何精度 | B-Rep 解析曲面（真圆、真平面） | 网格逼近（圆=多边形，精度由 setMinCircularAngle 控制） |
| 改草图拖一根线 | 实时求解几十个约束方程 | 不支持——改 JSON 重算（毫秒级，等效体验） |
| 欠约束/过约束提示 | 有（自由度分析） | 无——"约束冲突"表现为几何干涉，靠体积/genus 断言兜底 |
| 下游用途 | STEP→CAM/CAE/装配 | 仅 STL→3D 打印 |
| 实现复杂度 | 数十人年（求解器+B-Rep+容差） | 一天（本文档这套） |

**5. 什么时候必须回头用 FreeCAD/SW/UG？**
- 需要 STEP/IGES 给 CNC、注塑模、有限元；
- 需要在屏幕上亲手拖草图、加圆角、实时看到约束反馈（"人手"驱动的建模）；
- 装配体需要配合关系（同轴、贴合）自动传播。
本项目当前目标是"AI 出可打印 STL"，这三条都不沾边——这正是路线成立的根基。

**6. 给 AI 驱动建模的启示（可迁移的经验）。**
- **约束的本质是"单一数据源+推导顺序"**，不是求解器 GUI。JSON 单源 + 内核
  纯函数，AI 改参数永远不会出现"求解器跳到另一个解"的诡异跳变；
- **水密性靠内核构造保证，不靠事后检查**：选 Manifold 这类 always-watertight
  内核，等于把 SW 里"检查实体是否有效"这步整个消灭了；
- **断言代替约束求解器**：`status()/genus()/volume()` 三个数字就能确定几何
  没坏，比自由度分析便宜几个数量级，且完全可自动化。

## 8. 已知限制与后续方向
- STL 无单位/材质信息（Manifold 官方建议 3MF，拓扑无损）——后续可加 3MF 导出
- 抽壳是"轮廓内缩相减"轻量方案，凹腔深处的壁厚均匀性依赖轮廓曲率（当前琴体 OK）
- 品条/音柱等附件目前是简单几何；可逐步参数化细化
- 未做：参数滑杆 GUI（当前面板改 JSON 文本）、多零件 parts[] 拆件、3MF 导出
- 注意：白屏=模块级语法/加载错误，页面头部已有 window error 钩子上屏（LOAD ❌ 行）
- 成为"完整框架"尚缺的必备能力（按优先级）：
  1. 多零件装配（model.parts[]：每个零件独立 JSON + 定位变换 + 零件间布尔/配合）
  2. 更多几何算子：revolve / loft / 圆角（Manifold 有 revolve；圆角需偏移方案）
  3. 撤销/重做（JSON 文本历史栈即可，成本低）
  4. 3MF/OBJ 导出（OBJ 近乎免费；3MF 需按 OPC 打包）
  5. 参数滑杆面板（读 params 生成控件 + 联动重建）
  6. meta.version 迁移机制（改 schema 时不破坏旧模型文件）
