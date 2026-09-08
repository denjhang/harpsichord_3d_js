/* lyre.build.mjs —— 几何内核：模型 JSON → Manifold 实体 → 渲染网格
 * 输入输出都是纯数据，与页面 UI 完全解耦（Node 里同样可用：见 ../lab/test_manifold.mjs 的用法）
 */
import Module from "manifold-3d";

/* 关键：所有 builder 共享同一个 wasm 实例——
   Module() 每次调用都会新建实例，跨实例的 Manifold 无法互相布尔运算 */
let _wasm=null;
async function W(){
  if(!_wasm){ _wasm=await Module(); _wasm.setup?.(); }
  return _wasm;
}

/** 模型 JSON 校验，返回错误列表（空数组 = 通过） */
export function validateModel(m){
  const errs=[];
  if(!m || typeof m!=="object" || Array.isArray(m)) return ["JSON 根必须是对象"];
  if(m.meta?.units && m.meta.units!=="mm") errs.push(`meta.units 目前只支持 mm（收到 ${m.meta.units}）`);
  const p=m.params;
  if(!p || typeof p!=="object"){ errs.push("缺少 params"); return errs; }
  for(const k of ["height","thickness","wall"]) if(!(p[k]>0)) errs.push(`params.${k} 必须为正数`);
  for(const k of ["soundHole","stringHoles","bridge","window"])
    if(!p[k] || typeof p[k]!=="object") errs.push(`params.${k} 缺失`);
  if(p.stringHoles){
    if(!(p.stringHoles.n>=1)) errs.push("params.stringHoles.n 必须 ≥ 1");
    if(!(p.stringHoles.r>0))  errs.push("params.stringHoles.r 必须为正数");
  }
  if(p.soundHole && !(p.soundHole.r>0)) errs.push("params.soundHole.r 必须为正数");
  if(p.window && !(p.window.rx>0 && p.window.ry>0)) errs.push("params.window.rx/ry 必须为正数");
  const o=m.outline;
  if(!o || !Array.isArray(o.bezierSegs) || o.bezierSegs.length<1)
    errs.push("缺少 outline.bezierSegs（每段 6 个数字：cx1,cy1,cx2,cy2,x,y）");
  else{
    o.bezierSegs.forEach((s,i)=>{
      if(!Array.isArray(s) || s.length!==6 || s.some(v=>typeof v!=="number"))
        errs.push(`outline.bezierSegs[${i}] 必须是 6 个数字`);
    });
    if(o.start && (!Array.isArray(o.start) || o.start.length!==2)) errs.push("outline.start 必须是 [x,y]");
  }
  return errs;
}

/** 调音柱孔位（mm）：与穿弦孔对齐，排在顶部横梁上 */
export function pegPositions(p){
  const g=p.pegs;
  const out=[];
  for(let i=0;i<g.n;i++)
    out.push([(i-(g.n-1)/2)*g.gap, g.y]);
  return out;
}

/** 由模型 JSON 构建琴体，返回 { body(Manifold), mesh, info }
 *  opts.pegHoles=false 时不打调音孔（组件清单可切换） */
export async function buildBody(model, opts={}){
  const wasm = await W();
  const { Manifold, CrossSection, setMinCircularAngle } = wasm;
  setMinCircularAngle(6);
  const p = model.params;
  const K = p.height/32.5;                               // 实物 32.5cm → 目标高度
  const X = v => v*K, Y = v => (v-16.25)*K;              // cm 轮廓 → mm 居中坐标
  const bez=(p0,p1,p2,p3,t)=>{const u=1-t;return [
    u*u*u*p0[0]+3*u*u*t*p1[0]+3*u*t*t*p2[0]+t*t*t*p3[0],
    u*u*u*p0[1]+3*u*u*t*p1[1]+3*u*t*t*p2[1]+t*t*t*p3[1]];};
  const pts=[]; let cur=model.outline.start?[...model.outline.start]:[0,0];
  for(const s of model.outline.bezierSegs){
    const p0=cur,p1=[s[0],s[1]],p2=[s[2],s[3]],p3=[s[4],s[5]];
    for(let i=1;i<=24;i++){const [x,y]=bez(p0,p1,p2,p3,i/24); pts.push([X(x),Y(y)]);}
    cur=p3;
  }
  const win=[];
  for(let i=p.window.SAMPLE;i>=0;i--){                   // 顺时针绕向 → 作为轮廓内孔
    const t=(i/p.window.SAMPLE)*Math.PI*2;
    win.push([p.window.cx+p.window.rx*Math.cos(t), p.window.cy+p.window.ry*Math.sin(t)]);
  }
  const outer=new CrossSection([pts,win],"NonZero");
  let body=outer.extrude(p.thickness);
  if(p.cavity){
    /* 空腔=音孔周围一小圈密闭腔（params.cavity{cx,cy,r}），其余琴体 100% 实心
       （品条下方、穿弦孔区、横梁束弦区都保持实心）。腔壁上下左右均留 wall。 */
    const inner=outer.offset(-p.wall,"Round").extrude(p.thickness-2*p.wall).translate([0,0,p.wall]);
    const region=Manifold.cylinder(p.thickness,p.cavity.r,p.cavity.r)
      .translate([p.cavity.cx||0, p.cavity.cy||0, p.wall]);
    body=body.subtract(inner.intersect(region));
  }
  /* 音孔只开面板（吉他式）：有腔体时仅切顶壁，背板完整；
     无腔体（老模型）保持全厚度贯通 */
  const shCut=p.cavity?p.wall+2:p.thickness+2;           // 顶壁厚+2：下探入腔、上露出面
  const shZ=p.cavity?p.thickness-p.wall-1:-1;
  const holes=[Manifold.cylinder(shCut,p.soundHole.r,p.soundHole.r).translate([0,p.soundHole.cy,shZ])];
  for(let i=0;i<p.stringHoles.n;i++)
    holes.push(Manifold.cylinder(p.thickness+2,p.stringHoles.r,p.stringHoles.r)
      .translate([(i-(p.stringHoles.n-1)/2)*p.stringHoles.gap,p.stringHoles.cy,-1]));
  for(const h of holes) body=body.subtract(h);
  if(opts.pegHoles!==false && p.pegHoles){               // 调音柱穿孔（与柱同轴）
    for(const [px,py] of pegPositions(p))
      body=body.subtract(Manifold.cylinder(p.thickness+2,p.pegHoles.r,p.pegHoles.r)
        .translate([px,py,-1]));
  }
  body=body.add(Manifold.cube([p.bridge.w,p.bridge.d,p.bridge.h],true)
    .translate([0,p.bridge.y,p.thickness+p.bridge.h/2]));
  const NoError="NoError";
  if(String(body.status())!==NoError) throw new Error("Manifold 布尔结果异常: status="+body.status());
  return { body, mesh:body.getMesh(),
    info:`status:${body.status()}  genus:${body.genus()}  tri:${body.numTri()}  体积:${(body.volume()/1000).toFixed(1)}cm³` };
}

