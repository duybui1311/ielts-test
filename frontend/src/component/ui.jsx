import * as React from "react";
import { Box, Card, Chip, Stack, Typography, alpha } from "@mui/material";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";

/** Shared presentational helpers for the IELTS Platform look. */

// MUI palette slot per skill (kept for back-compat with older call sites).
export const SKILL_COLOR = {
  reading: "primary",
  listening: "success",
  writing: "secondary",
  speaking: "warning",
};

// Explicit, distinctive per-skill hues: reading=blue, listening=green,
// writing=purple, speaking=orange. Used for chips and card accents so the
// mapping stays consistent regardless of the active palette slots.
export const SKILL_HEX = {
  reading: "#3B82F6",
  listening: "#10B981",
  writing: "#8B5CF6",
  speaking: "#F97316",
};

export function skillHex(skill) {
  return SKILL_HEX[String(skill || "").toLowerCase()] || "#64748B";
}

export function bandColor(band) {
  if (band == null) return "text.secondary";
  if (band >= 7) return "success.main";
  if (band >= 5) return "warning.main";
  return "error.main";
}

/**
 * Themed Recharts props so axes, gridlines and tooltips stay readable in both
 * light and dark mode.
 */
export function chartTheme(theme) {
  const line = { stroke: theme.palette.divider };
  const textPrimary = theme.palette.text.primary;
  return {
    tick: { fontSize: 12, fill: theme.palette.text.secondary },
    axisLine: line,
    tickLine: line,
    grid: { stroke: theme.palette.divider },
    tooltip: {
      contentStyle: {
        background: theme.palette.background.paper,
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 10,
        boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
        color: textPrimary,
      },
      labelStyle: { color: textPrimary, fontWeight: 600 },
      itemStyle: { color: textPrimary },
    },
  };
}

/** Skill chip with a soft tinted background in the skill's signature colour. */
export function SkillChip({ skill, ...rest }) {
  if (!skill) return null;
  const hex = skillHex(skill);
  return (
    <Chip
      label={skill}
      size="small"
      sx={(theme) => ({
        textTransform: "capitalize",
        color: hex,
        bgcolor: alpha(hex, theme.palette.mode === "dark" ? 0.22 : 0.12),
        border: `1px solid ${alpha(hex, 0.32)}`,
        fontWeight: 700,
      })}
      {...rest}
    />
  );
}

/** Small "AI" pill that signals AI-powered grading — the key differentiator. */
export function AiBadge({ label = "AI", size = "small", sx, ...rest }) {
  return (
    <Chip
      size={size}
      icon={<AutoAwesomeRoundedIcon sx={{ fontSize: 15 }} />}
      label={label}
      sx={[
        {
          height: 22,
          fontWeight: 700,
          letterSpacing: "0.02em",
          color: "#fff",
          border: "none",
          background: "linear-gradient(135deg, #6366F1 0%, #A855F7 100%)",
          "& .MuiChip-icon": { color: "#fff", ml: 0.5 },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      {...rest}
    />
  );
}

/** Rounded band-score pill, colour-coded by band. */
export function BandPill({ band, label = "Band", sx }) {
  const hasBand = band != null;
  return (
    <Stack
      direction="row"
      spacing={0.75}
      alignItems="center"
      sx={[
        (theme) => {
          const c = !hasBand
            ? theme.palette.text.disabled
            : band >= 7
            ? theme.palette.success.main
            : band >= 5
            ? theme.palette.warning.main
            : theme.palette.error.main;
          return {
            px: 1.25,
            py: 0.4,
            borderRadius: 999,
            bgcolor: alpha(c, theme.palette.mode === "dark" ? 0.2 : 0.12),
            border: `1px solid ${alpha(c, 0.35)}`,
            color: c,
          };
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Typography variant="caption" sx={{ fontWeight: 600, opacity: 0.85 }}>
        {label}
      </Typography>
      <Typography variant="subtitle2" sx={{ fontWeight: 800, lineHeight: 1 }}>
        {hasBand ? band : "—"}
      </Typography>
    </Stack>
  );
}

/** Wraps children in a subtle fade-in-up entrance animation. */
export function FadeIn({ children, delay = 0, sx, ...rest }) {
  return (
    <Box
      sx={[
        {
          animation: "appFadeInUp .45s cubic-bezier(0.22, 1, 0.36, 1) both",
          animationDelay: `${delay}ms`,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      {...rest}
    >
      {children}
    </Box>
  );
}

/** Page title + optional subtitle and right-aligned action. */
export function PageHeader({ title, subtitle, action }) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      alignItems={{ xs: "flex-start", sm: "center" }}
      spacing={2}
      sx={{ mb: 3 }}
    >
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography variant="h4">{title}</Typography>
        {subtitle && (
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {action}
    </Stack>
  );
}

/** Compact KPI card with a tinted icon tile and a gentle hover lift. */
export function StatCard({ icon, label, value, hint, color = "primary.main", onClick }) {
  return (
    <Card
      onClick={onClick}
      sx={{
        p: 2.5,
        height: "100%",
        cursor: onClick ? "pointer" : "default",
        "&:hover": onClick ? { transform: "translateY(-3px)" } : undefined,
      }}
    >
      <Stack direction="row" spacing={2} alignItems="center">
        <Box
          sx={(theme) => ({
            width: 50,
            height: 50,
            borderRadius: 2.5,
            flexShrink: 0,
            display: "grid",
            placeItems: "center",
            color,
            bgcolor: alpha(
              color.includes(".")
                ? theme.palette[color.split(".")[0]].main
                : color,
              theme.palette.mode === "dark" ? 0.2 : 0.12
            ),
          })}
        >
          {icon}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h5" fontWeight={800} noWrap sx={{ letterSpacing: "-0.02em" }}>
            {value}
          </Typography>
          <Typography variant="body2" color="text.secondary" noWrap>
            {label}
          </Typography>
          {hint && (
            <Typography variant="caption" color="text.disabled" noWrap display="block">
              {hint}
            </Typography>
          )}
        </Box>
      </Stack>
    </Card>
  );
}
