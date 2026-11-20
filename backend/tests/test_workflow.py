"""Contract fixtures are test-only. Use TALQY_TEST_DATABASE_URL for a disposable Postgres DB."""

import io
import json
import os
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch, MagicMock

temp = tempfile.TemporaryDirectory()
os.environ.update(
    JWT_SECRET="isolated-integration-suite-" + uuid.uuid4().hex,
    COOKIE_SECURE="false",
    APP_ORIGIN="http://testserver",
    DATABASE_URL=os.getenv(
        "TALQY_TEST_DATABASE_URL", "sqlite:///" + str(Path(temp.name) / "tests.db")
    ),
)
from fastapi.testclient import TestClient
from fastapi import HTTPException
from docx import Document
import fitz
from app.main import app
from app import ai
from app.db import transaction, now


class Workflow(unittest.TestCase):
    def setUp(self):
        self.c = TestClient(app)
        self.c.__enter__()
        self.addCleanup(self.c.__exit__, None, None, None)
        self.creds = {
            "email": uuid.uuid4().hex + "@example.test",
            "password": "test-password-01",
        }
        self.user = self.register(self.c, self.creds)
        self.calls = []
        self.provider = patch.object(ai, "request", side_effect=self.contract)
        self.provider.start()
        self.addCleanup(self.provider.stop)

    def register(self, client, creds):
        r = client.post(
            "/api/auth/register",
            json={
                **creds,
                "name": "Studio Tester",
                "confirm_password": creds["password"],
            },
        )
        self.assertEqual(r.status_code, 201, r.text)
        return r.json()

    def contract(self, path, **kwargs):
        if path == "/embeddings":
            return {
                "data": [
                    {"index": 0, "embedding": [0, 1]},
                    {"index": 1, "embedding": [1, 1]},
                ]
            }
        if path == "/audio/transcriptions":
            return {
                "text": "I used SQL indexes",
                "duration": 5,
                "segments": [{"start": 0, "end": 2}, {"start": 3.5, "end": 5}],
            }
        system, payload = kwargs["json"]["messages"]
        data = json.loads(payload["content"])
        self.calls.append(data)
        if "job_description" in data:
            out = dict(
                resume={"projects": ["query tuning"]},
                job_description={"required": ["SQL"]},
                matches=[
                    dict(skill="SQL", level="Strong match", evidence="Indexed queries")
                ],
                strengths=["Indexes"],
                gaps=[],
                projects=["query tuning"],
                topics=["SQL"],
            )
        elif "history" in data:
            out = {
                "question": (
                    "Why did you use indexes?"
                    if data["history"]
                    else "Describe your query project."
                )
            }
        else:
            out = dict(
                relevance=80,
                accuracy=70,
                communication=75,
                structure=65,
                coverage=70,
                fluency=65 if data["delivery"] else None,
                strengths=["Relevant example"],
                missing=["Benchmark"],
                suggestions=["Compare query latency."],
                sample="Describe the query plan and compare timings.",
                topic="SQL",
                covered_skills=["SQL"],
            )
        return {"choices": [{"message": {"content": json.dumps(out)}}]}

    def prepare(self):
        doc = Document()
        doc.add_paragraph("I built a query indexing project using SQL.")
        b = io.BytesIO()
        doc.save(b)
        res = self.c.post(
            "/api/documents/upload-resume",
            files={"file": ("resume.docx", b.getvalue())},
        )
        self.assertEqual(res.status_code, 200, res.text)
        self.resume = res.json()["id"]
        with fitz.open() as pdf:
            pdf.new_page().insert_text(
                (40, 80), "This role requires SQL and query tuning experience."
            )
            raw = pdf.tobytes()
        jd = self.c.post(
            "/api/documents/upload-job-description", files={"file": ("job.pdf", raw)}
        ).json()
        self.analysis = self.c.post(
            "/api/documents/analyze",
            json=dict(
                resume=self.resume,
                jd=jd["id"],
                role="Data engineer",
                experience="Entry Level",
                category="Technical",
            ),
        ).json()
        return self.analysis

    def start(self):
        self.prepare()
        r = self.c.post(
            "/api/interview/start",
            json=dict(
                analysis_id=self.analysis["id"],
                category="Technical",
                difficulty="Intermediate",
                duration=10,
                count=5,
                mode="Voice",
            ),
        )
        self.assertEqual(r.status_code, 201, r.text)
        return r.json()

    def test_voice_text_adaptive_history_pdf(self):
        room = self.start()
        ident = room["id"]
        turn = room["turns"][0]["id"]
        root = "/api/interview/" + ident
        file = {"file": ("response.webm", b"\x1aE\xdf\xa3test-only-container")}
        rec = self.c.post(
            "/api/audio/transcribe",
            files=file,
            data={"interview_id": ident, "turn_id": turn},
        ).json()
        self.assertEqual(rec["metrics"]["segment_gaps_over_1s"], 1)
        answer = dict(
            turn_id=turn, text=rec["text"] + " for filtering.", recording_id=rec["id"]
        )
        nxt = self.c.post(root + "/answer", json=answer)
        self.assertEqual(nxt.status_code, 200, nxt.text)
        self.assertEqual(self.calls[-1]["history"][-1]["answer"], answer["text"])
        self.assertEqual(nxt.json()["turns"][0]["evaluation"]["fluency"], 65)
        self.assertEqual(
            self.c.post(root + "/answer", json=answer).json()["revision"], 1
        )
        for i in range(4):
            turn = nxt.json()["turns"][-1]["id"]
            nxt = self.c.post(
                root + "/answer",
                json={
                    "turn_id": turn,
                    "text": "I compared query plans before and after adding indexes.",
                },
            )
            self.assertEqual(nxt.status_code, 200, nxt.text)
        self.assertTrue(nxt.json()["ended"])
        report = self.c.get("/api/results/" + ident).json()
        self.assertEqual(len(report["answers"]), 5)
        self.assertIsNone(report["answers"][1]["evaluation"]["fluency"])
        self.assertEqual(self.c.get("/api/analytics/progress").json()["completed"], 1)
        self.assertEqual(
            self.c.get("/api/results/history").json()[0]["score"], report["score"]
        )
        pdf = self.c.get("/api/results/" + ident + "/download")
        with fitz.open(stream=pdf.content, filetype="pdf") as document:
            self.assertIn("Coaching priorities", document[0].get_text())
        self.assertEqual(
            self.c.delete("/api/documents/" + self.resume).status_code, 200
        )
        self.assertEqual(self.c.get("/api/results/" + ident).status_code, 200)
        self.assertEqual(self.c.delete(root).status_code, 200)
        self.assertEqual(self.c.get("/api/results/history").json(), [])

    def test_failure_and_early_finish(self):
        room = self.start()
        base = "/api/interview/" + room["id"]
        with patch.object(
            ai, "question", side_effect=HTTPException(502, "provider timeout")
        ):
            r = self.c.post(
                base + "/answer",
                json={"turn_id": room["turns"][0]["id"], "text": "Query tuning"},
            )
            self.assertEqual(r.status_code, 502)
        self.assertIsNone(self.c.get(base).json()["turns"][0]["answer"])
        self.assertEqual(self.c.post(base + "/end").status_code, 200)
        self.assertIsNone(self.c.get("/api/results/" + room["id"]).json()["score"])

    def test_owner_isolation_and_validation(self):
        room = self.start()
        with TestClient(app) as other:
            self.register(
                other,
                dict(
                    email=uuid.uuid4().hex + "@example.test",
                    password="other-password-01",
                ),
            )
            for path in [
                "/interview/" + room["id"],
                "/documents/analysis/" + self.analysis["id"],
                "/results/" + room["id"] + "/download",
            ]:
                self.assertEqual(other.get("/api" + path).status_code, 404)
            self.assertEqual(
                other.delete("/api/documents/" + self.resume).status_code, 404
            )
        self.assertEqual(
            self.c.post(
                "/api/documents/upload-resume", files={"file": ("bad.pdf", b"bad")}
            ).status_code,
            422,
        )
        self.assertEqual(
            self.c.post(
                "/api/documents/paste",
                json={"text": "The candidate should understand database indexing."},
            ).status_code,
            200,
        )
        self.assertEqual(
            self.c.post(
                "/api/auth/logout", headers={"origin": "https://invalid.test"}
            ).status_code,
            403,
        )
        self.assertEqual(
            self.c.get("/api/documents/analysis").json()["id"], self.analysis["id"]
        )

    def test_account_and_revocation(self):
        self.assertEqual(self.c.get("/api/auth/me").json()["id"], self.user["id"])
        self.assertEqual(
            self.c.post(
                "/api/auth/register",
                json={
                    **self.creds,
                    "name": "Again",
                    "confirm_password": self.creds["password"],
                },
            ).status_code,
            409,
        )
        self.assertEqual(
            self.c.put(
                "/api/profile",
                json={
                    "name": "Test User",
                    "role": "Engineer",
                    "experience": "Experienced",
                },
            ).json()["role"],
            "Engineer",
        )
        old = self.c.cookies.get("talqy")
        self.c.post("/api/auth/logout")
        self.c.cookies.set("talqy", old)
        self.assertEqual(self.c.get("/api/profile").status_code, 401)
        self.c.cookies.clear()
        self.assertEqual(
            self.c.post("/api/auth/login", json=self.creds).status_code, 200
        )
        self.assertEqual(
            self.c.post(
                "/api/profile/password",
                json={
                    "current": self.creds["password"],
                    "password": "a-new-password-09",
                },
            ).status_code,
            200,
        )
        self.assertEqual(
            self.c.request(
                "DELETE", "/api/profile", json={"current": "a-new-password-09"}
            ).status_code,
            200,
        )
        self.assertEqual(self.c.get("/api/profile").status_code, 401)

    def test_email_reset(self):
        mail = MagicMock()
        with patch.dict(os.environ, {"SMTP_HOST": "mail.test"}), patch(
            "app.auth.smtplib.SMTP", return_value=mail
        ):
            self.assertEqual(
                self.c.post(
                    "/api/auth/forgot", json={"email": self.creds["email"]}
                ).status_code,
                200,
            )
        message = mail.__enter__.return_value.send_message.call_args.args[0]
        token = message.get_content().strip().split("token=")[1]
        data = {"token": token, "password": "different-password"}
        self.assertEqual(self.c.post("/api/auth/reset", json=data).status_code, 200)
        self.assertEqual(self.c.post("/api/auth/reset", json=data).status_code, 400)
        self.assertEqual(self.c.get("/api/profile").status_code, 401)

    def test_timeout(self):
        room = self.start()
        with transaction() as db:
            db.execute(
                "UPDATE interviews SET started=? WHERE id=?", now() - 700, room["id"]
            )
        base = "/api/interview/" + room["id"]
        self.assertEqual(
            self.c.post(
                base + "/answer",
                json={"turn_id": room["turns"][0]["id"], "text": "Late answer"},
            ).status_code,
            409,
        )
        self.assertEqual(self.c.post(base + "/end").status_code, 200)

    def test_empty_and_malformed_provider(self):
        self.assertEqual(self.c.get("/api/analytics/dashboard").json()["trend"], [])
        with patch.object(ai, "request", return_value={"choices": []}):
            with self.assertRaises(HTTPException) as err:
                ai.question({}, {}, [])
            self.assertEqual(err.exception.status_code, 502)
