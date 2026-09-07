# 项目环境与接入文档

> 工作区：`E:\working\vscode-projects\Freecad`
> 更新日期：2026-09-08
> 用途：记录 GitHub 加速方案、FreeCAD 接入方式（MCP vs XML-RPC）的结论与用法。

---

## 1. GitHub 加速镜像（国内必用）

本机直连 GitHub release 资产只有几十 KB/s，所有下载（uv 的 Python、pip 包等）必须走加速。

| 镜像 | 地址 | 备注 |
|---|---|---|
| gh-proxy.com | `https://gh-proxy.com/` | 前缀拼接式：`https://gh-proxy.com/https://github.com/...` |
| ghproxy.net | `https://ghproxy.net/` | 同上，已验证可用 |

### 用法

**uv 下载 Python**（环境变量）：
```bash
export UV_PYTHON_INSTALL_MIRROR=https://ghproxy.net/https://github.com/astral-sh/python-build-standalone/releases/download
uv python install 3.12
```

**任意 GitHub 直链手动下载**：
```
https://ghproxy.net/https://github.com/<owner>/<repo>/releases/download/...
```

**pip / uv 的 Python 包装依赖**：用清华 PyPI 镜像（比 GitHub 加速还快）：
```bash
uv sync --default-index https://pypi.tuna.tsinghua.edu.cn/simple
```

### 已完成状态（2026-09-08）
- ✅ Python 3.12 已装好（uv 管理）
- ✅ `D:\working\zcode\freecad-mcp-main` 依赖已 `uv sync` 完成
- ✅ `uv run freecad-mcp` 可正常启动并连接 FreeCAD RPC

---

## 2. FreeCAD 接入方式结论：XML-RPC 直连优先

### 架构（两层）
1. FreeCAD 插件 `FreeCADMCP`（`C:\Users\Denjhang\AppData\Roaming\FreeCAD\Mod\FreeCADMCP\`）→ 在 FreeCAD 内开 XML-RPC 服务器，端口 **9875**
2. MCP 服务器（`D:\working\zcode\freecad-mcp-main`，stdio）→ 只是包了一层转发给 9875

### 结论：直接用 XML-RPC，不走 MCP 工具层

理由：
- XML-RPC 不依赖 ZCode 会话重启，随时可用；MCP 工具要会话启动时加载成功才有
- 少一层封装，报错更直接
- MCP 服务器本身也是转调同一个 9875 端口，功能完全等价
- MCP 通道作为备用：环境已装好，ZCode 重启会话后 `mcp__freecad__*` 工具会自动出现

### 标准调用方式

```python
import xmlrpc.client
s = xmlrpc.client.ServerProxy('http://127.0.0.1:9875')

# 连通性检查
s.ping()  # -> True

# 执行任意 FreeCAD Python 代码
r = s.execute_code("import FreeCAD; print([d.Name for d in FreeCAD.listDocuments().values()])")
# r = {'success': True, 'message': '...Output: ...'}
```

### 使用前提
1. FreeCAD 已打开
2. 工作台切到 "MCP Addon"，点 **Start RPC Server**（无弹窗是正常的，看 Report View）

### 验证命令（一行）
```bash
python -c "import xmlrpc.client; print(xmlrpc.client.ServerProxy('http://127.0.0.1:9875').ping())"
```

---

## 3. 目录结构（2026-09-08 整理后）

```
E:\working\vscode-projects\Freecad\
├── PROJECT_ENV.md      ← 本文档
├── u1HD\               ← u1HD 项目（FCStd / STEP / STL / 预览图）
├── u1SX\               ← u1SX 项目（v1-v3 三个版本 + 导出文件）
└── backups\            ← FreeCAD 自动备份 .FCBak
```

## 4. 相关文档（在 D:\working\zcode\ 下）

- `FREECAD_MCP_AI_TUTORIAL.md` — 详细教程：建模/装配/动画示例、踩坑记录
- `FREECAD_MCP_GUIDE.md` — 环境搭建总结
- `MINI_HARPSICHORD_PETG_GUIDE.md` — 迷你拨弦键盘乐器设计教程
- `MINI_HARPSICHORD_V0_CLEAR_EXPLANATION.md` — 单键单弦机构图解

关键经验（摘自教程）：
- 齿轮动画：Shape 以自身圆心为局部原点，用 `Placement.Base` 定位、`Placement.Rotation` 自转
- FEM 自动化 API 有版本兼容问题，真实应力分析建议 GUI 手动做，别把几何截图当应力云图
