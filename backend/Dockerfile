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

# Bake YOLO model weights into the image, pinned to an exact HF commit
# (not "main" — that URL was observed serving different bytes on repeat
# requests). Checksums make the build fail loudly if anything ever
# doesn't match, instead of silently shipping a broken model.
RUN curl -L https://huggingface.co/TellMeWhatYouSaw/RoadDamage-yolo-models-v2/resolve/7157ab9427bbd128d00df85d0a2cf7d3888f29c6/Pothole_best.pt -o Pothole_best.pt \
    && curl -L https://huggingface.co/TellMeWhatYouSaw/RoadDamage-yolo-models-v2/resolve/7157ab9427bbd128d00df85d0a2cf7d3888f29c6/Crack_best.pt -o Crack_best.pt \
    && echo "574e48cb0ca7743b4cfaf04a4d921617c17563549377403e19a65b30f58939ba  Crack_best.pt" | sha256sum -c - \
    && echo "74ae8be31f631013caf1e54a5fbd3afde0fef4051a45519b04e81848f7417b0c  Pothole_best.pt" | sha256sum -c -

COPY . .

ENV PORT=8080
EXPOSE 8080

CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT}