import React, { useEffect, useState, useCallback } from "react";
import {
  Box, Card, CardActionArea, Stack, Typography, Button, Chip, TextField,
  CircularProgress, Alert, Divider, LinearProgress,
} from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import EditNoteRoundedIcon from "@mui/icons-material/EditNoteRounded";
import { apiFetch } from "../api";
import { PageHeader, bandColor } from "../component/ui";

function fmt(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function Writing() {
  const [tasks, setTasks] = useState([]);
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);

  const loadSubs = useCallback(() => {
    apiFetch("/api/writing/submissions")
      .then((r) => r.json())
      .then((d) => setSubs(Array.isArray(d) ? d : []))
      .catch(() => setSubs([]));
  }, []);

  useEffect(() => {
    Promise.all([
      apiFetch("/api/writing/tasks").then((r) => r.json()).catch(() => []),
      apiFetch("/api/writing/submissions").then((r) => r.json()).catch(() => []),
    ])
      .then(([t, s]) => {
        setTasks(Array.isArray(t) ? t : []);
        setSubs(Array.isArray(s) ? s : []);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}><CircularProgress /></Box>;
  }

  if (active) {
    return <Editor task={active} onDone={() => { setActive(null); loadSubs(); }} />;
  }

  return (
    <Box>
      <PageHeader title="Writing" subtitle="Practise IELTS essays and get teacher feedback." />

      <Typography variant="subtitle1" sx={{ mb: 1.5 }}>Tasks</Typography>
      {tasks.length === 0 ? (
        <Card sx={{ p: 4, textAlign: "center", mb: 4 }}>
          <Typography color="text.secondary">No writing tasks yet.</Typography>
        </Card>
      ) : (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, mb: 4 }}>
          {tasks.map((t) => (
            <Card key={t.id}>
              <CardActionArea onClick={() => setActive(t)} sx={{ p: 3 }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <Chip size="small" color="primary" label={t.task_type === "task1" ? "Task 1" : "Task 2"} />
                  <Chip size="small" variant="outlined" label={`${t.time_limit_min} min`} />
                </Stack>
                <Typography variant="h6" gutterBottom>{t.title}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{
                  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                }}>
                  {t.prompt_md}
                </Typography>
              </CardActionArea>
            </Card>
          ))}
        </Box>
      )}

      <Typography variant="subtitle1" sx={{ mb: 1.5 }}>My submissions</Typography>
      {subs.length === 0 ? (
        <Card sx={{ p: 4, textAlign: "center" }}>
          <Typography color="text.secondary">You haven't submitted any essays yet.</Typography>
        </Card>
      ) : (
        <Card sx={{ p: 0 }}>
          {subs.map((s, i) => (
            <React.Fragment key={s.id}>
              {i > 0 && <Divider />}
              <Box sx={{ p: 2.5 }}>
                <Stack direction="row" alignItems="center" spacing={2}>
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography fontWeight={600} noWrap>{s.task_title}</Typography>
                    <Typography variant="caption" color="text.secondary">{s.word_count} words</Typography>
                  </Box>
                  {s.status === "reviewed" ? (
                    <Typography variant="h6" fontWeight={800} color={bandColor(s.band)}>{s.band}</Typography>
                  ) : (
                    <Chip size="small" color="warning" label="Awaiting review" />
                  )}
                </Stack>
                {s.status === "reviewed" && s.feedback && (
                  <Alert severity="info" icon={false} sx={{ mt: 1.5 }}>
                    <strong>Teacher feedback:</strong> {s.feedback}
                  </Alert>
                )}
              </Box>
            </React.Fragment>
          ))}
        </Card>
      )}
    </Box>
  );
}

function Editor({ task, onDone }) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [timeLeft, setTimeLeft] = useState(task.time_limit_min ? task.time_limit_min * 60 : null);

  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return;
    const id = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(id);
  }, [timeLeft]);

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const minWords = task.task_type === "task1" ? 150 : 250;

  const submit = async () => {
    if (!text.trim()) { setError("Write something before submitting."); return; }
    setSubmitting(true);
    setError("");
    try {
      const res = await apiFetch("/api/writing/submissions", {
        method: "POST",
        body: JSON.stringify({ task_id: task.id, response_text: text }),
      });
      if (!res.ok) throw new Error("Submit failed");
      onDone();
    } catch (e) {
      setError(e.message);
      setSubmitting(false);
    }
  };

  return (
    <Box>
      <PageHeader
        title={task.title}
        subtitle={task.task_type === "task1" ? "Task 1 · min 150 words" : "Task 2 · min 250 words"}
        action={
          <Stack direction="row" spacing={1} alignItems="center">
            {timeLeft !== null && (
              <Chip color={timeLeft < 60 ? "error" : "default"} label={fmt(timeLeft)} />
            )}
            <Button startIcon={<ArrowBackRoundedIcon />} onClick={onDone}>Back</Button>
            <Button variant="contained" disabled={submitting} onClick={submit}>
              {submitting ? "Submitting…" : "Submit"}
            </Button>
          </Stack>
        }
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Card sx={{ p: 3, mb: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <EditNoteRoundedIcon color="primary" />
          <Typography variant="subtitle1">Prompt</Typography>
        </Stack>
        <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>{task.prompt_md}</Typography>
        {task.image_url && (
          <Box component="img" src={task.image_url} alt="" sx={{ mt: 2, maxWidth: "100%", borderRadius: 2 }} />
        )}
      </Card>

      <Card sx={{ p: 3 }}>
        <TextField
          fullWidth multiline minRows={14} placeholder="Write your response here…"
          value={text} onChange={(e) => setText(e.target.value)}
        />
        <Stack direction="row" alignItems="center" spacing={2} sx={{ mt: 1.5 }}>
          <Typography variant="body2" color={words >= minWords ? "success.main" : "text.secondary"}>
            {words} / {minWords} words
          </Typography>
          <Box sx={{ flexGrow: 1 }}>
            <LinearProgress
              variant="determinate"
              value={Math.min(100, (words / minWords) * 100)}
              color={words >= minWords ? "success" : "primary"}
              sx={{ borderRadius: 1 }}
            />
          </Box>
        </Stack>
      </Card>
    </Box>
  );
}
