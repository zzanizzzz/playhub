"""
Local runner. Start the site on your computer with:  python app.py
Then open http://127.0.0.1:5000
"""

from api.index import app

if __name__ == "__main__":
    app.run(debug=True, port=5000)