import React, { useEffect, useState, useCallback } from "react";
import {
  Box, Card, Stack, Typography, Button, Chip, TextField, MenuItem,
  CircularProgress, Alert, Divider,
} from "@mui/material";
import { apiFetch, API_BASE } from "../api";
import { PageHeader } from "../component/ui";

const BANDS = [];
for (let b = 9; b >= 0; b -= 0.5) BANDS.push(b);

function fmtDate(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

export default function Review() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch("/api/review/queue")
      .then((r) => { if (r.status === 403) throw new Error("Teachers only."); return r.json(); })
      .then((d) => setItems(Array.isArray(d) ? d : []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const onGraded = (item) => {
    setItems((list) => list.filter((x) => !(x.kind === item.kind && x.id === item.id)));
    setSelected(null);
  };

  if (loading) {
    return <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}><CircularProgress /></Box>;
  }
  if (error) return <Box><PageHeader title="Review" /><Alert severity="error">{error}</Alert></Box>;

  return (
    <Box>
      <PageHeader title="Review" subtitle="Grade pending Writing and Speaking submissions." />

      {items.length === 0 ? (
        <Card sx={{ p: 5, textAlign: "center" }}>
          <Typography variant="h6" gutterBottom>All caught up 🎉</Typography>
          <Typography color="text.secondary">There are no submissions waiting to be reviewed.</Typography>
        </Card>
      ) : (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "320px 1fr" }, gap: 2 }}>
          {/* Queue */}
          <Card sx={{ p: 0, alignSelf: "start" }}>
            {items.map((it, i) => {
              const sel = selected && selected.kind === it.kind && selected.id === it.id;
              return (
                <React.Fragment key={`${it.kind}-${it.id}`}>
                  {i > 0 && <Divider />}
                  <Box
                    onClick={() => setSelected(it)}
                    sx={{
                      p: 2, cursor: "pointer",
                      bgcolor: sel ? "action.selected" : "transparent",
                      "&:hover": { bgcolor: "action.hover" },
                    }}
                  >
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                      <Chip size="small" color={it.kind === "writing" ? "primary" : "secondary"}
                            label={it.kind === "writing" ? "Writing" : "Speaking"} />
                      <Typography variant="caption" color="text.secondary">{fmtDate(it.created_at)}</Typography>
                    </Stack>
                    <Typography fontWeight={600} noWrap>{it.student}</Typography>
                    <Typography variant="body2" color="text.secondary" noWrap>{it.task_title}</Typography>
                  </Box>
                </React.Fragment>
              );
            })}
          </Card>

          {/* Detail */}
          {selected ? (
            <GradePanel key={`${selected.kind}-${selected.id}`} item={selected} onGraded={() => onGraded(selected)} />
          ) : (
            <Card sx={{ p: 5, display: "grid", placeItems: "center" }}>
              <Typography color="text.secondary">Select a submission to review.</Typography>
            </Card>
          )}
        </Box>
      )}
    </Box>
  );
}

function GradePanel({ item, onGraded }) {
  const [band, setBand] = useState(6.5);
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setSubmitting(true);
    setError("");
    try {
      const res = await apiFetch(`/api/review/${item.kind}/${item.id}`, {
        method: "POST",
        body: JSON.stringify({ band: Number(band), feedback }),
      });
      if (!res.ok) throw new Error("Could not save grade.");
      onGraded();
    } catch (e) {
      setError(e.message);
      setSubmitting(false);
    }
  };

  return (
    <Card sx={{ p: 3 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
        <Chip size="small" color={item.kind === "writing" ? "primary" : "secondary"}
              label={item.kind === "writing" ? "Writing" : "Speaking"} />
        <Typography variant="h6">{item.student}</Typography>
      </Stack>

      <Typography variant="subtitle2" color="text.secondary">Task</Typography>
      <Typography sx={{ mb: 2, whiteSpace: "pre-wrap" }}>{item.task_prompt || item.task_title}</Typography>

      {item.kind === "writing" ? (
        <>
          <Typography variant="subtitle2" color="text.secondary">
            Response ({item.word_count} words)
          </Typography>
          <Card variant="outlined" sx={{ p: 2, mt: 1, mb: 2, boxShadow: "none", maxHeight: 360, overflow: "auto" }}>
            <Typography sx={{ whiteSpace: "pre-wrap" }}>{item.response_text}</Typography>
          </Card>
        </>
      ) : (
        <>
          {item.audio_url && (
            <Box component="audio" controls src={`${API_BASE}${item.audio_url}`} sx={{ width: "100%", mb: 2 }} />
          )}
          <Typography variant="subtitle2" color="text.secondary">Transcript</Typography>
          <Card variant="outlined" sx={{ p: 2, mt: 1, mb: 2, boxShadow: "none", maxHeight: 280, overflow: "auto" }}>
            <Typography sx={{ whiteSpace: "pre-wrap" }} color={item.transcript ? "text.primary" : "text.disabled"}>
              {item.transcript || "(no transcript provided)"}
            </Typography>
          </Card>
        </>
      )}

      <Divider sx={{ my: 2 }} />
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
        <TextField select label="Band" value={band} onChange={(e) => setBand(e.target.value)} sx={{ width: 120 }}>
          {BANDS.map((b) => <MenuItem key={b} value={b}>{b}</MenuItem>)}
        </TextField>
        <TextField
          label="Feedback for the student" fullWidth multiline minRows={2}
          value={feedback} onChange={(e) => setFeedback(e.target.value)}
        />
      </Stack>
      <Button variant="contained" sx={{ mt: 2 }} disabled={submitting} onClick={submit}>
        {submitting ? "Saving…" : "Submit grade"}
      </Button>
    </Card>
  );
}
