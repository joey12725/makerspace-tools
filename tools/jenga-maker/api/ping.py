from flask import Flask, jsonify

app = Flask(__name__)


@app.get("/")
def ping():
    return jsonify({"ok": True, "message": "python api alive"})
