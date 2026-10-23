# 1. Сборка интерфейса (React + Three.js)
FROM node:22-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# 2. Сервер на Python без внешних зависимостей
FROM python:3.12-slim
WORKDIR /app
COPY server.py ./
COPY static ./static
COPY --from=web /web/dist ./web/dist
ENV DATA_DIR=/data PORT=8000 PYTHONUNBUFFERED=1
VOLUME /data
EXPOSE 8000
CMD ["python", "server.py"]
