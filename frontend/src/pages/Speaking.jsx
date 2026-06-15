import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  Box, Card, CardActionArea, Stack, Typography, Button, Chip, TextField,
  CircularProgress, Alert, Divider, IconButton,
} from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import MicRoundedIcon from "@mui/icons-material/MicRounded";
import StopRoundedIcon from "@mui/icons-material/StopRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import { useNavigate } from "react-router-dom";
import { apiFetch, API_BASE, authHeaders } from "../api";
import { PageHeader, bandColor } from "../component/ui";

const SR = typeof window !== "undefined"
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;

// Pick a container/codec the current browser can actually record. iOS Safari
// only records audio/mp4 (not webm), so hardcoding webm produced a blob the
// <audio> element couldn't play back. Returns "" to let the browser default.
function pickAudioMime() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4",
    "audio/aac",
    "audio/ogg;codecs=opus",
  ];
  for (const t of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t;
    } catch {
      /* isTypeSupported can throw on some engines — keep trying */
    }
  }
  return "";
}

// File extension matching the recorded MIME, so the stored file is served with
// a sensible name/type for later playback on the result page.
function extForMime(mime) {
  const m = String(mime || "").toLowerCase();
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return "mp4";
  if (m.includes("ogg")) return "ogg";
  return "webm";
}

