# IELTS Platform — backend API image.
# Build from the repo root:  docker build -t ielts-api .
# Run:                       docker run -p 8000:8000 --env-file backend/.env ielts-api
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000

WORKDIR /app

# Install dependencies first so this layer caches unless requirements change.
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Application code.
COPY backend ./backend

# Local fallback dir for the /uploads static mount (Supabase Storage is preferred).
# Run as a non-root user and give it ownership of the app dir (uploads must be
# writable at runtime).
RUN mkdir -p backend/uploads \
    && useradd --create-home --uid 1000 appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# Container-level health probe (Render also uses healthCheckPath in render.yaml).
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
    CMD python -c "import os,sys,urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('PORT','8000')+'/api/health', timeout=4).status==200 else 1)"

# Shell form so $PORT (set by the platform, defaulting to 8000) is expanded.
CMD uvicorn backend.main:app --host 0.0.0.0 --port $PORT
