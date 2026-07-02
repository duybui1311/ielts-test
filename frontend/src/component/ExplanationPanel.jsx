import * as React from "react";
import {
  Box, Button, Chip, Collapse, Stack, Typography, alpha, CircularProgress, Alert,
} from "@mui/material";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import LightbulbRoundedIcon from "@mui/icons-material/LightbulbRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import SwapHorizRoundedIcon from "@mui/icons-material/SwapHorizRounded";
import MyLocationRoundedIcon from "@mui/icons-material/MyLocationRounded";
import { apiFetch } from "../api";

/**
 * Collapsible "Show explanation" panel for a Reading/Listening question.
 *
 * Shows the cached explanation, paraphrase map and supporting sentences; if the
 * question hasn't been explained yet it generates one on demand via
 * POST /api/questions/{id}/explain. When the student answered wrong, pass
 * `studentAnswer` + `wasWrong` and the panel also fetches a personalized
 * "why your answer is wrong" note (never cached — it's about this student).
 * `onLocate(sentence)` (optional) adds a "Show in passage" action per support
 * sentence, e.g. to scroll the passage to the highlighted evidence.
 */
export default function ExplanationPanel({
  questionId,
  explanation: initialExplanation,
  supportSentences: initialSupport = [],
  paraphrases: initialParaphrases = [],
  studentAnswer = null,
  wasWrong = false,
  onLocate,
}) {
  const [open, setOpen] = React.useState(false);
  const [explanation, setExplanation] = React.useState(initialExplanation || "");
  const [support, setSupport] = React.useState(initialSupport || []);
  const [paraphrases, setParaphrases] = React.useState(initialParaphrases || []);
  const [mistakeNote, setMistakeNote] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [reported, setReported] = React.useState(false);
  const fetchedPersonal = React.useRef(false);

  const reportExplanation = React.useCallback(async () => {
    if (!questionId) return;
    setReported(true);   // optimistic; a failed report is non-critical
    try {
      await apiFetch(`/api/questions/${questionId}/report-explanation`, { method: "POST" });
    } catch {
      // ignore — the flag is best-effort feedback
    }
  }, [questionId]);

  const generate = React.useCallback(async () => {
    if (!questionId) return;
    setLoading(true);
    setError("");
    try {
      const wantPersonal = wasWrong && !!studentAnswer;
      const res = await apiFetch(`/api/questions/${questionId}/explain`, {
        method: "POST",
        body: JSON.stringify(wantPersonal ? { student_answer: studentAnswer } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Could not generate an explanation.");
      setExplanation(data.explanation || "");
      setSupport(data.support_sentences || []);
      setParaphrases(data.paraphrases || []);
      if (data.mistake_note) setMistakeNote(data.mistake_note);
      if (wantPersonal) fetchedPersonal.current = true;
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [questionId, studentAnswer, wasWrong]);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    // Fetch when nothing is cached yet, or when a personalized note is wanted
    // and hasn't been fetched. Cached generic content stays visible meanwhile.
    const wantPersonal = wasWrong && !!studentAnswer && !fetchedPersonal.current;
    if (next && !loading && (!explanation || wantPersonal)) generate();
  };

  return (
    <Box sx={{ mt: 1.5 }}>
      <Button
        size="small"
        variant="text"
        onClick={handleToggle}
        startIcon={<LightbulbRoundedIcon />}
        endIcon={
          <ExpandMoreRoundedIcon
            sx={{ transition: "transform .2s ease", transform: open ? "rotate(180deg)" : "none" }}
          />
        }
        sx={{ color: "secondary.main", fontWeight: 700 }}
      >
        {open ? "Hide explanation" : wasWrong ? "Explain my mistake" : "Show explanation"}
      </Button>

      <Collapse in={open} unmountOnExit>
        <Box
          sx={(theme) => ({
            mt: 1,
            p: 2,
            borderRadius: 2,
            border: `1px solid ${alpha(theme.palette.secondary.main, 0.35)}`,
            bgcolor: alpha(theme.palette.secondary.main, theme.palette.mode === "dark" ? 0.1 : 0.06),
          })}
        >
          {loading && !explanation ? (
            <Stack direction="row" spacing={1.5} alignItems="center">
              <CircularProgress size={18} color="secondary" />
              <Typography variant="body2" color="text.secondary">
                Generating explanation…
              </Typography>
            </Stack>
          ) : error && !explanation ? (
            <Stack spacing={1}>
              <Alert severity="warning" sx={{ py: 0.5 }}>{error}</Alert>
              <Button size="small" onClick={generate} startIcon={<AutoAwesomeRoundedIcon />}>
                Try again
              </Button>
            </Stack>
          ) : explanation ? (
            <Stack spacing={1.5}>
              {/* Personalized: why the student's own answer is wrong */}
              {wasWrong && (mistakeNote || loading) && (
                <Box
                  sx={(theme) => ({
                    p: 1.5,
                    borderRadius: 1.5,
                    border: `1px solid ${alpha(theme.palette.error.main, 0.35)}`,
                    bgcolor: alpha(theme.palette.error.main, theme.palette.mode === "dark" ? 0.12 : 0.06),
                  })}
                >
                  <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.5 }}>
                    <ErrorOutlineRoundedIcon sx={{ fontSize: 16, color: "error.main" }} />
                    <Typography variant="overline" sx={{ color: "error.main", lineHeight: 1.5 }}>
                      About your answer
                    </Typography>
                  </Stack>
                  {mistakeNote ? (
                    <Typography variant="body2" sx={{ lineHeight: 1.7 }}>{mistakeNote}</Typography>
                  ) : (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <CircularProgress size={14} color="error" />
                      <Typography variant="caption" color="text.secondary">
                        Looking at what went wrong…
                      </Typography>
                    </Stack>
                  )}
                </Box>
              )}

              <Stack direction="row" spacing={0.75} alignItems="center">
                <AutoAwesomeRoundedIcon sx={{ fontSize: 16, color: "secondary.main" }} />
                <Typography variant="overline" sx={{ color: "secondary.main" }}>
                  Why this answer
                </Typography>
              </Stack>
              <Typography variant="body2" sx={{ lineHeight: 1.7 }}>
                {explanation}
              </Typography>

              {/* Paraphrase map: how the question rewords the passage */}
              {paraphrases && paraphrases.length > 0 && (
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                    Paraphrase map
                  </Typography>
                  <Stack spacing={0.75} sx={{ mt: 0.5 }}>
                    {paraphrases.map((p, i) => (
                      <Stack
                        key={i}
                        direction="row"
                        spacing={0.75}
                        alignItems="center"
                        flexWrap="wrap"
                        useFlexGap
                      >
                        <Chip
                          size="small"
                          label={p.question_phrase}
                          sx={(theme) => ({
                            bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.2 : 0.1),
                            fontWeight: 600, height: "auto",
                            "& .MuiChip-label": { whiteSpace: "normal", py: 0.4 },
                          })}
                        />
                        <SwapHorizRoundedIcon sx={{ fontSize: 16, color: "text.disabled" }} />
                        <Chip
                          size="small"
                          label={p.passage_phrase}
                          onClick={onLocate ? () => onLocate(p.passage_phrase) : undefined}
                          sx={(theme) => ({
                            bgcolor: alpha(theme.palette.secondary.main, theme.palette.mode === "dark" ? 0.22 : 0.14),
                            fontWeight: 600, height: "auto",
                            "& .MuiChip-label": { whiteSpace: "normal", py: 0.4 },
                          })}
                        />
                      </Stack>
                    ))}
                  </Stack>
                </Box>
              )}

              {support && support.length > 0 && (
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                    Supporting evidence
                  </Typography>
                  <Stack spacing={0.75} sx={{ mt: 0.5 }}>
                    {support.map((s, i) => (
                      <Box
                        key={i}
                        sx={(theme) => ({
                          px: 1.25,
                          py: 0.75,
                          borderRadius: 1.5,
                          borderLeft: `3px solid ${theme.palette.secondary.main}`,
                          bgcolor: alpha(theme.palette.secondary.main, theme.palette.mode === "dark" ? 0.16 : 0.12),
                        })}
                      >
                        <Typography variant="body2" sx={{ fontStyle: "italic" }}>“{s}”</Typography>
                        {onLocate && (
                          <Button
                            size="small"
                            variant="text"
                            startIcon={<MyLocationRoundedIcon sx={{ fontSize: 14 }} />}
                            onClick={() => onLocate(s)}
                            sx={{ mt: 0.25, px: 0.5, fontSize: 12, textTransform: "none", color: "secondary.main" }}
                          >
                            Show in passage
                          </Button>
                        )}
                      </Box>
                    ))}
                  </Stack>
                </Box>
              )}
              <Box>
                {reported ? (
                  <Typography variant="caption" color="text.secondary">
                    Thanks — this explanation was reported for review.
                  </Typography>
                ) : (
                  <Button
                    size="small"
                    variant="text"
                    color="inherit"
                    onClick={reportExplanation}
                    sx={{ color: "text.secondary", textTransform: "none", fontSize: 12, px: 0 }}
                  >
                    Report this explanation
                  </Button>
                )}
              </Box>
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No explanation available.
            </Typography>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}
