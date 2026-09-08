/* 里拉竖琴 · Chili3D 程序化建模驱动脚本
 * 用法：Chili3D 页面控制台粘贴执行（返回 Promise），或自动化 evaluate 执行。
 * 参数集中在 LYRE，改完重跑即可。单位：mm。 */
(async () => {
  const { app, Transaction, EditableShapeNode, shapeFactory, XYZ } = window.__chili;
  const { ShapeTypes } = window.Chili3dCore;
  const doc = app.activeView && app.activeView.document;
  if (!doc) throw new Error("请先新建文档 (doc.new)");

  const LYRE = {
    H: 240,        // 琴体总高（原物 325cm × 打印比例 0.7385）
    TH: 20.7,      // 厚度
    WALL: 2.4,     // 抽壳壁厚
    soundHole: { cy: 8.6, r: 2.5 },            // 圆音孔：轮廓 y 坐标(cm) + 半径(cm)
    stringHoles: { cy: 2.5, r: 0.3, n: 7, gap: 1.55 }, // 穿弦孔
    SAMPLE: 24,    // 每段贝塞尔采样数
  };
  const K = LYRE.H / 32.5;                       // cm → mm
  const X = v => v * K;
  const Y = v => (v - 16.25) * K;                // 轮廓 y 居中

  const bez = (p0, p1, p2, p3, t) => {
    const u = 1 - t;
    return [u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0],
            u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1]];
  };
  // 轮廓：与 lyre_simulator.html 同源的三次贝塞尔链（cm）
  const segs = [
    [3.2,.6, 6.4,1.6, 8.2,3.6],    [10.6,6.4, 10.9,10.8, 8.9,14.2],
    [7.6,16.4, 6.3,17.6, 6.1,19.6],[5.9,22.4, 7.3,24.4, 7.8,27.0],
    [8.2,29.6, 7.4,31.2, 5.4,31.9],[3.6,32.5, -3.6,32.5, -5.4,31.9],
    [-7.4,31.2, -8.2,29.6, -7.8,27.0],[-7.3,24.4, -5.9,22.4, -6.1,19.6],
    [-6.3,17.6, -7.6,16.4, -8.9,14.2],[-10.9,10.8, -10.6,6.4, -8.2,3.6],
    [-6.4,1.6, -3.2,.6, 0,.6],
  ];
  const pts = [];
  let cur = [0, .6];
  for (const s of segs) {
    const p0 = cur, p1 = [s[0], s[1]], p2 = [s[2], s[3]], p3 = [s[4], s[5]];
    for (let i = 1; i <= LYRE.SAMPLE; i++) {
      const [x, y] = bez(p0, p1, p2, p3, i / LYRE.SAMPLE);
      pts.push({ x: X(x), y: Y(y), z: 0 });
    }
    cur = p3;
  }

  const wire = shapeFactory.polygon(pts).value;
  const face = shapeFactory.face([wire]).value;
  let solid = shapeFactory.prism(face, new XYZ({ x: 0, y: 0, z: LYRE.TH })).value;

  // 孔：圆音孔 + 7 穿弦孔
  const holes = [shapeFactory.cylinder(new XYZ({ x: 0, y: 0, z: 1 }),
    new XYZ({ x: X(0), y: Y(LYRE.soundHole.cy), z: -LYRE.TH / 2 }),
    LYRE.soundHole.r * K, LYRE.TH * 2).value];
  const st = LYRE.stringHoles, x0 = -(st.n - 1) / 2 * st.gap;
  for (let i = 0; i < st.n; i++)
    holes.push(shapeFactory.cylinder(new XYZ({ x: 0, y: 0, z: 1 }),
      new XYZ({ x: X(x0 + i * st.gap), y: Y(st.cy), z: -LYRE.TH / 2 }),
      st.r * K, LYRE.TH * 2).value);
  solid = shapeFactory.booleanCut([solid], holes).value;

  // 抽壳：选最高面（顶面）向内负壁厚
  let top = null, tz = -1e9;
  for (const f of solid.findSubShapes(ShapeTypes.face)) {
    const bb = f.boundingBox();
    const zm = (bb.max.z + bb.min.z) / 2;
    if (zm > tz) { tz = zm; top = f; }
  }
  let res = shapeFactory.makeThickSolidBySimple(top, -LYRE.WALL);
  let mode = "shell";
  if (!res.isOk) { console.warn("抽壳失败，回退实心:", res.error); res = { value: solid }; mode = "solid"; }

  const node = new EditableShapeNode({ document: doc, name: "LyreBody", shape: res.value });
  Transaction.execute(doc, "create lyre body", () => { doc.modelManager.addNode(node); });
  doc.visual.update();
  return { mode, faces: 0 };
})();
