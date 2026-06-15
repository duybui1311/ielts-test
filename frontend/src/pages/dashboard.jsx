import React, { useEffect, useState } from "react";
import {
  Box, Card, CardActionArea, Stack, Typography, Button, Chip, CircularProgress,
  Divider, useTheme, alpha,
} from "@mui/material";
import EmojiEventsRoundedIcon from "@mui/icons-material/EmojiEventsRounded";
import FactCheckRoundedIcon from "@mui/icons-material/FactCheckRounded";
import QuizRoundedIcon from "@mui/icons-material/QuizRounded";
import ReportProblemRoundedIcon from "@mui/icons-material/ReportProblemRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import EditNoteRoundedIcon from "@mui/icons-material/EditNoteRounded";
import MicRoundedIcon from "@mui/icons-material/MicRounded";
import StyleRoundedIcon from "@mui/icons-material/StyleRounded";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { apiFetch } from "../api";
import { StatCard, AiBadge, bandColor, chartTheme } from "../component/ui";
import Heatmap from "../component/Heatmap";

const PRACTICE = [
  { icon: <EditNoteRoundedIcon />, label: "Writing", desc: "AI-graded Task 1 & 2 essays", path: "/writing", color: "success.main", ai: true },
  { icon: <MicRoundedIcon />, label: "Speaking", desc: "AI feedback on recorded answers", path: "/speaking", color: "warning.main", ai: true },
  { icon: <StyleRoundedIcon />, label: "Flashcards", desc: "Review vocabulary decks", path: "/flashcard", color: "secondary.main" },
];

