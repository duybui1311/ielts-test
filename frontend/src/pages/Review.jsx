import React, { useEffect, useState, useCallback } from "react";
import {
  Box, Card, Stack, Typography, Button, Chip, TextField, MenuItem,
  CircularProgress, Alert, Divider, IconButton, Tooltip, Checkbox, FormControlLabel,
} from "@mui/material";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import AddCommentRoundedIcon from "@mui/icons-material/AddCommentRounded";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import { apiFetch, API_BASE } from "../api";
import { PageHeader } from "../component/ui";
import CommentedDoc from "../component/CommentedDoc";
import AiGrade from "../component/AiGrade";

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

  // Keep the queue current: refetch when the teacher returns to the tab/window.
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

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
      <PageHeader
        title="Review"
        subtitle="Grade pending Writing and Speaking submissions."
        action={
          <Button variant="outlined" startIcon={<RefreshRoundedIcon />} onClick={load}>
            Refresh
          </Button>
        }
      />

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
  const [aiResult, setAiResult] = useState(item.ai_result || null);
  const [aiLoading, setAiLoading] = useState(false);
  const [shareAi, setShareAi] = useState(true);
  const [band, setBand] = useState(item.ai_result?.overall_band ?? 6.5);
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const runAiGrade = async () => {
    setAiLoading(true);
    setError("");
    try {
      const res = await apiFetch(`/api/${item.kind}/submissions/${item.id}/ai-grade`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "AI grading failed.");
      setAiResult(data.ai_result);
      if (data.ai_result?.overall_band != null) setBand(data.ai_result.overall_band);
    } catch (e) {
      setError(e.message);
    } finally {
      setAiLoading(false);
    }
  };

  // Inline comments (writing only)
  const [comments, setComments] = useState([]);
  const [pending, setPending] = useState(null);    // { start, end, quote }
  const [commentText, setCommentText] = useState("");

  useEffect(() => {
    if (item.kind !== "writing") return;
    apiFetch(`/api/review/writing/${item.id}/comments`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setComments(Array.isArray(d) ? d : []))
      .catch(() => setComments([]));
  }, [item]);

  const addComment = async () => {
    if (!pending || !commentText.trim()) return;
    try {
      const res = await apiFetch(`/api/review/writing/${item.id}/comments`, {
        method: "POST",
        body: JSON.stringify({
          start_offset: pending.start, end_offset: pending.end,
          quote: pending.quote, comment: commentText.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Could not add comment.");
      setComments((cs) => [...cs, data].sort((a, b) => a.start_offset - b.start_offset));
      setPending(null);
      setCommentText("");
      window.getSelection()?.removeAllRanges();
    } catch (e) {
      setError(e.message);
    }
  };

  const removeComment = async (id) => {
    try {
      const res = await apiFetch(`/api/review/writing/comments/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not delete comment.");
      setComments((cs) => cs.filter((c) => c.id !== id));
    } catch (e) { setError(e.message); }
  };

  const submit = async () => {
    setSubmitting(true);
    setError("");
    try {
      const res = await apiFetch(`/api/review/${item.kind}/${item.id}`, {
        method: "POST",
        body: JSON.stringify({ band: Number(band), feedback, ai_result: aiResult, share_ai: shareAi }),
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
          <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ flexGrow: 1 }}>
              Response ({item.word_count} words)
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Select text to add a comment
            </Typography>
          </Stack>
          <Box sx={{ mt: 1, mb: 2 }}>
            <CommentedDoc
              text={item.response_text || ""}
              comments={comments}
              onSelect={(sel) => { setPending(sel); setCommentText(""); }}
              onDelete={removeComment}
            />
          </Box>

          {pending && (
            <Card variant="outlined" sx={{ p: 2, mb: 2, borderColor: "warning.main" }}>
              <Typography variant="caption" color="text.secondary">Commenting on:</Typography>
              <Typography variant="body2" sx={{ fontStyle: "italic", mb: 1 }}>
                “{pending.quote.length > 140 ? pending.quote.slice(0, 140) + "…" : pending.quote}”
              </Typography>
              <Stack direction="row" spacing={1} alignItems="flex-start">
                <TextField
                  fullWidth size="small" autoFocus multiline
                  placeholder="Your comment…"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                />
                <Button variant="contained" startIcon={<AddCommentRoundedIcon />} onClick={addComment} disabled={!commentText.trim()}>
                  Add
                </Button>
                <Button onClick={() => { setPending(null); window.getSelection()?.removeAllRanges(); }}>Cancel</Button>
              </Stack>
            </Card>
          )}
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

      {/* AI draft grade */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Typography variant="subtitle2" color="text.secondary" sx={{ flexGrow: 1 }}>
          AI grade {aiResult ? "(draft — review & approve)" : ""}
        </Typography>
        <Button
          size="small" variant="outlined" startIcon={<AutoAwesomeRoundedIcon />}
          onClick={runAiGrade} disabled={aiLoading}
        >
          {aiLoading ? "Grading…" : aiResult ? "Re-run AI grade" : "AI grade"}
        </Button>
      </Stack>
      {aiResult && <Box sx={{ mb: 1 }}><AiGrade result={aiResult} headlineBand={Number(band)} /></Box>}
      {aiResult && (
        <FormControlLabel
          control={<Checkbox checked={shareAi} onChange={(e) => setShareAi(e.target.checked)} />}
          label="Share the AI assessment with the student"
        />
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
        {submitting ? "Saving…" : aiResult ? "Approve & save" : "Submit grade"}
      </Button>
    </Card>
  );
}