export default function Speaking({ embedded = false }) {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);

  const loadSubs = useCallback(() => {
    apiFetch("/api/speaking/submissions")
      .then((r) => r.json())
      .then((d) => setSubs(Array.isArray(d) ? d : []))
      .catch(() => setSubs([]));
  }, []);

  useEffect(() => {
    Promise.all([
      apiFetch("/api/speaking/tasks").then((r) => r.json()).catch(() => []),
      apiFetch("/api/speaking/submissions").then((r) => r.json()).catch(() => []),
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
    return <Recorder task={active} onDone={() => { setActive(null); loadSubs(); }} />;
  }

  return (
    <Box>
      {!embedded && <PageHeader eyebrow="AI-graded" title="Speaking" subtitle="Record your answers and get teacher feedback." icon={<MicRoundedIcon />} />}

      {!SR && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Live transcription works best in Chrome or Edge. You can still record audio
          (and type a transcript) in any browser — your teacher will hear the recording.
        </Alert>
      )}

      <Typography variant="subtitle1" sx={{ mb: 1.5 }}>Tasks</Typography>
      {tasks.length === 0 ? (
        <Card sx={{ p: 4, textAlign: "center", mb: 4 }}>
          <Typography color="text.secondary">No speaking tasks yet.</Typography>
        </Card>
      ) : (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr", lg: "repeat(3,1fr)" }, gap: 2, mb: 4 }}>
          {tasks.map((t) => (
            <Card key={t.id}>
              <CardActionArea onClick={() => setActive(t)} sx={{ p: 3, height: "100%" }}>
                <Chip size="small" color="secondary" label={`Part ${t.part}`} sx={{ mb: 1 }} />
                <Typography variant="h6" gutterBottom>{t.title}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{
                  display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
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
          <Typography color="text.secondary">You haven't recorded any answers yet.</Typography>
        </Card>
      ) : (
        <Card sx={{ p: 0 }}>
          {subs.map((s, i) => (
            <React.Fragment key={s.id}>
              {i > 0 && <Divider />}
              <Stack direction="row" alignItems="center" spacing={2} sx={{ p: 2.5 }}>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography fontWeight={600} noWrap>{s.task_title}</Typography>
                  <Typography variant="caption" color="text.secondary">Part {s.part}</Typography>
                </Box>
                {s.status === "reviewed" ? (
                  <Typography variant="h6" fontWeight={800} color={bandColor(s.band)}>{s.band}</Typography>
                ) : (
                  <Chip size="small" color="warning" label="Awaiting review" />
                )}
                <Button size="small" variant="outlined" startIcon={<VisibilityRoundedIcon />} onClick={() => navigate(`/result/speaking/${s.id}`)}>
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

function Recorder({ task, onDone }) {
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const blobRef = useRef(null);
  const recogRef = useRef(null);
  const finalRef = useRef("");
  const audioUrlRef = useRef("");

  // Swap in a fresh preview URL, revoking the previous one to avoid leaks.
  const setPreview = (blob) => {
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    const url = blob ? URL.createObjectURL(blob) : "";
    audioUrlRef.current = url;
    setAudioUrl(url);
  };

  useEffect(() => () => { if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current); }, []);

  const start = async () => {
    setError("");
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Recording isn't supported in this browser. Try Chrome, Edge, or Safari 14.3+.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickAudioMime();
      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        // Build the blob from the type the recorder actually used (mr.mimeType),
        // not a hardcoded one — otherwise iOS Safari's mp4 data gets mislabelled
        // as webm and won't play back.
        const type = mr.mimeType || mime || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        blobRef.current = blob;
        setPreview(blob);
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      mediaRef.current = mr;

      if (SR) {
        const rec = new SR();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = "en-US";
        finalRef.current = transcript ? transcript + " " : "";
        rec.onresult = (e) => {
          let interim = "";
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const r = e.results[i];
            if (r.isFinal) finalRef.current += r[0].transcript;
            else interim += r[0].transcript;
          }
          setTranscript((finalRef.current + interim).trim());
        };
        rec.onerror = () => {};
        recogRef.current = rec;
        rec.start();
      }
      setRecording(true);
    } catch {
      setError("Could not access the microphone. Check your browser permissions.");
    }
  };

  const stop = () => {
    mediaRef.current?.stop();
    try { recogRef.current?.stop(); } catch { /* ignore */ }
    setRecording(false);
  };

  const submit = async () => {
    if (!blobRef.current && !transcript.trim()) {
      setError("Record an answer (or type a transcript) before submitting.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("task_id", String(task.id));
      fd.append("transcript", transcript);
      if (blobRef.current) {
        fd.append("audio", blobRef.current, `answer.${extForMime(blobRef.current.type)}`);
      }
      const res = await fetch(`${API_BASE}/api/speaking/submissions`, {
        method: "POST",
        headers: authHeaders(),
        body: fd,
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
        subtitle={`Part ${task.part}`}
        action={
          <Stack direction="row" spacing={1}>
            <Button startIcon={<ArrowBackRoundedIcon />} onClick={onDone}>Back</Button>
            <Button variant="contained" disabled={submitting || recording} onClick={submit}>
              {submitting ? "Submitting…" : "Submit"}
            </Button>
          </Stack>
        }
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Card sx={{ p: 3, mb: 2 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>Prompt</Typography>
        <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>{task.prompt_md}</Typography>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
          Suggested: {task.prep_sec ? `${task.prep_sec}s preparation, ` : ""}{task.answer_sec}s answer.
        </Typography>
      </Card>

      <Card sx={{ p: 3, mb: 2, textAlign: "center" }}>
        <IconButton
          onClick={recording ? stop : start}
          sx={{
            width: 88, height: 88,
            bgcolor: recording ? "error.main" : "primary.main",
            color: "#fff",
            "&:hover": { bgcolor: recording ? "error.dark" : "primary.dark" },
          }}
        >
          {recording ? <StopRoundedIcon sx={{ fontSize: 40 }} /> : <MicRoundedIcon sx={{ fontSize: 40 }} />}
        </IconButton>
        <Typography sx={{ mt: 1.5 }} color="text.secondary">
          {recording ? "Recording… tap to stop" : audioUrl ? "Recorded — tap to re-record" : "Tap to start recording"}
        </Typography>
        {audioUrl && !recording && (
          <Box component="audio" controls src={audioUrl} sx={{ width: "100%", maxWidth: 480, mt: 2 }} />
        )}
      </Card>

      <Card sx={{ p: 3 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          Transcript {SR ? "(auto-generated, editable)" : "(type your answer)"}
        </Typography>
        <TextField
          fullWidth multiline minRows={5}
          placeholder={SR ? "Your speech will appear here as you talk…" : "Type what you said…"}
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
        />
      </Card>
    </Box>
  );
}
