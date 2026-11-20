import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  NavLink,
  Navigate,
  Outlet,
  useNavigate,
} from "react-router-dom";
import {
  LayoutDashboard,
  Plus,
  History as Clock,
  ChartNoAxesColumn,
  UserRound,
  LogOut,
} from "lucide-react";
import { Brand, api, Loading, Notice, useAction } from "./common";
import { Home, Auth } from "./Public";
import { Setup, Configure, Room } from "./Interview";
import { Overview, History, Report, Profile } from "./Studio";
import "./style.css";
function Shell({ user, setUser }) {
  const nav = useNavigate(),
    { run, error } = useAction();
  if (user === undefined) return <Loading />;
  if (!user) return <Navigate replace to="/login" />;
  return (
    <div className="shell">
      <aside>
        <Brand />
        <nav>
          {[
            ["", "Dashboard", LayoutDashboard],
            ["/new", "New interview", Plus],
            ["/history", "Interview history", Clock],
            ["/analytics", "Performance analytics", ChartNoAxesColumn],
            ["/profile", "Profile settings", UserRound],
          ].map(([p, name, Icon]) => (
            <NavLink end key={p} to={"/studio" + p}>
              <Icon size={18} />
              {name}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={() =>
            run(async () => {
              await api("/auth/logout", "POST", {});
              setUser(null);
              nav("/");
            })
          }
        >
          <LogOut size={16} />
          Log out
        </button>
        <Notice error={error} />
      </aside>
      <main className="workspace">
        <Outlet />
      </main>
    </div>
  );
}
function App() {
  const [user, setUser] = useState(undefined);
  useEffect(() => {
    api("/auth/me")
      .then(setUser)
      .catch(() => setUser(null));
  }, []);
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      {["signup", "login", "forgot", "reset"].map((m) => (
        <Route
          key={m}
          path={"/" + m}
          element={<Auth key={m} mode={m} onLogin={setUser} />}
        />
      ))}
      <Route path="/studio" element={<Shell user={user} setUser={setUser} />}>
        <Route index element={<Overview user={user} />} />
        <Route path="analytics" element={<Overview user={user} analytics />} />
        <Route path="history" element={<History />} />
        <Route
          path="profile"
          element={<Profile user={user} onUser={setUser} />}
        />
        <Route path="new" element={<Setup user={user} />} />
        <Route path="config/:id" element={<Configure />} />
        <Route path="room/:id" element={<Room />} />
        <Route path="report/:id" element={<Report />} />
      </Route>
      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  );
}
createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
