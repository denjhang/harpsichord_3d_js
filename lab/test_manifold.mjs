// Manifold 内核冒烟测试：布尔减 + 抽壳 + 水密检查
import Module from 'manifold-3d';
const wasm = await Module();
wasm.setup();
const { Cube, Cylinder, Manifold, setMinCircularAngle } = wasm;
setMinCircularAngle(6);

// 1) 布尔减：立方体减圆柱（= 琴体开孔的基本操作）
const box = Manifold.cube([30, 60, 20], true);
const hole = Manifold.cylinder(40, 6, 6, true);
const body = box.subtract(hole);
console.log('[布尔减] volume =', body.volume().toFixed(1), 'genus =', body.genus(), 'status =', body.status());

// 2) 抽壳：外盒减内缩盒 → 中空壳体（= 琴体抽壁厚）
const outer = Manifold.cube([30, 60, 20], true);
const inner = Manifold.cube([25.2, 55.2, 15.2], true).translate([0, 0, 2.6]); // 底留 2.6 实底
const shell = outer.subtract(inner);
console.log('[抽壳]   volume =', shell.volume().toFixed(1), 'genus =', shell.genus(), 'status =', shell.status());

// 3) 组合体：壳体 + 圆柱支柱 的并集
const combined = shell.add(Manifold.sphere(6).translate([0, 0, 14]));
console.log('[并集]   volume =', combined.volume().toFixed(1), 'genus =', combined.genus(), 'status =', combined.status());

// 4) 导出 mesh → 验证三角形数
const mesh = combined.getMesh();
console.log('[导出]   tri =', mesh.triVerts.length / 3, 'vert =', mesh.vertProperties.length / 3);
console.log(String(combined.status())==="NoError" ? '✅ 全部水密，内核可用' : '❌ 有问题');
