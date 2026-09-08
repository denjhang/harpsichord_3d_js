/* lyre.build.mjs —— 几何内核：模型 JSON → Manifold 实体 → 渲染网格
 * 输入输出都是纯数据，与页面 UI 完全解耦（Node 里同样可用：见 ../lab/test_manifold.mjs 的用法）
 */
import Module from "manifold-3d";

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

/** 由模型 JSON 构建实体，返回 { body(Manifold), mesh, info } */
export async function buildBody(model){
  const wasm = await Module(); wasm.setup?.();
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
  const inner=outer.offset(-p.wall,"Round").extrude(p.thickness-2*p.wall).translate([0,0,p.wall]);
  body=body.subtract(inner);
  const holes=[Manifold.cylinder(p.thickness+2,p.soundHole.r,p.soundHole.r).translate([0,p.soundHole.cy,-1])];
  for(let i=0;i<p.stringHoles.n;i++)
    holes.push(Manifold.cylinder(p.thickness+2,p.stringHoles.r,p.stringHoles.r)
      .translate([(i-(p.stringHoles.n-1)/2)*p.stringHoles.gap,p.stringHoles.cy,-1]));
  for(const h of holes) body=body.subtract(h);
  body=body.add(Manifold.cube([p.bridge.w,p.bridge.d,p.bridge.h],true)
    .translate([0,p.bridge.y,p.thickness+p.bridge.h/2]));
  if(String(body.status())!=="NoError") throw new Error("Manifold 布尔结果异常: status="+body.status());
  return { body, mesh:body.getMesh(),
    info:`status:${body.status()}  genus:${body.genus()}  tri:${body.numTri()}  体积:${(body.volume()/1000).toFixed(1)}cm³` };
}
