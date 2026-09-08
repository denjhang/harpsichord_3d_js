# Chili3D 部署与程序化驱动手册

> 部署日期：2026-09-08 ｜ 版本 0.7.0 ｜ 地址 http://127.0.0.1:8930/

## 部署
```
cd E:\working\vscode-projects\Freecad\chili3d
npm i --registry=https://registry.npmmirror.com
npm run build          # OCCT wasm 已预编译提交在 packages/wasm/lib/，无需 emsdk
cd dist && python -m http.server 8930
```
本仓库相对上游唯一改动：`packages/web/src/index.ts` 暴露驱动接口：
```js
window.__chili = { app, PubSub, Transaction, CommandStore, Serializer }
```

## 程序化建模（AI 与用户控制台共用，不模拟点击）
```js
const { app, Transaction, Serializer } = window.__chili;
const doc = app.activeView.document;
const CLS = "__cla" + String.fromCharCode(36,36) + "__";   // "__cla$$__"
const xyz = (x,y,z) => ({ [CLS]: "XYZ", x, y, z });
Transaction.execute(doc, "add box", () => {
  const node = Serializer.deserializeObject(doc, {
    [CLS]: "BoxNode", name: "TestBox",
    plane: { [CLS]: "Plane", origin: xyz(0,0,0), normal: xyz(0,0,1), xvec: xyz(1,0,0) },
    dx: 60, dy: 40, dz: 20,
  });
  doc.modelManager.addNode(node);
});
doc.visual.update();
```
已实测：BoxNode 出现在项目树并生成实体；`doc.serialize()` 直接得到完整 JSON 文档
（`{"__cla$$__":"Document", nodes:[...]}`）——**参数化 JSON 框架 Chili3D 原生具备**。

## 源码地图（packages/）
- `core/src/command/` — ICommand / CommandStore（@command({key}) 注册）
- `app/src/services/commandService.ts` — PubSub.sub("executeCommand") → new ctor().execute(app)
- `app/src/bodys/*.ts` — 参数化节点：BoxNode/CylinderNode/ExtrudeNode…（@serialize 属性 + generateShape()→OCCT）
- `app/src/commands/create/createCommand.ts` — 交互式建范式的模板：Transaction.execute 内 addNode + visual.update()
- `core/src/serialize/serializer.ts` — `__cla$$__` 类型标签反序列化注册表
- `core/src/foundation/` — Transaction（撤销/重做事务）、PubSub

## 踩坑
1. 应用在 `window.onbeforeunload` 拦截导航 → 自动化导航前先 `window.onbeforeunload=null`
2. http.server 缓存强，改 bundle 后用 `?v=N` 强刷
3. 构建时必须先停掉占用 dist 的本地服务器（Windows EBUSY）
4. 交互式命令（CreateCommand）需要拾取点，不适合自动化；自动化走"直接构造 Node + Transaction"
