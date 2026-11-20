import io
import json
from collections import Counter
from statistics import mean
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends, HTTPException, Response
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer

from .auth import current
from .db import transaction, now
from .interviews import state, deadline

router = APIRouter(prefix="/api")
DIMS = ["relevance", "accuracy", "communication", "structure", "coverage", "fluency"]


def average(numbers):
    values = [x for x in numbers if x is not None]
    return round(mean(values), 1) if values else None


def summarize(record):
    answers = [t for t in record["turns"] if t["evaluation"]]
    for t in answers:
        t["score"] = average(t["evaluation"].get(k) for k in DIMS)
    categories = {k: average(t["evaluation"].get(k) for t in answers) for k in DIMS}
    ranked = sorted(answers, key=lambda t: t["score"])
    recommendations = list(
        dict.fromkeys(s for t in ranked for s in t["evaluation"]["suggestions"])
    )[:5]
    return {
        "id": record["id"],
        "started": record["started"],
        "ended": record["ended"],
        "target": record["context"]["target"],
        "config": record["config"],
        "duration_seconds": max(
            0, (record["ended"] or min(now(), deadline(record))) - record["started"]
        ),
        "score": average(t["score"] for t in answers),
        "categories": categories,
        "answers": answers,
        "strongest": ranked[-1]["position"] if ranked else None,
        "weakest": ranked[0]["position"] if ranked else None,
        "recommendations": recommendations,
        "skills": sorted(
            {s for t in answers for s in t["evaluation"]["covered_skills"]}
        ),
        "required_skills": [m["skill"] for m in record["context"].get("matches", [])],
    }


def reports(user):
    with transaction() as db:
        records = db.all(
            "SELECT id FROM interviews WHERE user_id=? ORDER BY started,id", user["id"]
        )
        return [summarize(state(db, r["id"], user)) for r in records]


@router.get("/results/history")
def history(user=Depends(current)):
    return [
        {
            k: v
            for k, v in r.items()
            if k not in ("answers", "recommendations", "skills", "required_skills")
        }
        for r in reversed(reports(user))
    ]


@router.get("/analytics/dashboard")
@router.get("/analytics/progress")
def progress(user=Depends(current)):
    completed = [r for r in reports(user) if r["ended"]]
    scored = [r for r in completed if r["score"] is not None]
    low = sorted([t for r in scored for t in r["answers"]], key=lambda t: t["score"])
    skills = {}
    for report in scored:
        for answer in report["answers"]:
            for skill in answer["evaluation"]["covered_skills"]:
                skills.setdefault(skill, []).append(answer["evaluation"]["coverage"])
    return {
        "completed": len(completed),
        "average": average(r["score"] for r in scored),
        "readiness": average(r["score"] for r in scored[-3:]),
        "categories": {k: average(r["categories"][k] for r in scored) for k in DIMS},
        "trend": [
            {"date": r["started"], "score": r["score"], **r["categories"]}
            for r in scored
        ],
        "recommendations": list(
            dict.fromkeys(s for t in low for s in t["evaluation"]["suggestions"])
        )[:4],
        "weak_topics": Counter(
            t["evaluation"]["topic"] for t in low if t["score"] < 60
        ).most_common(5),
        "skills": sorted(
            ((k, average(v)) for k, v in skills.items()), key=lambda x: -x[1]
        ),
    }


@router.get("/results/{ident}")
def result(ident: str, user=Depends(current)):
    with transaction() as db:
        record = state(db, ident, user)
    if not record["ended"]:
        raise HTTPException(409, "End this session to generate a report.")
    return summarize(record)


@router.delete("/interview/{ident}")
def remove(ident: str, user=Depends(current)):
    with transaction() as db:
        if not db.execute(
            "DELETE FROM interviews WHERE id=? AND user_id=?", ident, user["id"]
        ).rowcount:
            raise HTTPException(404, "Session not found.")
    return {"ok": True}


@router.get("/results/{ident}/download")
def download(ident: str, user=Depends(current)):
    r = result(ident, user)
    output = io.BytesIO()
    styles = getSampleStyleSheet()
    flow = []

    def add(value, style="BodyText"):
        flow.extend([Paragraph(escape(str(value)), styles[style]), Spacer(1, 5)])

    add("TALQY | Interview report", "Title")
    add(r["target"]["role"] + " · " + r["config"]["category"], "Heading2")
    add("Overall score: " + str(r["score"] if r["score"] is not None else "Unscored"))
    for k, v in r["categories"].items():
        if v is not None:
            add(f"{k.title()}: {v}/100")
    add("Coaching priorities", "Heading2")
    for s in r["recommendations"]:
        add(s)
    add("JD skills discussed: " + ", ".join(r["skills"]))
    for t in r["answers"]:
        e = t["evaluation"]
        add(f'Question {t["position"]} · {t["score"]}/100', "Heading2")
        add(t["question"])
        add("Your answer: " + t["answer"])
        for k in ["strengths", "missing", "suggestions"]:
            add(k.title() + ": " + " ".join(e[k]))
        if t["delivery"]:
            add("Observed delivery: " + json.dumps(t["delivery"], ensure_ascii=False))
        add("Sample answer for practice: " + e["sample"])
    SimpleDocTemplate(output).build(flow)
    return Response(
        output.getvalue(),
        media_type="application/pdf",
        headers={
            "Content-Disposition": 'attachment; filename="TALQY-interview-report.pdf"'
        },
    )
