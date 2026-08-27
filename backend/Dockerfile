FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgl1 \
    libglib2.0-0 \
    curl \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV PYTHONUNBUFFERED=1

RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir torch==2.9.1 torchvision==0.24.1 \
       --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Bake YOLO model weights into the image so they're on disk instantly at
# container start — no runtime download, no startup-timeout risk.
RUN curl -L https://huggingface.co/TellMeWhatYouSaw/RoadDamage-yolo-models/resolve/main/Pothole_best.pt -o Pothole_best.pt \
    && curl -L https://huggingface.co/TellMeWhatYouSaw/RoadDamage-yolo-models/resolve/main/Crack_best.pt -o Crack_best.pt

COPY . .

ENV PORT=8080
EXPOSE 8080

CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT}