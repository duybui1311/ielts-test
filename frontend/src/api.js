export const API_BASE = import.meta.env.VITE_API_URL || "";

/** Read the signed-in user id stored at login (test-version auth). */
export function getUserId() {
  try {
    return localStorage.getItem("osce-user-id") || "";
  } catch {
    return "";
  }
}

/**
 * fetch wrapper that targets the backend and attaches the test-version
 * `X-User-Id` header so per-user endpoints (dashboard, flashcards, history,
 * teacher) know who is calling.
 */
export function apiFetch(path, options = {}) {
  const userId = getUserId();
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(userId ? { "X-User-Id": userId } : {}),
      ...options.headers,
    },
  });
}
