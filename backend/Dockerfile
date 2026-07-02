# ---- Snap2Fix Backend Dockerfile (FastAPI + Alembic + YOLO) ----
# Place this file at: backend/Dockerfile

FROM python:3.11-slim

# System dependencies needed for common ML/image libs (opencv, torch, etc.)
# and ffmpeg (required at runtime by ffmpeg-python for video processing)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    curl \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first (better layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Copy the rest of the backend code (app/, alembic/, models, etc.)
COPY . .

# Cloud Run injects PORT env var at runtime — do NOT hardcode 8000 here
ENV PORT=8080
EXPOSE 8080

# Run Alembic migrations, then start the app.
# If migrations should NOT run on every boot, remove the alembic line
# and run migrations manually/once instead.
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT}