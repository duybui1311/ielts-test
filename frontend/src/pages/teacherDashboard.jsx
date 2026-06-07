import React, { useEffect, useState } from "react";
import {
  Box, Card, Stack, Typography, Button, Chip, Divider, CircularProgress,
  useTheme,
} from "@mui/material";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import ClassRoundedIcon from "@mui/icons-material/ClassRounded";
import AssignmentRoundedIcon from "@mui/icons-material/AssignmentRounded";
import PendingActionsRoundedIcon from "@mui/icons-material/PendingActionsRounded";
import AddBoxRoundedIcon from "@mui/icons-material/AddBoxRounded";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import { PageHeader, StatCard, bandColor, chartTheme } from "../component/ui";
import Heatmap from "../component/Heatmap";

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

  return (
    <Box>
      <PageHeader
        title="Class Dashboard"
        subtitle="Monitor your classes, exams and recent submissions."
        action={
          <Button variant="contained" startIcon={<AddBoxRoundedIcon />} onClick={() => navigate("/create-exam")}>
            Create exam
          </Button>
        }
      />

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 2, mb: 3 }}>
        <StatCard icon={<ClassRoundedIcon />} label="Classes" value={kpis.classes} color="primary.main" />
        <StatCard icon={<GroupsRoundedIcon />} label="Students" value={kpis.students} color="secondary.main" />
        <StatCard icon={<AssignmentRoundedIcon />} label="Exams" value={kpis.exams} color="success.main" />
        <StatCard icon={<PendingActionsRoundedIcon />} label="To review" value={kpis.to_review} color="warning.main" />
      </Box>

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
