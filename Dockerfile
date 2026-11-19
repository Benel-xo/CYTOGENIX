# Build the Python backend dependencies
FROM python:3.12-slim AS python-deps

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libopenslide-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /app/requirements.txt

RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir \
    --index-url https://download.pytorch.org/whl/cpu \
    torch torchvision && \
    pip install --no-cache-dir -r /app/requirements.txt


# Build the Next.js frontend
FROM node:22-bookworm-slim AS frontend-build

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm install

COPY frontend/ ./
RUN npm run build


# Run both applications in one container
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libopenslide0 \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    bash \
    && rm -rf /var/lib/apt/lists/*

COPY --from=python-deps /usr/local /usr/local
COPY --from=frontend-build /app/frontend /app/frontend
COPY backend /app/backend
COPY start.sh /app/start.sh

WORKDIR /app

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV NODE_ENV=production

EXPOSE 10000

CMD ["bash", "/app/start.sh"]
