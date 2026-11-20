# TALQY architecture and implementation plan

The browser serves a React workspace built by Vite. A same-origin proxy sends /api traffic to FastAPI. The API owns authentication, document validation, interview state and scoring. PostgreSQL holds private documents and results. SQLite supports single-machine development and isolated tests. Both use foreign keys and parameterized queries through a small repository adapter.

## Data relationships
A user has revocable login sessions, password reset tokens, documents, analyses and interviews. An analysis records the input document IDs, target role and extracted profile. Each interview snapshots its analysis so replacing a resume does not change historical reports. Each turn stores one question, one reviewed answer, its evaluation and optional delivery measurements. A recording is scoped to its interview and turn. Final reports aggregate only submitted, evaluated answers. Empty or abandoned interviews have no score.

## Candidate journey and pages
Home → sign up/sign in → dashboard → upload resume and upload/paste job description → preview and analyze → configure role-specific interview → answer and review transcript → submit → adaptive follow-up or completion → report and PDF. History reopens interviews and reports. Analytics compares completed sessions. Profile manages identity, credentials and documents.

## AI choices
A configurable OpenAI-compatible chat endpoint extracts evidence, chooses questions and evaluates answers using a shared rubric. Pretrained embeddings measure semantic similarity between documents and between an answer and a question. Choose hosted embeddings for low installation cost or local MiniLM for local vector inference. Cosine similarity is context for the evaluator, never a substitute for a correctness score. Whisper returns timestamped transcripts. Segment gaps and transcript counts support observable delivery metrics. No webcam or psychological inference is required.

## Implementation order
1. Create schema, password and session management, document ingestion and permission checks.
2. Integrate model calls, validate responses, implement transactional turn progression and aggregation.
3. Build public pages, authenticated workflow, microphone controls and charts.
4. Exercise the API with isolated test data, check package contents and document live-provider acceptance tests.
