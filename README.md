# TALQY — An AI-Powered Smart Interview Coach

TALQY turns a resume and a job description into an adaptive practice interview. The candidate can record an answer, edit the Whisper transcript or type a response. After submission the coach evaluates the answer, asks a contextual follow-up and saves the result. Each completed session has a downloadable PDF and contributes to the candidate’s dashboard.

## Run on Windows, macOS or Linux with Docker

Use Docker Desktop with Compose, Python 3 and a provider account with chat, embedding and transcription access. The default settings target the OpenAI API. Usage incurs the provider's normal charges.

1. Extract this archive and open a terminal in the TALQY directory.
2. Run `python configure.py` (on Windows, `py configure.py` also works). This creates a local .env with a fresh password and signing secret.
3. Open .env and set AI_API_KEY. Keep it server-side. If using another compatible endpoint, also change AI_BASE_URL and the three model names.
4. Run `docker compose up --build`.
5. Open **http://localhost:8000**. Create an account, select **New interview**, upload a readable resume and paste or upload a JD. Choose **Analyze profile**, review the evidence and select **Proceed to interview**.
6. Pick the duration, count, difficulty, category and answer mode. Enable microphone access when recording. Stop, review the transcript and submit. End the interview to view the scores, coaching and PDF.

Interactive API documentation is at **http://localhost:8000/docs**. Development password-reset messages arrive in **http://localhost:8025**, the local Mailpit inbox. Compose publishes both services on loopback. Postgres persists in the named talqy_db volume. Use `docker compose stop` to stop the app while retaining data.

## Run the prebuilt frontend with Python

The archive includes a built copy of the frontend under backend/public. For a quick local demonstration with SQLite, run configure.py, fill in .env, leave APP_ORIGIN=http://localhost:8000, create and activate the Python environment as described below, then run the backend installation and Uvicorn commands. Open http://localhost:8000. This path needs no Node process. Configure reachable SMTP separately for password reset.

## Native development

Requires Python 3.12+, Node 22+ and npm. Run commands from the indicated directories. The native path defaults to a local SQLite file. Set DATABASE_URL to a PostgreSQL URL to exercise the same ORM schema on PostgreSQL.

From the project root:

```sh
python configure.py
python -m venv .venv
```

Activate the environment with `.venv\Scripts\Activate.ps1` in PowerShell or `source .venv/bin/activate` in bash. Edit .env, set APP_ORIGIN=http://localhost:5173 and set AI_API_KEY. For email, set a reachable SMTP host or start the Compose mail service and expose its SMTP port locally. Then run:

```sh
cd backend
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --env-file ../.env --reload
```

In a second terminal:

```sh
cd frontend
npm ci
npm run dev
```

Open http://localhost:5173. Vite forwards /api requests to the backend. Both services must run. For the production asset build, run `npm run build` in frontend. Docker copies these assets into the FastAPI image and provides SPA route fallback.

## Configuration

| Variable | Purpose |
|---|---|
| JWT_SECRET | Signing secret of at least 32 characters. configure.py generates it. Rotating it invalidates active tokens. |
| POSTGRES_PASSWORD | Generated database credential used by Compose. |
| DATABASE_URL | Native database URL, e.g. postgresql://user:password@localhost:5432/talqy. Compose sets this automatically. |
| APP_ORIGIN | Exact browser origin, including scheme and port, without a trailing slash. |
| COOKIE_SECURE | false for local HTTP. Use true behind HTTPS. |
| AI_API_KEY / AI_BASE_URL | Server-only credential and compatible API root ending in /v1. |
| CHAT_MODEL | Model supporting chat completions with JSON output. |
| EMBEDDINGS_MODE / EMBEDDING_MODEL | hosted calls the embeddings endpoint. local loads all-MiniLM-L6-v2. |
| WHISPER_MODEL | Transcription model supporting verbose_json and timestamped segments. |
| SMTP_HOST / SMTP_PORT / SMTP_TLS | Password reset email transport. The bundled mail catcher uses mail:1025 with TLS disabled. |
| SMTP_FROM / SMTP_USER / SMTP_PASSWORD | Sender address and optional SMTP authentication. Use a verified sender for externally delivered mail. |
| VITE_CONTACT_EMAIL | Optional real support address shown in the footer. Set before the frontend build. For native Vite development set it in frontend/.env.local. |
| API_PROXY | Optional backend origin for the Vite development proxy. |