/** 琴弦走线（每根弦的折线控制点，mm）：孔内 → 品条后缘 → 品条顶 → 调音柱顶
 *  全程绕开琴体/品条材料，配合 buildStrings 的布尔干涉断言验证 */
export function stringPath(p, x){
  const g=p.strings, br=p.bridge, pg=p.pegs;
  const m=0.2;                                           // 安全间隙：网格逼近下保证真不相交
  return [
    [x, p.stringHoles.cy, p.thickness-2],                                  // 孔内锚点（通孔空腔）
    [x, br.y-br.d/2, br.z+br.h+g.r+m],                                     // 品条后缘上方
    [x, br.y,       br.z+br.h+g.r+m],                                      // 品条顶（留间隙）
    [x, pg.y-(pg.r+g.r+m), p.thickness+pg.h-2],                            // 柱前表面缠绕终点（柱头顶面之下，避开柱头）
  ];
}

/** 琴弦实体（胶囊串联）：用于渲染 + 与琴体/品条的布尔干涉断言 */
export async function buildStrings(model){
  const wasm = await W();
  const { Manifold } = wasm;
  const p=model.params, g=p.strings;
  let strings=null;
  const xs=pegPositions(p);
  for(let i=0;i<p.stringHoles.n;i++){
    const path=stringPath(p, xs[i][0]);
    let s=null;
    for(let k=0;k<path.length-1;k++){
      const cap=Manifold.hull([
        Manifold.sphere(g.r).translate(path[k]),
        Manifold.sphere(g.r).translate(path[k+1])]);
      s=s?s.add(cap):cap;
    }
    strings=strings?strings.add(s):s;
  }
  if(String(strings.status())!=="NoError") throw new Error("琴弦布尔异常: status="+strings.status());
  return { body:strings, mesh:strings.getMesh(),
    info:`琴弦×${p.stringHoles.n}（实体胶囊）` };
}

/** 调音柱（可打印实体）：柱体+加粗柱头，立在琴体顶面。返回 { body, mesh, info } */
export async function buildPegs(model){
  const wasm = await W();
  const { Manifold } = wasm;
  const p=model.params, g=p.pegs;
  let pegs=null;
  for(const [px,py] of pegPositions(p)){
    const m=Manifold.cylinder(g.h,g.r,g.r).translate([px,py,p.thickness])
      .add(Manifold.cylinder(g.headH,g.headR,g.headR).translate([px,py,p.thickness+g.h]));
    pegs=pegs?pegs.add(m):m;
  }
  if(String(pegs.status())!=="NoError") throw new Error("调音柱布尔异常: status="+pegs.status());
  return { body:pegs, mesh:pegs.getMesh(),
    info:`调音柱×${g.n}  tri:${pegs.numTri()}  体积:${(pegs.volume()/1000).toFixed(1)}cm³` };
}
/** 模拟切片填充：在高度 h 处用 ±45° 正交网格（随层高交替，仿切片器）
 *  填充 target 实体的截面。target=各实体的并集（调用方缓存，避免每次重算）。
 *  柱条网格按方向缓存——拖动切片滑块时只做一次交集，不重复并集。 */
const _gridCache={};
function infillGrid(h, th, spacing){
  const a=(Math.round(h/2)%2? 45:-45)*Math.PI/180;
  const key=a*180/Math.PI+"_"+spacing;
  if(_gridCache[key]) return _gridCache[key];
  const { Manifold } = { Manifold: _wasm.Manifold };
  const ca=Math.cos(a), sa=Math.sin(a);
  let grid=null;
  for(let d=-230; d<=230; d+=spacing){
    const bar=Manifold.cube([460,1.1,th],true).rotate(0,0,a*180/Math.PI)
      .translate([-sa*d, ca*d, 0]);
    grid=grid?grid.add(bar):bar;
  }
  _gridCache[key]=grid;
  return grid;
}
export async function buildInfill(target, h, spacing=4){
  const wasm=await W();
  const th=0.6;
  const grid=infillGrid(h, th, spacing).translate([0,0,h+th/2]);   // 缓存的网格平移到层高
  const infill=grid.intersect(target);
  if(String(infill.status())!=="NoError") throw new Error("填充线布尔异常");
  const a=(Math.round(h/2)%2? 45:-45);
  return { mesh:infill.getMesh(), info:`填充 ${a>0?"+45°":"-45°"} spacing:${spacing}mm` };
}
