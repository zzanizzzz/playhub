"""
PlayHub setup script.

What it does:
  1. Creates the folders the project needs (templates, static/css, static/js).
  2. Writes .gitignore (keeps .env and venv off GitHub).
  3. Writes requirements.txt (adds gunicorn for Render).
  4. Fixes SUPABASE_URL in .env (removes /rest/v1 if it is there).
  5. Checks that every required file exists and reports anything missing.
  6. With --git: runs git init, adds files, and makes the first commit.

Usage (run from inside the playhub folder):
  python setup_deploy.py          # file changes only
  python setup_deploy.py --git    # file changes + git init and first commit
"""

import re
import subprocess
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent

GITIGNORE = """venv/
.env
__pycache__/
*.pyc
"""

REQUIREMENTS = """flask
python-dotenv
gunicorn
"""

FOLDERS = [
    "templates",
    "static/css",
    "static/js",
]

REQUIRED_FILES = [
    "app.py",
    "requirements.txt",
    "schema.sql",
    "templates/base.html",
    "templates/index.html",
    "static/css/style.css",
    "static/js/supabase-client.js",
    "static/js/auth.js",
    "static/js/game.js",
]


def step(title):
    print(f"\n== {title} ==")


def create_folders():
    step("Folders")
    for folder in FOLDERS:
        path = BASE / folder
        path.mkdir(parents=True, exist_ok=True)
        print(f"OK  {folder}/")


def write_file(rel_path, content):
    path = BASE / rel_path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    print(f"Wrote {rel_path}")


def write_project_files():
    step("Config files")
    write_file(".gitignore", GITIGNORE)
    write_file("requirements.txt", REQUIREMENTS)


def fix_env():
    step(".env")
    env_path = BASE / ".env"
    if not env_path.exists():
        print("No .env found. Create it with SUPABASE_URL and SUPABASE_ANON_KEY.")
        return

    new_lines = []
    for line in env_path.read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("SUPABASE_URL="):
            url = line.split("=", 1)[1].strip().strip('"').strip("'")
            url = url.rstrip("/")
            url = re.sub(r"/rest/v1$", "", url)
            line = f"SUPABASE_URL={url}"
            print(f"SUPABASE_URL set to {url}")
        new_lines.append(line)

    env_path.write_text("\n".join(new_lines) + "\n", encoding="utf-8")
    print("OK  .env checked (key values were not changed or printed)")


def check_files():
    step("Checking required files")
    missing = []
    for rel in REQUIRED_FILES:
        if (BASE / rel).exists():
            print(f"OK  {rel}")
        else:
            print(f"MISSING  {rel}")
            missing.append(rel)
    if missing:
        print("\nSome files are missing. Create them from the code you were given.")
    return not missing


def run(cmd):
    print(f"$ {' '.join(cmd)}")
    subprocess.run(cmd, cwd=BASE, check=True)


def setup_git():
    step("Git")
    try:
        subprocess.run(["git", "--version"], cwd=BASE, check=True,
                       capture_output=True)
    except (FileNotFoundError, subprocess.CalledProcessError):
        print("Git is not installed. Install it from https://git-scm.com and run again.")
        return

    if not (BASE / ".git").exists():
        run(["git", "init"])

    run(["git", "add", "."])

    result = subprocess.run(["git", "status", "--porcelain"], cwd=BASE,
                            capture_output=True, text=True)
    staged = result.stdout
    if ".env" in staged.replace(".env.example", ""):
        print("WARNING: .env is being staged. Check .gitignore before pushing.")

    try:
        run(["git", "commit", "-m", "PlayHub first version"])
    except subprocess.CalledProcessError:
        print("Nothing new to commit, or Git user name/email is not set.")
        print('Set them with: git config --global user.name "Your Name"')
        print('               git config --global user.email "you@example.com"')

    run(["git", "branch", "-M", "main"])

    print("\nNext, connect GitHub and push:")
    print("  git remote add origin https://github.com/YOUR-USERNAME/playhub.git")
    print("  git push -u origin main")


def main():
    print(f"Setting up PlayHub in: {BASE}")
    create_folders()
    write_project_files()
    fix_env()
    all_ok = check_files()

    if "--git" in sys.argv:
        setup_git()

    print("\nDone." if all_ok else "\nDone, but fix the missing files above.")


if __name__ == "__main__":
    main()
