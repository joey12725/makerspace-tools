from flask import Flask, jsonify

app = Flask(__name__)


# "/" for the local dev server mount, "/api/ping" for Vercel, which passes the full path.
@app.get("/")
@app.get("/api/ping")
def ping():
    return jsonify({"ok": True, "message": "python api alive"})
