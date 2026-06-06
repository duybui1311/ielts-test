import React, { useEffect, useState } from "react";
import {
  Box, Card, Stack, Typography, Button, TextField, MenuItem, Alert,
  CircularProgress, Snackbar,
} from "@mui/material";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch, API_BASE, getUserId } from "../api";
import { PageHeader } from "../component/ui";

export default function TaskEdit() {
  const navigate = useNavigate();
  const { kind, taskId } = useParams();          // kind: writing | speaking ; taskId: "new" | number
  const isWriting = kind === "writing";
  const isNew = taskId === "new";

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [taskType, setTaskType] = useState("task2");   // writing
  const [timeLimit, setTimeLimit] = useState(20);      // writing
  const [minWords, setMinWords] = useState(250);       // writing word threshold
  const [part, setPart] = useState(1);                 // speaking
  const [prepSec, setPrepSec] = useState(60);          // speaking
  const [answerSec, setAnswerSec] = useState(120);     // speaking
  const [imageUrl, setImageUrl] = useState("");        // writing chart
  const [imageFile, setImageFile] = useState(null);

  useEffect(() => {
    if (isNew) return;
    apiFetch(`/api/${kind}/tasks/${taskId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Could not load task"))))
      .then((t) => {
        setTitle(t.title || "");
        setPrompt(t.prompt_md || "");
        if (isWriting) {
          setTaskType(t.task_type || "task2");
          setTimeLimit(t.time_limit_min || 20);
          setMinWords(t.min_words ?? (t.task_type === "task1" ? 150 : 250));
          setImageUrl(t.image_url || "");
        } else {
          setPart(t.part || 1);
          setPrepSec(t.prep_sec ?? 60);
          setAnswerSec(t.answer_sec ?? 120);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [kind, taskId, isNew, isWriting]);

  const uploadImage = async (taskIdForImage) => {
    if (!imageFile) return;
    const fd = new FormData();
    fd.append("file", imageFile);
    const uid = getUserId();
    const res = await fetch(`${API_BASE}/api/writing/tasks/${taskIdForImage}/image`, {
      method: "POST",
      headers: uid ? { "X-User-Id": uid } : {},
      body: fd,
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      throw new Error(msg || "Saved, but the chart image upload failed.");
    }
  };

  const save = async () => {
    if (!title.trim()) { setError("Give the task a title."); return; }
    if (!prompt.trim()) { setError("Add a prompt for the student."); return; }
    setSaving(true);
    setError("");
    try {
      const body = isWriting
        ? { task_type: taskType, title: title.trim(), prompt_md: prompt, time_limit_min: Number(timeLimit) || 20, min_words: Number(minWords) || null }
        : { part: Number(part) || 1, title: title.trim(), prompt_md: prompt, prep_sec: Number(prepSec) || 60, answer_sec: Number(answerSec) || 120 };

      let id = taskId;
      if (isNew) {
        const res = await apiFetch(`/api/${kind}/tasks`, { method: "POST", body: JSON.stringify(body) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Could not create task.");
        id = data.id;
      } else {
        const res = await apiFetch(`/api/${kind}/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(body) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Could not save task.");
      }

      if (isWriting && imageFile) await uploadImage(id);

      setToast("Task saved.");
      setTimeout(() => navigate("/manage-tests"), 800);
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  if (loading) {
    return <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}><CircularProgress /></Box>;
  }

  const titleText = `${isNew ? "New" : "Edit"} ${isWriting ? "Writing" : "Speaking"} Task`;

  return (
    <Box sx={{ maxWidth: 760 }}>
      <PageHeader
        title={titleText}
        subtitle="Students see this in My Tests under the matching skill tab."
        action={
          <Stack direction="row" spacing={1}>
            <Button onClick={() => navigate("/manage-tests")}>Cancel</Button>
            <Button variant="contained" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save task"}
            </Button>
          </Stack>
        }
      />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}

      <Card sx={{ p: 3 }}>
        <Stack spacing={2.5}>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
            {isWriting ? (
              <TextField select label="Type" value={taskType} onChange={(e) => setTaskType(e.target.value)}>
                <MenuItem value="task1">Task 1 (chart / diagram)</MenuItem>
                <MenuItem value="task2">Task 2 (essay)</MenuItem>
              </TextField>
            ) : (
              <TextField select label="Part" value={part} onChange={(e) => setPart(e.target.value)}>
                {[1, 2, 3].map((p) => <MenuItem key={p} value={p}>Part {p}</MenuItem>)}
              </TextField>
            )}
            <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Box>

          <TextField
            label="Prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)}
            multiline minRows={5} fullWidth
            placeholder={isWriting ? "Describe the task the student must respond to…" : "The question the student should answer aloud…"}
          />

          {isWriting ? (
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2, alignItems: "start" }}>
              <TextField type="number" label="Word threshold (min words)" value={minWords} onChange={(e) => setMinWords(e.target.value)} helperText="Shown to the student as the target length" />
              <TextField type="number" label="Time limit (minutes)" value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)} />
              <Box sx={{ gridColumn: { sm: "1 / -1" } }}>
                <Button component="label" variant="outlined" startIcon={<UploadFileRoundedIcon />}>
                  {imageFile ? imageFile.name : imageUrl ? "Replace chart image" : "Upload chart image (Task 1)"}
                  <input hidden type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] || null)} />
                </Button>
                {(imageUrl || imageFile) && (
                  <Box
                    component="img"
                    src={imageFile ? URL.createObjectURL(imageFile) : imageUrl}
                    alt="Task chart"
                    sx={{ display: "block", mt: 1, maxWidth: "100%", maxHeight: 200, borderRadius: 1, border: "1px solid", borderColor: "divider" }}
                  />
                )}
              </Box>
            </Box>
          ) : (
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
              <TextField type="number" label="Preparation (seconds)" value={prepSec} onChange={(e) => setPrepSec(e.target.value)} />
              <TextField type="number" label="Answer (seconds)" value={answerSec} onChange={(e) => setAnswerSec(e.target.value)} />
            </Box>
          )}
        </Stack>
      </Card>

      <Snackbar open={!!toast} autoHideDuration={2000} onClose={() => setToast("")} message={toast}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }} />
    </Box>
  );
}
