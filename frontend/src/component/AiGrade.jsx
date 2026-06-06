import React from "react";
import { Box, Card, Stack, Typography, Chip, Divider, LinearProgress } from "@mui/material";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import TipsAndUpdatesRoundedIcon from "@mui/icons-material/TipsAndUpdatesRounded";
import { bandColor } from "./ui";

/**
 * Read-only display of an AI grading result:
 *   { overall_band, criteria: [{name, band, comment}], tips: [...], error_tags? }
 * `headlineBand` overrides the big number (e.g. the teacher's approved band).
 */
export default function AiGrade({ result, headlineBand }) {
  if (!result) return null;
  const overall = headlineBand != null ? headlineBand : result.overall_band;
  const criteria = result.criteria || [];
  const tips = result.tips || [];

  return (
    <Card variant="outlined" sx={{ p: 2.5, boxShadow: "none" }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
        <AutoAwesomeRoundedIcon fontSize="small" color="primary" />
        <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>AI assessment</Typography>
        <Typography variant="h5" fontWeight={800} color={bandColor(overall)}>{overall ?? "—"}</Typography>
      </Stack>

      <Stack spacing={1.25}>
        {criteria.map((c, i) => (
          <Box key={i}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography variant="body2" sx={{ flexGrow: 1 }} fontWeight={600}>{c.name}</Typography>
              <Chip size="small" label={c.band ?? "—"} sx={{ fontWeight: 700 }} />
            </Stack>
            <Box sx={{ my: 0.5 }}>
              <LinearProgress
                variant="determinate"
                value={Math.max(0, Math.min(100, ((c.band || 0) / 9) * 100))}
                sx={{ borderRadius: 1, height: 6 }}
              />
            </Box>
            {c.comment && (
              <Typography variant="caption" color="text.secondary">{c.comment}</Typography>
            )}
          </Box>
        ))}
      </Stack>

      {tips.length > 0 && (
        <>
          <Divider sx={{ my: 1.5 }} />
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
            <TipsAndUpdatesRoundedIcon fontSize="small" color="warning" />
            <Typography variant="subtitle2">How to improve</Typography>
          </Stack>
          <Box component="ul" sx={{ pl: 3, m: 0 }}>
            {tips.map((t, i) => (
              <Typography component="li" variant="body2" key={i} sx={{ mb: 0.25 }}>{t}</Typography>
            ))}
          </Box>
        </>
      )}
    </Card>
  );
}
