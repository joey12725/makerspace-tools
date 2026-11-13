"""Run the Jenga Maker web app locally: static UI plus the /api routes Vercel serves in production.

uv run python serve.py   # then open http://localhost:5050
"""

import importlib.util
import sys
from pathlib import Path

from flask import Flask, send_from_directory
from werkzeug.middleware.dispatcher import DispatcherMiddleware
from werkzeug.serving import run_simple

HERE = Path(__file__).resolve().parent


def load(name: str):
    """Import api/<name>.py and serve its "/" route at the mount point itself, like Vercel does."""
    spec = importlib.util.spec_from_file_location(f"api_{name}", HERE / "api" / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    def wsgi(environ, start_response):
        environ["PATH_INFO"] = environ.get("PATH_INFO") or "/"
        return module.app(environ, start_response)

    return wsgi


ui = Flask(__name__, static_folder=None)


@ui.get("/")
@ui.get("/<path:path>")
def static_files(path: str = "index.html"):
    if path not in {"index.html", "app.jsx"}:
        path = "index.html"
    mimetype = "text/javascript" if path.endswith(".jsx") else None
    return send_from_directory(HERE, path, mimetype=mimetype)


app = DispatcherMiddleware(ui, {"/api/generate": load("generate"), "/api/ping": load("ping")})

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5050
    run_simple("127.0.0.1", port, app, use_reloader=False)
