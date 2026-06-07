import React, { useEffect, useState } from "react";
import {
  Box, Typography, Card, CardContent, CardActions,
  Button, Chip, Stack, CircularProgress, Alert, Tabs, Tab,
} from "@mui/material";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import QuizIcon from "@mui/icons-material/Quiz";
import MenuBookRoundedIcon from "@mui/icons-material/MenuBookRounded";
import HeadphonesRoundedIcon from "@mui/icons-material/HeadphonesRounded";
import EditNoteRoundedIcon from "@mui/icons-material/EditNoteRounded";
import MicRoundedIcon from "@mui/icons-material/MicRounded";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import { PageHeader, SkillChip, AiBadge, skillHex } from "../component/ui";
import Writing from "./Writing";
import Speaking from "./Speaking";

const TABS = [
  { key: "reading", label: "Reading", icon: <MenuBookRoundedIcon /> },
  { key: "listening", label: "Listening", icon: <HeadphonesRoundedIcon /> },
  { key: "writing", label: "Writing", icon: <EditNoteRoundedIcon />, ai: true },
  { key: "speaking", label: "Speaking", icon: <MicRoundedIcon />, ai: true },
];

function ExamGrid({ exams, skill, starting, onStart, hideWhenEmpty = false, heading = null }) {
  const list = exams.filter((e) => ((e.skills && e.skills[0]) || "reading") === skill);
  if (list.length === 0) {
    if (hideWhenEmpty) return null;
    return (
      <Card variant="outlined" sx={{ p: 4, textAlign: "center", bgcolor: "transparent" }}>
        <Typography color="text.secondary">No {skill} tests yet.</Typography>
      </Card>
    );
  }
  return (
    <Box sx={{ mb: heading ? 3 : 0 }}>
      {heading && <Typography variant="subtitle1" sx={{ mb: 1.5 }}>{heading}</Typography>}
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 2 }}>
      {list.map((exam) => (
        <Card
          key={exam.id}
          sx={{
            display: "flex",
            flexDirection: "column",
            borderLeft: `4px solid ${skillHex(skill)}`,
            "&:hover": { transform: "translateY(-4px)", boxShadow: (t) => t.palette.mode === "dark" ? "0 8px 20px rgba(0,0,0,0.55), 0 22px 48px rgba(0,0,0,0.6)" : "0 6px 16px rgba(79,70,229,0.10), 0 18px 40px rgba(16,24,40,0.12)" },
          }}
        >
          <CardContent sx={{ flexGrow: 1 }}>
            <Typography variant="h6" fontWeight={700} gutterBottom>{exam.name}</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap mb={2}>
              {(exam.skills || []).map((s) => <SkillChip key={s} skill={s} />)}
              <Chip label={exam.difficulty} size="small" variant="outlined" sx={{ textTransform: "capitalize" }} />
            </Stack>
            <Stack direction="row" spacing={2}>
              <Stack direction="row" alignItems="center" spacing={0.5}>
                <AccessTimeIcon fontSize="small" color="action" />
                <Typography variant="body2" color="text.secondary">{exam.time_limit_min} min</Typography>
              </Stack>
              <Stack direction="row" alignItems="center" spacing={0.5}>
                <QuizIcon fontSize="small" color="action" />
                <Typography variant="body2" color="text.secondary">{exam.total_questions} questions</Typography>
              </Stack>
            </Stack>
          </CardContent>
          <CardActions sx={{ px: 2, pb: 2 }}>
            <Button variant="contained" fullWidth disabled={starting === exam.id} onClick={() => onStart(exam.id)}>
              {starting === exam.id ? "Starting…" : "Start Test"}
            </Button>
          </CardActions>
        </Card>
      ))}
      </Box>
    </Box>
  );
}

export default function ExamList() {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(null);
  const [tab, setTab] = useState(0);
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
    return <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}><CircularProgress /></Box>;
  }

  const skill = TABS[tab].key;

  return (
    <Box>
      <PageHeader title="My Tests" subtitle="Practise one skill at a time — choose a tab below." />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}
      >
        {TABS.map((t) => (
          <Tab
            key={t.key}
            icon={t.icon}
            iconPosition="start"
            label={
              t.ai ? (
                <Stack direction="row" spacing={0.75} alignItems="center">
                  <span>{t.label}</span>
                  <AiBadge />
                </Stack>
              ) : (
                t.label
              )
            }
            sx={{ minHeight: 48 }}
          />
        ))}
      </Tabs>

      {skill === "reading" && <ExamGrid exams={exams} skill="reading" starting={starting} onStart={handleStart} />}
      {skill === "listening" && <ExamGrid exams={exams} skill="listening" starting={starting} onStart={handleStart} />}
      {skill === "writing" && (
        <>
          <ExamGrid exams={exams} skill="writing" starting={starting} onStart={handleStart} hideWhenEmpty heading="Exam-based tests" />
          <Writing embedded />
        </>
      )}
      {skill === "speaking" && (
        <>
          <ExamGrid exams={exams} skill="speaking" starting={starting} onStart={handleStart} hideWhenEmpty heading="Exam-based tests" />
          <Speaking embedded />
        </>
      )}
    </Box>
  );
}
