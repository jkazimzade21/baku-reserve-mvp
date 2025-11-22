# Backend multi-stage build
FROM python:3.11-slim AS builder
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
WORKDIR /app
COPY backend/requirements.txt backend/requirements.lock ./backend/
RUN pip install --upgrade pip && \
    pip install --prefix=/install -r backend/requirements.txt

FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DATA_DIR=/data
WORKDIR /app
COPY --from=builder /install /usr/local
COPY backend ./backend
COPY backend/.env.example ./backend/.env.example
VOLUME ["/data"]
EXPOSE 8000
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
