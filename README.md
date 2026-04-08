# DoNext AI – Ultimate Productivity Autopilot

Hackathon-ready productivity app with:

- React + Chakra UI frontend
- FastAPI backend
- Gemini-powered "Do Next Task" prioritization
- Dynamic context support (deadline, priority, dependencies, available time, energy)

## Project Structure

- `frontend/` – React + Chakra single-page app
- `backend/` – FastAPI API with Gemini integration and fallback prioritizer

## 1) Backend Setup (FastAPI)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Set `GEMINI_API_KEY` in `backend/.env`.
Set `CORS_ORIGINS` for your deployed frontend URL(s), comma-separated.

Run backend:

```bash
uvicorn app.main:app --reload --port 8000
```

Health check:

```bash
curl http://localhost:8000/health
```

## 2) Frontend Setup (React + Chakra)

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Frontend runs on `http://localhost:5173` and calls backend at `VITE_API_BASE_URL`.

## 3) Production Notes

- Never commit real API keys. Use `.env` locally and host-managed secrets in production.
- Configure `CORS_ORIGINS` to your actual deployed frontend domain.
- Keep backend and frontend on HTTPS in production.
- Fallback prioritizer ensures app still responds if Gemini is unavailable.

## 4) Gemini Prompt Logic

Backend sends tasks + user context in one request and instructs Gemini to:

1. Prioritize urgency first, then importance, then effort fit
2. Respect dependencies
3. Pick one best next task
4. Return micro-actions, estimated time, and motivation in strict JSON

## 5) Demo Flow

1. Add tasks (deadline/priority/estimate/dependency optional)
2. Set context (available minutes + energy)
3. Click **Do Next Task**
4. Complete micro-actions via button or hotkeys `1-9`

## Notes

- If Gemini key is missing or API fails, backend falls back to a deterministic prioritizer so your demo still works.
- Designed for fast hackathon iteration and easy deployment.
