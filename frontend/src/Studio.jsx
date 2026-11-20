import React, { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { Download, Clock, Trash2, Activity } from "lucide-react";
import {
  api,
  useResource,
  useAction,
  Notice,
  Status,
  Select,
  CTA,
  experiences,
  labels,
  fmt,
} from "./common";
const show = (v) => v ?? "—";
function Notes({ items }) {
  return items?.length ? (
    <ul>
      {items.map((s, i) => (
        <li key={i}>{s}</li>
      ))}
    </ul>
  ) : (
    <p className="muted">No observations yet.</p>
  );
}
function Breakdown({ values }) {
  const data = Object.entries(values)
    .filter(([, v]) => v != null)
    .map(([k, score]) => ({ name: labels[k], score }));
  return data.length ? (
    <ResponsiveContainer width="100%" height={245}>
      <BarChart layout="vertical" data={data} margin={{ left: 5, right: 20 }}>
        <XAxis type="number" domain={[0, 100]} />
        <YAxis type="category" dataKey="name" width={120} fontSize={12} />
        <Tooltip />
        <Bar dataKey="score" fill="#7766de" radius={[0, 5, 5, 0]} />
      </BarChart>
    </ResponsiveContainer>
  ) : (
    <p>Complete a scored answer to see your breakdown.</p>
  );
}
function Sessions({ rows, onDelete }) {
  if (!rows.length)
    return (
      <p className="empty">
        <Clock />
        Your practice sessions will appear here.
      </p>
    );
  return (
    <div>
      {rows.map((r) => (
        <div className="session" key={r.id}>
          <div>
            <b>{r.target.role}</b>
            <small>
              {fmt(r.started)} · {r.config.category} ·{" "}
              {Math.ceil(r.duration_seconds / 60)} min
            </small>
          </div>
          <span>
            {r.ended
              ? r.score == null
                ? "Unscored"
                : r.score + "/100"
              : "In progress"}
          </span>
          <Link to={"/studio/" + (r.ended ? "report/" : "room/") + r.id}>
            {r.ended ? "View report" : "Resume"}
          </Link>
          {onDelete && (
            <button
              aria-label="Delete interview"
              onClick={() => onDelete(r.id)}
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
export function Overview({ user, analytics = false }) {
  const stats = useResource(
      "/analytics/" + (analytics ? "progress" : "dashboard"),
    ),
    history = useResource("/results/history");
  if (!stats.data || !history.data)
    return (
      <Status
        resource={
          stats.error
            ? stats
            : history.error
              ? history
              : !stats.data
                ? stats
                : history
        }
      />
    );
  const d = stats.data;
  return (
    <>
      <p className="eyebrow">
        {analytics ? "PERFORMANCE ANALYTICS" : "YOUR WORKSPACE"}
      </p>
      <div className="between">
        <h1>
          {analytics
            ? "Performance over time"
            : "Welcome, " + user.name.split(" ")[0]}
        </h1>
        <CTA to="/studio/new">New interview</CTA>
      </div>
      <div className="stats">
        {[
          ["Sessions completed", d.completed],
          ["Average score", d.average],
          ["Readiness score", d.readiness],
        ].map(([k, v]) => (
          <div className="panel" key={k}>
            <small>{k}</small>
            <strong>{show(v)}</strong>
          </div>
        ))}
      </div>
      <div className="grid2">
        <section className="panel">
          <h2>Practice trend</h2>
          {d.trend.length ? (
            <ResponsiveContainer height={245} width="100%">
              <LineChart
                data={d.trend.map((r, i) => ({ ...r, session: i + 1 }))}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="session" />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Legend />
                {(analytics
                  ? ["score", "structure", "fluency"]
                  : ["score"]
                ).map((k, i) => (
                  <Line
                    key={k}
                    name={labels[k] || "Overall"}
                    type="monotone"
                    dataKey={k}
                    stroke={["#6552c9", "#287fb1", "#b35c8a"][i]}
                    strokeWidth={2}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="empty">
              <Activity />
              Complete your first session to start tracking progress.
            </p>
          )}
          <small>Readiness averages your three latest scored sessions.</small>
        </section>
        <section className="panel">
          <h2>Score breakdown</h2>
          <Breakdown values={d.categories} />
        </section>
      </div>
      <section className="panel">
        <h2>Coaching priorities</h2>
        <Notes items={d.recommendations} />
      </section>
      {analytics && (
        <section className="panel">
          <h2>Skills practiced</h2>
          <Notes
            items={d.skills.map(([s, v]) => s + " · " + v + "/100 coverage")}
          />
          <h2>Topics to revisit</h2>
          <Notes
            items={d.weak_topics.map(
              ([s, n]) => s + " · " + n + " lower-scoring answer(s)",
            )}
          />
        </section>
      )}
      <section className="panel">
        <div className="between">
          <h2>Recent interviews</h2>
          <Link to="/studio/history">View all</Link>
        </div>
        <Sessions rows={history.data.slice(0, 4)} />
      </section>
    </>
  );
}
export function History() {
  const [rev, set] = useState(0),
    r = useResource("/results/history", rev),
    { run, error } = useAction();
  return (
    <>
      <p className="eyebrow">YOUR SESSIONS</p>
      <h1>Interview history</h1>
      <section className="panel">
        <Notice error={error} />
        {r.data ? (
          <Sessions
            rows={r.data}
            onDelete={(id) => {
              if (
                window.confirm(
                  "Permanently delete this interview and its answers?",
                )
              )
                run(async () => {
                  await api("/interview/" + id, "DELETE");
                  set(rev + 1);
                });
            }}
          />
        ) : (
          <Status resource={r} />
        )}
      </section>
    </>
  );
}
export function Report() {
  const { id } = useParams(),
    r = useResource("/results/" + id);
  if (!r.data) return <Status resource={r} />;
  const d = r.data;
  return (
    <>
      <p className="eyebrow">SESSION REPORT</p>
      <div className="between">
        <h1>{d.target.role}</h1>
        <a
          className="btn soft"
          href={"/api/results/" + id + "/download"}
          download
        >
          <Download size={16} />
          Download PDF
        </a>
      </div>
      <p>
        {fmt(d.started)} · {d.config.category} · {d.answers.length} submitted
        answers
      </p>
      <div className="grid2">
        <section className="question">
          <small>Overall score</small>
          <div className="bigscore">
            {show(d.score)}
            <small> / 100</small>
          </div>
          <p>
            {d.strongest
              ? "Strongest answer · Question " + d.strongest
              : "No evaluated answers"}
          </p>
          {d.answers.length > 1 && (
            <p>Lowest-scoring answer · Question {d.weakest}</p>
          )}
        </section>
        <section className="panel">
          <h2>Category scores</h2>
          <Breakdown values={d.categories} />
        </section>
      </div>
      <section className="panel">
        <h2>Coaching recommendations</h2>
        <Notes items={d.recommendations} />
        <h3>JD skill coverage</h3>
        <p>Discussed · {d.skills.join(", ") || "None recorded"}</p>
        <p>
          Target skills · {d.required_skills.join(", ") || "None identified"}
        </p>
      </section>
      <h2>Answer review</h2>
      {d.answers.map((t) => (
        <details className="panel" key={t.id}>
          <summary>
            Q{t.position} · {t.question} <b>{t.score}/100</b>
          </summary>
          <h3>Your answer</h3>
          <p>{t.answer}</p>
          <p>
            {Object.entries(labels)
              .filter(([k]) => t.evaluation[k] != null)
              .map(([k, v]) => v + " " + t.evaluation[k])
              .join(" · ")}
          </p>
          {[
            ["strengths", "What worked"],
            ["missing", "What was missing"],
            ["suggestions", "Try next time"],
          ].map(([k, v]) => (
            <div key={k}>
              <h3>{v}</h3>
              <Notes items={t.evaluation[k]} />
            </div>
          ))}
          {t.delivery && (
            <>
              <h3>Observed speech delivery</h3>
              <p>
                {t.delivery.words_per_minute} words/min ·{" "}
                {t.delivery.segment_gaps_over_1s} segment gaps ≥1s ·{" "}
                {t.delivery.repeated_adjacent_words} adjacent repetitions
              </p>
              <p>
                Possible fillers ·{" "}
                {Object.entries(t.delivery.possible_fillers)
                  .map(([k, v]) => k + " × " + v)
                  .join(", ") || "None counted"}
              </p>
            </>
          )}
          <h3>Sample answer for practice</h3>
          <p>{t.evaluation.sample}</p>
        </details>
      ))}
      <div className="actions">
        <CTA to="/studio/new">Practice again</CTA>
        <Link to="/studio">Return to dashboard</Link>
      </div>
    </>
  );
}
export function Profile({ user, onUser }) {
  const [rev, setRev] = useState(0),
    docs = useResource("/documents", rev),
    { run, busy, error } = useAction(),
    [msg, setMsg] = useState(""),
    [experience, setExperience] = useState(user.experience);
  function submit(fn) {
    return (e) => {
      e.preventDefault();
      const form = e.currentTarget,
        f = Object.fromEntries(new FormData(form));
      setMsg("");
      run(() => fn(f, form));
    };
  }
  return (
    <>
      <p className="eyebrow">ACCOUNT</p>
      <h1>Profile settings</h1>
      <Notice error={error} />
      {msg && <p role="status">{msg}</p>}
      <form
        className="panel"
        onSubmit={submit(async (f) => {
          onUser(await api("/profile", "PUT", { ...f, experience }));
          setMsg("Profile saved.");
        })}
      >
        <h2>Personal details</h2>
        <p>{user.email}</p>
        <div className="grid2">
          <label>
            Full name
            <input required name="name" defaultValue={user.name} />
          </label>
          <label>
            Target role
            <input name="role" defaultValue={user.role} />
          </label>
          <Select
            label="Experience level"
            options={experiences}
            value={experience}
            onChange={setExperience}
          />
        </div>
        <button disabled={busy}>Save details</button>
      </form>
      <section className="panel">
        <h2>Uploaded documents</h2>
        {docs.data ? (
          docs.data.length ? (
            docs.data.map((d) => (
              <div className="between" key={d.id}>
                <p>{d.name}</p>
                <button
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Delete this document and its saved analysis?",
                      )
                    )
                      run(async () => {
                        await api("/documents/" + d.id, "DELETE");
                        setRev(rev + 1);
                      });
                  }}
                >
                  Delete
                </button>
              </div>
            ))
          ) : (
            <p>No documents uploaded.</p>
          )
        ) : (
          <Status resource={docs} />
        )}
      </section>
      <form
        className="panel"
        onSubmit={submit(async (f, form) => {
          await api("/profile/password", "POST", f);
          form.reset();
          setMsg("Password updated.");
        })}
      >
        <h2>Change password</h2>
        <label>
          Current password
          <input
            required
            type="password"
            name="current"
            autoComplete="current-password"
          />
        </label>
        <label>
          New password
          <input
            required
            minLength={10}
            type="password"
            name="password"
            autoComplete="new-password"
          />
        </label>
        <button disabled={busy}>Change password</button>
      </form>
      <form
        className="panel"
        onSubmit={submit(async (f) => {
          if (
            window.confirm(
              "Permanently delete your account, documents and interview history?",
            )
          ) {
            await api("/profile", "DELETE", f);
            onUser(null);
          }
        })}
      >
        <h2>Delete account</h2>
        <label>
          Confirm your password
          <input
            type="password"
            required
            name="current"
            autoComplete="current-password"
          />
        </label>
        <button disabled={busy}>Delete account permanently</button>
      </form>
    </>
  );
}
