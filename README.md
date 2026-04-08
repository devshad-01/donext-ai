# DoNext AI – Ultimate Productivity Autopilot

Hackathon-ready productivity app with:

- React + Chakra UI frontend
- FastAPI backend
- Gemini-powered "Do Next Task" prioritization
- Dynamic context support (deadline, priority, dependencies, available time, energy)

## Project Structure

- `frontend/` – React + Chakra single-page app
- `backend/` – FastAPI API with Gemini integration and fallback prioritizer
- `Dockerfile` – single-container production image (frontend + backend)
- `docker-compose.yml` – local one-command run

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

## 4) One-Container Run (Docker)

Create a root `.env` file:

```bash
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.0-flash
CORS_ORIGINS=http://localhost:8000
```

Run everything with one command:

```bash
docker compose up --build
```

Open: `http://localhost:8000`

## 5) Azure Fast Deploy (Azure Web App for Containers)

```bash
# 1) Variables
RG=donext-ai-rg
LOC=eastus
ACR=donextaiacr$RANDOM
PLAN=donext-ai-plan
APP=donext-ai-$RANDOM

# 2) Resource group + ACR
az group create -n $RG -l $LOC
az acr create -g $RG -n $ACR --sku Basic

# 3) Build image in ACR
az acr build -r $ACR -t donext-ai:latest .

# 4) App Service plan + Web App
az appservice plan create -g $RG -n $PLAN --is-linux --sku B1
az webapp create -g $RG -p $PLAN -n $APP --deployment-container-image-name $ACR.azurecr.io/donext-ai:latest

# 5) Allow Web App to pull from ACR
ACR_USER=$(az acr credential show -n $ACR --query username -o tsv)
ACR_PASS=$(az acr credential show -n $ACR --query passwords[0].value -o tsv)
az webapp config container set -g $RG -n $APP \
	--container-image-name $ACR.azurecr.io/donext-ai:latest \
	--container-registry-url https://$ACR.azurecr.io \
	--container-registry-user $ACR_USER \
	--container-registry-password $ACR_PASS

# 6) Runtime secrets/settings
az webapp config appsettings set -g $RG -n $APP --settings \
	GEMINI_API_KEY="<your_key>" \
	GEMINI_MODEL="gemini-2.0-flash" \
	CORS_ORIGINS="https://$APP.azurewebsites.net"

# 7) Open app
echo "https://$APP.azurewebsites.net"
```

## 6) Gemini Prompt Logic

Backend sends tasks + user context in one request and instructs Gemini to:

1. Prioritize urgency first, then importance, then effort fit
2. Respect dependencies
3. Pick one best next task
4. Return micro-actions, estimated time, and motivation in strict JSON

## 7) Demo Flow

1. Add tasks (deadline/priority/estimate/dependency optional)
2. Set context (available minutes + energy)
3. Click **Do Next Task**
4. Complete micro-actions via button or hotkeys `1-9`

## Notes

- If Gemini key is missing or API fails, backend falls back to a deterministic prioritizer so your demo still works.
- Designed for fast hackathon iteration and easy deployment.

## 8) Auto Deploy on Every Push (GitHub Actions)

This repo includes workflow: `.github/workflows/deploy-azure.yml`.

On every push to `main`, it will:
1. Build Docker image
2. Push image to Docker Hub
3. Update Azure Web App container image

### Required GitHub repository secrets

Set these in: **GitHub Repo → Settings → Secrets and variables → Actions**

- `DOCKERHUB_USERNAME` (example: `devshad`)
- `DOCKERHUB_TOKEN` (Docker Hub access token)
- `AZURE_WEBAPP_NAME` (example: `donext-ai-api-fgdsa0g4d4gzdngs`)
- `AZURE_WEBAPP_PUBLISH_PROFILE` (download from Azure Web App → Get publish profile)

### One-time Azure app settings

These are not set by workflow and should stay in Azure Web App Environment Variables:

- `GEMINI_API_KEY`
- `GEMINI_MODEL=gemini-2.0-flash`
- `CORS_ORIGINS=https://<your-webapp-domain>`
- `WEBSITES_PORT=8000`
