#!/usr/bin/env bash
# Clone your own voice locally for the demo video (Chatterbox, MIT licence) — no cloud, no API key.
#   bash scripts/video/clone-local.sh --try     # first: opening + closing lines, to listen
#   bash scripts/video/clone-local.sh           # then: every line
# The first run sets up a private Python 3.11 environment OUTSIDE the repo (../video/.chatterbox-env) and
# downloads the model once (a few GB). Nothing is installed into the app.
set -euo pipefail
cd "$(dirname "$0")/../.."                      # the allowance repo
VIDEO="$(cd .. && pwd)/video"
ENV="$VIDEO/.chatterbox-env"
mkdir -p "$VIDEO"

if ! command -v uv >/dev/null 2>&1; then
  echo "Installing uv (a fast Python environment tool)…"
  if command -v brew >/dev/null 2>&1; then brew install uv; else curl -LsSf https://astral.sh/uv/install.sh | sh; export PATH="$HOME/.local/bin:$PATH"; fi
fi
if ! command -v ffmpeg >/dev/null 2>&1 && command -v brew >/dev/null 2>&1; then brew install ffmpeg; fi

if [ ! -x "$ENV/bin/python" ]; then
  echo "Creating the voice environment (Python 3.11)…"
  uv venv --python 3.11 "$ENV"
fi
uv pip install --quiet --python "$ENV/bin/python" "chatterbox-tts==0.1.7"

exec "$ENV/bin/python" scripts/video/clone_local.py "$@"
