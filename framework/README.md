# Lyre 轻量参数化建模框架（Manifold 内核）

- `lyre.model.json` — 参数单一来源（尺寸/壁厚/孔位/轮廓贝塞尔链），**合法 JSON，注意小数写 0.6 不是 .6**
- `index.html` — 求值器 + three.js 查看器 + STL 导出；本地 `python -m http.server 8765` → `/framework/index.html`
- 内核：`../lab/node_modules/manifold-3d`（wasm），抽壳 = CrossSection.Offset(-wall) 内缩挤出后相减

## Manifold JS 绑定踩坑（实测）
1. `CrossSection` 直接收 **SimplePolygon[]**：外圈 `[ [x,y],... ]` 元组数组 + 孔数组，NonZero 规则下孔需反向绕行
2. 元素既不是 {x,y} 对象也不是 embind Vector —— 传**元组**；报 "as a Vector2_vec2" 是把它当成了多层包装
3. `Manifold.subtract(other)` 只收**单个** Manifold，多个孔逐个 subtract
4. `makeThickSolid...`（Chili3D/OCCT 系）与 Manifold 的 Offset 抽壳是两码事；本框架用轻量内缩相减
5. 白屏排查：页面加载即执行，任何未捕获异常都会卡在初始 UI——关键路径必须 try/catch 把错误打到页面
