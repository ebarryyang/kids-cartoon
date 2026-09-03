"""
本地流水线服务 (Local Pipeline Server)
=========================================
配合管理后台「AI 课件制作向导」的服务模式使用：

    python scripts/pipeline-server.py            # 默认 127.0.0.1:8765
    python scripts/pipeline-server.py --port 8765

提供接口（全部 JSON / 二进制流，带 CORS，可被 Vercel 上的 https 页面调用）：
  GET  /health                 健康检查（whisper / ffmpeg / edge-tts 检测）
  POST /start                  启动流水线任务：raw body = 视频字节流，
                               query 携带参数；Header X-Pipeline-Env 携带 base64(JSON) 环境变量
  GET  /status?taskId=         轮询任务进度 {state, percent, message, logsTail}
  GET  /artifacts?taskId=      任务产物清单（mp4 / vtt / json / md / audio 文件名列表）
  GET  /download?taskId=&name= 下载单个产物文件
  POST /cancel?taskId=         终止任务

安全设计：只绑定 127.0.0.1；文件名白名单校验；产物下载限制在任务产物清单内。
进度解析：监听 auto_process_video.py 的 stdout 标记行，映射为百分比。
"""

import argparse
import base64
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import uuid
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs, unquote

# ---- Windows 控制台 UTF-8 双保险 ----
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

SCRIPTS_DIR = Path(__file__).resolve().parent
PIPELINE_SCRIPT = SCRIPTS_DIR / "auto_process_video.py"
SERVER_VERSION = "1.0.0"

# 允许从环境变量注入到子进程的 Key（其余全部忽略）
ALLOWED_ENV_KEYS = {
    "SILICONFLOW_API_KEY", "SILICONFLOW_KEY",
    "DEEPSEEK_API_KEY", "DEEPSEEK_KEY",
    "LLM_API_KEY", "LLM_BASE_URL", "LLM_MODEL",
    "EDGE_TTS_VOICE", "LLM_MAX_TOKENS",
}

# 文件名：允许中文、字母数字、空格、点、下划线、横线（禁止路径分隔符）
_SAFE_NAME_RE = re.compile(r"^[\w\u4e00-\u9fff\- .()（）\[\]【】]+$")


class Task:
    def __init__(self, task_id: str, stem: str, video_path: Path, cmd: list, env: dict):
        self.id = task_id
        self.stem = stem
        self.video_path = video_path
        self.cmd = cmd
        self.env = env
        self.state = "running"          # running | done | error
        self.percent = 0
        self.message = "任务已创建，准备上传/启动…"
        self.logs: deque = deque(maxlen=800)
        self.exit_code: "int | None" = None
        self.cancelled = False
        self.created_at = time.time()
        self.finished_at: "float | None" = None
        self.proc: "subprocess.Popen | None" = None
        self._lock = threading.Lock()

    def log(self, line: str) -> None:
        with self._lock:
            self.logs.append(line.rstrip("\n"))

    def set_progress(self, percent: int, message: str) -> None:
        with self._lock:
            self.percent = max(self.percent, percent)
            self.message = message

    def snapshot(self, tail: int = 30) -> dict:
        with self._lock:
            return {
                "taskId": self.id,
                "state": self.state,
                "percent": self.percent,
                "message": self.message,
                "exitCode": self.exit_code,
                "logsTail": list(self.logs)[-tail:],
            }


TASKS: "dict[str, Task]" = {}
TASKS_LOCK = threading.Lock()
MAX_TASKS_KEPT = 8


def _gc_tasks() -> None:
    with TASKS_LOCK:
        if len(TASKS) <= MAX_TASKS_KEPT:
            return
        # 按 created_at 清掉最旧的已完成任务
        done = sorted(
            (t for t in TASKS.values() if t.state != "running"),
            key=lambda t: t.created_at,
        )
        while len(TASKS) > MAX_TASKS_KEPT and done:
            old = done.pop(0)
            TASKS.pop(old.id, None)


