FROM node:22-alpine AS frontend-builder
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm config set fetch-retries 5 \
	&& npm config set fetch-retry-factor 2 \
	&& npm config set fetch-retry-mintimeout 20000 \
	&& npm config set fetch-retry-maxtimeout 120000 \
	&& npm config set fetch-timeout 300000 \
	&& npm config set registry https://registry.npmjs.org/ \
	&& ok=0 \
	&& for i in 1 2 3; do npm ci --no-audit --no-fund && ok=1 && break || (echo "npm ci failed (attempt $i), retrying..." && sleep 12); done \
	&& if [ "$ok" -ne 1 ]; then echo "npm ci failed after retries; trying npm install fallback"; npm install --no-audit --no-fund; fi
COPY frontend/ ./
ARG VITE_API_BASE_URL=
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build

FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
WORKDIR /app

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r ./backend/requirements.txt

COPY backend/ ./backend/
COPY --from=frontend-builder /frontend/dist ./frontend_dist

ENV CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--app-dir", "/app/backend"]
