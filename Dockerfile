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
RUN mkdir -p backend/uploads

EXPOSE 8000

# Shell form so $PORT (set by the platform, defaulting to 8000) is expanded.
CMD uvicorn backend.main:app --host 0.0.0.0 --port $PORT
