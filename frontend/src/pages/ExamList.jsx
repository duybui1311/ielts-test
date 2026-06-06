import React, { useEffect, useState } from "react";
import {
  Box, Typography, Card, CardContent, CardActions,
  Button, Chip, Stack, CircularProgress, Alert,
} from "@mui/material";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import QuizIcon from "@mui/icons-material/Quiz";
import MenuBookRoundedIcon from "@mui/icons-material/MenuBookRounded";
import HeadphonesRoundedIcon from "@mui/icons-material/HeadphonesRounded";
import EditNoteRoundedIcon from "@mui/icons-material/EditNoteRounded";
import MicRoundedIcon from "@mui/icons-material/MicRounded";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import { PageHeader, SkillChip, SKILL_COLOR } from "../component/ui";

// Each skill gets its own section. Tests are organised by their (single) skill.
const SKILL_SECTIONS = [
  { key: "reading", label: "Reading", icon: <MenuBookRoundedIcon /> },
  { key: "listening", label: "Listening", icon: <HeadphonesRoundedIcon /> },
  { key: "writing", label: "Writing", icon: <EditNoteRoundedIcon /> },
  { key: "speaking", label: "Speaking", icon: <MicRoundedIcon /> },
];

export default function ExamList() {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    apiFetch("/api/exams")
      .then((r) => r.json())
      .then((d) => setExams(Array.isArray(d) ? d : []))
      .catch(() => setError("Could not load exams."))
      .finally(() => setLoading(false));
  }, []);

  const handleStart = async (examId) => {
    const userId = parseInt(localStorage.getItem("osce-user-id"), 10);
    if (!userId) { navigate("/login"); return; }
    setStarting(examId);
    try {
      const res = await apiFetch("/api/attempts/start", {
        method: "POST",
        body: JSON.stringify({ exam_id: examId, user_id: userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to start");
      navigate(`/exam/${data.attempt_id}`, { state: data });
    } catch (e) {
      setError(e.message);
      setStarting(null);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  // Group each exam under its primary skill (skills[0]); fall back to "reading".
  const bySkill = { reading: [], listening: [], writing: [], speaking: [] };
  for (const exam of exams) {
    const skill = (exam.skills && exam.skills[0]) || "reading";
    (bySkill[skill] || bySkill.reading).push(exam);
  }

  const renderCard = (exam) => (
    <Card
      key={exam.id}
      sx={{
        display: "flex",
        flexDirection: "column",
        transition: "transform .15s ease, box-shadow .15s ease",
        "&:hover": { transform: "translateY(-3px)" },
      }}
    >
      <CardContent sx={{ flexGrow: 1 }}>
        <Typography variant="h6" fontWeight={700} gutterBottom>
          {exam.name}
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap mb={2}>
          {(exam.skills || []).map((s) => <SkillChip key={s} skill={s} />)}
          <Chip label={exam.difficulty} size="small" variant="outlined" sx={{ textTransform: "capitalize" }} />
        </Stack>
        <Stack direction="row" spacing={2}>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <AccessTimeIcon fontSize="small" color="action" />
            <Typography variant="body2" color="text.secondary">
              {exam.time_limit_min} min
            </Typography>
          </Stack>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <QuizIcon fontSize="small" color="action" />
            <Typography variant="body2" color="text.secondary">
              {exam.total_questions} questions
            </Typography>
          </Stack>
        </Stack>
      </CardContent>
      <CardActions sx={{ px: 2, pb: 2 }}>
        <Button
          variant="contained"
          fullWidth
          disabled={starting === exam.id}
          onClick={() => handleStart(exam.id)}
        >
          {starting === exam.id ? "Starting…" : "Start Test"}
        </Button>
      </CardActions>
    </Card>
  );

  return (
    <Box>
      <PageHeader title="My Tests" subtitle="Practise one skill at a time — pick a test below." />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {exams.length === 0 && !error && (
        <Card sx={{ p: 5, textAlign: "center" }}>
          <Typography color="text.secondary">No tests available yet.</Typography>
        </Card>
      )}

      {exams.length > 0 && SKILL_SECTIONS.map(({ key, label, icon }) => {
        const list = bySkill[key] || [];
        return (
          <Box key={key} sx={{ mb: 4 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
              <Box sx={{ color: `${SKILL_COLOR[key]}.main`, display: "flex" }}>{icon}</Box>
              <Typography variant="h6" fontWeight={700}>{label}</Typography>
              <Chip label={list.length} size="small" color={SKILL_COLOR[key]} />
            </Stack>

            {list.length === 0 ? (
              <Card variant="outlined" sx={{ p: 3, textAlign: "center", bgcolor: "transparent" }}>
                <Typography variant="body2" color="text.secondary">
                  No {label.toLowerCase()} tests yet.
                </Typography>
              </Card>
            ) : (
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                  gap: 2,
                }}
              >
                {list.map(renderCard)}
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