def sanitize_stem(filename: str) -> str:
    """从上传文件名提取安全的 stem（不含扩展名）"""
    name = Path(filename.replace("\\", "/")).name.strip()
    stem = Path(name).stem.strip()
    if not stem or not _SAFE_NAME_RE.match(stem):
        stem = re.sub(r"[^\w\u4e00-\u9fff\-]+", "_", stem) or "video"
    if len(stem) > 80:
        stem = stem[:80]
    return stem


def _has_module(mod: str) -> bool:
    try:
        __import__(mod)
        return True
    except Exception:
        return False


def detect_env() -> dict:
    ffmpeg = shutil.which("ffmpeg") is not None
    return {
        "ok": True,
        "service": "kids-pipeline-server",
        "version": SERVER_VERSION,
        "python": sys.version.split()[0],
        "whisper": _has_module("whisper"),
        "edgeTts": _has_module("edge_tts"),
        "ffmpeg": ffmpeg,
        "scriptsDir": str(SCRIPTS_DIR),
    }


# ============================================================
# 进度标记：auto_process_video.py 的 stdout 行 → 百分比
# ============================================================
PROGRESS_MARKERS = [
    ("🎬 开始处理视频", 5, "开始处理视频"),
    ("加载 Whisper 模型", 10, "加载 Whisper 模型（首次会下载权重）"),
    ("语音识别中", 20, "🎙️ 语音识别中（最耗时的一步，请耐心等待）"),
    ("英文字幕已生成", 45, "✅ 英文字幕已生成"),
    ("正在翻译英文字幕", 50, "🌐 正在翻译中文字幕"),
    ("字幕翻译成功", 56, "✅ 中文字幕翻译成功"),
    ("中文字幕已生成", 58, "✅ 中文字幕已生成"),
    ("中文字幕已存在", 58, "✅ 中文字幕已存在，跳过翻译"),
    ("正在调用大模型提取核心生词", 62, "🧠 正在调用大模型抽取生词（多引擎依次尝试）"),
    ("本地零依赖抽词", 62, "🧠 正在本地抽取生词（TF + 停用词）"),
    ("抽词结束", 68, "✅ 生词抽取完成"),
    ("生成单词发音音频", 72, "🔊 生成单词发音音频"),
    ("生词表 Markdown", 96, "✅ 生词表导出完成"),
]

_TTS_DONE_RE = re.compile(r"发音生成:\s*(.+?)(?:\s*\(|$)")
_TTS_BASE = 72
_TTS_SPAN = 22  # TTS 阶段占 72% → 94%


def _run_task(task: Task, words: int) -> None:
    try:
        task.log(f"$ {' '.join(task.cmd)}")
        proc = subprocess.Popen(
            task.cmd,
            cwd=str(SCRIPTS_DIR),
            env=task.env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
        )
        task.proc = proc
        assert proc.stdout is not None
        for line in proc.stdout:
            if not line:
                continue
            task.log(line)
            for marker, pct, msg in PROGRESS_MARKERS:
                if marker in line:
                    task.set_progress(pct, msg)
                    break
            else:
                m = _TTS_DONE_RE.search(line)
                if m and words > 0:
                    # 用日志里出现的第 n 个发音行估算 TTS 进度
                    done_n = sum(1 for l in list(task.logs) if "发音生成:" in l)
                    pct = _TTS_BASE + int(_TTS_SPAN * min(done_n / words, 1.0))
                    task.set_progress(min(pct, 94), f"🔊 发音音频 {done_n}/{words}")
        code = proc.wait()
        task.exit_code = code
        if task.cancelled:
            task.state = "error"
            task.set_progress(task.percent, "⏹ 任务已取消")
            task.log("==== 任务已取消 ====")
        elif code == 0:
            task.set_progress(100, "🎉 流水线全部完成")
            task.state = "done"
            task.log("==== 任务完成 ====")
        else:
            task.state = "error"
            task.set_progress(task.percent, f"❌ 脚本退出码 {code}")
            task.log(f"==== 任务失败 exit={code} ====")
    except Exception as e:  # noqa: BLE001
        task.state = "error"
        task.exit_code = -1
        task.log(f"==== 服务端异常: {e} ====")
    finally:
        task.finished_at = time.time()
        _gc_tasks()


