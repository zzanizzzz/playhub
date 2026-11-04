"""
Builds a static copy of PlayHub into the docs/ folder for GitHub Pages.

Run from the playhub folder:
  python build_static.py
"""

import os
import re
import shutil
import sys
from pathlib import Path

from dotenv import load_dotenv
from jinja2 import Environment, FileSystemLoader

BASE = Path(__file__).resolve().parent
load_dotenv(BASE / ".env")

supabase_url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
supabase_url = re.sub(r"/rest/v1$", "", supabase_url)
supabase_key = os.getenv("SUPABASE_ANON_KEY", "").strip()

if not supabase_url or not supabase_key:
    sys.exit("Missing SUPABASE_URL or SUPABASE_ANON_KEY in your .env file.")

# Jinja setup: url_for becomes a plain relative path,
# because GitHub Pages has no Flask to build URLs for us.
env = Environment(loader=FileSystemLoader(BASE / "templates"), autoescape=True)
env.globals["url_for"] = lambda endpoint, filename="": f"static/{filename}"

html = env.get_template("index.html").render(
    supabase_url=supabase_url,
    supabase_key=supabase_key,
)

docs = BASE / "docs"
docs.mkdir(exist_ok=True)

(docs / "index.html").write_text(html, encoding="utf-8")
(docs / ".nojekyll").write_text("", encoding="utf-8")

static_dst = docs / "static"
if static_dst.exists():
    shutil.rmtree(static_dst)
shutil.copytree(BASE / "static", static_dst)

print("Built docs/index.html and docs/static/")
print(f"Supabase URL used: {supabase_url}")