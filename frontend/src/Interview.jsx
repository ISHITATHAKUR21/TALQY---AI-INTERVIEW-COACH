import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { UploadCloud, Mic, Square, AudioLines, Timer } from "lucide-react";
import {
  api,
  upload,
  Select,
  Notice,
  useAction,
  useResource,
  Status,
  experiences,
  categories,
  Wave,
} from "./common";

function FileSlot({ kind, title, value, onChange, onPending }) {
  const [pct, setPct] = useState(0),
    { busy, error, run } = useAction();
  const input = useRef();
  async function receive(file) {
    if (!file || busy) return;
    onPending(true);
    setPct(0);
    await run(async () => {
      if (file.size > 5000000 || !/\.(pdf|docx)$/i.test(file.name))
        throw Error("Choose a PDF or DOCX under 5 MB.");
      const form = new FormData();
      form.append("file", file);
      onChange(await upload("/documents/upload-" + kind, form, setPct));
    });
    onPending(false);
    if (input.current) input.current.value = "";
  }
  return (
    <div className="slot">
      <h3>{title}</h3>
      <input
        ref={input}
        hidden
        type="file"
        accept=".pdf,.docx"
        onChange={(e) => receive(e.target.files[0])}
      />
      <button
        type="button"
        className="drop"
        disabled={busy}
        onClick={() => input.current.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          receive(e.dataTransfer.files[0]);
        }}
      >
        <UploadCloud />
        {busy
          ? "Uploading " + pct + "%"
          : value
            ? "Replace " + value.name
            : "Drop a file or browse"}
        <small>PDF or DOCX · 5 MB maximum</small>
      </button>
      {value && (
        <>
          <details>
            <summary>Preview extracted text</summary>
            <pre>{value.body}</pre>
          </details>
          <button
            className="link"
            type="button"
            onClick={() =>
              run(async () => {
                await api("/documents/" + value.id, "DELETE");
                onChange(null);
              })
            }
          >
            Remove document
          </button>
        </>
      )}
      <Notice error={error} />
    </div>
  );
}
export function Setup({ user }) {
  const [resume, setResume] = useState(null),
    [jd, setJd] = useState(null),
    [text, setText] = useState(""),
    [tab, setTab] = useState("Paste"),
    [report, setReport] = useState(null),
    [uploads, setUploads] = useState(0);
  const [target, setTarget] = useState({
      role: user.role,
      experience: user.experience,
      category: "Mixed",
      company: "",
    }),
    { busy, run, error } = useAction();
  function field(k, v) {
    setTarget({ ...target, [k]: v });
  }
  function pending(start) {
    setUploads((n) => n + (start ? 1 : -1));
  }
  async function analyze(e) {
    e.preventDefault();
    await run(async () => {
      const job =
        tab === "Paste" ? await api("/documents/paste", "POST", { text }) : jd;
      setReport(
        await api("/documents/analyze", "POST", {
          ...target,
          resume: resume.id,
          jd: job.id,
        }),
      );
    });
  }
  if (report)
    return (
      <>
        <p className="eyebrow">PROFILE ANALYSIS</p>
        <h1>Your interview focus</h1>
        <section className="panel">
          <h2>{report.target.role}</h2>
          <p>
            Your profile has been analyzed. TALQY has identified the most
            relevant interview topics based on your resume and target job
            description.
          </p>
          <h3>Skill evidence</h3>
          {report.matches.map((m, i) => (
            <div key={i} className="match">
              <b>{m.skill}</b>
              <span>{m.level}</span>
              <p>{m.evidence}</p>
            </div>
          ))}
          <p>
            Limited evidence means the resume supplied little detail about a
            skill.
          </p>
          {["strengths", "gaps", "projects", "topics"].map((k) => (
            <div key={k}>
              <h3>{k}</h3>
              <ul>
                {report[k].map((v, i) => (
                  <li key={i}>{v}</li>
                ))}
              </ul>
            </div>
          ))}
          <details>
            <summary>Extracted resume and job requirements</summary>
            {[report.resume, report.job_description].map((obj, i) => (
              <dl key={i}>
                {Object.entries(obj).map(([k, v]) => (
                  <React.Fragment key={k}>
                    <dt>{k}</dt>
                    <dd>{v.join(" · ") || "No evidence found"}</dd>
                  </React.Fragment>
                ))}
              </dl>
            ))}
          </details>
          <div className="actions">
            <Link
              className="btn primary"
              to={"/studio/config/" + report.id}
              state={report}
            >
              Proceed to interview
            </Link>
            <button onClick={() => setReport(null)}>Edit inputs</button>
          </div>
        </section>
      </>
    );
  return (
    <>
      <p className="eyebrow">NEW INTERVIEW</p>
      <h1>Prepare your session</h1>
      <p>
        Choose a role and add the documents you want your interviewer to use.
      </p>
      <form onSubmit={analyze} className="panel">
        <div className="grid2">
          <label>
            Target job role
            <input
              required
              minLength={2}
              maxLength={120}
              value={target.role}
              onChange={(e) => field("role", e.target.value)}
            />
          </label>
          <label>
            Target company (optional)
            <input
              maxLength={120}
              value={target.company}
              onChange={(e) => field("company", e.target.value)}
            />
          </label>
          <Select
            label="Experience level"
            options={experiences}
            value={target.experience}
            onChange={(v) => field("experience", v)}
          />
          <Select
            label="Interview type"
            options={categories}
            value={target.category}
            onChange={(v) => field("category", v)}
          />
        </div>
        <FileSlot
          kind="resume"
          title="Resume"
          value={resume}
          onChange={setResume}
          onPending={pending}
        />
        <h3>Job description</h3>
        <div className="tabs">
          {["Paste", "Upload"].map((v) => (
            <button
              className={v === tab ? "selected" : ""}
              type="button"
              onClick={() => setTab(v)}
              key={v}
            >
              {v}
            </button>
          ))}
        </div>
        {tab === "Paste" ? (
          <label>
            Job description text
            <textarea
              required
              minLength={20}
              maxLength={50000}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
        ) : (
          <FileSlot
            kind="job-description"
            title="Job description file"
            value={jd}
            onChange={setJd}
            onPending={pending}
          />
        )}
        <p className="muted">
          Analysis sends extracted text to the configured AI provider.
        </p>
        <Notice error={error} />
        <button
          className="primary"
          disabled={busy || uploads > 0 || !resume || (tab === "Upload" && !jd)}
        >
          {busy ? "Analyzing your profile…" : "Analyze profile"}
        </button>
      </form>
    </>
  );
}
export function Configure() {
  const { id } = useParams(),
    resource = useResource("/documents/analysis/" + id);
  if (!resource.data) return <Status resource={resource} />;
  return <ConfigForm report={resource.data} />;
}
function ConfigForm({ report }) {
  const nav = useNavigate(),
    [c, set] = useState({
      duration: 15,
      count: 5,
      difficulty: "Intermediate",
      mode: "Voice",
      category: report.target.category,
    }),
    { busy, run, error } = useAction();
  return (
    <>
      <p className="eyebrow">SESSION SETTINGS</p>
      <h1>Configure your interview</h1>
      <section className="panel">
        <h2>{report.target.role}</h2>
        <p>
          {[report.target.experience, report.target.company]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <div className="grid2">
          {[
            ["duration", "Time limit (minutes)", [10, 15, 20, 30]],
            ["count", "Questions", [5, 10, 15]],
            [
              "difficulty",
              "Difficulty",
              ["Beginner", "Intermediate", "Advanced"],
            ],
            ["mode", "Answer mode", ["Voice", "Text"]],
            ["category", "Interview category", categories],
          ].map(([key, label, options]) => (
            <Select
              key={key}
              label={label}
              options={options}
              value={c[key]}
              onChange={(v) =>
                set({
                  ...c,
                  [key]: typeof options[0] === "number" ? Number(v) : v,
                })
              }
            />
          ))}
        </div>
        <Notice error={error} />
        <button
          className="primary"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const room = await api("/interview/start", "POST", {
                ...c,
                analysis_id: report.id,
              });
              nav("/studio/room/" + room.id);
            })
          }
        >
          {busy ? "Preparing your first question…" : "Start interview"}
        </button>
      </section>
    </>
  );
}
export function Room() {
  const { id } = useParams(),
    r = useResource("/interview/" + id);
  if (!r.data) return <Status resource={r} />;
  return <Live initial={r.data} />;
}
function Live({ initial }) {
  const [room, setRoom] = useState(initial),
    [text, setText] = useState(""),
    [mode, setMode] = useState(initial.config.mode),
    [recId, setRecId] = useState(null),
    [recording, setRecording] = useState(false),
    [tick, setTick] = useState(Date.now()),
    [metrics, setMetrics] = useState(null);
  const recorder = useRef(null),
    alive = useRef(true),
    nav = useNavigate(),
    { run, busy, error } = useAction(),
    turn = room.turns.at(-1),
    remaining = Math.max(0, room.deadline - Math.floor(tick / 1000));
  useEffect(() => {
    alive.current = true;
    const t = setInterval(() => setTick(Date.now()), 1000);
    return () => {
      alive.current = false;
      clearInterval(t);
      if (recorder.current?.state === "recording") recorder.current.stop();
      recorder.current?.stream.getTracks().forEach((x) => x.stop());
    };
  }, []);
  useEffect(() => {
    if (room.ended) nav("/studio/report/" + room.id, { replace: true });
  }, [room.ended]);
  async function finish() {
    setRoom(await api("/interview/" + room.id + "/end", "POST", {}));
  }
  const expiryAttempt = useRef(false);
  useEffect(() => {
    if (!remaining && !busy && !room.ended && !expiryAttempt.current) {
      expiryAttempt.current = true;
      if (recorder.current?.state === "recording") recorder.current.stop();
      run(finish);
    }
  }, [remaining, busy, room.ended]);
  async function record() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
      throw Error(
        "Microphone recording needs HTTPS or localhost and browser support. You can switch to text.",
      );
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (!alive.current) {
      stream.getTracks().forEach((x) => x.stop());
      return;
    }
    try {
      const format = ["audio/webm;codecs=opus", "audio/mp4"].find((v) =>
        MediaRecorder.isTypeSupported(v),
      );
      if (!format)
        throw Error("This browser cannot record WebM or MP4. Use text mode.");
      const r = new MediaRecorder(stream, { mimeType: format }),
        chunks = [];
      r.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      r.onstop = () => {
        stream.getTracks().forEach((x) => x.stop());
        if (!alive.current) return;
        setRecording(false);
        if (Date.now() / 1000 >= room.deadline) return;
        run(async () => {
          const f = new FormData();
          f.append(
            "file",
            new Blob(chunks, { type: r.mimeType }),
            "answer." + (format.includes("mp4") ? "mp4" : "webm"),
          );
          f.append("interview_id", room.id);
          f.append("turn_id", turn.id);
          const data = await api("/audio/transcribe", "POST", f);
          if (alive.current) {
            setText(data.text);
            setRecId(data.id);
            setMetrics(data.metrics);
          }
        });
      };
      recorder.current = r;
      r.start();
      setRecording(true);
    } catch (e) {
      stream.getTracks().forEach((x) => x.stop());
      throw e;
    }
  }
  async function submit() {
    const next = await api("/interview/" + room.id + "/answer", "POST", {
      turn_id: turn.id,
      text,
      recording_id: recId,
    });
    setRoom(next);
    setText("");
    setRecId(null);
    setMetrics(null);
  }
  return (
    <>
      <div className="between">
        <p className="eyebrow">INTERVIEW ROOM</p>
        <span className="clock">
          <Timer size={16} />
          {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
        </span>
      </div>
      <h1>{room.context.target.role}</h1>
      <section className="question">
        <div className="between">
          <span>
            <AudioLines size={18} /> AI interviewer
          </span>
          <small>
            Question {turn.position} / {room.config.count}
          </small>
        </div>
        <progress value={turn.position} max={room.config.count} />
        <h2>{turn.question}</h2>
      </section>
      <section className="panel">
        <div className="tabs">
          {["Voice", "Text"].map((m) => (
            <button
              disabled={busy || recording}
              key={m}
              className={mode === m ? "selected" : ""}
              onClick={() => {
                setMode(m);
                if (m === "Text") {
                  setRecId(null);
                  setMetrics(null);
                }
              }}
            >
              {m}
            </button>
          ))}
        </div>
        {mode === "Voice" && (
          <div className="record">
            {recording && <Wave />}
            <button
              disabled={busy || !remaining}
              onClick={() =>
                recording ? recorder.current.stop() : run(record)
              }
            >
              {recording ? <Square size={16} /> : <Mic size={16} />}{" "}
              {recording ? "Stop & transcribe" : "Record answer"}
            </button>
          </div>
        )}
        <label>
          {mode === "Voice" ? "Review your transcript" : "Your answer"}
          <textarea
            maxLength={10000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Your response goes here…"
          />
        </label>
        {metrics && (
          <p>
            {metrics.words_per_minute} words/min · {metrics.seconds}s recorded
          </p>
        )}
        <Notice error={error} />
        <div className="actions">
          <button
            className="primary"
            disabled={!text.trim() || busy || recording || !remaining}
            onClick={() => run(submit)}
          >
            {busy ? "Processing…" : "Submit answer"}
          </button>
          <button
            disabled={busy || recording}
            onClick={() => {
              if (
                window.confirm(
                  "End this interview and generate a report for submitted answers?",
                )
              )
                run(finish);
            }}
          >
            End interview
          </button>
        </div>
      </section>
    </>
  );
}
