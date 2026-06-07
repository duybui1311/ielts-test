import * as React from "react";
import {
  Box, Button, Collapse, Stack, Typography, alpha, CircularProgress, Alert,
} from "@mui/material";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import LightbulbRoundedIcon from "@mui/icons-material/LightbulbRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import { apiFetch } from "../api";

/**
 * Collapsible "Show explanation" panel for a Reading/Listening question.
 * Shows the cached explanation + supporting sentences; if none is cached yet it
 * offers to generate one on demand via POST /api/questions/{id}/explain.
 */
export default function ExplanationPanel({
  questionId,
  explanation: initialExplanation,
  supportSentences: initialSupport = [],
}) {
  const [open, setOpen] = React.useState(false);
  const [explanation, setExplanation] = React.useState(initialExplanation || "");
  const [support, setSupport] = React.useState(initialSupport || []);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const generate = React.useCallback(async () => {
    if (!questionId) return;
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch(`/api/questions/${questionId}/explain`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Could not generate an explanation.");
      setExplanation(data.explanation || "");
      setSupport(data.support_sentences || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [questionId]);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !explanation && !loading) generate();
  };

  return (
    <Box sx={{ mt: 1.5 }}>
      <Button
        size="small"
        variant="text"
        onClick={handleToggle}
        startIcon={<LightbulbRoundedIcon />}
        endIcon={
          <ExpandMoreRoundedIcon
            sx={{ transition: "transform .2s ease", transform: open ? "rotate(180deg)" : "none" }}
          />
        }
        sx={{ color: "secondary.main", fontWeight: 700 }}
      >
        {open ? "Hide explanation" : "Show explanation"}
      </Button>

      <Collapse in={open} unmountOnExit>
        <Box
          sx={(theme) => ({
            mt: 1,
            p: 2,
            borderRadius: 2,
            border: `1px solid ${alpha(theme.palette.secondary.main, 0.35)}`,
            bgcolor: alpha(theme.palette.secondary.main, theme.palette.mode === "dark" ? 0.1 : 0.06),
          })}
        >
          {loading ? (
            <Stack direction="row" spacing={1.5} alignItems="center">
              <CircularProgress size={18} color="secondary" />
              <Typography variant="body2" color="text.secondary">
                Generating explanation…
              </Typography>
            </Stack>
          ) : error ? (
            <Stack spacing={1}>
              <Alert severity="warning" sx={{ py: 0.5 }}>{error}</Alert>
              <Button size="small" onClick={generate} startIcon={<AutoAwesomeRoundedIcon />}>
                Try again
              </Button>
            </Stack>
          ) : explanation ? (
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={0.75} alignItems="center">
                <AutoAwesomeRoundedIcon sx={{ fontSize: 16, color: "secondary.main" }} />
                <Typography variant="overline" sx={{ color: "secondary.main" }}>
                  Why this answer
                </Typography>
              </Stack>
              <Typography variant="body2" sx={{ lineHeight: 1.7 }}>
                {explanation}
              </Typography>
              {support && support.length > 0 && (
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                    Supporting evidence
                  </Typography>
                  <Stack spacing={0.75} sx={{ mt: 0.5 }}>
                    {support.map((s, i) => (
                      <Box
                        key={i}
                        sx={(theme) => ({
                          px: 1.25,
                          py: 0.75,
                          borderRadius: 1.5,
                          borderLeft: `3px solid ${theme.palette.secondary.main}`,
                          bgcolor: alpha(theme.palette.secondary.main, theme.palette.mode === "dark" ? 0.16 : 0.12),
                          fontStyle: "italic",
                        })}
                      >
                        <Typography variant="body2">“{s}”</Typography>
                      </Box>
                    ))}
                  </Stack>
                </Box>
              )}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No explanation available.
            </Typography>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}
