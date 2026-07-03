import * as React from "react";
import { Box, Stack, TextField, Button, Typography, Alert, Paper } from "@mui/material";
import { useNavigate, useSearchParams } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_URL || "";

/** Landing page for the emailed reset link: /reset-password?token=… */
export default function ResetPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") || "";

  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState("");
  const [done, setDone] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) { setError("The password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("The passwords don't match."); return; }
    try {
      setSubmitting(true);
      const res = await fetch(`${API_BASE}/api/auth/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.detail || "Could not reset the password."); return; }
      setDone(true);
    } catch {
      setError("Could not reset the password. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: 3, bgcolor: "background.default" }}>
      <Paper component="form" onSubmit={submit} sx={{ p: 4, width: "100%", maxWidth: 420, borderRadius: 4 }}>
        <Stack spacing={2.5}>
          <Typography variant="h5" fontWeight={800}>Choose a new password</Typography>
          {!token && <Alert severity="error">This link is missing its token — open the link from your email again.</Alert>}
          {error && <Alert severity="error">{error}</Alert>}
          {done ? (
            <>
              <Alert severity="success">Password updated — you can sign in now.</Alert>
              <Button variant="contained" size="large" onClick={() => navigate("/login")}>
                Go to sign in
              </Button>
            </>
          ) : (
            <>
              <TextField label="New password" type="password" value={password}
                onChange={(e) => setPassword(e.target.value)} fullWidth required autoComplete="new-password" />
              <TextField label="Repeat new password" type="password" value={confirm}
                onChange={(e) => setConfirm(e.target.value)} fullWidth required autoComplete="new-password" />
              <Button type="submit" variant="contained" size="large" disabled={submitting || !token}>
                {submitting ? "Saving…" : "Set new password"}
              </Button>
            </>
          )}
        </Stack>
      </Paper>
    </Box>
  );
}
