import React, { useEffect, useState } from "react";
import {
  Box, Typography, Paper, Stack, Chip, Alert,
  CircularProgress, Divider, Button, useTheme,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import { useParams, useNavigate } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { apiFetch } from "../api";

function BandBadge({ band }) {
  const color =
    band >= 7 ? "success.main" : band >= 5 ? "warning.main" : "error.main";
  return (
    <Typography
      variant="h1"
      fontWeight={800}
      sx={{ color, lineHeight: 1, my: 1 }}
    >
      {band ?? "—"}
    </Typography>
  );
}

export default function ExamResults() {
  const theme = useTheme();
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch(`/api/attempts/${attemptId}/results`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setError("Could not load results."))
      .finally(() => setLoading(false));
  }, [attemptId]);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!data) return null;

  return (
    <Box>
      {/* ── Overall band ── */}
      <Paper variant="outlined" sx={{ p: 4, mb: 3, textAlign: "center" }}>
        <Typography variant="overline" color="text.secondary" letterSpacing={2}>
          Overall Band Score
        </Typography>
        <BandBadge band={data.overall_band} />
        <Typography variant="body2" color="text.secondary">
          {data.status === "graded"
            ? "Test completed and graded"
            : data.status}
        </Typography>
        <Button
          sx={{ mt: 2 }}
          variant="outlined"
          onClick={() => navigate("/exams")}
        >
          Back to Tests
        </Button>
      </Paper>

      {/* ── Per-section breakdown ── */}
      {(data.sections || []).map((sec) => (
        <Paper key={sec.station_id} variant="outlined" sx={{ mb: 3 }}>
          {/* Section header */}
          <Box
            sx={{
              p: 2,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="subtitle1" fontWeight={700}>
                {sec.title}
              </Typography>
              {sec.skill && (
                <Chip label={sec.skill} size="small" color="primary" />
              )}
            </Stack>
            <Stack direction="row" spacing={2} alignItems="center">
              <Typography variant="body2" color="text.secondary">
                Raw score:{" "}
                <strong>
                  {sec.raw_score ?? "—"} / {sec.questions.length}
                </strong>
              </Typography>
              {sec.band != null && (
                <Typography
                  variant="body2"
                  fontWeight={700}
                  color={
                    sec.band >= 7
                      ? "success.main"
                      : sec.band >= 5
                      ? "warning.main"
                      : "error.main"
                  }
                >
                  Band {sec.band}
                </Typography>
              )}
            </Stack>
          </Box>
          <Divider />

          {/* Per-question rows */}
          <Box sx={{ p: 2 }}>
            {(sec.questions || []).map((q, qi) => (
              <Box
                key={q.id}
                sx={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 1.5,
                  py: 1.5,
                  borderBottom:
                    qi < sec.questions.length - 1 ? "1px solid" : "none",
                  borderColor: "divider",
                }}
              >
                {/* Icon */}
                {q.is_auto_correct === true && (
                  <CheckCircleIcon
                    color="success"
                    sx={{ mt: 0.3, flexShrink: 0 }}
                  />
                )}
                {q.is_auto_correct === false && (
                  <CancelIcon color="error" sx={{ mt: 0.3, flexShrink: 0 }} />
                )}
                {q.is_auto_correct == null && (
                  <RemoveCircleOutlineIcon
                    color="disabled"
                    sx={{ mt: 0.3, flexShrink: 0 }}
                  />
                )}

                {/* Text */}
                <Box flex={1} minWidth={0}>
                  <Typography variant="body2" fontWeight={500}>
                    Q{qi + 1}. {q.prompt}
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mt: 0.25 }}
                  >
                    Your answer:{" "}
                    <strong>{q.student_answer ?? "(no answer)"}</strong>
                  </Typography>
                  {q.is_auto_correct === false && q.correct_answer && (
                    <Typography
                      variant="body2"
                      color="success.main"
                      sx={{ mt: 0.25 }}
                    >
                      Correct answer: <strong>{q.correct_answer}</strong>
                    </Typography>
                  )}
                </Box>

                {/* Sub-skill tag */}
                {q.sub_skill && (
                  <Chip
                    label={q.sub_skill.replace(/_/g, " ")}
                    size="small"
                    variant="outlined"
                    sx={{ flexShrink: 0, mt: 0.25 }}
                  />
                )}
              </Box>
            ))}
          </Box>
        </Paper>
      ))}

      {/* ── Weakness chart ── */}
      {data.weakness_chart && data.weakness_chart.length > 0 && (
        <Paper variant="outlined" sx={{ p: 3, mb: 4 }}>
          <Typography variant="subtitle1" fontWeight={700} gutterBottom>
            Mistake Patterns
          </Typography>
          <ResponsiveContainer
            width="100%"
            height={Math.max(120, data.weakness_chart.length * 52)}
          >
            <BarChart
              data={data.weakness_chart}
              layout="vertical"
              margin={{ left: 16, right: 24, top: 4, bottom: 4 }}
            >
              <XAxis type="number" allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="name"
                width={160}
                tickFormatter={(v) => v.replace(/_/g, " ")}
              />
              <Tooltip formatter={(v) => [v, "mistakes"]} />
              <Bar dataKey="misses" fill={theme.palette.primary.main} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Paper>
      )}
    </Box>
  );
}