For local embeddings, install `python -m pip install sentence-transformers` in the backend environment and set EMBEDDINGS_MODE=local. The first run downloads the model weights. For Docker, add this dependency to backend/requirements.txt and rebuild. Chat and Whisper still require the configured provider. Uploaded originals and extracted text are held in the account-owned database. Audio is forwarded for transcription and its bytes are discarded after processing. The original transcript and delivery observations are retained with the session. Account deletion cascades through all owned data.

## Scoring and interpretation

- The rubric scores relevance, accuracy, communication, structure and relevant skill coverage from 0 to 100. Voice answers add an observable fluency dimension. Behavioral questions may use STAR. Technical explanations are evaluated in context.
- Each answer score averages its applicable dimensions. The session score averages answered questions. Readiness averages the three most recent scored sessions. It is a practice trend, not a validated hiring prediction.
- Speech rate uses the recording duration. Pauses are estimated from consecutive Whisper segment timestamps. Filler counts include possible conversational uses. Edited transcripts change the evaluated content; delivery observations still describe the original recording.
- The semantic cosine uses a bounded text excerpt. The model receives the full accepted document text for evidence extraction. Missing resume evidence is recorded as limited evidence.
- Closing an interview before submitting any answer creates an unscored report. API failures leave the turn available for retry. Replaying the same successful submission returns the existing session state.
- The public interview-room preview and sample testimonial are illustrative. User dashboards start empty.

## Architecture and API

See docs/architecture.md and docs/openapi.json. The live /docs interface includes request and response schemas, field constraints and multipart inputs. Authentication uses an HttpOnly same-site cookie. Protected resources look up the authenticated owner on each request.

| Area | Main endpoints under /api |
|---|---|
| Authentication | POST /auth/register, /auth/login, /auth/logout, /auth/forgot, /auth/reset. GET /auth/me. |
| Documents | POST /documents/upload-resume, /documents/upload-job-description, /documents/paste, /documents/analyze. GET /documents, /documents/analysis, /documents/analysis/{id}. DELETE /documents/{id}. |
| Interview | POST /interview/start creates the session and its first question. GET /interview/{id}. POST /interview/{id}/answer evaluates and advances atomically. POST /interview/{id}/end. DELETE /interview/{id}. |
| Audio | POST /audio/transcribe accepts file, interview_id and turn_id. Returns reviewed-answer input text, a recording ID and delivery measurements. |
| Results | GET /results/history, /results/{id}, /results/{id}/download, /analytics/dashboard, /analytics/progress. |
| Profile | GET, PUT or DELETE /profile. POST /profile/password. |
| Health | GET /health. |

## Verification

From backend, run `python -m unittest discover -s tests -v`. Seven integration scenarios exercise registration, duplicate email, sign-in, revocation, password reset, private data access, PDF and DOCX extraction, pasted text, adaptive voice/text progression, transcript review, JSON evaluation validation, retry, expiration, historical aggregation, PDF output and deletion. Tests use a temporary SQLite database by default. To test PostgreSQL, set TALQY_TEST_DATABASE_URL to a **disposable** PostgreSQL database. The suite creates accounts and interview data there.

Provider responses and SMTP delivery are fixtures in these tests. Production routes always call the configured services. The frontend production build, landing-page render and both SQLite and PostgreSQL integration suites were verified during implementation.

From frontend, run `npm test`. Three component integration tests exercise registration and redirect, recording controls and microphone track cleanup, transcription review, submission of an edited answer, rendering the next question, and text fallback after microphone denial. These use simulated browser audio and HTTP responses.

### Live acceptance check

1. Register two disposable accounts. In account A upload a short resume with a named project and paste a JD. Check the extracted project and skill evidence.
2. Run a five-question interview. Mention one specific technical decision in the first voice answer. Verify the transcript, edit a word, submit and compare the next question with the submitted answer.
3. Switch to text for the next answer and check that it receives no voice score. End the session and download the PDF. Compare the original answers, scores, coaching and chart with the report.
4. Refresh, reopen the session from history and sign in to account B. Verify account B starts empty.
5. Trigger a password reset and open the message in the local mail inbox. Stop and restart Compose and verify account A's history persists.

Live provider output, physical microphone capture and Docker Compose startup require validation on the target machine. The project has been tested as a development build. Before public deployment, configure TLS, real outbound mail, provider spending limits, ingress body-size and rate limits, database backups and a retention policy for candidate documents.
