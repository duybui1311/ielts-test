import * as React from "react";
import {
  Box, Card, CardActionArea, Stack, Typography, Button, CircularProgress,
  Alert, LinearProgress, alpha,
} from "@mui/material";
import FitnessCenterRoundedIcon from "@mui/icons-material/FitnessCenterRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import { useParams, useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import { PageHeader } from "../component/ui";
import QuestionStem from "../component/QuestionStem";

function accuracyColor(theme, accuracy) {
  if (accuracy == null) return theme.palette.text.disabled;
  if (accuracy >= 85) return theme.palette.success.main;
  if (accuracy >= 60) return theme.palette.warning.main;
  return theme.palette.error.main;
}

/* ───────────────────────── Type picker ───────────────────────── */

function SkillPicker() {
  const navigate = useNavigate();
  const [skills, setSkills] = React.useState(null);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    apiFetch("/api/practice/skills")
      .then((r) => (r.ok ? r.json() : []))
      .then(setSkills)
      .catch(() => setError("Could not load practice types."));
  }, []);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!skills) {
    return <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}><CircularProgress /></Box>;
  }

  return (
    <Box>
      <PageHeader
        eyebrow="AI practice"
        title="Practice by Type"
        subtitle="Drill a single question type with instant grading and AI explanations."
        icon={<FitnessCenterRoundedIcon />}
      />
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "repeat(3, 1fr)" }, gap: 2 }}>
        {skills.map((s) => {
          const disabled = s.available === 0;
          return (
            <Card key={s.sub_skill} sx={{ "&:hover": disabled ? undefined : { transform: "translateY(-3px)" } }}>
              <CardActionArea
                disabled={disabled}
                onClick={() => navigate(`/practice/${s.sub_skill}`)}
                sx={{ p: 2.5, height: "100%" }}
              >
                <Stack direction="row" spacing={2} alignItems="center">
                  <Box
                    sx={(t) => ({
                      width: 48, height: 48, borderRadius: 2.5, flexShrink: 0,
                      display: "grid", placeItems: "center",
                      color: accuracyColor(t, s.accuracy),
                      bgcolor: alpha(accuracyColor(t, s.accuracy), t.palette.mode === "dark" ? 0.2 : 0.12),
                    })}
                  >
                    <FitnessCenterRoundedIcon />
                  </Box>
                  <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                    <Typography fontWeight={700} noWrap>{s.label}</Typography>
                    <Typography variant="body2" color="text.secondary" noWrap>
                      {disabled
                        ? "No questions yet"
                        : s.accuracy == null
                        ? "Not enough data"
                        : `${s.accuracy}% accuracy`}
                    </Typography>
                  </Box>
                  {!disabled && <ChevronRightRoundedIcon sx={{ color: "text.disabled" }} />}
                </Stack>
                {!disabled && s.accuracy != null && (
                  <LinearProgress
                    variant="determinate"
                    value={s.accuracy}
                    sx={(t) => ({
                      mt: 2,
                      "& .MuiLinearProgress-bar": { backgroundColor: accuracyColor(t, s.accuracy) },
                    })}
                  />
                )}
              </CardActionArea>
            </Card>
          );
        })}
      </Box>
    </Box>
  );
}

/* ───────────────────────── Drill ───────────────────────── */

function Drill({ subSkill }) {
  const navigate = useNavigate();
  const [data, setData] = React.useState(null);
  const [answers, setAnswers] = React.useState({});
  const [result, setResult] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");
  const [round, setRound] = React.useState(0); // bump to fetch a fresh set in place

  React.useEffect(() => {
    setData(null); setAnswers({}); setResult(null); setError("");
    apiFetch(`/api/practice/${subSkill}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.detail || "Could not load questions.");
        return d;
      })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [subSkill, round]);

  const tryMore = () => {
    setRound((n) => n + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async () => {
    setSubmitting(true);
    setError("");
    try {
      const payload = {
        answers: (data.questions || []).map((q) => ({
          question_id: q.id,
          choice_index: answers[q.id]?.choice_index ?? null,
          value_text: answers[q.id]?.value_text ?? null,
        })),
      };
      const res = await apiFetch(`/api/practice/${subSkill}/submit`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || "Could not submit.");
      setResult(d);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (error && !data) {
    return (
      <Box>
        <Button startIcon={<ArrowBackRoundedIcon />} onClick={() => navigate("/practice")} sx={{ mb: 2 }}>
          All types
        </Button>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }
  if (!data) {
    return <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}><CircularProgress /></Box>;
  }

  const resultById = {};
  (result?.results || []).forEach((r) => { resultById[r.question_id] = r; });

  return (
    <Box>
      <Button startIcon={<ArrowBackRoundedIcon />} onClick={() => navigate("/practice")} sx={{ mb: 1 }}>
        All types
      </Button>
      <PageHeader
        title={data.label}
        subtitle={result ? "Review your answers and explanations below." : `${data.questions.length} questions · answer them all, then submit.`}
        action={
          result ? (
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="h5" fontWeight={800} color={result.correct / result.total >= 0.6 ? "success.main" : "error.main"}>
                {result.correct}/{result.total}
              </Typography>
              <Button variant="contained" onClick={tryMore}>
                Try more
              </Button>
            </Stack>
          ) : undefined
        }
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Stack spacing={2}>
        {data.questions.map((q, i) => (
          <QuestionStem
            key={q.id}
            question={q}
            number={i + 1}
            value={answers[q.id] || {}}
            onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
            result={resultById[q.id]}
          />
        ))}
      </Stack>

      {!result && (
        <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 3 }}>
          <Button variant="contained" size="large" disabled={submitting} onClick={submit}>
            {submitting ? "Grading…" : "Submit answers"}
          </Button>
        </Box>
      )}
    </Box>
  );
}

export default function Practice() {
  const { subSkill } = useParams();
  return subSkill ? <Drill subSkill={subSkill} /> : <SkillPicker />;
}
