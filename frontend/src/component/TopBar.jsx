import * as React from "react";
import {
  Box, Stack, Typography, IconButton, Avatar, Tooltip, alpha, Divider,
} from "@mui/material";
import DarkModeRoundedIcon from "@mui/icons-material/DarkModeRounded";
import LightModeRoundedIcon from "@mui/icons-material/LightModeRounded";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import { useColorMode } from "../theme/ColorModeContext";
import { BandPill } from "./ui";
import { apiFetch } from "../api";

export const TOPBAR_HEIGHT = 60;

// Cache the student's band across navigations so we fetch it at most once.
let bandCache; // undefined = not fetched, null = no data, number = band

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function TopBar() {
  const { mode, toggle } = useColorMode();

  const role = React.useMemo(() => {
    try { return (localStorage.getItem("osce-role") || "student").toLowerCase(); }
    catch { return "student"; }
  }, []);
  const name = React.useMemo(() => {
    try { return localStorage.getItem("osce-name") || ""; } catch { return ""; }
  }, []);

  const [band, setBand] = React.useState(bandCache);

  React.useEffect(() => {
    if (role !== "student" || bandCache !== undefined) return;
    apiFetch("/api/dashboard")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        bandCache = d?.kpis?.avg_band ?? null;
        setBand(bandCache);
      })
      .catch(() => { bandCache = null; });
  }, [role]);

  return (
    <Box
      sx={(theme) => ({
        position: "sticky",
        top: 0,
        zIndex: 1100,
        height: TOPBAR_HEIGHT,
        mx: { xs: -2, md: -3 },
        mt: { xs: -2, md: -3 },
        mb: { xs: 2, md: 3 },
        px: { xs: 2, md: 3 },
        display: "flex",
        alignItems: "center",
        borderBottom: `1px solid ${theme.palette.divider}`,
        bgcolor: alpha(theme.palette.background.paper, 0.8),
        backdropFilter: "blur(10px)",
      })}
    >
      {/* Left: subtle AI-powered marker */}
      <Stack direction="row" spacing={1} alignItems="center" sx={{ flexGrow: 1, minWidth: 0 }}>
        <AutoAwesomeRoundedIcon sx={{ fontSize: 18, color: "secondary.main" }} />
        <Typography
          variant="body2"
          sx={{ fontWeight: 600, color: "text.secondary", display: { xs: "none", sm: "block" } }}
        >
          AI-powered · All 4 skills
        </Typography>
      </Stack>

      {/* Right: band pill, theme toggle, user */}
      <Stack direction="row" spacing={1.5} alignItems="center">
        {role === "student" && band !== undefined && (
          <Box sx={{ display: { xs: "none", sm: "block" } }}>
            <BandPill band={band} label="Avg band" />
          </Box>
        )}

        <Tooltip title={mode === "dark" ? "Light mode" : "Dark mode"}>
          <IconButton onClick={toggle} size="small" sx={{ color: "text.secondary" }}>
            {mode === "dark" ? <LightModeRoundedIcon /> : <DarkModeRoundedIcon />}
          </IconButton>
        </Tooltip>

        <Divider orientation="vertical" flexItem sx={{ my: 1.25 }} />

        <Stack direction="row" spacing={1.25} alignItems="center">
          <Box sx={{ textAlign: "right", display: { xs: "none", md: "block" }, minWidth: 0 }}>
            <Typography variant="body2" fontWeight={700} noWrap sx={{ lineHeight: 1.2 }}>
              {name || "Account"}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              noWrap
              sx={{ textTransform: "capitalize", lineHeight: 1 }}
            >
              {role}
            </Typography>
          </Box>
          <Avatar
            sx={{
              width: 36, height: 36, fontSize: 14, fontWeight: 700, color: "#fff",
              background: "linear-gradient(135deg, #0046FF 0%, #73C8D2 100%)",
            }}
          >
            {initials(name)}
          </Avatar>
        </Stack>
      </Stack>
    </Box>
  );
}
