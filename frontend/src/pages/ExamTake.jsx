import React, {
  useEffect, useState, useCallback, useRef,
} from "react";
import {
  Box, Typography, Paper, RadioGroup, FormControlLabel, Radio,
  TextField, Button, Stack, Alert, CircularProgress,
} from "@mui/material";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { apiFetch, API_BASE } from "../api";
import { SkillChip } from "../component/ui";

function fmt(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Resolve a media URL: Supabase uploads are absolute; legacy paths are relative. */
const mediaSrc = (url) => (!url ? "" : /^https?:\/\//.test(url) ? url : `${API_BASE}${url}`);

const REF_LABEL = {
  reading: "PASSAGE",
  listening: "AUDIO & NOTES",
  writing: "TASK",
  speaking: "TASK",
};

export default function ExamTake() {
  const { attemptId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [examData, setExamData] = useState(location.state || null);
  const [loading, setLoading] = useState(!location.state);
  const [error, setError] = useState("");
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState(null);

  const submitted = useRef(false);
  const answersRef = useRef({});
  const handleSubmitRef = useRef(null);

  // Keep answersRef in sync so the timer's auto-submit sees fresh answers
  useEffect(() => { answersRef.current = answers; }, [answers]);

  // ── Load content (from route state or API) ──────────────────────────────
  useEffect(() => {
    if (examData) {
      if (examData.status === "graded" || examData.status === "submitted") {
        navigate(`/results/${attemptId}`, { replace: true });
        return;
      }
      const init = {};
      for (const sec of examData.sections || []) {
        for (const q of sec.questions || []) {
          if (q.saved_answer) init[q.id] = q.saved_answer;
        }
      }
      setAnswers(init);
      setTimeLeft((examData.time_limit_min || 60) * 60);
      return;
    }
    apiFetch(`/api/attempts/${attemptId}/content`)
      .then((r) => r.json())
      .then((data) => {
        if (data.status === "graded" || data.status === "submitted") {
          navigate(`/results/${attemptId}`, { replace: true });
          return;
        }
        setExamData(data);
        const init = {};
        for (const sec of data.sections || []) {
          for (const q of sec.questions || []) {
            if (q.saved_answer) init[q.id] = q.saved_answer;
          }
        }
        setAnswers(init);
        setTimeLeft((data.time_limit_min || 60) * 60);
      })
      .catch(() => setError("Could not load exam."))
      .finally(() => setLoading(false));
  }, [attemptId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Submit ──────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (submitted.current) return;
    submitted.current = true;
    setSubmitting(true);
    try {
      // Flush any short answers that were typed but not blurred
      await Promise.all(
        Object.entries(answersRef.current)
          .filter(([, a]) => a.value_text != null)
          .map(([qId, a]) =>
            apiFetch(`/api/attempts/${attemptId}/answer`, {
              method: "POST",
              body: JSON.stringify({
                question_id: Number(qId),
                choice_index: null,
                value_text: a.value_text,
              }),
            })
          )
      );
      const res = await apiFetch(`/api/attempts/${attemptId}/submit`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Submit failed");
      navigate(`/results/${attemptId}`);
    } catch (e) {
      setError(e.message);
      submitted.current = false;
      setSubmitting(false);
    }
  }, [attemptId, navigate]);

  // Keep ref updated so the timer always calls the latest version
  useEffect(() => { handleSubmitRef.current = handleSubmit; }, [handleSubmit]);

  // ── Countdown timer ─────────────────────────────────────────────────────
  useEffect(() => {
    if (timeLeft === null) return;
    if (timeLeft <= 0) {
      handleSubmitRef.current?.();
      return;
    }
    const id = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(id);
  }, [timeLeft]);

  // ── Answer handlers ─────────────────────────────────────────────────────
  const saveToDB = useCallback((questionId, choiceIndex, valueText) => {
    apiFetch(`/api/attempts/${attemptId}/answer`, {
      method: "POST",
      body: JSON.stringify({
        question_id: questionId,
        choice_index: choiceIndex ?? null,
        value_text: valueText ?? null,
      }),
    }).catch(() => {}); // silent — answer is already in local state
  }, [attemptId]);

  const handleMCQ = (questionId, choiceIndex) => {
    setAnswers((a) => ({ ...a, [questionId]: { choice_index: choiceIndex } }));
    saveToDB(questionId, choiceIndex, null);
  };

  const handleShortChange = (questionId, value) => {
    setAnswers((a) => ({ ...a, [questionId]: { value_text: value } }));
  };

  const handleShortBlur = (questionId, value) => {
    saveToDB(questionId, null, value);
  };

  // ── A single question (shared across all skills) ─────────────────────────
  const renderQuestion = (q, qi) => (
    <Paper key={q.id} variant="outlined" sx={{ p: 2, mb: 2 }}>
      <Typography variant="body2" fontWeight={600} gutterBottom>
        Q{qi + 1}. {q.prompt}
      </Typography>

      {q.qtype === "mcq" && (
        <RadioGroup
          value={answers[q.id]?.choice_index?.toString() ?? ""}
          onChange={(e) => handleMCQ(q.id, parseInt(e.target.value, 10))}
        >
          {(q.options || []).map((opt, i) => (
            <FormControlLabel
              key={i}
              value={i.toString()}
              control={<Radio size="small" />}
              label={opt}
            />
          ))}
        </RadioGroup>
      )}

      {q.qtype === "short" && (
        <TextField
          size="small"
          fullWidth
          placeholder="Type your answer…"
          value={answers[q.id]?.value_text ?? ""}
          onChange={(e) => handleShortChange(q.id, e.target.value)}
          onBlur={(e) => handleShortBlur(q.id, e.target.value)}
          sx={{ mt: 1 }}
        />
      )}

      {q.qtype === "explain" && (
        <TextField
          multiline
          minRows={8}
          fullWidth
          placeholder="Write your answer…"
          value={answers[q.id]?.value_text ?? ""}
          onChange={(e) => handleShortChange(q.id, e.target.value)}
          onBlur={(e) => handleShortBlur(q.id, e.target.value)}
          sx={{ mt: 1 }}
        />
      )}
    </Paper>
  );

  /** Per-skill reference panel: audio (listening), chart (writing), text. */
  const renderReference = (sec, skill) => {
    const hasAudio = skill === "listening" && sec.audio_url;
    const hasImage = skill === "writing" && sec.image_url;
    const hasText = !!(sec.passage_md && sec.passage_md.trim());
    const isReading = skill === "reading";
    return (
      <Paper
        variant="outlined"
        sx={{
          p: 2.5,
          maxHeight: isReading ? 600 : "none",
          overflowY: isReading ? "auto" : "visible",
          position: skill === "listening" ? "sticky" : "static",
          top: skill === "listening" ? 88 : "auto",
        }}
      >
        <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
          {REF_LABEL[skill] || "MATERIAL"}
        </Typography>
        {hasAudio && (
          <Box
            component="audio"
            controls
            preload="metadata"
            src={mediaSrc(sec.audio_url)}
            sx={{ width: "100%", mb: hasText ? 2 : 0 }}
          />
        )}
        {hasImage && (
          <Box
            component="img"
            src={mediaSrc(sec.image_url)}
            alt="Task chart or diagram"
            sx={{
              display: "block", maxWidth: "100%", borderRadius: 1,
              mb: hasText ? 2 : 0, border: "1px solid", borderColor: "divider",
            }}
          />
        )}
        {hasText && (
          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", lineHeight: 1.9 }}>
            {sec.passage_md}
          </Typography>
        )}
        {!hasAudio && !hasImage && !hasText && (
          <Typography variant="body2" color="text.secondary">No additional material.</Typography>
        )}
      </Paper>
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (error && !examData) return <Alert severity="error">{error}</Alert>;

  const warn = timeLeft !== null && timeLeft < 300;

  return (
    <Box>
      {/* ── Top bar ── */}
      <Paper
        variant="outlined"
        sx={{
          p: 2, mb: 3,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          position: "sticky", top: 0, zIndex: 10, bgcolor: "background.paper",
        }}
      >
        <Typography variant="h6" fontWeight={600} noWrap sx={{ maxWidth: "60%" }}>
          {examData?.exam_name}
        </Typography>
        <Stack direction="row" spacing={2} alignItems="center">
          {timeLeft !== null && (
            <Typography variant="h6" fontWeight={700} color={warn ? "error" : "text.primary"}>
              {fmt(timeLeft)}
            </Typography>
          )}
          <Button
            variant="contained"
            disabled={submitting}
            onClick={handleSubmit}
          >
            {submitting ? "Submitting…" : "Submit Test"}
          </Button>
        </Stack>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* ── Sections (layout adapts per skill) ── */}
      {(examData?.sections || []).map((sec) => {
        const skill = (sec.skill || "reading").toLowerCase();
        const isReading = skill === "reading";
        return (
          <Box key={sec.station_id} mb={4}>
            <Stack direction="row" spacing={1} alignItems="center" mb={2}>
              <Typography variant="subtitle1" fontWeight={700}>
                Section {sec.position}: {sec.title}
              </Typography>
              {sec.skill && <SkillChip skill={sec.skill} />}
            </Stack>

            {isReading ? (
              /* Reading: passage beside the questions */
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                  gap: 3,
                }}
              >
                {renderReference(sec, skill)}
                <Box>{sec.questions.map((q, qi) => renderQuestion(q, qi))}</Box>
              </Box>
            ) : (
              /* Listening / Writing / Speaking: material on top, questions below */
              <Stack spacing={3}>
                {renderReference(sec, skill)}
                <Box>{sec.questions.map((q, qi) => renderQuestion(q, qi))}</Box>
              </Stack>
            )}
          </Box>
        );
      })}

      <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2, mb: 4 }}>
        <Button
          variant="contained"
          size="large"
          disabled={submitting}
          onClick={handleSubmit}
        >
          {submitting ? "Submitting…" : "Submit Test"}
        </Button>
      </Box>
    </Box>
  );
}
