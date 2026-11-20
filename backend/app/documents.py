import io
import json
import zipfile
from pathlib import Path
from typing import Literal

import fitz
from docx import Document
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from .models import Document as StoredDocument
from . import ai
from .auth import current, Experience
from .db import transaction, uid, now

router = APIRouter(prefix="/api/documents")
Category = Literal["HR", "Technical", "Behavioral", "Mixed"]
Kind = Literal["resume", "job-description"]


class Pasted(BaseModel):
    text: str = Field(min_length=20, max_length=50000)


class Analyze(BaseModel):
    resume: str
    jd: str
    role: str = Field(min_length=2, max_length=120)
    experience: Experience
    category: Category
    company: str = Field(default="", max_length=120)


def extract(name, blob):
    try:
        if Path(name).suffix.lower() == ".pdf" and blob.startswith(b"%PDF-"):
            with fitz.open(stream=blob, filetype="pdf") as pdf:
                if len(pdf) > 100:
                    raise ValueError()
                body = "\n".join(p.get_text() for p in pdf)
        elif Path(name).suffix.lower() == ".docx":
            with zipfile.ZipFile(io.BytesIO(blob)) as archive:
                if sum(f.file_size for f in archive.infolist()) > 30_000_000:
                    raise ValueError()
            doc = Document(io.BytesIO(blob))
            body = "\n".join(
                [p.text for p in doc.paragraphs]
                + [
                    cell.text
                    for t in doc.tables
                    for row in t.rows
                    for cell in row.cells
                ]
            )
        else:
            raise ValueError()
    except Exception:
        raise HTTPException(422, "Upload a readable PDF or DOCX under 100 pages.")
    body = body.replace("\x00", "").strip()
    if not 20 <= len(body) <= 50000:
        raise HTTPException(
            422,
            "Document needs 20–50,000 readable characters. Use a text-based PDF or DOCX.",
        )
    return body


def save(user, kind, name, blob, body):
    ident = uid()
    with transaction() as db:
        db.session.add(
            StoredDocument(
                id=ident,
                user_id=user["id"],
                kind=kind,
                name=name,
                body=body,
                original=blob,
                created=now(),
            )
        )
    return {"id": ident, "name": name, "kind": kind, "body": body}


@router.post("/upload-{kind}")
def upload(kind: Kind, file: UploadFile = File(...), user=Depends(current)):
    blob = file.file.read(5_000_001)
    if len(blob) > 5_000_000:
        raise HTTPException(413, "Maximum document size is 5 MB.")
    name = Path(file.filename or "").name[:200]
    return save(user, kind, name, blob, extract(name, blob))


@router.post("/paste")
def paste(data: Pasted, user=Depends(current)):
    return save(
        user, "job-description", "Pasted job description", data.text.encode(), data.text
    )


@router.get("")
def documents(user=Depends(current)):
    with transaction() as db:
        return db.all(
            "SELECT id,name,kind,created FROM docs WHERE user_id=? ORDER BY created DESC",
            user["id"],
        )


@router.delete("/{ident}")
def remove(ident: str, user=Depends(current)):
    with transaction() as db:
        if not db.execute(
            "DELETE FROM docs WHERE id=? AND user_id=?", ident, user["id"]
        ).rowcount:
            raise HTTPException(404, "Document not found.")
    return {"ok": True}


@router.post("/analyze")
def analyze(data: Analyze, user=Depends(current)):
    with transaction() as db:
        docs = [
            db.one(
                "SELECT body FROM docs WHERE id=? AND kind=? AND user_id=?",
                ident,
                kind,
                user["id"],
            )
            for ident, kind in [(data.resume, "resume"), (data.jd, "job-description")]
        ]
    if not all(docs):
        raise HTTPException(404, "Select both documents from your account.")
    target = data.model_dump(exclude={"resume", "jd"})
    profile = ai.analyze(docs[0]["body"], docs[1]["body"], target)
    ident = uid()
    with transaction() as db:
        db.execute(
            "INSERT INTO analyses VALUES(?,?,?,?,?,?)",
            ident,
            user["id"],
            data.resume,
            data.jd,
            json.dumps(profile),
            now(),
        )
    return {"id": ident, **profile}


@router.get("/analysis")
def latest(user=Depends(current)):
    with transaction() as db:
        row = db.one(
            "SELECT id,data FROM analyses WHERE user_id=? ORDER BY created DESC,id DESC LIMIT 1",
            user["id"],
        )
    return {"id": row["id"], **json.loads(row["data"])} if row else None


@router.get("/analysis/{ident}")
def analysis(ident: str, user=Depends(current)):
    with transaction() as db:
        row = db.one(
            "SELECT data FROM analyses WHERE id=? AND user_id=?", ident, user["id"]
        )
    if not row:
        raise HTTPException(404, "Analysis not found.")
    return {"id": ident, **json.loads(row["data"])}
