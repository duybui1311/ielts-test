import * as React from "react";
import { Box, Stack, Button, Typography, Alert, Paper, CircularProgress } from "@mui/material";
import { useNavigate, useSearchParams } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_URL || "";

/** Landing page for the emailed verification link: /verify-email?token=… */
export default function VerifyEmail() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [state, setState] = React.useState(token ? "working" : "error");
  const [detail, setDetail] = React.useState(token ? "" : "This link is missing its token — open the link from your email again.");

  React.useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { setState("error"); setDetail(data.detail || "Verification failed."); return; }
        try { localStorage.setItem("bandly-email-verified", "1"); } catch { /* ignore */ }
        setState("done");
        setDetail(data.detail || "Email verified — thank you!");
      } catch {
        setState("error");
        setDetail("Verification failed. Please try again.");
      }
    })();
  }, [token]);

  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: 3, bgcolor: "background.default" }}>
      <Paper sx={{ p: 4, width: "100%", maxWidth: 420, borderRadius: 4 }}>
        <Stack spacing={2.5} alignItems="center">
          <Typography variant="h5" fontWeight={800}>Email verification</Typography>
          {state === "working" && <CircularProgress />}
          {state === "done" && <Alert severity="success" sx={{ width: "100%" }}>{detail}</Alert>}
          {state === "error" && <Alert severity="error" sx={{ width: "100%" }}>{detail}</Alert>}
          <Button variant="contained" onClick={() => navigate("/login")}>Continue</Button>
        </Stack>
      </Paper>
    </Box>
  );
}