def _task_artifacts(task: Task) -> dict:
    """扫描 scripts/ 下属于该任务 stem 的产物"""
    stem = task.stem
    out_dir = task.video_path.parent

    def _exists(p: Path) -> bool:
        try:
            return p.is_file() and p.stat().st_size > 0
        except OSError:
            return False

    mp4 = out_dir / f"{stem}.mp4"
    # mkv 源可能转出了 mp4；视频产物以实际存在的为准
    video = None
    for cand in (mp4, out_dir / f"{stem}.mkv", task.video_path):
        if cand is not None and _exists(cand):
            video = cand
            break

    en_vtt = out_dir / f"{stem}_en.vtt"
    zh_vtt = out_dir / f"{stem}_zh.vtt"
    vocab_json = out_dir / f"{stem}_vocabulary.json"
    vocab_md = out_dir / f"{stem}_vocabulary.md"

    audio_dir = out_dir / f"{stem}_audio"
    audio_files = []
    if audio_dir.is_dir():
        audio_files = sorted(p.name for p in audio_dir.glob("*.mp3") if p.is_file())

    artifacts = {
        "stem": stem,
        "video": video.name if video else None,
        "enVtt": en_vtt.name if _exists(en_vtt) else None,
        "zhVtt": zh_vtt.name if _exists(zh_vtt) else None,
        "vocabularyJson": vocab_json.name if _exists(vocab_json) else None,
        "vocabularyMd": vocab_md.name if _exists(vocab_md) else None,
        "audioFiles": audio_files,
    }
    return artifacts


def _resolve_download(task: Task, name: str) -> "Path | None":
    """只允许下载任务产物清单内的文件（防目录穿越）"""
    arts = _task_artifacts(task)
    safe = Path(name.replace("\\", "/")).name
    allowed = {
        arts["video"], arts["enVtt"], arts["zhVtt"],
        arts["vocabularyJson"], arts["vocabularyMd"], *arts["audioFiles"],
    }
    if safe not in allowed or safe is None:
        return None
    # 视频和字幕/词汇表在 scripts/，音频在 scripts/{stem}_audio/
    cand_direct = task.video_path.parent / safe
    if cand_direct.is_file():
        return cand_direct
    cand_audio = task.video_path.parent / f"{task.stem}_audio" / safe
    if cand_audio.is_file():
        return cand_audio
    return None


