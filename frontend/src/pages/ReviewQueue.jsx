import * as React from "react";
import {
  Box, Card, Stack, Typography, Button, CircularProgress, Alert, LinearProgress,
} from "@mui/material";
import ReplayRoundedIcon from "@mui/icons-material/ReplayRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import { PageHeader } from "../component/ui";
import QuestionStem from "../component/QuestionStem";

const norm = (t) => (t || "").trim().toLowerCase().replace(/\s+/g, " ");

function gradeLocally(item, value) {
  if (item.qtype === "mcq") {
    const ok = value.choice_index != null && value.choice_index === item.correct_index;
    const opts = item.options || [];
    return {
      is_correct: ok,
      correct_answer: item.correct_index != null && item.correct_index < opts.length ? opts[item.correct_index] : null,
      explanation: item.explanation,
      support_sentences: item.support_sentences,
    };
  }
  const accept = (item.accept_answers || []).map(norm);
  const ok = accept.includes(norm(value.value_text));
  return {
    is_correct: ok,
    correct_answer: (item.accept_answers || []).join(", ") || null,
    explanation: item.explanation,
    support_sentences: item.support_sentences,
  };
}

export default function ReviewQueue() {
  const navigate = useNavigate();
  const [items, setItems] = React.useState(null);
  const [idx, setIdx] = React.useState(0);
  const [value, setValue] = React.useState({});
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState("");
  const [done, setDone] = React.useState(0); // reviewed count

  React.useEffect(() => {
    apiFetch("/api/review/due")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setItems(Array.isArray(d) ? d : []))
      .catch(() => setError("Could not load your review queue."));
  }, []);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!items) {
    return <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}><CircularProgress /></Box>;
  }

  const total = items.length;

  if (total === 0 || idx >= total) {
    return (
      <Box>
        <PageHeader eyebrow="Spaced repetition" title="Spaced Review" subtitle="Resurface the questions you got wrong, right before you'd forget them." icon={<ReplayRoundedIcon />} />
        <Card sx={{ p: 5, textAlign: "center" }}>
          <CheckCircleRoundedIcon color="success" sx={{ fontSize: 48, mb: 1 }} />
          <Typography variant="h6" gutterBottom>
            {done > 0 ? "Review complete!" : "Nothing due right now"}
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            {done > 0
              ? `You reviewed ${done} question${done === 1 ? "" : "s"}. Come back when more are due.`
              : "Missed questions from tests and practice will show up here when they're due."}
          </Typography>
          <Stack direction="row" spacing={1.5} justifyContent="center">
            <Button variant="contained" onClick={() => navigate("/practice")}>Practice by type</Button>
            <Button variant="outlined" onClick={() => navigate("/exams")}>Take a test</Button>
          </Stack>
        </Card>
      </Box>
    );
  }

  const item = items[idx];

  const check = () => setResult(gradeLocally(item, value));

  const next = async () => {
    try {
      await apiFetch(`/api/review/${item.id}/result`, {
        method: "POST",
        body: JSON.stringify({ correct: !!result.is_correct }),
      });
    } catch { /* schedule update is best-effort */ }
    setDone((d) => d + 1);
    setIdx((i) => i + 1);
    setValue({});
    setResult(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const answered = value.choice_index != null || (value.value_text && value.value_text.trim() !== "");

  return (
    <Box>
      <PageHeader
        eyebrow="Spaced repetition"
        title="Spaced Review"
        subtitle="Resurface the questions you got wrong, right before you'd forget them."
        icon={<ReplayRoundedIcon />}
      />

      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
        <ReplayRoundedIcon color="primary" fontSize="small" />
        <Typography variant="body2" fontWeight={600}>
          {idx + 1} / {total} due
        </Typography>
        <Box sx={{ flexGrow: 1 }}>
          <LinearProgress variant="determinate" value={(idx / total) * 100} />
        </Box>
      </Stack>

      <QuestionStem
        question={item}
        value={value}
        onChange={setValue}
        result={result}
        showPassage
      />

      <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 3 }}>
        {!result ? (
          <Button variant="contained" size="large" disabled={!answered} onClick={check}>
            Check answer
          </Button>
        ) : (
          <Button variant="contained" size="large" onClick={next}>
            {idx + 1 >= total ? "Finish" : "Next question"}
          </Button>
        )}
      </Box>
    </Box>
  );
}
