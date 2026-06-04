import React, { useEffect, useState } from "react";
import {
  Box, Typography, Card, CardContent, CardActions,
  Button, Chip, Stack, CircularProgress, Alert,
} from "@mui/material";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import QuizIcon from "@mui/icons-material/Quiz";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import { PageHeader, SkillChip } from "../component/ui";

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

  return (
    <Box>
      <PageHeader title="My Tests" subtitle="Pick a test and start practising." />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {exams.length === 0 && !error && (
        <Card sx={{ p: 5, textAlign: "center" }}>
          <Typography color="text.secondary">No tests available yet.</Typography>
        </Card>
      )}

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 2,
        }}
      >
        {exams.map((exam) => (
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
        ))}
      </Box>
    </Box>
  );
}
