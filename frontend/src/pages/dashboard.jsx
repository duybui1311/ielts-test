import React, { useEffect, useState } from "react";
import {
  Box, Card, Stack, Typography, Button, Chip, CircularProgress, Divider,
  useTheme,
} from "@mui/material";
import EmojiEventsRoundedIcon from "@mui/icons-material/EmojiEventsRounded";
import FactCheckRoundedIcon from "@mui/icons-material/FactCheckRounded";
import QuizRoundedIcon from "@mui/icons-material/QuizRounded";
import ReportProblemRoundedIcon from "@mui/icons-material/ReportProblemRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import { PageHeader, StatCard, bandColor } from "../component/ui";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const EMPTY = {
  kpis: { tests_taken: 0, avg_band: null, questions_answered: 0, top_weakness: null },
  band_trend: [],
  recent: [],
  weakness: [],
};

export default function Dashboard() {
  const theme = useTheme();
  const navigate = useNavigate();
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/dashboard")
      .then((r) => (r.ok ? r.json() : EMPTY))
      .then((d) => setData({ ...EMPTY, ...d }))
      .catch(() => setData(EMPTY))
      .finally(() => setLoading(false));
  }, []);

  const name = (() => {
    try { return localStorage.getItem("osce-name") || ""; } catch { return ""; }
  })();

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  const { kpis, band_trend, recent, weakness } = data;
  const hasData = kpis.tests_taken > 0;
  const primary = theme.palette.primary.main;
  const gridStroke = theme.palette.divider;

  return (
    <Box>
      <PageHeader
        title={`${greeting()}${name ? `, ${name.split(" ")[0]}` : ""}`}
        subtitle="Here's how your IELTS practice is going."
        action={
          <Button variant="contained" onClick={() => navigate("/exams")}>
            Take a test
          </Button>
        }
      />

      {/* KPI row */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" },
          gap: 2,
          mb: 3,
        }}
      >
        <StatCard
          icon={<FactCheckRoundedIcon />}
          label="Tests taken"
          value={kpis.tests_taken}
          color="primary.main"
        />
        <StatCard
          icon={<EmojiEventsRoundedIcon />}
          label="Average band"
          value={kpis.avg_band ?? "—"}
          color="success.main"
        />
        <StatCard
          icon={<QuizRoundedIcon />}
          label="Questions answered"
          value={kpis.questions_answered}
          color="secondary.main"
        />
        <StatCard
          icon={<ReportProblemRoundedIcon />}
          label="Top weakness"
          value={kpis.top_weakness ? kpis.top_weakness.replace(/_/g, " ") : "—"}
          color="warning.main"
        />
      </Box>

      {!hasData ? (
        <Card sx={{ p: 5, textAlign: "center" }}>
          <Typography variant="h6" gutterBottom>No results yet</Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Complete a test and your band trend and mistake patterns will show up here.
          </Typography>
          <Button variant="contained" onClick={() => navigate("/exams")}>Browse tests</Button>
        </Card>
      ) : (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
            gap: 2,
          }}
        >
          {/* Band trend */}
          <Card sx={{ p: 3 }}>
            <Typography variant="subtitle1" sx={{ mb: 2 }}>Band trend</Typography>
            <Box sx={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={band_trend} margin={{ left: -16, right: 8, top: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="bandGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={primary} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={primary} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke={gridStroke} />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} tickFormatter={(v) => (v.length > 10 ? `${v.slice(0, 10)}…` : v)} />
                  <YAxis domain={[0, 9]} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="band" stroke={primary} strokeWidth={2.5} fill="url(#bandGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </Box>
          </Card>

          {/* Weakness */}
          <Card sx={{ p: 3 }}>
            <Typography variant="subtitle1" sx={{ mb: 2 }}>Mistake patterns</Typography>
            {weakness.length === 0 ? (
              <Typography color="text.secondary" variant="body2">No mistakes recorded — great work!</Typography>
            ) : (
              <Box sx={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weakness} layout="vertical" margin={{ left: 16, right: 16, top: 4, bottom: 4 }}>
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                    <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 12 }} tickFormatter={(v) => v.replace(/_/g, " ")} />
                    <Tooltip formatter={(v) => [v, "mistakes"]} />
                    <Bar dataKey="misses" fill={theme.palette.warning.main} radius={[0, 6, 6, 0]} barSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            )}
          </Card>

          {/* Recent attempts */}
          <Card sx={{ p: 0, gridColumn: { md: "1 / -1" } }}>
            <Stack direction="row" alignItems="center" sx={{ p: 3, pb: 2 }}>
              <Typography variant="subtitle1" sx={{ flexGrow: 1 }}>Recent tests</Typography>
              <Button size="small" onClick={() => navigate("/history")} endIcon={<ChevronRightRoundedIcon />}>
                View all
              </Button>
            </Stack>
            <Divider />
            {recent.map((a, i) => (
              <React.Fragment key={a.attempt_id}>
                {i > 0 && <Divider />}
                <Stack direction="row" alignItems="center" spacing={2} sx={{ px: 3, py: 2 }}>
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography fontWeight={600} noWrap>{a.exam_name}</Typography>
                    <Chip label={a.status} size="small" sx={{ mt: 0.5, textTransform: "capitalize" }} />
                  </Box>
                  {a.overall_band != null && (
                    <Typography variant="h6" fontWeight={800} color={bandColor(a.overall_band)}>
                      {a.overall_band}
                    </Typography>
                  )}
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() =>
                      navigate(
                        a.status === "draft" ? `/exam/${a.attempt_id}` : `/results/${a.attempt_id}`
                      )
                    }
                  >
                    {a.status === "draft" ? "Resume" : "Results"}
                  </Button>
                </Stack>
              </React.Fragment>
            ))}
          </Card>
        </Box>
      )}
    </Box>
  );
}
