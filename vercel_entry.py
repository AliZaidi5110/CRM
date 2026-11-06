"""Vercel entrypoint: configure the serverless runtime before importing Flask."""
import os

os.environ.setdefault("VERCEL", "1")

from app import create_app

app = create_app()
