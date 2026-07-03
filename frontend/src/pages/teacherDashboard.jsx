import React, { useEffect, useState } from "react";
import {
  Box, Card, Stack, Typography, Button, Chip, Divider, CircularProgress,
  useTheme, TextField, Tooltip as MuiTooltip,
} from "@mui/material";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import ClassRoundedIcon from "@mui/icons-material/ClassRounded";
import AssignmentRoundedIcon from "@mui/icons-material/AssignmentRounded";
import PendingActionsRoundedIcon from "@mui/icons-material/PendingActionsRounded";
import AddBoxRoundedIcon from "@mui/icons-material/AddBoxRounded";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { apiFetch } from "../api";
import { StatCard, bandColor, chartTheme } from "../component/ui";
import { BlurText } from "../component/TextReveal";
import Heatmap from "../component/Heatmap";

/** Teacher's classes with their share codes — students join with these. */
function ClassCodesCard() {
  const [classes, setClasses] = useState(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");

  const load = () =>
    apiFetch("/api/teacher/classes")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setClasses(Array.isArray(d) ? d : []))
      .catch(() => setClasses([]));
  useEffect(() => { load(); }, []);

  const createClass = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await apiFetch("/api/teacher/classes", {
        method: "POST",
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.ok) { setName(""); await load(); }
    } finally {
      setBusy(false);
    }
  };

  const copy = (code) => {
    try { navigator.clipboard.writeText(code); setCopied(code); setTimeout(() => setCopied(""), 1500); }
    catch { /* clipboard unavailable */ }
  };

  if (classes === null) return null;
  return (
    <Card sx={{ p: 3, mb: 2 }}>
      <Typography variant="subtitle1" sx={{ mb: 0.5 }}>My classes</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
        Students join a class by entering its code on their "My Tests" page — only then can
        they see the tests you assign to it.
      </Typography>
      <Stack spacing={1}>
        {classes.map((c) => (
          <Stack key={c.id} direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography variant="body2" fontWeight={600} sx={{ minWidth: 140 }}>{c.name}</Typography>
            <Chip size="small" variant="outlined" label={`${c.students} student${c.students === 1 ? "" : "s"}`} />
            {c.join_code && (
              <MuiTooltip title={copied === c.join_code ? "Copied!" : "Copy class code"}>
                <Chip
                  size="small"
                  color="primary"
                  icon={<ContentCopyRoundedIcon sx={{ fontSize: 14 }} />}
                  label={c.join_code}
                  onClick={() => copy(c.join_code)}
                  sx={{ fontWeight: 700, letterSpacing: 1, cursor: "pointer" }}
                />
              </MuiTooltip>
            )}
          </Stack>
        ))}
        {classes.length === 0 && (
          <Typography variant="body2" color="text.secondary">No classes yet — create one below.</Typography>
        )}
      </Stack>
      <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
        <TextField
          size="small" label="New class name" value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") createClass(); }}
        />
        <Button variant="outlined" disabled={busy || !name.trim()} onClick={createClass}>
          Create class
        </Button>
      </Stack>
    </Card>
  );
}


function readName() {
  try { return localStorage.getItem("osce-name") || ""; } catch { return ""; }
}

const EMPTY = {
  kpis: { classes: 0, students: 0, exams: 0, to_review: 0 },
  classes: [],
  band_trend: [],
  recent_submissions: [],
  heatmap: [],
};

