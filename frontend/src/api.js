export const API_BASE = import.meta.env.VITE_API_URL || "";

/** Read the signed-in user id stored at login. */
export function getUserId() {
  try {
    return localStorage.getItem("osce-user-id") || "";
  } catch {
    return "";
  }
}

/** Read the JWT access token stored at login. */
export function getToken() {
  try {
    return localStorage.getItem("osce-token") || "";
  } catch {
    return "";
  }
}

/** Authorization header for the current token (empty when signed out).
 *  Use for non-JSON requests (file uploads) that can't go through apiFetch. */
export function authHeaders() {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function clearAuthAndRedirect() {
  try {
    ["osce-auth", "osce-token", "osce-user-id", "osce-name", "osce-email", "osce-role"]
      .forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
  const path = window.location.pathname + window.location.search;
  if (!window.location.pathname.startsWith("/login")) {
    window.location.assign(`/login?next=${encodeURIComponent(path)}`);
  }
}

/**
 * fetch wrapper that targets the backend and attaches the JWT as
 * `Authorization: Bearer`. On a 401 it clears the session and redirects to
 * /login (the token is missing, invalid or expired).
 */
export function apiFetch(path, options = {}) {
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...options.headers,
    },
  }).then((res) => {
    if (res.status === 401) clearAuthAndRedirect();
    return res;
  });
}
