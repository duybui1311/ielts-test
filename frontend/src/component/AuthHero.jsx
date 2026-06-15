import * as React from "react";
import { Box, Stack, Typography } from "@mui/material";
import { motion } from "framer-motion";
import AutoAwesomeRounded from "@mui/icons-material/AutoAwesomeRounded";
import MenuBookRounded from "@mui/icons-material/MenuBookRounded";
import HeadphonesRounded from "@mui/icons-material/HeadphonesRounded";
import EditNoteRounded from "@mui/icons-material/EditNoteRounded";
import MicRounded from "@mui/icons-material/MicRounded";
import BoltRounded from "@mui/icons-material/BoltRounded";

const MotionBox = motion.create(Box);

const SKILLS = [
  { icon: <MenuBookRounded />, label: "Reading", grad: "linear-gradient(135deg,#0046FF,#4178FF)" },
  { icon: <HeadphonesRounded />, label: "Listening", grad: "linear-gradient(135deg,#2BA8B5,#73C8D2)" },
  { icon: <EditNoteRounded />, label: "Writing", grad: "linear-gradient(135deg,#0A1F66,#0046FF)" },
  { icon: <MicRounded />, label: "Speaking", grad: "linear-gradient(135deg,#FF9013,#FFB347)" },
];

/**
 * Animated marketing hero shared by the login and signup screens: a shifting
 * brand gradient, glowing orbs, floating per-skill glass cards and trust stats.
 * `headline` and `sub` let each screen set its own copy.
 */
export default function AuthHero({ headline, sub }) {
  return (
    <Box
      sx={(theme) => ({
        position: "relative",
        overflow: "hidden",
        display: { xs: "none", md: "flex" },
        flexDirection: "column",
        justifyContent: "center",
        gap: 3.5,
        p: { md: 6, lg: 8 },
        color: "#fff",
        background: theme.gradients.hero,
        backgroundSize: "200% 200%",
        animation: "appGradientShift 14s ease infinite",
      })}
    >
      <Box sx={{ position: "absolute", top: -110, right: -90, width: 360, height: 360, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(255,144,19,0.38) 0%, rgba(255,144,19,0) 70%)",
        animation: "appPulseGlow 9s ease-in-out infinite" }} />
      <Box sx={{ position: "absolute", bottom: -120, left: -80, width: 320, height: 320, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(115,200,210,0.40) 0%, rgba(115,200,210,0) 70%)",
        animation: "appPulseGlow 11s ease-in-out infinite 1s" }} />

      <MotionBox initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} sx={{ position: "relative" }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Box sx={{ width: 48, height: 48, borderRadius: 2.5, display: "grid", placeItems: "center",
            fontWeight: 800, fontSize: 24, bgcolor: "rgba(255,255,255,0.16)", border: "1px solid rgba(255,255,255,0.28)",
            backdropFilter: "blur(6px)" }}>
            B
          </Box>
          <Typography variant="h5" fontWeight={800}>Bandly</Typography>
        </Stack>
      </MotionBox>

      <MotionBox initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.08 }} sx={{ position: "relative" }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
          <AutoAwesomeRounded sx={{ fontSize: 18 }} />
          <Typography variant="overline" sx={{ opacity: 0.92 }}>AI-powered IELTS preparation</Typography>
        </Stack>
        <Typography variant="h2" fontWeight={800} sx={{ maxWidth: 520, lineHeight: 1.05 }}>
          {headline || (<>Practice. Auto-grade.{" "}<Box component="span" sx={{ color: "#FF9013" }}>Improve.</Box></>)}
        </Typography>
        <Typography sx={{ maxWidth: 480, opacity: 0.92, mt: 2, fontSize: "1.05rem" }}>
          {sub || "Realistic tests across all four skills, instant band scores, AI feedback on Writing & Speaking, and a clear map of what to work on next."}
        </Typography>
      </MotionBox>

      <Box sx={{ position: "relative", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, maxWidth: 460 }}>
        {SKILLS.map((s, i) => (
          <MotionBox
            key={s.label}
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.2 + i * 0.08 }}
            whileHover={{ y: -5, scale: 1.02 }}
            sx={{ display: "flex", alignItems: "center", gap: 1.5, p: 1.75, borderRadius: 3,
              bgcolor: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)",
              backdropFilter: "blur(8px)", cursor: "default" }}
          >
            <Box sx={{ width: 38, height: 38, borderRadius: 2, display: "grid", placeItems: "center",
              background: s.grad, boxShadow: "0 6px 16px rgba(0,0,0,0.25)", "& svg": { fontSize: 20 } }}>
              {s.icon}
            </Box>
            <Typography fontWeight={700}>{s.label}</Typography>
          </MotionBox>
        ))}
      </Box>

      <MotionBox initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.55 }} sx={{ position: "relative" }}>
        <Stack direction="row" spacing={3} sx={{ mt: 1 }}>
          {[
            { icon: <BoltRounded sx={{ fontSize: 18 }} />, k: "Instant", v: "band scores" },
            { icon: <AutoAwesomeRounded sx={{ fontSize: 18 }} />, k: "AI-graded", v: "writing & speaking" },
            { icon: <MenuBookRounded sx={{ fontSize: 18 }} />, k: "All 4", v: "skills covered" },
          ].map((m) => (
            <Stack key={m.k} spacing={0.25}>
              <Stack direction="row" spacing={0.5} alignItems="center">
                {m.icon}
                <Typography fontWeight={800}>{m.k}</Typography>
              </Stack>
              <Typography variant="caption" sx={{ opacity: 0.85 }}>{m.v}</Typography>
            </Stack>
          ))}
        </Stack>
      </MotionBox>
    </Box>
  );
}
