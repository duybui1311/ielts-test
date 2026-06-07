import React, { useEffect, useState, useCallback } from "react";
import {
  Box, Card, CardActionArea, Stack, Typography, Button, Chip, TextField,
  CircularProgress, Alert, Divider, LinearProgress,
} from "@mui/material";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import EditNoteRoundedIcon from "@mui/icons-material/EditNoteRounded";
import AddPhotoAlternateRoundedIcon from "@mui/icons-material/AddPhotoAlternateRounded";
import { useNavigate } from "react-router-dom";
import { apiFetch, API_BASE, authHeaders, mediaUrl } from "../api";
import { PageHeader, bandColor } from "../component/ui";

function isTeacher() {
  try {
    return (localStorage.getItem("osce-role") || "").toLowerCase() === "teacher";
  } catch {
    return false;
  }
}

function fmt(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function Writing({ embedded = false }) {
  const navigate = useNavigate();
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

  const loadTasks = useCallback(() => {
    apiFetch("/api/writing/tasks")
      .then((r) => r.json())
      .then((d) => setTasks(Array.isArray(d) ? d : []))
      .catch(() => setTasks([]));
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
      {!embedded && <PageHeader title="Writing" subtitle="Practise IELTS essays and get teacher feedback." />}

      {isTeacher() && <CreateTaskForm onCreated={loadTasks} />}

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
              <Stack direction="row" alignItems="center" spacing={2} sx={{ p: 2.5 }}>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography fontWeight={600} noWrap>{s.task_title}</Typography>
                  <Typography variant="caption" color="text.secondary">{s.word_count} words</Typography>
                </Box>
                {s.status === "reviewed" ? (
                  <Typography variant="h6" fontWeight={800} color={bandColor(s.band)}>{s.band}</Typography>
                ) : (
                  <Chip size="small" color="warning" label="Awaiting review" />
                )}
                <Button size="small" variant="outlined" startIcon={<VisibilityRoundedIcon />} onClick={() => navigate(`/result/writing/${s.id}`)}>
                  View result
                </Button>
              </Stack>
            </React.Fragment>
          ))}
        </Card>
      )}

    </Box>
  );
}

function CreateTaskForm({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [taskType, setTaskType] = useState("task1");
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [timeLimit, setTimeLimit] = useState(20);
  const [imageFile, setImageFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const reset = () => {
    setTaskType("task1"); setTitle(""); setPrompt(""); setTimeLimit(20); setImageFile(null);
  };

  const save = async () => {
    if (!title.trim() || !prompt.trim()) { setError("Title and prompt are required."); return; }
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch("/api/writing/tasks", {
        method: "POST",
        body: JSON.stringify({
          task_type: taskType, title, prompt_md: prompt,
          time_limit_min: Number(timeLimit) || 20,
        }),
      });
      if (!res.ok) throw new Error("Could not create task.");
      const task = await res.json();

      if (imageFile) {
        const fd = new FormData();
        fd.append("file", imageFile);
        const up = await fetch(`${API_BASE}/api/writing/tasks/${task.id}/image`, {
          method: "POST",
          headers: authHeaders(),
          body: fd,
        });
        if (!up.ok) {
          const msg = await up.text().catch(() => "");
          throw new Error(msg || "Task created, but the image upload failed.");
        }
      }

      reset();
      setOpen(false);
      onCreated();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <Button
        variant="outlined"
        startIcon={<AddPhotoAlternateRoundedIcon />}
        onClick={() => setOpen(true)}
        sx={{ mb: 3 }}
      >
        New writing task
      </Button>
    );
  }

  return (
    <Card sx={{ p: 3, mb: 3 }}>
      <Typography variant="subtitle1" sx={{ mb: 2 }}>New writing task</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Stack spacing={2}>
        <TextField
          select label="Type" value={taskType}
          onChange={(e) => setTaskType(e.target.value)}
          SelectProps={{ native: true }} sx={{ maxWidth: 280 }}
        >
          <option value="task1">Task 1 (chart/diagram)</option>
          <option value="task2">Task 2 (essay)</option>
        </TextField>
        <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <TextField
          label="Prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)}
          multiline minRows={3}
        />
        <TextField
          label="Time limit (min)" type="number" value={timeLimit}
          onChange={(e) => setTimeLimit(e.target.value)} sx={{ maxWidth: 200 }}
        />
        <Box>
          <Button component="label" variant="outlined" startIcon={<AddPhotoAlternateRoundedIcon />}>
            {imageFile ? "Change chart image" : "Upload chart image"}
            <input
              type="file" accept="image/*" hidden
              onChange={(e) => setImageFile(e.target.files?.[0] || null)}
            />
          </Button>
          {imageFile && (
            <Typography variant="caption" sx={{ ml: 1.5 }}>{imageFile.name}</Typography>
          )}
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="contained" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Create task"}
          </Button>
          <Button disabled={saving} onClick={() => { reset(); setOpen(false); setError(""); }}>
            Cancel
          </Button>
        </Stack>
      </Stack>
    </Card>
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
  const minWords = task.min_words || (task.task_type === "task1" ? 150 : 250);

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
        {task.image_url && (
          <Box component="img" src={mediaUrl(task.image_url)} alt="Task chart" sx={{ mb: 2, maxWidth: "100%", borderRadius: 2 }} />
        )}
        <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>{task.prompt_md}</Typography>
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
