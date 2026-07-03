import React, { useEffect, useState } from "react";
import {
  Box, Typography, Card, CardContent, CardActions,
  Button, Chip, Stack, CircularProgress, Alert, Tabs, Tab, alpha,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
} from "@mui/material";
import { motion } from "framer-motion";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import QuizIcon from "@mui/icons-material/Quiz";
import MenuBookRoundedIcon from "@mui/icons-material/MenuBookRounded";
import HeadphonesRoundedIcon from "@mui/icons-material/HeadphonesRounded";
import EditNoteRoundedIcon from "@mui/icons-material/EditNoteRounded";
import MicRoundedIcon from "@mui/icons-material/MicRounded";
import SchoolRoundedIcon from "@mui/icons-material/SchoolRounded";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import { PageHeader, SkillChip, AiBadge, skillHex, skillGradient } from "../component/ui";
import Writing from "./Writing";
import Speaking from "./Speaking";

const SKILL_ICON = {
  reading: <MenuBookRoundedIcon />,
  listening: <HeadphonesRoundedIcon />,
  writing: <EditNoteRoundedIcon />,
  speaking: <MicRoundedIcon />,
};

const TABS = [
  { key: "reading", label: "Reading", icon: <MenuBookRoundedIcon /> },
  { key: "listening", label: "Listening", icon: <HeadphonesRoundedIcon /> },
  { key: "writing", label: "Writing", icon: <EditNoteRoundedIcon />, ai: true },
  { key: "speaking", label: "Speaking", icon: <MicRoundedIcon />, ai: true },
];

function ExamCard({ exam, skill, starting, onStart, index = 0 }) {
  const hex = skillHex(skill);
  return (
    <Card
      component={motion.div}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index, 8) * 0.06, ease: [0.22, 1, 0.36, 1] }}
      sx={(t) => ({
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
        pt: 0.5,
        // gradient accent strip on top
        "&::before": {
          content: '""',
          position: "absolute",
          top: 0, left: 0, right: 0, height: 5,
          background: skillGradient(skill),
        },
        "&:hover": {
          transform: "translateY(-5px)",
          boxShadow: t.customShadows.hover,
          borderColor: alpha(hex, 0.45),
        },
      })}
    >
      <CardContent sx={{ flexGrow: 1 }}>
        <Stack direction="row" spacing={1.5} alignItems="flex-start" sx={{ mb: 1.5 }}>
          <Box
            sx={{
              width: 44, height: 44, borderRadius: 2.5, flexShrink: 0,
              display: "grid", placeItems: "center", color: "#fff",
              background: skillGradient(skill),
              boxShadow: `0 6px 16px ${alpha(hex, 0.4)}`,
            }}
          >
            {SKILL_ICON[skill] || <MenuBookRoundedIcon />}
          </Box>
          <Typography variant="h6" fontWeight={800} sx={{ lineHeight: 1.25 }}>
            {exam.name}
          </Typography>
        </Stack>

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
  );
}

function ExamGrid({ exams, skill, starting, onStart, hideWhenEmpty = false, heading = null }) {
  const list = exams.filter((e) => ((e.skills && e.skills[0]) || "reading") === skill);
  if (list.length === 0) {
    if (hideWhenEmpty) return null;
    return (
      <Card variant="outlined" sx={{ p: 5, textAlign: "center", bgcolor: "transparent" }}>
        <Box
          sx={(t) => ({
            width: 56, height: 56, borderRadius: 3, mx: "auto", mb: 1.5,
            display: "grid", placeItems: "center", color: skillHex(skill),
            bgcolor: alpha(skillHex(skill), t.palette.mode === "dark" ? 0.2 : 0.1),
          })}
        >
          {SKILL_ICON[skill]}
        </Box>
        <Typography color="text.secondary">No {skill} tests yet.</Typography>
      </Card>
    );
  }
  return (
    <Box sx={{ mb: heading ? 3 : 0 }}>
      {heading && <Typography variant="subtitle1" sx={{ mb: 1.5 }}>{heading}</Typography>}
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 2 }}>
        {list.map((exam, i) => (
          <ExamCard key={exam.id} exam={exam} skill={skill} starting={starting} onStart={onStart} index={i} />
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
  const [tab, setTab] = useState(() => {
    try {
      const saved = parseInt(localStorage.getItem("ielts-exam-tab"), 10);
      return Number.isInteger(saved) && saved >= 0 && saved < TABS.length ? saved : 0;
    } catch { return 0; }
  });
  const changeTab = (_, v) => {
    setTab(v);
    try { localStorage.setItem("ielts-exam-tab", String(v)); } catch { /* ignore */ }
  };
  const navigate = useNavigate();

  // Join-a-class dialog (students enrol themselves with the teacher's code).
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    apiFetch("/api/exams")
      .then((r) => r.json())
      .then((d) => setExams(Array.isArray(d) ? d : []))
      .catch(() => setError("Could not load exams."))
      .finally(() => setLoading(false));
  }, [reload]);

  const joinClass = async () => {
    setJoining(true);
    setJoinError("");
    try {
      const res = await apiFetch("/api/classes/join", {
        method: "POST",
        body: JSON.stringify({ code: joinCode.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Could not join the class.");
      setJoinOpen(false);
      setJoinCode("");
      setReload((n) => n + 1);
    } catch (e) {
      setJoinError(e.message);
    } finally {
      setJoining(false);
    }
  };

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
      <PageHeader
        eyebrow="Practice"
        title="My Tests"
        subtitle="Practise one skill at a time — choose a tab below."
        icon={<SchoolRoundedIcon />}
        action={
          <Button variant="outlined" size="small" onClick={() => setJoinOpen(true)}>
            Join a class
          </Button>
        }
      />

      {/* Join a class with the teacher's share code */}
      <Dialog open={joinOpen} onClose={() => setJoinOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Join a class</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Type the class code your teacher shared (e.g. <strong>DEMO26</strong>).
            Tests assigned to that class will appear here.
          </Typography>
          {joinError && <Alert severity="warning" sx={{ mb: 2 }}>{joinError}</Alert>}
          <TextField
            autoFocus fullWidth label="Class code" value={joinCode}
            onChange={(e) => { setJoinCode(e.target.value.toUpperCase()); setJoinError(""); }}
            inputProps={{ style: { textTransform: "uppercase", letterSpacing: 2, fontWeight: 700 } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setJoinOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={joining || !joinCode.trim()} onClick={joinClass}>
            {joining ? "Joining…" : "Join"}
          </Button>
        </DialogActions>
      </Dialog>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}

      <Tabs
        value={tab}
        onChange={changeTab}
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
