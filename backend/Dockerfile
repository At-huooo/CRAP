# Backend image for the C.R.A.P. physics API (FastAPI + uvicorn)
FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install dependencies first so this layer is cached until requirements.txt changes
COPY requirements.txt .
RUN pip install -r requirements.txt

# Application code (.dockerignore keeps .venv, __pycache__ and .git out)
COPY . .

# Don't run as root
RUN useradd --create-home appuser
USER appuser

# Render and other hosts set $PORT; fall back to 8000 locally
ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
