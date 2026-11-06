"""Publish frontend assets through Vercel's CDN instead of a Python function."""
from pathlib import Path
import shutil

root = Path(__file__).resolve().parent
shutil.copytree(root / "static", root / "public", dirs_exist_ok=True)
