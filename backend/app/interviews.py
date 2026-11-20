import json
from typing import Literal

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

from . import ai
from .auth import current
from .documents import Category
from .db import transaction, uid, now

router = APIRouter(prefix="/api")


class Start(BaseModel):
    analysis_id: str
    duration: Literal[10, 15, 20, 30]
    count: Literal[5, 10, 15]
    difficulty: Literal["Beginner", "Intermediate", "Advanced"]
    mode: Literal["Voice", "Text"]
    category: Category


class Answer(BaseModel):
    turn_id: str
    text: str = Field(min_length=1, max_length=10000)
    recording_id: str | None = None


def owned(db, ident, user):
    record = db.one(
        "SELECT * FROM interviews WHERE id=? AND user_id=?", ident, user["id"]
    )
    if not record:
        raise HTTPException(404, "Interview not found.")
    record["context"] = json.loads(record["context"])
    record["config"] = json.loads(record["config"])
    return record


def turns(db, ident):
    rows = db.all("SELECT * FROM turns WHERE interview_id=? ORDER BY position", ident)
    for row in rows:
        for key in ("evaluation", "delivery"):
            row[key] = json.loads(row[key]) if row[key] else None
    return rows


def deadline(record):
    return record["started"] + 60 * record["config"]["duration"]


def state(db, ident, user):
    record = owned(db, ident, user)
    expires = deadline(record)
    if not record["ended"] and now() >= expires:
        db.execute(
            "UPDATE interviews SET ended=?,revision=revision+1 WHERE id=? AND ended IS NULL",
            expires,
            ident,
        )
        record = owned(db, ident, user)
    return {**record, "deadline": expires, "turns": turns(db, ident)}


@router.post("/interview/start", status_code=201)
def start(data: Start, user=Depends(current)):
    with transaction() as db:
        row = db.one(
            "SELECT data FROM analyses WHERE id=? AND user_id=?",
            data.analysis_id,
            user["id"],
        )
    if not row:
        raise HTTPException(404, "Analyze your documents first.")
    context, config = json.loads(row["data"]), data.model_dump(exclude={"analysis_id"})
    first = ai.question(context, config, [])
    ident = uid()
    with transaction() as db:
        db.execute(
            "INSERT INTO interviews(id,user_id,context,config,started) VALUES(?,?,?,?,?)",
            ident,
            user["id"],
            row["data"],
            json.dumps(config),
            now(),
        )
        db.execute(
            "INSERT INTO turns(id,interview_id,position,question) VALUES(?,?,?,?)",
            uid(),
            ident,
            1,
            first,
        )
        return state(db, ident, user)


@router.get("/interview/{ident}")
def get(ident: str, user=Depends(current)):
    with transaction() as db:
        return state(db, ident, user)


@router.post("/interview/{ident}/end")
def end(ident: str, user=Depends(current)):
    with transaction() as db:
        record = owned(db, ident, user)
        db.execute(
            "UPDATE interviews SET ended=?,revision=revision+1 WHERE id=? AND ended IS NULL",
            min(now(), deadline(record)),
            ident,
        )
        return state(db, ident, user)


@router.post("/interview/{ident}/answer")
def answer(ident: str, data: Answer, user=Depends(current)):
    with transaction() as db:
        record = state(db, ident, user)
        last = record["turns"][-1]
        previous = next(
            (
                t
                for t in record["turns"]
                if t["id"] == data.turn_id and t["answer"] == data.text.strip()
            ),
            None,
        )
        if previous:
            return record
        if record["ended"] or now() >= record["deadline"] or last["id"] != data.turn_id:
            raise HTTPException(
                409, "Interview has ended or advanced. Refresh the room."
            )
        if not data.text.strip():
            raise HTTPException(422, "Enter a response first.")
        delivery = None
        if data.recording_id:
            rec = db.one(
                "SELECT metrics FROM recordings WHERE id=? AND turn_id=?",
                data.recording_id,
                last["id"],
            )
            if not rec:
                raise HTTPException(422, "Recording does not belong to this question.")
            delivery = json.loads(rec["metrics"])
    config = record["config"]
    evaluation = ai.evaluate(
        record["context"], config, last["question"], data.text.strip(), delivery
    )
    history = [
        {
            "question": t["question"],
            "answer": t["answer"],
            "topic": (t["evaluation"] or {}).get("topic"),
        }
        for t in record["turns"]
    ]
    history[-1].update(answer=data.text.strip(), evaluation=evaluation)
    next_question = None
    if len(history) < config["count"] and now() < record["deadline"]:
        next_question = ai.question(record["context"], config, history)
    with transaction() as db:
        changed = db.execute(
            "UPDATE interviews SET revision=revision+1 WHERE id=? AND ended IS NULL AND revision=?",
            ident,
            record["revision"],
        )
        if not changed.rowcount:
            fresh = state(db, ident, user)
            if any(
                t["id"] == data.turn_id and t["answer"] == data.text.strip()
                for t in fresh["turns"]
            ):
                return fresh
            raise HTTPException(409, "Interview changed. Refresh the room.")
        db.execute(
            "UPDATE turns SET answer=?,evaluation=?,delivery=? WHERE id=?",
            data.text.strip(),
            json.dumps(evaluation),
            json.dumps(delivery),
            last["id"],
        )
        if next_question and now() < record["deadline"]:
            db.execute(
                "INSERT INTO turns(id,interview_id,position,question) VALUES(?,?,?,?)",
                uid(),
                ident,
                len(history) + 1,
                next_question,
            )
        else:
            db.execute(
                "UPDATE interviews SET ended=? WHERE id=?",
                min(now(), record["deadline"]),
                ident,
            )
        return state(db, ident, user)


@router.post("/audio/transcribe")
def audio(
    file: UploadFile,
    interview_id: str = Form(...),
    turn_id: str = Form(...),
    user=Depends(current),
):
    with transaction() as db:
        record = state(db, interview_id, user)
        if (
            record["ended"]
            or now() >= record["deadline"]
            or turn_id != record["turns"][-1]["id"]
        ):
            raise HTTPException(409, "Recording window closed.")
    blob = file.file.read(20_000_001)
    if len(blob) > 20_000_000:
        raise HTTPException(413, "Maximum audio size is 20 MB.")
    if blob.startswith(b"\x1aE\xdf\xa3"):
        name, mime = "answer.webm", "audio/webm"
    elif blob[4:8] == b"ftyp":
        name, mime = "answer.mp4", "audio/mp4"
    elif blob[:4] == b"RIFF" and blob[8:12] == b"WAVE":
        name, mime = "answer.wav", "audio/wav"
    else:
        raise HTTPException(422, "Use WebM, MP4 or WAV audio.")
    transcript, metrics = ai.transcribe(name, mime, blob)
    ident = uid()
    with transaction() as db:
        db.execute(
            "INSERT INTO recordings VALUES(?,?,?,?)",
            ident,
            turn_id,
            transcript,
            json.dumps(metrics),
        )
    return {"id": ident, "text": transcript, "metrics": metrics}
