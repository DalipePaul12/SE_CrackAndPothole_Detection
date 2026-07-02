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

# Force Python to flush stdout/stderr immediately (no buffering)
# so we can actually see logs/errors in Render instead of silence
ENV PYTHONUNBUFFERED=1

# ── CPU-only torch FIRST ──────────────────────────────────────────────────
# Default PyPI torch pulls the full CUDA/NVIDIA toolkit (~2+ GB of cuBLAS,
# cuFFT, cuSolver, cuSparse, NCCL, etc.) even though Render has no GPU.
# That bloats the image, slows the import at startup, and on a 0.1 CPU /
# 512 MB instance is enough to blow past Render's deploy timeout with zero
# logs (exit 128). Installing the CPU wheel avoids pulling any nvidia-*
# packages entirely.
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir torch==2.11.0 torchvision==0.26.0 \
       --index-url https://download.pytorch.org/whl/cpu

# Install remaining Python dependencies (torch/torchvision must already be
# removed from requirements.txt, or pip will re-resolve and pull the GPU
# build right back in, undoing the step above)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the backend code (app/, alembic/, models, etc.)
COPY . .

# Cloud Run injects PORT env var at runtime — do NOT hardcode 8000 here
ENV PORT=8080
EXPOSE 8080

# Run Alembic migrations, then start the app.
# If migrations should NOT run on every boot, remove the alembic line
# and run migrations manually/once instead.
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT}