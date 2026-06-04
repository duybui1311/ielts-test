import * as React from "react";
import { Box, Card, Chip, Stack, Typography, alpha } from "@mui/material";

/** Shared presentational helpers for the Modern Indigo SaaS look. */

export const SKILL_COLOR = {
  reading: "primary",
  listening: "secondary",
  writing: "success",
  speaking: "warning",
};

export function bandColor(band) {
  if (band == null) return "text.secondary";
  if (band >= 7) return "success.main";
  if (band >= 5) return "warning.main";
  return "error.main";
}

export function SkillChip({ skill, ...rest }) {
  if (!skill) return null;
  return (
    <Chip
      label={skill}
      size="small"
      color={SKILL_COLOR[skill] || "default"}
      sx={{ textTransform: "capitalize" }}
      {...rest}
    />
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
      <Box sx={{ flexGrow: 1 }}>
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

/** Compact KPI card with a tinted icon tile. */
export function StatCard({ icon, label, value, hint, color = "primary.main" }) {
  return (
    <Card sx={{ p: 2.5, height: "100%" }}>
      <Stack direction="row" spacing={2} alignItems="center">
        <Box
          sx={(theme) => ({
            width: 48,
            height: 48,
            borderRadius: 2.5,
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
          <Typography variant="h5" fontWeight={800} noWrap>
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
