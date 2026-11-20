import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AudioLines, ArrowUpRight, LoaderCircle } from "lucide-react";

export async function api(path, method = "GET", data) {
  const multipart = data instanceof FormData;
  const response = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers: data && !multipart ? { "Content-Type": "application/json" } : {},
    body: data ? (multipart ? data : JSON.stringify(data)) : undefined,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      typeof body.detail === "string"
        ? body.detail
        : body.detail?.[0]?.msg || "Request failed. Try again.",
    );
  return body;
}
export function upload(path, form, progress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api" + path);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) progress(Math.round((100 * e.loaded) / e.total));
    };
    xhr.onload = () => {
      let body;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = {};
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else
        reject(
          new Error(
            typeof body.detail === "string" ? body.detail : "Upload failed.",
          ),
        );
    };
    xhr.onerror = () => reject(new Error("Connection interrupted. Try again."));
    xhr.send(form);
  });
}
export function useResource(path, refresh = 0) {
  const [result, set] = useState({ loading: true });
  useEffect(() => {
    let alive = true;
    set({ loading: true });
    api(path)
      .then((data) => alive && set({ data }))
      .catch((e) => alive && set({ error: e.message }));
    return () => {
      alive = false;
    };
  }, [path, refresh]);
  return result;
}
export function useAction() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function run(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}
export const experiences = [
    "Fresher",
    "Entry Level",
    "Intermediate",
    "Experienced",
  ],
  categories = ["HR", "Technical", "Behavioral", "Mixed"];
export function Brand() {
  return (
    <Link className="brand" to="/">
      <span>
        <AudioLines size={21} />
      </span>
      TALQY
    </Link>
  );
}
export function CTA({ to, children }) {
  return (
    <Link className="btn primary" to={to}>
      {children}
      <ArrowUpRight size={16} />
    </Link>
  );
}
export function Notice({ error }) {
  return error ? (
    <p className="notice" role="alert">
      {error}
    </p>
  ) : null;
}
export function Loading() {
  return (
    <p role="status" className="loading">
      <LoaderCircle className="spin" size={18} /> Loading your studio…
    </p>
  );
}
export function Status({ resource }) {
  return resource.error ? <Notice error={resource.error} /> : <Loading />;
}
export function Select({ label, options, value, onChange }) {
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
    </label>
  );
}
export function Wave() {
  return (
    <div className="wave" aria-hidden="true">
      {Array.from({ length: 48 }, (_, i) => (
        <i
          key={i}
          style={{
            height:
              10 +
              Math.abs(Math.sin(i * 0.79) * Math.cos(i * 0.21)) * 38 +
              "px",
          }}
        />
      ))}
    </div>
  );
}
export const fmt = (t) =>
  new Date(t * 1000).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
export const labels = {
  accuracy: "Technical accuracy",
  relevance: "Answer relevance",
  communication: "Communication",
  structure: "Answer structure",
  coverage: "Skill coverage",
  fluency: "Speech fluency",
};
