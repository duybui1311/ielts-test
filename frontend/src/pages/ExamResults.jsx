import React, { useEffect, useState } from "react";
import {
  Box, Typography, Paper, Stack, Chip, Alert,
  CircularProgress, Divider, Button, Collapse, useTheme,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import MenuBookRoundedIcon from "@mui/icons-material/MenuBookRounded";
import { useParams, useNavigate } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { alpha } from "@mui/material/styles";
import { apiFetch } from "../api";
import { PageHeader, chartTheme } from "../component/ui";
import ExplanationPanel from "../component/ExplanationPanel";
import HighlightedText from "../component/HighlightedText";

/** Collapsible passage/transcript with the section's support sentences highlighted. */
function SectionPassage({ passage, sentences }) {
  const [open, setOpen] = useState(false);
  if (!passage || !passage.trim()) return null;
  return (
    <Box sx={{ px: 2, pt: 1.5 }}>
      <Button
        size="small"
        variant="text"
        onClick={() => setOpen((o) => !o)}
        startIcon={<MenuBookRoundedIcon />}
        sx={{ fontWeight: 700 }}
      >
        {open ? "Hide passage" : "Show passage"}
      </Button>
      <Collapse in={open} unmountOnExit>
        <Box
          sx={(t) => ({
            mt: 1, p: 2, borderRadius: 2, maxHeight: 360, overflowY: "auto",
            border: `1px solid ${t.palette.divider}`, bgcolor: "background.default",
          })}
        >
          <HighlightedText text={passage} sentences={sentences} />
        </Box>
      </Collapse>
    </Box>
  );
}

function BandCircle({ band }) {
  const key = band == null ? "info" : band >= 7 ? "success" : band >= 5 ? "warning" : "error";
  return (
    <Box
      sx={(theme) => {
        const c = theme.palette[key].main;
        return {
          width: 150,
          height: 150,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          mx: "auto",
          my: 1,
          color: c,
          background: `conic-gradient(${c} ${(Math.min(band ?? 0, 9) / 9) * 360}deg, ${alpha(c, 0.14)} 0deg)`,
          boxShadow: `0 10px 30px ${alpha(c, 0.28)}`,
        };
      }}
    >
      <Box
        sx={(theme) => ({
          width: 124,
          height: 124,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          bgcolor: "background.paper",
          border: `1px solid ${theme.palette.divider}`,
        })}
      >
        <Typography variant="h2" fontWeight={800} sx={{ lineHeight: 1 }}>
          {band ?? "—"}
        </Typography>
      </Box>
    </Box>
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

  const ct = chartTheme(theme);

  return (
    <Box>
      <PageHeader
        title="Results"
        subtitle="Your band score and per-question breakdown."
        action={
          <Button variant="outlined" onClick={() => navigate("/exams")}>
            Back to Tests
          </Button>
        }
      />

      {/* ── Overall band ── */}
      <Paper
        variant="outlined"
        sx={{
          p: 4, mb: 3, textAlign: "center", borderRadius: 3,
          background: (t) =>
            `linear-gradient(180deg, ${alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.12 : 0.06)} 0%, ${t.palette.background.paper} 60%)`,
        }}
      >
        <Typography variant="overline" color="text.secondary" letterSpacing={2}>
          Overall Band Score
        </Typography>
        <BandCircle band={data.overall_band} />
        <Typography variant="body2" color="text.secondary">
          {data.status === "graded"
            ? "Test completed and graded"
            : data.status}
        </Typography>
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

          <SectionPassage
            passage={sec.passage_md}
            sentences={(sec.questions || []).flatMap((q) => q.support_sentences || [])}
          />

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
                  {q.qtype !== "explain" && (
                    <ExplanationPanel
                      questionId={q.id}
                      explanation={q.explanation}
                      supportSentences={q.support_sentences}
                    />
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
              <XAxis type="number" allowDecimals={false} tick={ct.tick} axisLine={ct.axisLine} tickLine={ct.tickLine} />
              <YAxis
                type="category"
                dataKey="name"
                width={160}
                tick={ct.tick}
                axisLine={ct.axisLine}
                tickLine={ct.tickLine}
                tickFormatter={(v) => v.replace(/_/g, " ")}
              />
              <Tooltip {...ct.tooltip} formatter={(v) => [v, "mistakes"]} cursor={{ fill: ct.grid.stroke }} />
              <Bar dataKey="misses" fill={theme.palette.primary.main} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Paper>
      )}
    </Box>
  );
}
