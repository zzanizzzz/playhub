import os

from dotenv import load_dotenv
from flask import Flask, render_template

# Load SUPABASE_URL and SUPABASE_ANON_KEY from the .env file
load_dotenv()

app = Flask(__name__)


@app.route("/")
def index():
    return render_template(
        "index.html",
        supabase_url=os.getenv("SUPABASE_URL", ""),
        supabase_key=os.getenv("SUPABASE_ANON_KEY", ""),
    )


if __name__ == "__main__":
    app.run(debug=True, port=5000)