"""
PlayHub backend (Flask).

It serves the web page and provides the API the game uses:
  POST /api/rounds/start           start a round, records the start time on the server
  POST /api/rounds/<id>/finish     finish a round, validates it and updates the player's totals
  GET  /api/leaderboard            top 50 players
  GET  /api/profiles/<user_id>     one player's stats and round history

The browser never writes to the database directly. Every change goes through
this server, which checks the user's login token first.
"""

import os
import uuid
from datetime import datetime, timezone
from functools import wraps

import requests
from dotenv import load_dotenv
from flask import Flask, g, jsonify, render_template, request

load_dotenv()

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

app = Flask(
    __name__,
    template_folder=os.path.join(BASE_DIR, "templates"),
    static_folder=os.path.join(BASE_DIR, "static"),
    static_url_path="/static",
)

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")
# Secret key. Used only on the server. Never send it to the browser.
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

ROUND_SECONDS = 15
MIN_ROUND_SECONDS = 14           # finishes sooner than this are rejected
MAX_ROUND_SECONDS = ROUND_SECONDS + 20  # finishes later than this are rejected
MAX_SCORE = 60                   # more hits than this in one round is treated as cheating


def db(method, table, params=None, json_body=None):
    """Call Supabase's database API with the service key (server-side only)."""
    response = requests.request(
        method,
        f"{SUPABASE_URL}/rest/v1/{table}",
        params=params,
        json=json_body,
        headers={
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
        timeout=10,
    )
    response.raise_for_status()
    return response.json() if response.text else []


def get_user_from_token(token):
    """Ask Supabase who owns this login token. Returns the user or None."""
    response = requests.get(
        f"{SUPABASE_URL}/auth/v1/user",
        headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}"},
        timeout=10,
    )
    if response.status_code != 200:
        return None
    return response.json()


def login_required(view):
    """Decorator: rejects requests that don't carry a valid login token."""
    @wraps(view)
    def wrapper(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return jsonify(error="Please log in first."), 401
        user = get_user_from_token(header[len("Bearer "):])
        if not user or "id" not in user:
            return jsonify(error="Your session has expired. Please log in again."), 401
        g.user_id = user["id"]
        return view(*args, **kwargs)
    return wrapper


def is_uuid(value):
    try:
        uuid.UUID(str(value))
        return True
    except ValueError:
        return False


def parse_time(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


@app.errorhandler(requests.HTTPError)
def database_error(err):
    return jsonify(error="The database request failed. Check your Supabase setup."), 502


@app.route("/")
def index():
    return render_template(
        "index.html",
        supabase_url=SUPABASE_URL,
        supabase_key=SUPABASE_ANON_KEY,
    )


@app.route("/api/rounds/start", methods=["POST"])
@login_required
def start_round():
    rows = db("POST", "rounds", json_body={"user_id": g.user_id})
    round_row = rows[0]
    return jsonify(id=round_row["id"], started_at=round_row["started_at"])


@app.route("/api/rounds/<round_id>/finish", methods=["POST"])
@login_required
def finish_round(round_id):
    if not is_uuid(round_id):
        return jsonify(error="Invalid round."), 400

    body = request.get_json(silent=True) or {}
    score = body.get("score")
    if not isinstance(score, int) or isinstance(score, bool) or score < 0 or score > MAX_SCORE:
        return jsonify(error="Invalid score."), 400

    found = db("GET", "rounds", params={
        "id": f"eq.{round_id}",
        "user_id": f"eq.{g.user_id}",
        "status": "eq.started",
        "select": "*",
    })
    if not found:
        return jsonify(error="This round was not found or is already finished."), 404
    round_row = found[0]

    now = datetime.now(timezone.utc)
    elapsed = (now - parse_time(round_row["started_at"])).total_seconds()
    if elapsed < MIN_ROUND_SECONDS or elapsed > MAX_ROUND_SECONDS:
        db("PATCH", "rounds", params={"id": f"eq.{round_id}"}, json_body={"status": "rejected"})
        return jsonify(error="Round timing was invalid, so the score was not saved."), 400

    db("PATCH", "rounds", params={"id": f"eq.{round_id}"}, json_body={
        "status": "finished",
        "score": score,
        "duration_seconds": round(elapsed, 1),
        "finished_at": now.isoformat(),
    })

    profile = db("GET", "profiles", params={"id": f"eq.{g.user_id}", "select": "*"})[0]
    updated = db("PATCH", "profiles", params={"id": f"eq.{g.user_id}"}, json_body={
        "points": profile["points"] + score,
        "games_played": profile["games_played"] + 1,
        "best_score": max(profile["best_score"], score),
    })[0]
    return jsonify(profile=updated)


@app.route("/api/leaderboard")
@login_required
def leaderboard():
    players = db("GET", "profiles", params={
        "select": "id,username,points",
        "order": "points.desc",
        "limit": "50",
    })
    return jsonify(players=players)


@app.route("/api/profiles/<user_id>")
@login_required
def profile(user_id):
    if not is_uuid(user_id):
        return jsonify(error="Invalid player."), 400

    found = db("GET", "profiles", params={
        "id": f"eq.{user_id}",
        "select": "id,username,points,games_played,best_score",
    })
    if not found:
        return jsonify(error="Player not found."), 404

    history = db("GET", "rounds", params={
        "user_id": f"eq.{user_id}",
        "status": "eq.finished",
        "select": "score,duration_seconds,finished_at",
        "order": "finished_at.desc",
        "limit": "50",
    })
    return jsonify(profile=found[0], history=history)


if __name__ == "__main__":
    app.run(debug=True, port=5000)