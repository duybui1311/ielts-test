import React, { useEffect, useState } from "react";
import {
  Box, Typography, Paper, Stack, Chip, Button, CircularProgress, Alert, Divider,
} from "@mui/material";
import PrintRoundedIcon from "@mui/icons-material/PrintRounded";
import { useParams } from "react-router-dom";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { useTheme } from "@mui/material/styles";
import { apiFetch } from "../api";
import { chartTheme, bandColor } from "../component/ui";
import Heatmap from "../component/Heatmap";

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString() : "—");

/**
 * Printable progress report for one student — the page parents see.
 * Students open their own; teachers open any student in their classes.
 * The Print button uses the browser's print-to-PDF (print CSS hides the app shell).
 */
export default function ProgressReport() {
  const { userId } = useParams();
  const theme = useTheme();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch(`/api/report/student/${userId}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.detail || "Could not load the report.");
        setData(d);
      })
      .catch((e) => setError(e.message));
  }, [userId]);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!data) {
    return <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}><CircularProgress /></Box>;
  }

  const trend = data.tests
    .filter((t) => t.overall_band != null)
    .map((t, i) => ({ i: i + 1, band: t.overall_band, name: t.exam_name }));
  const ct = chartTheme(theme);

  return (
    <Box className="report-page" sx={{ maxWidth: 860, mx: "auto" }}>
      {/* Controls — hidden when printing */}
      <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }} className="print-hide">
        <Button variant="contained" startIcon={<PrintRoundedIcon />} onClick={() => window.print()}>
          Print / save as PDF
        </Button>
      </Stack>

      <Paper variant="outlined" sx={{ p: 4 }}>
        {/* Letterhead */}
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1 }}>
          <Box>
            <Typography variant="h4" fontWeight={800}>Progress Report</Typography>
            <Typography variant="body2" color="text.secondary">
              {data.student.name} · {data.student.email}
            </Typography>
          </Box>
          <Box textAlign="right">
            <Typography variant="h6" fontWeight={800} color="primary.main">Bandly</Typography>
            <Typography variant="caption" color="text.secondary">
              Generated {new Date().toLocaleDateString()}
            </Typography>
          </Box>
        </Stack>
        <Divider sx={{ my: 2 }} />

        {/* Headline band */}
        <Stack direction="row" spacing={4} alignItems="center" sx={{ mb: 3 }} flexWrap="wrap" useFlexGap>
          <Box>
            <Typography variant="overline" color="text.secondary">Average band</Typography>
            <Typography variant="h2" fontWeight={800}
              sx={{ color: bandColor(theme, data.average_band), lineHeight: 1 }}>
              {data.average_band ?? "—"}
            </Typography>
          </Box>
          <Box>
            <Typography variant="overline" color="text.secondary">Tests completed</Typography>
            <Typography variant="h4" fontWeight={700}>{data.tests.length}</Typography>
          </Box>
          <Box>
            <Typography variant="overline" color="text.secondary">Writing / Speaking reviewed</Typography>
            <Typography variant="h4" fontWeight={700}>{data.productive.length}</Typography>
          </Box>
        </Stack>

        {/* Band trend */}
        {trend.length >= 2 && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>Band trend</Typography>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={trend} margin={{ left: -20, right: 12, top: 6 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={ct.grid.stroke} />
                <XAxis dataKey="i" tick={ct.tick} axisLine={ct.axisLine} tickLine={ct.tickLine} />
                <YAxis domain={[0, 9]} tick={ct.tick} axisLine={ct.axisLine} tickLine={ct.tickLine} />
                <Tooltip {...ct.tooltip} formatter={(v) => [v, "band"]}
                  labelFormatter={(i) => trend[i - 1]?.name || `Test ${i}`} />
                <Line type="monotone" dataKey="band" stroke={theme.palette.primary.main}
                  strokeWidth={2.5} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </Box>
        )}

        {/* Test history */}
        <Typography variant="subtitle1" fontWeight={700} gutterBottom>Reading & Listening tests</Typography>
        {data.tests.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>No graded tests yet.</Typography>
        ) : (
          <Box component="table" sx={{
            width: "100%", borderCollapse: "collapse", mb: 3,
            "& th, & td": { textAlign: "left", py: 0.75, px: 1, borderBottom: "1px solid", borderColor: "divider", fontSize: 14 },
          }}>
            <thead>
              <tr><th>Test</th><th>Date</th><th>Skills</th><th>Band</th></tr>
            </thead>
            <tbody>
              {data.tests.map((t, i) => (
                <tr key={i}>
                  <td>{t.exam_name}{t.is_mock ? " (mock)" : ""}</td>
                  <td>{fmtDate(t.date)}</td>
                  <td style={{ textTransform: "capitalize" }}>
                    {Object.entries(t.skill_bands).map(([s, b]) => `${s} ${b}`).join(" · ") || "—"}
                  </td>
                  <td><strong>{t.overall_band ?? "—"}</strong></td>
                </tr>
              ))}
            </tbody>
          </Box>
        )}

        {/* Writing / Speaking */}
        {data.productive.length > 0 && (
          <>
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>Writing & Speaking (teacher-reviewed)</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 3 }}>
              {data.productive.map((p, i) => (
                <Chip key={i} size="small" variant="outlined"
                  label={`${p.kind === "writing" ? "✍" : "🎙"} ${p.title}: band ${p.band}`} />
              ))}
            </Stack>
          </>
        )}

        {/* Skill heatmap */}
        {(data.heatmap || []).some((h) => h.attempted > 0) && (
          <>
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>Question-type accuracy</Typography>
            <Heatmap data={data.heatmap} />
          </>
        )}
      </Paper>
    </Box>
  );
}
