"""静态服务 + 保存接口：python server.py [port]
POST /save?name=xxx.stl      →  写入 ./out/<name>
POST /savemodel              →  回写 ./lyre.model.json（正文即 JSON 文本）"""
import http.server, urllib.parse, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
os.makedirs(OUT, exist_ok=True)

class Handler(http.server.SimpleHTTPRequestHandler):
    def _write(self, path, data, ctype="application/json"):
        with open(path, "wb") as f:
            f.write(data)
        body = f'{{"saved":"{path.replace(chr(92), "/")}","bytes":{len(data)}}}'.encode()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
        print(f"[saved] {path} ({len(data)} bytes)")

    def do_POST(self):
        q = urllib.parse.urlparse(self.path)
        if q.path == "/savemodel":
            length = int(self.headers.get("Content-Length", 0))
            data = self.rfile.read(length)
            self._write(os.path.join(HERE, "lyre.model.json"), data)
            return
        if q.path != "/save":
            self.send_error(404); return
        name = os.path.basename(urllib.parse.parse_qs(q.query).get("name", ["model.stl"])[0])
        length = int(self.headers.get("Content-Length", 0))
        data = self.rfile.read(length)
        self._write(os.path.join(OUT, name), data)

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # 仓库根为文档根
    http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
