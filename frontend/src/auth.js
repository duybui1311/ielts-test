// Client-side session helpers (role + identity stored at login).
//
// Extracted from pages/login so these can be imported synchronously anywhere
// without pulling the Login page into the initial bundle — which lets every
// route be code-split with React.lazy. Storage keys keep the legacy "osce-"
// prefix for backward compatibility with existing sessions.

export function normalizeRole(r) {
  if (!r) return null;
  const v = String(r).toLowerCase().trim();
  if (v === "teacher" || v === "student" || v === "admin") return v;
  return null;
}

export function setAuthed(role, info = {}) {
  const cleanRole = normalizeRole(role) || "student";
  try {
    localStorage.setItem("osce-auth", "1");
    localStorage.setItem("osce-role", cleanRole);
    if (info.userId != null) localStorage.setItem("osce-user-id", String(info.userId));
    if (info.name) localStorage.setItem("osce-name", info.name);
    if (info.email) localStorage.setItem("osce-email", info.email);
    if (info.token) localStorage.setItem("osce-token", info.token);
  } catch {
    // ignore storage errors
  }
}

export function logout() {
  try {
    ["osce-auth", "osce-role", "osce-user-id", "osce-name", "osce-email", "osce-token"]
      .forEach((k) => localStorage.removeItem(k));
    sessionStorage.setItem("osce-just-logged-out", "1"); // one-shot flag
  } catch {
    // ignore
  }
}

export function isAuthed() {
  try {
    return localStorage.getItem("osce-auth") === "1";
  } catch {
    return false;
  }
}

export function getRole() {
  try {
    return normalizeRole(localStorage.getItem("osce-role")) || "student";
  } catch {
    return "student";
  }
}

export function getName() {
  try {
    return localStorage.getItem("osce-name") || "";
  } catch {
    return "";
  }
}

export function landingFor(role) {
  if (role === "admin") return "/admin";
  if (role === "teacher") return "/manage-tests";
  return "/exams";
}
