import React, { useEffect, useState } from "react";
import {
  Box, Card, Stack, Typography, Chip, Button, CircularProgress, Alert, Divider,
} from "@mui/material";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import { PageHeader, bandColor } from "../component/ui";

const STATUS_COLOR = { graded: "success", submitted: "info", draft: "warning" };

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

export default function History() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    apiFetch("/api/me/attempts")
      .then((r) => r.json())
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .catch(() => setError("Could not load your history."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <PageHeader title="History" subtitle="Every test you have started or completed." />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {rows.length === 0 ? (
        <Card sx={{ p: 4, textAlign: "center" }}>
          <Typography color="text.secondary">
            You haven't taken any tests yet. Head to <strong>My Tests</strong> to start one.
          </Typography>
          <Button variant="contained" sx={{ mt: 2 }} onClick={() => navigate("/exams")}>
            Browse tests
          </Button>
        </Card>
      ) : (
        <Card sx={{ p: 0 }}>
          {rows.map((a, i) => {
            const graded = a.status === "graded" || a.status === "submitted";
            return (
              <React.Fragment key={a.attempt_id}>
                {i > 0 && <Divider />}
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={2}
                  sx={{ p: 2.5 }}
                >
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography fontWeight={600} noWrap>{a.exam_name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Started {fmtDate(a.started_at)}
                      {a.submitted_at ? ` · Submitted ${fmtDate(a.submitted_at)}` : ""}
                    </Typography>
                  </Box>

                  {a.overall_band != null && (
                    <Box sx={{ textAlign: "right", minWidth: 64 }}>
                      <Typography variant="h6" fontWeight={800} color={bandColor(a.overall_band)}>
                        {a.overall_band}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">band</Typography>
                    </Box>
                  )}

                  <Chip
                    label={a.status}
                    size="small"
                    color={STATUS_COLOR[a.status] || "default"}
                    sx={{ textTransform: "capitalize" }}
                  />

                  <Button
                    variant={graded ? "outlined" : "contained"}
                    size="small"
                    endIcon={<ChevronRightRoundedIcon />}
                    onClick={() =>
                      navigate(graded ? `/results/${a.attempt_id}` : `/exam/${a.attempt_id}`)
                    }
                  >
                    {graded ? "Results" : "Resume"}
                  </Button>
                </Stack>
              </React.Fragment>
            );
          })}
        </Card>
      )}
    </Box>
  );
}
