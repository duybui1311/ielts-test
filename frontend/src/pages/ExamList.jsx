import React, { useEffect, useState } from "react";
import {
  Box, Typography, Card, CardContent, CardActions,
  Button, Chip, Stack, CircularProgress, Alert,
} from "@mui/material";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import QuizIcon from "@mui/icons-material/Quiz";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api";

const SKILL_COLOR = { reading: "primary", listening: "secondary", writing: "success", speaking: "warning" };

export default function ExamList() {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    apiFetch("/api/exams")
      .then((r) => r.json())
      .then(setExams)
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
      <Typography variant="h5" fontWeight={700} mb={3}>Available Tests</Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {exams.length === 0 && !error && (
        <Typography color="text.secondary">No tests available yet.</Typography>
      )}

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 2,
        }}
      >
        {exams.map((exam) => (
          <Card key={exam.id} variant="outlined">
            <CardContent>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                {exam.name}
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap mb={1.5}>
                {(exam.skills || []).map((s) => (
                  <Chip
                    key={s}
                    label={s}
                    size="small"
                    color={SKILL_COLOR[s] || "default"}
                  />
                ))}
                <Chip label={exam.difficulty} size="small" variant="outlined" />
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
