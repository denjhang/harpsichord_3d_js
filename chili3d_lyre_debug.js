(() => {
  const { app, Transaction, EditableShapeNode, shapeFactory, XYZ } = window.__chili;
  const doc = app.activeView && app.activeView.document;
  const LYRE = { H: 240, TH: 20.7, WALL: 2.4, soundHole: { cy: 8.6, r: 2.5 }, stringHoles: { cy: 2.5, r: 0.3, n: 7, gap: 1.55 }, SAMPLE: 24 };
  const K = LYRE.H / 32.5;
  const X = v => v * K, Y = v => (v - 16.25) * K;
  const bez = (p0,p1,p2,p3,t) => { const u=1-t; return [
    u*u*u*p0[0]+3*u*u*t*p1[0]+3*u*t*t*p2[0]+t*t*t*p3[0],
    u*u*u*p0[1]+3*u*u*t*p1[1]+3*u*t*t*p2[1]+t*t*t*p3[1]]; };
  const segs = [
    [3.2,.6,6.4,1.6,8.2,3.6],[10.6,6.4,10.9,10.8,8.9,14.2],
    [7.6,16.4,6.3,17.6,6.1,19.6],[5.9,22.4,7.3,24.4,7.8,27.0],
    [8.2,29.6,7.4,31.2,5.4,31.9],[3.6,32.5,-3.6,32.5,-5.4,31.9],
    [-7.4,31.2,-8.2,29.6,-7.8,27.0],[-7.3,24.4,-5.9,22.4,-6.1,19.6],
    [-6.3,17.6,-7.6,16.4,-8.9,14.2],[-10.9,10.8,-10.6,6.4,-8.2,3.6],
    [-6.4,1.6,-3.2,.6,0,.6]];
  const pts = []; let cur = [0,.6];
  for (const s of segs) {
    const p0=cur, p1=[s[0],s[1]], p2=[s[2],s[3]], p3=[s[4],s[5]];
    for (let i=1;i<=LYRE.SAMPLE;i++){ const [x,y]=bez(p0,p1,p2,p3,i/LYRE.SAMPLE); pts.push({x:X(x),y:Y(y),z:0}); }
    cur = p3;
  }
  const log = [];
  const add = (name, shape) => { const n = new EditableShapeNode({document:doc,name,shape});
    Transaction.execute(doc,"dbg "+name,()=>{doc.modelManager.addNode(n);}); return n; };

  const wireRes = shapeFactory.polygon(pts);
  const wire = wireRes.value;
  log.push(["wire", wire.isClosed && wire.isClosed(), wire.boundingBox ? JSON.stringify((w=>{const b=w.boundingBox();return[b.min,b.max]})(wire)) : "no bb"]);
  const face = shapeFactory.face([wire]).value;
  log.push(["face", face.boundingBox().max.x, face.boundingBox().max.y]);
  const solid = shapeFactory.prism(face, new XYZ({x:0,y:0,z:LYRE.TH})).value;
  const sbb = solid.boundingBox();
  log.push(["solid", sbb.min.x.toFixed(0), sbb.max.x.toFixed(0), sbb.min.z.toFixed(1), sbb.max.z.toFixed(1)]);

  const holes = [shapeFactory.cylinder(new XYZ({x:0,y:0,z:1}), new XYZ({x:X(0),y:Y(LYRE.soundHole.cy),z:-LYRE.TH/2}), LYRE.soundHole.r*K, LYRE.TH*2).value];
  const st = LYRE.stringHoles, x0 = -(st.n-1)/2*st.gap;
  for (let i=0;i<st.n;i++) holes.push(shapeFactory.cylinder(new XYZ({x:0,y:0,z:1}),
    new XYZ({x:X(x0+i*st.gap),y:Y(st.cy),z:-LYRE.TH/2}), st.r*K, LYRE.TH*2).value);
  const hbb = holes[0].boundingBox();
  log.push(["hole0", hbb.min.x.toFixed(1), hbb.max.x.toFixed(1), hbb.min.y.toFixed(1), hbb.max.y.toFixed(1), hbb.min.z.toFixed(1), hbb.max.z.toFixed(1)]);

  const cutRes = shapeFactory.booleanCut([solid], holes);
  log.push(["cut", cutRes.isOk]);
  const cut = cutRes.value;
  const cbb = cut.boundingBox();
  log.push(["cut-bb", cbb.min.x.toFixed(1), cbb.max.x.toFixed(1), cbb.min.y.toFixed(1), cbb.max.y.toFixed(1), cbb.min.z.toFixed(1), cbb.max.z.toFixed(1)]);

  window.__lyreDbg = { log, wire, face, solid, cut, holes,
    addAll: () => { add("dbg-wire",wire); add("dbg-face",face); add("dbg-solid",solid);
      holes.forEach((h,i)=>add("dbg-hole"+i,h)); add("dbg-cut",cut); return "added"; } };
  return log;
})()
