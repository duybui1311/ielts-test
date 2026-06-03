import React from "react";
import {
  Box,
  Container,
  Paper,
  Grid,
  Typography,
  Button,
  Stack,
} from "@mui/material";
import { useLocation, useNavigate } from "react-router-dom";

export default function Summary() {
  const loc = useLocation();
  const navigate = useNavigate();
  const submission = loc.state?.submission || {};
  const score = submission.score ?? 69;
  const duration = submission.duration ?? "9:5 minute";
  const title = submission.title ?? "Headache 1";
  const time = submission.endedAt ? new Date(submission.endedAt).toLocaleString() : "";

  const topActions = ["HOME", "STATIONS", "CIRCUITS", "RE-DO", "PDF", "REASSIGN", "SHARE", "REPORT"];

  return (
    <Box sx={{ bgcolor: "#f5f7fb", minHeight: "100vh", py: 4 }}>
      <Container maxWidth="lg">
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>
          Result
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Chat with your colleagues !
        </Typography>

        <Paper sx={{ p: 3, borderRadius: 2 }}>
          <Grid container spacing={3}>

            {/* ROW 1: Header + action chips */}
            <Grid item xs={12}>
              <Stack direction="row" alignItems="center" spacing={2}>
                <Typography variant="h6">Summary</Typography>
                <Typography variant="body2" color="text.secondary">| {title}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>{time}</Typography>
                <Box sx={{ flexGrow: 1 }} />
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  {topActions.map((t) => (
                    <Button key={t} variant="outlined" size="small" sx={{ textTransform: "none" }}>
                      {t}
                    </Button>
                  ))}
                </Stack>
              </Stack>
            </Grid>

            {/* ROW 2: Score + Duration (take full container width together) */}
            <Grid item xs={12}>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <Paper elevation={1} sx={{ p: 3, width: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 110 }}>
                    <Typography variant="subtitle2" color="text.secondary">Score</Typography>
                    <Typography variant="h4" sx={{ mt: 1 }}>{score}%</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Paper elevation={1} sx={{ p: 3, width: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 110 }}>
                    <Typography variant="subtitle2" color="text.secondary">Duration</Typography>
                    <Typography variant="h5" sx={{ mt: 1 }}>{duration}</Typography>
                  </Paper>
                </Grid>
              </Grid>
            </Grid>

            {/* ROW 3: main content cards (left big, right column) */}
            <Grid item xs={12}>
              <Grid container spacing={2}>
                <Grid item xs={12} md={8}>
                  <Paper elevation={1} sx={{ p: 3, minHeight: 180 }}>
                    <Typography variant="subtitle1" sx={{ mb: 1 }}>Opening the consultation</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {submission.opening ?? "Interact with an AI patient & examiner"}
                    </Typography>
                  </Paper>

                  <Paper elevation={1} sx={{ p: 2, mt: 2, minHeight: 80 }}>
                    <Typography variant="subtitle1">Presenting complaint</Typography>
                    <Typography variant="body2" color="text.secondary">{submission.complaint ?? ""}</Typography>
                  </Paper>
                </Grid>

                <Grid item xs={12} md={4}>
                  <Paper elevation={1} sx={{ p: 2, mb: 2 }}>
                    <Typography variant="subtitle1">Diagnosis</Typography>
                    <Typography variant="body2" color="text.secondary">{submission.diagnosis ?? "Reveal diagnosis"}</Typography>
                  </Paper>

                  <Paper elevation={1} sx={{ p: 2, mb: 2 }}>
                    <Typography variant="subtitle1">Useful links</Typography>
                    <Typography variant="body2" color="text.secondary">Links / resources</Typography>
                  </Paper>

                  <Paper elevation={1} sx={{ p: 2 }}>
                    <Typography variant="subtitle1">Relevant guides</Typography>
                    <Typography variant="body2" color="text.secondary">Guides</Typography>
                  </Paper>
                </Grid>
              </Grid>
            </Grid>

            {/* ROW 4: actions (separated row) */}
            <Grid item xs={12}>
              <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>
                <Button variant="outlined" onClick={() => navigate(-1)}>Back</Button>
                <Button
                  variant="contained"
                  onClick={async () => {
                    try {
                      await fetch("/api/submissions", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(submission),
                      });
                    } catch (e) {
                      console.error("submit error", e);
                    } finally {
                      navigate("/dashboard", { replace: true });
                    }
                  }}
                >
                  Confirm & Submit
                </Button>
              </Box>
            </Grid>

          </Grid>
        </Paper>
      </Container>
    </Box>
  );
}