function PracticeCard({ item, onClick }) {
  return (
    <Card sx={{ "&:hover": { transform: "translateY(-3px)" } }}>
      <CardActionArea onClick={onClick} sx={{ p: 2.5 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Box
            sx={(theme) => ({
              width: 48, height: 48, borderRadius: 2.5, flexShrink: 0,
              display: "grid", placeItems: "center",
              color: item.color,
              bgcolor: alpha(
                theme.palette[item.color.split(".")[0]].main,
                theme.palette.mode === "dark" ? 0.2 : 0.12
              ),
            })}
          >
            {item.icon}
          </Box>
          <Box sx={{ minWidth: 0, flexGrow: 1 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography fontWeight={700} noWrap>{item.label}</Typography>
              {item.ai && <AiBadge />}
            </Stack>
            <Typography variant="body2" color="text.secondary" noWrap>{item.desc}</Typography>
          </Box>
        </Stack>
      </CardActionArea>
    </Card>
  );
}

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
  heatmap: [],
  productive: [],
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

  const { kpis, band_trend, recent, heatmap, productive } = data;
  const reviewed = (productive || []).filter((p) => p.band != null);
  const hasData = kpis.tests_taken > 0 || reviewed.length > 0;
  const primary = theme.palette.primary.main;
  const ct = chartTheme(theme);

  return (
    <Box>
      {/* Hero greeting banner */}
      <Card
        component={motion.div}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        sx={(t) => ({
          position: "relative",
          overflow: "hidden",
          mb: 3,
          p: { xs: 3, md: 4 },
          color: "#fff",
          border: "none",
          background: t.gradients.hero,
          backgroundSize: "200% 200%",
          animation: "appGradientShift 16s ease infinite",
        })}
      >
        <Box sx={{ position: "absolute", top: -90, right: -60, width: 280, height: 280, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 70%)" }} />
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          alignItems={{ xs: "flex-start", sm: "center" }}
          sx={{ position: "relative" }}
        >
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="overline" sx={{ opacity: 0.85 }}>Your dashboard</Typography>
            <Typography variant="h3" fontWeight={800} sx={{ lineHeight: 1.05 }}>
              {greeting()}{name ? `, ${name.split(" ")[0]}` : ""}
            </Typography>
            <Typography sx={{ opacity: 0.9, mt: 0.5 }}>
              Here's how your IELTS practice is going.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1.5} alignItems="center">
            {kpis.avg_band != null && (
              <Stack alignItems="center" sx={{ px: 2, py: 1.25, borderRadius: 3,
                bgcolor: "rgba(255,255,255,0.16)", border: "1px solid rgba(255,255,255,0.25)", backdropFilter: "blur(6px)" }}>
                <Typography variant="h4" fontWeight={800} sx={{ lineHeight: 1 }}>{kpis.avg_band}</Typography>
                <Typography variant="caption" sx={{ opacity: 0.85 }}>avg band</Typography>
              </Stack>
            )}
            <Button
              variant="contained"
              onClick={() => navigate("/exams")}
              sx={{ bgcolor: "#fff", color: "primary.main", background: "#fff",
                "&:hover": { background: "#fff", filter: "brightness(0.96)", transform: "translateY(-1px)" } }}
            >
              Take a test
            </Button>
          </Stack>
        </Stack>
      </Card>

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
          gradient={theme.gradients.brand}
          delay={40}
        />
        <StatCard
          icon={<EmojiEventsRoundedIcon />}
          label="Average band"
          value={kpis.avg_band ?? "—"}
          gradient={theme.gradients.emerald}
          delay={120}
        />
        <StatCard
          icon={<QuizRoundedIcon />}
          label="Questions answered"
          value={kpis.questions_answered}
          gradient={theme.gradients.ocean}
          delay={200}
        />
        <StatCard
          icon={<ReportProblemRoundedIcon />}
          label="Top weakness"
          value={kpis.top_weakness ? kpis.top_weakness.replace(/_/g, " ") : "—"}
          gradient={theme.gradients.sunset}
          delay={280}
        />
      </Box>

      {/* Practice quick actions */}
      <Typography variant="subtitle1" sx={{ mb: 1.5 }}>Practice</Typography>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" },
          gap: 2,
          mb: 3,
        }}
      >
        {PRACTICE.map((p) => (
          <PracticeCard key={p.path} item={p} onClick={() => navigate(p.path)} />
        ))}
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
                  <CartesianGrid vertical={false} stroke={ct.grid.stroke} />
                  <XAxis dataKey="label" tick={ct.tick} axisLine={ct.axisLine} tickLine={ct.tickLine} tickFormatter={(v) => (v.length > 10 ? `${v.slice(0, 10)}…` : v)} />
                  <YAxis domain={[0, 9]} tick={ct.tick} axisLine={ct.axisLine} tickLine={ct.tickLine} />
                  <Tooltip {...ct.tooltip} />
                  <Area type="monotone" dataKey="band" stroke={primary} strokeWidth={2.5} fill="url(#bandGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </Box>
          </Card>

          {/* Weakness heatmap */}
          <Card sx={{ p: 3 }}>
            <Stack direction="row" alignItems="center" sx={{ mb: 2 }}>
              <Typography variant="subtitle1" sx={{ flexGrow: 1 }}>Weakness heatmap</Typography>
              <Typography variant="caption" color="text.secondary">Tap a type to drill it</Typography>
            </Stack>
            <Heatmap data={heatmap} onCellClick={(sk) => navigate(`/practice/${sk}`)} />
            <Stack direction="row" spacing={2} sx={{ mt: 2, flexWrap: "wrap" }}>
              {[
                ["success.main", "≥85%"],
                ["warning.main", "60–84%"],
                ["error.main", "<60%"],
                ["text.disabled", "No data"],
              ].map(([color, label]) => (
                <Stack key={label} direction="row" spacing={0.75} alignItems="center">
                  <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: color }} />
                  <Typography variant="caption" color="text.secondary">{label}</Typography>
                </Stack>
              ))}
            </Stack>
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

          {/* Writing & Speaking — teacher-graded productive-skill results */}
          {(productive || []).length > 0 && (
            <Card sx={{ p: 0, gridColumn: { md: "1 / -1" } }}>
              <Stack direction="row" alignItems="center" sx={{ p: 3, pb: 2 }}>
                <Typography variant="subtitle1" sx={{ flexGrow: 1 }}>
                  Writing &amp; Speaking
                </Typography>
              </Stack>
              <Divider />
              {productive.map((p, i) => (
                <React.Fragment key={`${p.kind}-${i}`}>
                  {i > 0 && <Divider />}
                  <Stack direction="row" alignItems="center" spacing={2} sx={{ px: 3, py: 2 }}>
                    <Box
                      sx={(t) => ({
                        width: 40, height: 40, borderRadius: 2,
                        display: "grid", placeItems: "center", flexShrink: 0,
                        color: p.kind === "writing" ? "success.main" : "warning.main",
                        bgcolor: alpha(
                          (p.kind === "writing" ? t.palette.success : t.palette.warning).main,
                          t.palette.mode === "dark" ? 0.2 : 0.12
                        ),
                      })}
                    >
                      {p.kind === "writing" ? <EditNoteRoundedIcon /> : <MicRoundedIcon />}
                    </Box>
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                      <Typography fontWeight={600} noWrap>{p.title}</Typography>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                        <Chip label={p.kind} size="small" sx={{ textTransform: "capitalize" }} />
                        {p.band == null && (
                          <Chip label="Awaiting review" size="small" color="default" variant="outlined" />
                        )}
                      </Stack>
                    </Box>
                    {p.band != null ? (
                      <Typography variant="h6" fontWeight={800} color={bandColor(p.band)}>
                        {p.band}
                      </Typography>
                    ) : (
                      <Typography variant="body2" color="text.secondary">—</Typography>
                    )}
                  </Stack>
                </React.Fragment>
              ))}
            </Card>
          )}
        </Box>
      )}
    </Box>
  );
}
