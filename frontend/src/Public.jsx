import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  Mic,
  FileText,
  MessagesSquare,
  Radio,
  ScanText,
  ChartNoAxesCombined,
  Target,
  ListChecks,
  AudioLines,
} from "lucide-react";
import { Brand, CTA, Wave, Notice, useAction, api } from "./common";
const features = [
  [
    MessagesSquare,
    "Adaptive interviews",
    "Follow-up questions build on the decisions and examples in your last answer.",
  ],
  [
    FileText,
    "Resume & role analysis",
    "Compare the evidence in your resume with the requirements of a specific role.",
  ],
  [
    Target,
    "Personalized questions",
    "Practice explaining the projects and skills your target job calls for.",
  ],
  [
    Mic,
    "Voice practice",
    "Record an answer and review the Whisper transcript before submitting.",
  ],
  [
    Radio,
    "Intelligent follow-ups",
    "Explore trade-offs, clarify an example, or move to a new topic.",
  ],
  [
    ScanText,
    "Answer evaluation",
    "See how your answer performed across individual scoring dimensions.",
  ],
  [
    ChartNoAxesCombined,
    "Performance analytics",
    "Compare your completed interviews and follow changes in your scores.",
  ],
  [
    ListChecks,
    "Targeted coaching",
    "Take specific suggestions and improved sample answers into your next session.",
  ],
];
export function Home() {
  return (
    <main className="home">
      <header className="top">
        <Brand />
        <nav>
          <a href="#home">Home</a>
          <a href="#features">Features</a>
          <a href="#process">How it works</a>
          <a href="#about">About</a>
        </nav>
        <div>
          <Link to="/login">Log in</Link>
          <CTA to="/signup">Get started</CTA>
        </div>
      </header>
      <section className="hero" id="home">
        <div className="herotext">
          <p className="eyebrow">
            <i /> AI INTERVIEW STUDIO
          </p>
          <h1>
            Your Next Interview.
            <br />
            <em>Your Best Performance.</em>
          </h1>
          <p>
            Practice smarter with AI-powered interviews tailored to your resume
            and dream job. Get real-time insights, personalized feedback, and
            the confidence to succeed.
          </p>
          <div className="actions">
            <CTA to="/signup">Start Practicing</CTA>
            <a className="btn soft" href="#features">
              Explore Features
            </a>
          </div>
        </div>
        <div className="preview">
          <div className="previewtop">
            <span>
              <i /> Interview room
            </span>
            <small>Studio preview</small>
          </div>
          <div className="orb">
            <b />
            <b />
            <b />
          </div>
          <div className="previewbody">
            <small>AI INTERVIEWER</small>
            <h3>
              Walk me through a project decision you would make differently
              today.
            </h3>
            <Wave />
          </div>
        </div>
      </section>
      <section id="features">
        <p className="eyebrow">THE TOOLKIT</p>
        <h2>Inside your interview studio</h2>
        <div className="featuregrid">
          {features.map(([Icon, name, copy]) => (
            <article key={name}>
              <Icon />
              <h3>{name}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>
      <section id="process">
        <h2>How it works</h2>
        <div className="steps">
          {[
            "Upload your resume and job description",
            "Review your profile analysis",
            "Practice an adaptive interview",
            "Review scores and coaching feedback",
          ].map((s, i) => (
            <article key={s}>
              <small>STEP 0{i + 1}</small>
              <h3>{s}</h3>
            </article>
          ))}
        </div>
      </section>
      <section id="about" className="about">
        <div>
          <p className="eyebrow">WHY TALQY</p>
          <h2>Practice for the role you want.</h2>
          <p>
            Bring a real job description, choose your difficulty and rehearse at
            your own pace. Your practice history helps you decide what to work
            on next.
          </p>
        </div>
        <blockquote>
          “Reviewing a transcript helps me spot where my project explanation
          gets vague.”<footer>Illustrative testimonial · sample content</footer>
        </blockquote>
      </section>
      <section className="closing">
        <h2>Ready for your next interview?</h2>
        <CTA to="/signup">Start Practicing</CTA>
      </section>
      <footer className="footer">
        <Brand />
        <a href="#about">About TALQY</a>
        <Link to="/login">Open your studio</Link>
        {import.meta.env.VITE_CONTACT_EMAIL && (
          <a href={"mailto:" + import.meta.env.VITE_CONTACT_EMAIL}>Contact</a>
        )}
      </footer>
    </main>
  );
}
export function Auth({ mode, onLogin }) {
  const [params] = useSearchParams(),
    nav = useNavigate(),
    { run, busy, error } = useAction(),
    [message, setMessage] = useState("");
  const titles = {
    signup: "Create your studio",
    login: "Welcome back",
    forgot: "Reset your password",
    reset: "Choose a new password",
  };
  async function submit(e) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    await run(async () => {
      if (mode === "signup" || mode === "login") {
        const u = await api(
          "/auth/" + (mode === "signup" ? "register" : "login"),
          "POST",
          { ...f, remember: !!f.remember },
        );
        onLogin(u);
        nav("/studio");
      } else if (mode === "forgot") {
        setMessage((await api("/auth/forgot", "POST", f)).message);
      } else {
        await api("/auth/reset", "POST", {
          token: params.get("token"),
          password: f.password,
        });
        nav("/login");
      }
    });
  }
  return (
    <main className="auth">
      <Brand />
      <section className="panel">
        <AudioLines className="accent" />
        <h1>{titles[mode]}</h1>
        <form onSubmit={submit}>
          {mode === "signup" && (
            <label>
              Full name
              <input required name="name" autoComplete="name" />
            </label>
          )}
          {mode !== "reset" && (
            <label>
              Email address
              <input type="email" required name="email" autoComplete="email" />
            </label>
          )}
          {mode !== "forgot" && (
            <label>
              Password
              <input
                name="password"
                type="password"
                required
                minLength={mode === "login" ? 1 : 10}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
              />
            </label>
          )}
          {mode === "signup" && (
            <label>
              Confirm password
              <input
                name="confirm_password"
                type="password"
                required
                autoComplete="new-password"
              />
            </label>
          )}
          {mode === "login" && (
            <div className="between">
              <label className="check">
                <input name="remember" type="checkbox" />
                Remember me
              </label>
              <Link to="/forgot">Forgot password?</Link>
            </div>
          )}
          <Notice error={error} />
          {message && <p role="status">{message}</p>}
          <button className="primary" disabled={busy}>
            {busy
              ? "Please wait…"
              : {
                  signup: "Create account",
                  login: "Log in",
                  forgot: "Send reset link",
                  reset: "Save password",
                }[mode]}
            <ArrowRight size={16} />
          </button>
        </form>
        <p>
          {mode === "login" ? (
            <Link to="/signup">Create an account</Link>
          ) : (
            <Link to="/login">Back to login</Link>
          )}
        </p>
      </section>
    </main>
  );
}
