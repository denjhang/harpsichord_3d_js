/* 里拉竖琴 · Chili3D 程序化建模驱动脚本（无布尔版：孔做在轮廓面内）
 * 用法：Chili3D 页面控制台粘贴执行，或自动化 evaluate。单位 mm。 */
(async () => {
  const { app, Transaction, EditableShapeNode, shapeFactory, XYZ } = window.__chili;
  const { ShapeTypes } = window.Chili3dCore;
  const doc = app.activeView && app.activeView.document;
  if (!doc) throw new Error("请先新建文档 (PubSub: doc.new)");

  const LYRE = {
    H: 240,        // 琴体总高
    TH: 20.7,      // 厚度
    WALL: 2.4,     // 抽壳壁厚
    soundHole: { cy: 8.6, r: 2.5 },
    stringHoles: { cy: 2.5, r: 0.3, n: 7, gap: 1.55 },
    SAMPLE: 24,
  };
  const K = LYRE.H / 32.5;
  const X = v => v * K;
  const Y = v => (v - 16.25) * K;

  const bez = (p0, p1, p2, p3, t) => {
    const u = 1 - t;
    return [u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0],
            u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1]];
  };
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

  const outer = shapeFactory.polygon(pts).value;
  const circles = [];
  const addCircle = (cx, cy, r) =>
    circles.push(shapeFactory.wire([shapeFactory.circle({ x: 0, y: 0, z: 1 },
      { x: X(cx), y: Y(cy), z: 0 }, r).value]).value);
  addCircle(0, LYRE.soundHole.cy, LYRE.soundHole.r * K);
  const st = LYRE.stringHoles, x0 = -(st.n - 1) / 2 * st.gap;
  for (let i = 0; i < st.n; i++) addCircle(x0 + i * st.gap, st.cy, st.r * K);

  const face = shapeFactory.face([outer, ...circles]).value;   // 内圈自动反向成孔
  const solid = shapeFactory.prism(face, new XYZ({ x: 0, y: 0, z: LYRE.TH })).value;

  // 抽壳：找最高面（顶面）
  let top = null, tz = -1e9;
  for (const f of solid.findSubShapes(ShapeTypes.face)) {
    const bb = f.boundingBox();
    const zm = (bb.max.z + bb.min.z) / 2;
    if (zm > tz) { tz = zm; top = f; }
  }
  let res = shapeFactory.makeThickSolidByJoin(solid, [top], -LYRE.WALL, "arc");
  let mode = "join-inward";
  if (!res.isOk) { res = shapeFactory.makeThickSolidByJoin(solid, [top], LYRE.WALL, "arc"); mode = "join-outward"; }
  if (!res.isOk) throw new Error("抽壳失败: " + res.error);

  const node = new EditableShapeNode({ document: doc, name: "LyreBody", shape: res.value });
  Transaction.execute(doc, "create lyre body", () => { doc.modelManager.addNode(node); });
  doc.visual.update();
  const bb = node.boundingBox();
  return { mode,
    bb: { min: { x: +bb.min.x.toFixed(1), y: +bb.min.y.toFixed(1), z: +bb.min.z.toFixed(1) },
          max: { x: +bb.max.x.toFixed(1), y: +bb.max.y.toFixed(1), z: +bb.max.z.toFixed(1) } } };
})();
