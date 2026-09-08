# Manifold 几何内核验证（M2 前置预研）

## 结论
`manifold-3d`(wasm, npmmirror 安装) 在本项目环境 **Node 与浏览器均可用**：
- 布尔减/并、抽壳（外盒减内缩盒）、水密检查(`status()===NoError`)全部通过
- 输出 mesh 可直接转 three.js BufferGeometry 渲染，STLExporter 可导出
- 浏览器 demo：`manifold_demo.html`（240×160×20 壳体，壁厚 2.4mm，音孔+7 穿弦孔+品条，
  genus=7、760 三角形、212cm³ 打印料）

## 踩坑
1. `Manifold.cylinder(h, rLow, rHigh)` 的 z 从 **0** 到 h（不居中）！贯穿必须 `translate([0,0,-h/2])`
2. cylinder 第 4 参是 `circularSegments`，传 `true` 会变成 1 段退化圆柱
3. `status()` 返回枚举字符串（"NoError"），不要用 `=== 0`
4. union 两个实心体 genus 可能是 -1（内部空腔合并），以 status() 为准
5. importmap 相对路径以**页面 URL** 为基准（`./node_modules/...`），python http.server 下注意目录层级
6. 浏览器对 http.server 的缓存较强，改动后用 `?v=N` 强刷验证

## 用法
- Node 冒烟测试：`node test_manifold.mjs`
- 浏览器 demo：项目根 `python -m http.server 8765` → /lab/manifold_demo.html

## 对 JSON 框架的意义
M2 的几何内核就选 Manifold：抽壳/布尔/水密保证开箱即用，JSON 里的每个 part
按 "草图 → Manifold 操作树" 求值即可；导出建议 3MF/STL（Manifold 官方建议 3MF，拓扑无损）。
