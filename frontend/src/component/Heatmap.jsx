import * as React from "react";
import { Box, Typography, Tooltip, alpha } from "@mui/material";

/** Accuracy → semantic colour. Null = not enough data (gray). */
function cellColor(theme, accuracy) {
  if (accuracy == null) return theme.palette.text.disabled;
  if (accuracy >= 85) return theme.palette.success.main;
  if (accuracy >= 60) return theme.palette.warning.main;
  return theme.palette.error.main;
}

/**
 * Weakness heatmap — one cell per sub_skill, coloured by accuracy. Clicking a
 * cell calls `onCellClick(sub_skill)` (used to jump into a focused drill).
 */
export default function Heatmap({ data = [], onCellClick }) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(3, 1fr)" },
        gap: 1.5,
      }}
    >
      {data.map((d) => {
        const clickable = !!onCellClick;
        const hint =
          d.accuracy == null
            ? `${d.attempted || 0} attempted · not enough data yet`
            : `${d.correct}/${d.attempted} correct`;
        return (
          <Tooltip key={d.sub_skill} title={hint} arrow>
            <Box
              onClick={clickable ? () => onCellClick(d.sub_skill) : undefined}
              sx={(theme) => {
                const c = cellColor(theme, d.accuracy);
                return {
                  p: 1.75,
                  borderRadius: 2,
                  cursor: clickable ? "pointer" : "default",
                  color: c,
                  border: `1px solid ${alpha(c, 0.4)}`,
                  bgcolor: alpha(c, theme.palette.mode === "dark" ? 0.18 : 0.12),
                  transition: "transform .15s ease, box-shadow .15s ease",
                  "&:hover": clickable ? { transform: "translateY(-2px)", boxShadow: `0 6px 16px ${alpha(c, 0.25)}` } : undefined,
                };
              }}
            >
              <Typography variant="h5" fontWeight={800} sx={{ lineHeight: 1 }}>
                {d.accuracy == null ? "—" : `${d.accuracy}%`}
              </Typography>
              <Typography
                variant="caption"
                sx={{ color: "text.secondary", fontWeight: 600, display: "block", mt: 0.5, lineHeight: 1.2 }}
              >
                {d.label}
              </Typography>
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
}