class Handler(BaseHTTPRequestHandler):
    server_version = "KidsPipelineServer/" + SERVER_VERSION
    protocol_version = "HTTP/1.1"

    # ---------- 基础工具 ----------
    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        # Chrome 私有网络访问（https 页面访问 localhost）预检要求
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Access-Control-Max-Age", "86400")

    def _send_json(self, obj: dict, status: int = 200) -> None:
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, p: Path) -> None:
        try:
            size = p.stat().st_size
        except OSError:
            self._send_json({"ok": False, "error": "file stat failed"}, 404)
            return
        ctype = {
            ".mp4": "video/mp4", ".mkv": "video/x-matroska",
            ".vtt": "text/vtt; charset=utf-8", ".json": "application/json; charset=utf-8",
            ".md": "text/markdown; charset=utf-8", ".mp3": "audio/mpeg",
        }.get(p.suffix.lower(), "application/octet-stream")
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(size))
        self.send_header("Cache-Control", "no-store")
        self._cors()
        self.end_headers()
        with open(p, "rb") as f:
            while True:
                chunk = f.read(1024 * 256)
                if not chunk:
                    break
                self.wfile.write(chunk)

    def log_message(self, fmt, *args):  # 精简控制台日志
        sys.stdout.write("[http] %s\n" % (fmt % args))

    def _qs(self) -> dict:
        return parse_qs(urlparse(self.path).query)

    # ---------- OPTIONS ----------
    def do_OPTIONS(self):  # noqa: N802
        self.send_response(204)
        self.send_header("Content-Length", "0")
        self._cors()
        self.end_headers()

    # ---------- GET ----------
    def do_GET(self):  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        qs = self._qs()

        if path == "/health":
            self._send_json(detect_env())
            return

        if path == "/status":
            tid = (qs.get("taskId") or [""])[0]
            task = TASKS.get(tid)
            if not task:
                self._send_json({"ok": False, "error": "task not found: " + tid}, 404)
                return
            self._send_json({"ok": True, **task.snapshot()})
            return

        if path == "/artifacts":
            tid = (qs.get("taskId") or [""])[0]
            task = TASKS.get(tid)
            if not task:
                self._send_json({"ok": False, "error": "task not found: " + tid}, 404)
                return
            if task.state == "running":
                self._send_json({"ok": False, "error": "task still running"}, 409)
                return
            self._send_json({"ok": True, "taskId": tid, "state": task.state,
                             "artifacts": _task_artifacts(task)})
            return

        if path == "/download":
            tid = (qs.get("taskId") or [""])[0]
            name = unquote((qs.get("name") or [""])[0])
            task = TASKS.get(tid)
            if not task:
                self._send_json({"ok": False, "error": "task not found"}, 404)
                return
            p = _resolve_download(task, name)
            if p is None:
                self._send_json({"ok": False, "error": "file not allowed or not found: " + name}, 404)
                return
            self._send_file(p)
            return

        if path == "/":
            self._send_json({**detect_env(), "endpoints": [
                "GET /health", "POST /start", "GET /status?taskId=",
                "GET /artifacts?taskId=", "GET /download?taskId=&name=", "POST /cancel?taskId=",
            ]})
            return

        self._send_json({"ok": False, "error": "not found"}, 404)

    # ---------- POST ----------
    def do_POST(self):  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")
        qs = self._qs()

        if path != "/start" and path != "/cancel":
            self._send_json({"ok": False, "error": "not found"}, 404)
            return

        if path == "/cancel":
            tid = (qs.get("taskId") or [""])[0]
            task = TASKS.get(tid)
            if not task:
                self._send_json({"ok": False, "error": "task not found"}, 404)
                return
            if task.proc and task.proc.poll() is None:
                try:
                    task.proc.terminate()
                except Exception:
                    pass
                task.cancelled = True
                task.log("==== 已被用户取消 ====")
                task.state = "error"
                task.message = "已取消"
                self._send_json({"ok": True, "cancelled": True})
            else:
                self._send_json({"ok": True, "cancelled": False, "reason": "not running"})
            return

        # ----- /start -----
        running = [t for t in TASKS.values() if t.state == "running"]
        if running:
            self._send_json({
                "ok": False,
                "error": f"已有任务在运行（{running[0].id}），请等待完成或先取消。",
            }, 409)
            return

        filename = unquote((qs.get("filename") or [""])[0])
        if not filename:
            self._send_json({"ok": False, "error": "missing filename query param"}, 400)
            return

        stem = sanitize_stem(filename)
        suffix = Path(filename.replace("\\", "/")).suffix.lower() or ".mp4"
        if not re.match(r"^\.(mp4|mkv|mov|avi|webm|flv|ts|m4v)$", suffix):
            suffix = ".mp4"
        video_path = SCRIPTS_DIR / f"{stem}{suffix}"
        if _SAFE_NAME_RE.match(stem) is None:
            self._send_json({"ok": False, "error": "invalid filename"}, 400)
            return

        # 流式写盘（不占大内存）
        try:
            length = int(self.headers.get("Content-Length") or "0")
        except ValueError:
            length = 0
        if length <= 0:
            self._send_json({"ok": False, "error": "empty upload body"}, 400)
            return
        try:
            with open(video_path, "wb") as f:
                remaining = length
                while remaining > 0:
                    chunk = self.rfile.read(min(1024 * 512, remaining))
                    if not chunk:
                        break
                    f.write(chunk)
                    remaining -= len(chunk)
        except OSError as e:
            self._send_json({"ok": False, "error": f"write video failed: {e}"}, 500)
            return

        # 参数
        def q(name: str, default: str = "") -> str:
            return unquote((qs.get(name) or [default])[0])

        model = q("model", "base")
        if model not in ("tiny", "base", "small", "medium", "large"):
            model = "base"
        try:
            words = max(3, min(30, int(q("words", "12") or 12)))
        except ValueError:
            words = 12
        cmd = [sys.executable, str(PIPELINE_SCRIPT), str(video_path),
               "--model", model, "--words", str(words)]
        if q("skipTts") in ("1", "true"):
            cmd.append("--skip-tts")
        if q("forceLocal") in ("1", "true"):
            cmd.append("--force-local")
        if q("noMkvConvert") in ("1", "true"):
            cmd.append("--no-mkv-convert")
        if q("translateZh") in ("1", "true"):
            cmd.append("--translate-zh")
        if q("zhModel", "").strip():
            cmd += ["--zh-model", q("zhModel").strip()]
        if q("vocabModel", "").strip():
            cmd += ["--vocab-model", q("vocabModel").strip()]

        # 环境变量（base64(JSON)，仅透传白名单 Key）
        env = os.environ.copy()
        env.setdefault("PYTHONIOENCODING", "utf-8")
        env.setdefault("PYTHONUNBUFFERED", "1")
        env_header = self.headers.get("X-Pipeline-Env") or ""
        if env_header:
            try:
                extra = json.loads(base64.b64decode(env_header).decode("utf-8"))
                for k, v in (extra or {}).items():
                    if k in ALLOWED_ENV_KEYS and isinstance(v, str) and v.strip():
                        env[k] = v.strip()
            except Exception as e:
                self._send_json({"ok": False, "error": f"X-Pipeline-Env parse failed: {e}"}, 400)
                return

        task = Task(uuid.uuid4().hex[:12], stem, video_path, cmd, env)
        with TASKS_LOCK:
            TASKS[task.id] = task
        threading.Thread(target=_run_task, args=(task, words), daemon=True).start()
        task.log(f"📥 视频已接收: {video_path.name} ({length / 1024 / 1024:.1f} MB)")
        task.set_progress(3, "📥 视频上传完成，启动流水线…")
        self._send_json({"ok": True, "taskId": task.id, "stem": stem})


def main() -> None:
    ap = argparse.ArgumentParser(description="儿童英文动画 · 本地流水线服务")
    ap.add_argument("--host", default="127.0.0.1", help="默认只监听本机 127.0.0.1")
    ap.add_argument("--port", type=int, default=8765)
    args = ap.parse_args()

    env = detect_env()
    print("=" * 56)
    print("🚀 本地流水线服务已启动")
    print(f"   地址:      http://{args.host}:{args.port}")
    print(f"   Python:    {env['python']}   whisper: {'✅' if env['whisper'] else '❌ 未安装'}")
    print(f"   ffmpeg:    {'✅' if env['ffmpeg'] else '❌ 未安装'}   edge-tts: {'✅' if env['edgeTts'] else '❌ 未安装'}")
    print(f"   脚本目录:  {SCRIPTS_DIR}")
    print("   现在可以回到管理后台 → 系统设置 → 勾选「启用本地流水线服务」")
    print("=" * 56)

    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    httpd.daemon_threads = True
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n👋 服务已停止")


if __name__ == "__main__":
    main()