export default function TeacherDashboard() {
  const theme = useTheme();
  const navigate = useNavigate();
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/teacher/dashboard")
      .then((r) => (r.ok ? r.json() : EMPTY))
      .then((d) => setData({ ...EMPTY, ...d }))
      .catch(() => setData(EMPTY))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}><CircularProgress /></Box>;
  }

  const { kpis, classes, band_trend, recent_submissions, heatmap } = data;
  const primary = theme.palette.primary.main;
  const ct = chartTheme(theme);
  const hasClasses = classes.length > 0;

  const firstName = readName().split(" ")[0];

  return (
    <Box>
      {/* Hero greeting banner */}
      <Card
        component={motion.div}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        sx={(t) => ({
          position: "relative", overflow: "hidden", mb: 3, p: { xs: 3, md: 4 }, color: "#fff",
          border: "none", background: t.gradients.hero, backgroundSize: "200% 200%",
          animation: "appGradientShift 16s ease infinite",
        })}
      >
        <Box sx={{ position: "absolute", top: -90, right: -60, width: 280, height: 280, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 70%)" }} />
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ xs: "flex-start", sm: "center" }} sx={{ position: "relative" }}>
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="overline" sx={{ opacity: 0.85 }}>Teacher workspace</Typography>
            <BlurText
              variant="h3"
              component="h1"
              text="Class Dashboard"
              sx={{ fontWeight: 800, lineHeight: 1.05 }}
            />
            <Typography sx={{ opacity: 0.9, mt: 0.5 }}>
              {firstName ? `Welcome back, ${firstName}. ` : ""}Monitor your classes, exams and submissions.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1.5} alignItems="center">
            {kpis.to_review > 0 && (
              <Stack alignItems="center" sx={{ px: 2, py: 1.25, borderRadius: 3,
                bgcolor: "rgba(255,255,255,0.16)", border: "1px solid rgba(255,255,255,0.25)", backdropFilter: "blur(6px)" }}>
                <Typography variant="h4" fontWeight={800} sx={{ lineHeight: 1 }}>{kpis.to_review}</Typography>
                <Typography variant="caption" sx={{ opacity: 0.85 }}>to review</Typography>
              </Stack>
            )}
            <Button
              variant="contained" startIcon={<AddBoxRoundedIcon />} onClick={() => navigate("/create-exam")}
              sx={{ bgcolor: "#fff", color: "primary.main", background: "#fff",
                "&:hover": { background: "#fff", filter: "brightness(0.96)", transform: "translateY(-1px)" } }}
            >
              Create exam
            </Button>
          </Stack>
        </Stack>
      </Card>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 2, mb: 3 }}>
        <StatCard icon={<ClassRoundedIcon />} label="Classes" value={kpis.classes} gradient={theme.gradients.brand} color="primary.main" delay={40} />
        <StatCard icon={<GroupsRoundedIcon />} label="Students" value={kpis.students} gradient={theme.gradients.ocean} color="info.main" delay={120} />
        <StatCard icon={<AssignmentRoundedIcon />} label="Exams" value={kpis.exams} gradient={theme.gradients.emerald} color="success.main" delay={200} />
        <StatCard icon={<PendingActionsRoundedIcon />} label="To review" value={kpis.to_review} gradient={theme.gradients.sunset} color="warning.main" delay={280} />
      </Box>

      <ClassCodesCard />

      {!hasClasses ? (
        <Card sx={{ p: 5, textAlign: "center" }}>
          <Typography variant="h6" gutterBottom>No classes yet</Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Create an exam to get started — it will appear here once students start submitting.
          </Typography>
          <Button variant="contained" startIcon={<AddBoxRoundedIcon />} onClick={() => navigate("/create-exam")}>
            Create exam
          </Button>
        </Card>
      ) : (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(0,1fr) 340px" }, gap: 2 }}>
          {/* Left column */}
          <Stack spacing={2}>
            {(heatmap || []).some((h) => h.attempted > 0) && (
              <Card sx={{ p: 3 }}>
                <Typography variant="subtitle1" sx={{ mb: 2 }}>
                  Class weakness heatmap
                </Typography>
                <Heatmap data={heatmap} />
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
            )}
            {band_trend.length > 0 && (
              <Card sx={{ p: 3 }}>
                <Typography variant="subtitle1" sx={{ mb: 2 }}>Class average band over time</Typography>
                <Box sx={{ height: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={band_trend} margin={{ left: -16, right: 8, top: 8, bottom: 0 }}>
                      <defs>
                        <linearGradient id="teacherGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={primary} stopOpacity={0.35} />
                          <stop offset="95%" stopColor={primary} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} stroke={ct.grid.stroke} />
                      <XAxis dataKey="label" tick={ct.tick} axisLine={ct.axisLine} tickLine={ct.tickLine} />
                      <YAxis domain={[0, 9]} tick={ct.tick} axisLine={ct.axisLine} tickLine={ct.tickLine} />
                      <Tooltip {...ct.tooltip} />
                      <Area type="monotone" dataKey="avg" stroke={primary} strokeWidth={2.5} fill="url(#teacherGradient)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </Box>
              </Card>
            )}

            {classes.map((c) => (
              <Card key={c.id} sx={{ p: 3 }}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                  <Typography variant="h6">{c.name}</Typography>
                  <Chip size="small" icon={<GroupsRoundedIcon />} label={`${c.students} student${c.students === 1 ? "" : "s"}`} />
                </Stack>
                {c.exams.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">No exams in this class yet.</Typography>
                ) : (
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
                    {c.exams.map((e) => (
                      <Card key={e.id} variant="outlined" sx={{ p: 2, boxShadow: "none" }}>
                        <Typography fontWeight={600} noWrap>{e.name}</Typography>
                        <Stack direction="row" spacing={2} sx={{ mt: 1 }} alignItems="center">
                          <Typography variant="body2" color="text.secondary">
                            {e.attempts} attempt{e.attempts === 1 ? "" : "s"}
                          </Typography>
                          <Typography variant="body2" fontWeight={700} color={bandColor(e.avg_band)}>
                            {e.avg_band != null ? `Avg ${e.avg_band}` : "No data"}
                          </Typography>
                        </Stack>
                      </Card>
                    ))}
                  </Box>
                )}
              </Card>
            ))}
          </Stack>

          {/* Right rail: recent submissions */}
          <Card sx={{ p: 0, alignSelf: "start" }}>
            <Typography variant="subtitle1" sx={{ p: 3, pb: 2 }}>Recent submissions</Typography>
            <Divider />
            {recent_submissions.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ p: 3 }}>
                No submissions yet.
              </Typography>
            ) : (
              recent_submissions.map((s, i) => (
                <React.Fragment key={s.attempt_id}>
                  {i > 0 && <Divider />}
                  <Stack direction="row" alignItems="center" spacing={1.5} sx={{ px: 3, py: 2 }}>
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                      <Typography fontWeight={600} noWrap>{s.student}</Typography>
                      <Typography variant="caption" color="text.secondary" noWrap display="block">{s.exam}</Typography>
                    </Box>
                    {s.band != null && (
                      <Typography fontWeight={800} color={bandColor(s.band)}>{s.band}</Typography>
                    )}
                  </Stack>
                </React.Fragment>
              ))
            )}
          </Card>
        </Box>
      )}
    </Box>
  );
}
