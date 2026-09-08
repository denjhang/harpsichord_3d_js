# 结论：GLM5.3Flash 驱动 Chili3D 建模的能力边界（2026-09-08）

> 结论先行：**GLM5.3Flash 当前无法可靠地用 Chili3D 完成里拉琴建模。**
> 原因不在"不会调 API"，而在 Chili3D 预编译 wasm 的布尔/抽壳运算产出不可信，
> 加上无约束草图、无装配，参数化修模型的收益被抵消。

## 已验证能做到的（源码级驱动，全部实测）
1. 部署：npm i + rspack build + 静态服务，http://127.0.0.1:8930 ✅
2. 程序化建文档/加节点：`doc.new` 命令、Transaction + Serializer + EditableShapeNode ✅
3. 简单参数实体：BoxNode、polygon 轮廓 → face → prism 挤出 ✅（TestBox、琴体实心挤出均成功）
4. 文档序列化：`doc.serialize()` 输出完整参数化 JSON，可保存/回读 ✅

## 无法做到的（实测复现，非偶然）
1. **booleanCut 语义错误**：`cut(体, 孔)` 的结果包含刀具残留（等效 fuse），
   交换参数则只剩刀具残留——两种顺序都得不到"体−孔"。体积/包围盒双重验证。
2. **makeThickSolidBySimple**：面对带孔轮廓直接报错；对无孔面产出几何位置错误的薄片。
3. **makeThickSolidByJoin**：返回 "Internal error"。
4. 官方 rstest 测试套件在本机无法运行（构建报错），无法用上游测试对照。

## 根因分析
- 预编译 `chili-wasm.wasm`（10.4MB，emscripten 5.0.7 + OCCT）的布尔/抽壳绑定层
  （EMSCRIPTEN_DECLARE_VAL_TYPE 的 ShapeArray 转换）疑似有缺陷，
  或 wasm 栈/内存配置在长运算下不稳定。重建 wasm 需要完整 emsdk+OCCT 工具链，
  成本高且超出本项目目标。
- 另：Chili3D 无 2D 草图约束（画线全靠拾取），复杂轮廓只能脚本生成——
  这点反而适合 AI，但被上面第 1、2 条抵消。

## 教训（给 AI 的流程教训）
1. 应该**先读完官方测试**（`packages/wasm/test/factory.test.ts` 有 booleanCut/
   makeThickSolid 的标准用法）并先跑通测试套件，再写业务脚本。
   本次顺序颠倒，导致在浏览器里反复试错，浪费大量轮次。
2. 每个几何操作都应立即用包围盒/体积断言验证，而不是最后看渲染。
3. 结果与预期不符时先怀疑平台，再怀疑自己的调用——本次最终证实是平台问题。

## 建议的后续路线（三选一，需人工决策）
A. **回到 Manifold 内核**（`lab/` 已验证布尔/抽壳全部正确）：
   自建轻量参数化 JSON 框架，AI 驱动无障碍，但用户 GUI 参与度低。
B. **升级/重建 Chili3D 的 wasm**：需要 emsdk + OCCT 源码编译（约半天工作量），
   若修好则 Chili3D 路线继续成立。
C. **用户在 Chili3D GUI 手工建模，AI 提供参数表和脚本辅助**（不做关键布尔运算）。
