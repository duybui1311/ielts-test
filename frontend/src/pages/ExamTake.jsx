import React, {
  useEffect, useState, useCallback, useRef,
} from "react";
import {
  Box, Typography, Paper,
  TextField, Button, Stack, Alert, CircularProgress, Chip, Tooltip, LinearProgress,
  IconButton, Snackbar,
} from "@mui/material";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import CloudDoneRoundedIcon from "@mui/icons-material/CloudDoneRounded";
import CloudSyncRoundedIcon from "@mui/icons-material/CloudSyncRounded";
import FlagRoundedIcon from "@mui/icons-material/FlagRounded";
import OutlinedFlagRoundedIcon from "@mui/icons-material/OutlinedFlagRounded";
import BorderColorRoundedIcon from "@mui/icons-material/BorderColorRounded";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { apiFetch, mediaUrl } from "../api";
import { SkillChip } from "../component/ui";
import { TOPBAR_HEIGHT } from "../component/TopBar";
import HighlightedText, { normalizeFragment } from "../component/HighlightedText";
import QuestionInput, { parsePicked } from "../component/QuestionInput";

function fmt(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Resolve a media URL: Supabase uploads are absolute; legacy paths are relative. */
const mediaSrc = mediaUrl;

const REF_LABEL = {
  reading: "PASSAGE",
  listening: "AUDIO & NOTES",
  writing: "TASK",
  speaking: "TASK",
};

// Fallback task instructions for tests imported before task_instructions
// existed — the standard wording of each official IELTS task type.
const FORMAT_INSTRUCTIONS = {
  tfng: "Do the following statements agree with the information given in the text? Choose TRUE, FALSE or NOT GIVEN.",
  ynng: "Do the following statements agree with the claims of the writer? Choose YES, NO or NOT GIVEN.",
  matching: "Choose the correct answer for each question from the list.",
  gap_fill: "Complete the sentences below with words taken from the passage.",
};

/** Group a section's questions into official-style task boxes: consecutive
 * questions sharing the same instruction block (or, failing that, the same
 * display format) belong to one task — like "Questions 1–7" on the paper. */
function groupTasks(questions) {
  const groups = [];
  for (const q of questions || []) {
    const instructions = (q.task_instructions || "").trim();
    const key = instructions || `fmt:${q.qformat || q.qtype}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(q);
    } else {
      groups.push({
        key,
        instructions: instructions || FORMAT_INSTRUCTIONS[q.qformat] || null,
        items: [q],
      });
    }
  }
  return groups;
}

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
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  const [timeToast, setTimeToast] = useState("");

  // Flag-for-review + passage highlights survive a refresh via localStorage,
  // scoped to this attempt.
  const [flags, setFlags] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`exam-flags-${attemptId}`)) || {}; }
    catch { return {}; }
  });
  const [highlights, setHighlights] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`exam-hl-${attemptId}`)) || {}; }
    catch { return {}; }
  });
  const [highlightMode, setHighlightMode] = useState(false);

  const toggleFlag = (questionId) => {
    setFlags((f) => {
      const next = { ...f, [questionId]: !f[questionId] };
      if (!next[questionId]) delete next[questionId];
      try { localStorage.setItem(`exam-flags-${attemptId}`, JSON.stringify(next)); } catch { /* best-effort */ }
      return next;
    });
  };

  const setStationHighlights = (stationId, list) => {
    setHighlights((h) => {
      const next = { ...h, [stationId]: list };
      if (!list.length) delete next[stationId];
      try { localStorage.setItem(`exam-hl-${attemptId}`, JSON.stringify(next)); } catch { /* best-effort */ }
      return next;
    });
  };

  // Highlighter: capture the text selection inside a passage and mark it.
  const captureHighlight = (stationId) => {
    if (!highlightMode) return;
    const sel = window.getSelection();
    const text = sel ? sel.toString().replace(/\s+/g, " ").trim() : "";
    if (!text || text.length < 3) return;
    const existing = highlights[stationId] || [];
    if (!existing.some((s) => normalizeFragment(s) === normalizeFragment(text))) {
      setStationHighlights(stationId, [...existing, text]);
    }
    sel.removeAllRanges();
  };

  const removeHighlight = (stationId, matchedText) => {
    const target = normalizeFragment(matchedText);
    const existing = highlights[stationId] || [];
    setStationHighlights(
      stationId,
      existing.filter((s) => !(target.includes(normalizeFragment(s)) || normalizeFragment(s).includes(target)))
    );
  };

  const submitted = useRef(false);
  const answersRef = useRef({});
  const handleSubmitRef = useRef(null);
  const qRefs = useRef({});           // question id -> DOM node, for the navigator

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
      // Server-anchored clock: seconds_left counts from the attempt's real
      // start, so refreshing the page doesn't restart the timer.
      setTimeLeft(examData.seconds_left ?? (examData.time_limit_min || 60) * 60);
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
        setTimeLeft(data.seconds_left ?? (data.time_limit_min || 60) * 60);
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
    // Gentle urgency nudges so the auto-submit never blindsides anyone.
    if (timeLeft === 600) setTimeToast("10 minutes left");
    if (timeLeft === 300) setTimeToast("5 minutes left — the test submits itself at 0:00");
    const id = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(id);
  }, [timeLeft]);

  // ── Answer handlers ─────────────────────────────────────────────────────
  const saveToDB = useCallback((questionId, choiceIndex, valueText) => {
    setSaveState("saving");
    apiFetch(`/api/attempts/${attemptId}/answer`, {
      method: "POST",
      body: JSON.stringify({
        question_id: questionId,
        choice_index: choiceIndex ?? null,
        value_text: valueText ?? null,
      }),
    })
      .then((r) => {
        if (r.status === 409) {
          // Time ran out (or the attempt was submitted in another tab) —
          // submit now so the student lands on their results instead of
          // silently losing answers.
          handleSubmitRef.current?.();
          return;
        }
        setSaveState(r.ok ? "saved" : "error");
      })
      .catch(() => setSaveState("error"));
  }, [attemptId]);

  // Warn before leaving/refreshing while the test is unsubmitted.
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (submitted.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

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

  // Flat list across sections for global numbering + the navigator.
  const flatQuestions = [];
  (examData?.sections || []).forEach((sec) =>
    (sec.questions || []).forEach((q) => flatQuestions.push(q))
  );
  // Official IELTS numbering (1–40, continuous across sections). The server
  // sends num_start/num_end — a "Choose N letters" question spans N numbers
  // (e.g. 24–26); the fallback recomputes the same thing for older payloads.
  const qWeight = (q) =>
    q.qformat === "multi_select" ? (q.select_count || 2) : 1;
  const qNumber = {};
  const qSpan = {};   // id -> [start, end], for task-box headers
  let nextNum = 1;
  flatQuestions.forEach((q) => {
    const start = q.num_start ?? nextNum;
    const end = q.num_end ?? (start + qWeight(q) - 1);
    qNumber[q.id] = start === end ? `${start}` : `${start}–${end}`;
    qSpan[q.id] = [start, end];
    nextNum = end + 1;
  });
  const totalMarks = nextNum - 1;
  const isAnswered = (q) => {
    const a = answers[q.id];
    if (!a) return false;
    if (q.qformat === "multi_select") return parsePicked(a.value_text).length > 0;
    return a.choice_index != null || (a.value_text && a.value_text.trim() !== "");
  };
  // Progress counts question numbers, so a half-done "choose 3" shows as 2/40.
  const answeredCount = flatQuestions.reduce((n, q) => {
    const a = answers[q.id];
    if (!a) return n;
    if (q.qformat === "multi_select") {
      return n + Math.min(parsePicked(a.value_text).length, qWeight(q));
    }
    return n + (isAnswered(q) ? 1 : 0);
  }, 0);

  const jumpTo = (id) =>
    qRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "center" });

  // ── A single question row inside a task box ──────────────────────────────
  const renderQuestion = (q, isLast) => (
    <Box
      key={q.id}
      ref={(el) => { qRefs.current[q.id] = el; }}
      sx={(t) => ({
        px: 2, py: 1.5, scrollMarginTop: TOPBAR_HEIGHT + 96,
        borderBottom: isLast ? "none" : "1px solid",
        borderColor: "divider",
        ...(flags[q.id] && { boxShadow: `inset 3px 0 0 ${t.palette.warning.main}` }),
      })}
    >
      <Stack direction="row" alignItems="flex-start" spacing={1}>
        <Typography variant="body2" fontWeight={600} sx={{ flex: 1 }}>
          <Box component="span" sx={{ color: "primary.main", fontWeight: 700, mr: 1 }}>{qNumber[q.id]}</Box>
          {/* Gap-fill sentences render inside the input (inline blank), so
              don't repeat the prompt here. */}
          {q.qformat === "gap_fill" ? null : q.prompt}
        </Typography>
        <Tooltip title={flags[q.id] ? "Remove flag" : "Flag to review later"}>
          <IconButton
            size="small"
            onClick={() => toggleFlag(q.id)}
            color={flags[q.id] ? "warning" : "default"}
            sx={{ mt: -0.5 }}
          >
            {flags[q.id] ? <FlagRoundedIcon fontSize="small" /> : <OutlinedFlagRoundedIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Stack>

      {q.qtype === "explain" ? (
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
      ) : (
        <QuestionInput
          question={q}
          value={answers[q.id] || {}}
          onChange={(patch) => {
            if (patch.choice_index != null) {
              handleMCQ(q.id, patch.choice_index);
            } else if (q.qformat === "multi_select") {
              // Checkbox picks are discrete actions — persist immediately.
              setAnswers((a) => ({ ...a, [q.id]: { value_text: patch.value_text } }));
              saveToDB(q.id, null, patch.value_text);
            } else {
              handleShortChange(q.id, patch.value_text);
            }
          }}
          onCommitText={(v) => handleShortBlur(q.id, v)}
        />
      )}
    </Box>
  );

  // ── A task box: "Questions 1–7" + instructions + its question rows,
  //    matching how tasks are presented on the official computer-based test.
  const renderTaskGroup = (group, gi) => {
    const first = group.items[0];
    const last = group.items[group.items.length - 1];
    const start = qSpan[first.id]?.[0];
    const end = qSpan[last.id]?.[1];
    const label = start === end ? `Question ${start}` : `Questions ${start}–${end}`;
    return (
      <Paper key={group.key + gi} variant="outlined" sx={{ mb: 2.5, overflow: "hidden" }}>
        <Box
          sx={(t) => ({
            px: 2, py: 1.25,
            bgcolor: t.palette.mode === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.025)",
            borderBottom: "1px solid", borderColor: "divider",
          })}
        >
          <Typography variant="subtitle2" fontWeight={700}>{label}</Typography>
          {group.instructions && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              {group.instructions}
            </Typography>
          )}
        </Box>
        {group.items.map((q, i) => renderQuestion(q, i === group.items.length - 1))}
      </Paper>
    );
  };

  /** Per-skill reference panel: audio (listening), chart (writing), text. */
  const renderReference = (sec, skill) => {
    const hasAudio = skill === "listening" && sec.audio_url;
    const hasImage = skill === "writing" && sec.image_url;
    const hasText = !!(sec.passage_md && sec.passage_md.trim());
    const isReading = skill === "reading";
    // Reading & listening reference material stays pinned while the questions
    // scroll, so you can keep reading the passage / replaying audio. alignSelf
    // "start" stops the grid cell from stretching, which is what lets it stick.
    //
    // Only pin it from `md` up (where there's room): on phone / tablet-portrait
    // the layout is a single column, so a tall pinned panel would cover the
    // questions underneath. There it scrolls normally instead.
    const sticky = isReading || skill === "listening";
    const stickTop = TOPBAR_HEIGHT + 88;
    return (
      <Paper
        variant="outlined"
        sx={{
          p: 2.5,
          alignSelf: sticky ? { xs: "stretch", md: "start" } : "stretch",
          position: sticky ? { xs: "static", md: "sticky" } : "static",
          top: sticky ? { xs: "auto", md: stickTop } : "auto",
          maxHeight: sticky ? { xs: "none", md: `calc(100vh - ${stickTop + 24}px)` } : "none",
          overflowY: sticky ? { xs: "visible", md: "auto" } : "visible",
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            {REF_LABEL[skill] || "MATERIAL"}
          </Typography>
          {hasText && (
            <Stack direction="row" spacing={0.5} alignItems="center">
              {(highlights[sec.station_id] || []).length > 0 && (
                <Button
                  size="small"
                  color="inherit"
                  onClick={() => setStationHighlights(sec.station_id, [])}
                  sx={{ fontSize: 11, color: "text.secondary", textTransform: "none", minWidth: 0 }}
                >
                  Clear
                </Button>
              )}
              <Tooltip title={highlightMode ? "Highlighter on — select text to mark it, click a mark to remove it" : "Turn on the highlighter"}>
                <IconButton
                  size="small"
                  color={highlightMode ? "warning" : "default"}
                  onClick={() => setHighlightMode((v) => !v)}
                >
                  <BorderColorRoundedIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            </Stack>
          )}
        </Stack>
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
          <Typography
            variant="body2"
            component="div"
            onMouseUp={() => captureHighlight(sec.station_id)}
            onTouchEnd={() => captureHighlight(sec.station_id)}
            sx={{
              lineHeight: 1.9,
              ...(highlightMode && {
                cursor: "text",
                "& ::selection": { background: "rgba(255,193,7,0.4)" },
              }),
            }}
          >
            <HighlightedText
              text={sec.passage_md}
              sentences={highlights[sec.station_id] || []}
              color="warning"
              onMarkClick={highlightMode ? (t) => removeHighlight(sec.station_id, t) : undefined}
            />
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

  // Timer urgency: calm → amber at 10 min → red (pulsing) at 5 min.
  const timerColor =
    timeLeft === null ? "text.primary"
    : timeLeft < 300 ? "error.main"
    : timeLeft < 600 ? "warning.main"
    : "text.primary";
  const flaggedCount = flatQuestions.filter((q) => flags[q.id]).length;

  return (
    <Box>
      {/* ── Top bar ── */}
      <Paper
        variant="outlined"
        sx={{
          p: 2, mb: 3,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: 1,
          position: "sticky", top: TOPBAR_HEIGHT, zIndex: 5, bgcolor: "background.paper",
        }}
      >
        <Typography variant="h6" fontWeight={600} noWrap sx={{ maxWidth: { xs: "100%", sm: "60%" } }}>
          {examData?.exam_name}
        </Typography>
        <Stack direction="row" spacing={{ xs: 1, sm: 2 }} alignItems="center" sx={{ flexWrap: "wrap" }}>
          {saveState !== "idle" && (
            <Tooltip title={saveState === "error" ? "Couldn't save — check your connection" : "Your answers are saved automatically"}>
              <Chip
                size="small"
                variant="outlined"
                color={saveState === "error" ? "error" : "success"}
                icon={saveState === "saving" ? <CloudSyncRoundedIcon /> : <CloudDoneRoundedIcon />}
                label={saveState === "saving" ? "Saving…" : saveState === "error" ? "Not saved" : "Saved"}
              />
            </Tooltip>
          )}
          {timeLeft !== null && (
            <Typography
              variant="h6"
              fontWeight={700}
              sx={{
                color: timerColor,
                ...(timeLeft < 300 && {
                  "@keyframes timerPulse": {
                    "0%, 100%": { opacity: 1 },
                    "50%": { opacity: 0.55 },
                  },
                  animation: "timerPulse 1.6s ease-in-out infinite",
                }),
              }}
            >
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

      {/* ── Question navigator ── */}
      {flatQuestions.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
            <CheckCircleRoundedIcon fontSize="small" color="success" />
            <Typography variant="body2" fontWeight={600}>
              {answeredCount} / {totalMarks} answered
            </Typography>
            {flaggedCount > 0 && (
              <Chip
                size="small"
                color="warning"
                variant="outlined"
                icon={<FlagRoundedIcon />}
                label={`${flaggedCount} flagged`}
              />
            )}
            <Box sx={{ flexGrow: 1, ml: 1 }}>
              <LinearProgress
                variant="determinate"
                value={(answeredCount / Math.max(totalMarks, 1)) * 100}
                color="success"
                sx={{ borderRadius: 1 }}
              />
            </Box>
          </Stack>
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
            {flatQuestions.map((q) => {
              const done = isAnswered(q);
              const flagged = !!flags[q.id];
              return (
                <Chip
                  key={q.id}
                  label={qNumber[q.id]}
                  size="small"
                  onClick={() => jumpTo(q.id)}
                  icon={flagged ? <FlagRoundedIcon sx={{ fontSize: 13 }} /> : undefined}
                  color={flagged ? "warning" : done ? "success" : "default"}
                  variant={done || flagged ? "filled" : "outlined"}
                  sx={{ minWidth: 34, cursor: "pointer" }}
                />
              );
            })}
          </Stack>
        </Paper>
      )}

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
                <Box>{groupTasks(sec.questions).map(renderTaskGroup)}</Box>
              </Box>
            ) : (
              /* Listening / Writing / Speaking: material on top, questions below */
              <Stack spacing={3}>
                {renderReference(sec, skill)}
                <Box>{groupTasks(sec.questions).map(renderTaskGroup)}</Box>
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

      <Snackbar
        open={!!timeToast}
        autoHideDuration={6000}
        onClose={() => setTimeToast("")}
        message={timeToast}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      />
    </Box>
  );
}
