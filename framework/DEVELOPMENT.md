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
index.html 求值器        params + outline.bezierSegs
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
| `lyre.model.json` | 参数单一来源。**改这里 + 点"重建"** |
| `index.html` | 求值器 + three.js 查看器 + 热床/导航立方体 UI + STL 静默导出 |
| `server.py` | `python framework/server.py 8765`：静态服务 + `POST /save?name=` 存盘 |
| `out/` | STL 输出目录（gitignore） |
| `../lab/node_modules/` | manifold-3d + three 本地依赖（npmmirror 安装） |

## 3. 参数模型（lyre.model.json）

```jsonc
{
  "meta":  { "name": "lyre", "units": "mm", "version": 1 },
  "params": {
    "height": 240,          // 琴体总高（打印比例 1:1.35，适配 250 热床）
    "thickness": 20.7,      // 厚度
    "wall": 2.4,            // 抽壳壁厚
    "soundHole":  { "y": 8.6, "r": 18.5, "cy": -56.5 },        // mm（已换算）
    "stringHoles":{ "cy": -101.5, "r": 2.2, "n": 7, "gap": 11.4 },
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
| `a.subtract(b)` / `a.add(b)` | **b 只能是单个 Manifold**，多个要逐个循环 |
| `m.volume()` / `m.numTri()` / `m.genus()` / `m.status()` | 断言用；status() 是字符串枚举 `"NoError"` |
| `m.getMesh()` | `{vertProperties: Float32Array, triVerts: Uint32Array}` → three BufferGeometry |
| `setMinCircularAngle(6)` | 圆/圆柱细分精度，setup 后设置 |

## 5. 查看器与 UI（H5 组件移植）

- **热床托盘**：canvas 程序贴图（1cm 网格、标牌条、RGB 轴、绿色 01），BoxGeometry 250×250×3
  ⚠️ z-up 场景顶面材质索引是 **4**（+Z）；y-up 才是 2
- **导航立方体**：真 3D 投影六面体，面/棱/角可点击切视角；环绕三角箭头 ±45°；
  弯箭头滚转 ±30°（camera.up 支持 roll）；右下小立方=切换轴十字
  ⚠️ 投影竖直分量取 `r[1]`（深度是 r[2]，抄错会只画一半）
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

## 7. 已知限制与后续方向
- STL 无单位/材质信息（Manifold 官方建议 3MF，拓扑无损）——后续可加 3MF 导出
- 抽壳是"轮廓内缩相减"轻量方案，凹腔深处的壁厚均匀性依赖轮廓曲率（当前琴体 OK）
- 品条/音柱等附件目前是简单几何；可逐步参数化细化
- 未做：参数 GUI 面板（当前改 JSON）、多零件装配拆件
