import json
import os
from datetime import datetime, timezone
from typing import Literal

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv()

app = FastAPI(title="DoNext AI API", version="1.0.0")


def _allowed_origins() -> list[str]:
    origins = os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    )
    return [item.strip() for item in origins.split(",") if item.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Task(BaseModel):
    id: str
    title: str = Field(min_length=1)
    deadline: str | None = None
    priority: Literal["low", "medium", "high"] = "medium"
    estimated_minutes: int | None = None
    depends_on_task_id: str | None = None
    done: bool = False


class UserContext(BaseModel):
    available_minutes: int | None = None
    energy_level: Literal["low", "medium", "high"] = "medium"


class NextTaskRequest(BaseModel):
    tasks: list[Task]
    user_context: UserContext = UserContext()


class NextTaskResponse(BaseModel):
    next_task_id: str
    next_task_title: str
    why: str
    steps: list[str]
    estimated_minutes: int
    motivation: str


def _priority_score(priority: str) -> int:
    return {"high": 30, "medium": 15, "low": 5}.get(priority, 10)


def _urgency_score(deadline: str | None) -> int:
    if not deadline:
        return 0
    try:
        due = datetime.fromisoformat(deadline)
        if due.tzinfo is None:
            due = due.replace(tzinfo=timezone.utc)
        hours_left = (due - datetime.now(timezone.utc)).total_seconds() / 3600
    except ValueError:
        return 0

    if hours_left <= 0:
        return 60
    if hours_left <= 24:
        return 45
    if hours_left <= 72:
        return 25
    if hours_left <= 168:
        return 12
    return 3


def _effort_fit_score(task: Task, context: UserContext) -> int:
    if task.estimated_minutes is None or context.available_minutes is None:
        return 5

    if task.estimated_minutes <= context.available_minutes:
        return 12

    over_by = task.estimated_minutes - context.available_minutes
    if over_by <= 15:
        return 4
    return -8


def _energy_fit_score(task: Task, context: UserContext) -> int:
    if context.energy_level == "high":
        return 6

    estimate = task.estimated_minutes or 25
    if context.energy_level == "low":
        return 10 if estimate <= 30 else -6
    return 4 if estimate <= 60 else 0


def _has_unfinished_dependency(task: Task, tasks: list[Task]) -> bool:
    if not task.depends_on_task_id:
        return False
    for item in tasks:
        if item.id == task.depends_on_task_id:
            return not item.done
    return False


def _fallback_recommendation(request: NextTaskRequest) -> NextTaskResponse:
    candidates = [task for task in request.tasks if not task.done]
    if not candidates:
        raise HTTPException(status_code=400, detail="No pending tasks found")

    scored: list[tuple[Task, int]] = []
    for task in candidates:
        dependency_penalty = -100 if _has_unfinished_dependency(task, request.tasks) else 0
        score = (
            _urgency_score(task.deadline)
            + _priority_score(task.priority)
            + _effort_fit_score(task, request.user_context)
            + _energy_fit_score(task, request.user_context)
            + dependency_penalty
        )
        scored.append((task, score))

    scored.sort(key=lambda item: item[1], reverse=True)
    chosen = scored[0][0]

    estimated = chosen.estimated_minutes or 30
    steps = [
        f"Open all materials required for '{chosen.title}'.",
        "Work in a focused sprint for 15 minutes and complete the core part.",
        "Do a final review and submit/commit your progress.",
    ]

    return NextTaskResponse(
        next_task_id=chosen.id,
        next_task_title=chosen.title,
        why="Chosen by urgency first, then importance, effort fit, and dependency readiness.",
        steps=steps,
        estimated_minutes=estimated,
        motivation="Momentum beats perfection — start the first step right now.",
    )


def _extract_json(text: str) -> dict:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:].strip()
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("No JSON object found")
    return json.loads(cleaned[start : end + 1])


async def _gemini_recommendation(request: NextTaskRequest) -> NextTaskResponse:
    gemini_api_key = os.getenv("GEMINI_API_KEY")
    if not gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured")

    model = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

    prompt = (
        "You are a productivity coach.\n\n"
        "Analyze tasks and output ONLY valid JSON with this schema:\n"
        "{\n"
        '  "next_task_id": "string",\n'
        '  "next_task_title": "string",\n'
        '  "why": "string",\n'
        '  "steps": ["string", "string"],\n'
        '  "estimated_minutes": 30,\n'
        '  "motivation": "string"\n'
        "}\n\n"
        "Rules:\n"
        "- Prioritize urgency first, then importance, then effort fit.\n"
        "- Respect dependencies: avoid tasks blocked by unfinished dependencies.\n"
        "- Pick exactly one next task from the provided task ids.\n"
        "- Keep steps concise and actionable.\n\n"
        f"User context: {request.user_context.model_dump_json()}\n"
        f"Tasks: {json.dumps([t.model_dump() for t in request.tasks])}\n"
    )

    endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.2,
            "responseMimeType": "application/json",
        },
    }

    async with httpx.AsyncClient(timeout=12.0) as client:
        response = await client.post(
            endpoint,
            params={"key": gemini_api_key},
            json=payload,
        )

    if response.status_code >= 400:
        raise RuntimeError(f"Gemini request failed: {response.text}")

    data = response.json()
    text = (
        data.get("candidates", [{}])[0]
        .get("content", {})
        .get("parts", [{}])[0]
        .get("text", "")
    )

    parsed = _extract_json(text)
    return NextTaskResponse(**parsed)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/")
def root() -> dict[str, str]:
    return {"service": "DoNext AI API", "status": "ok"}


@app.post("/api/donext", response_model=NextTaskResponse)
async def do_next_task(request: NextTaskRequest) -> NextTaskResponse:
    if not request.tasks:
        raise HTTPException(status_code=400, detail="Task list is empty")

    pending_count = len([task for task in request.tasks if not task.done])
    if pending_count == 0:
        raise HTTPException(status_code=400, detail="All tasks are already done")

    try:
        return await _gemini_recommendation(request)
    except Exception:
        return _fallback_recommendation(request)
