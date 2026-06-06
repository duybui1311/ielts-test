import React, { useEffect, useState } from "react";
import {
  Box, Card, Stack, Typography, Button, Chip, CircularProgress, Alert, Divider,
} from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import { useParams, useNavigate } from "react-router-dom";
import { apiFetch, API_BASE } from "../api";
import { PageHeader, bandColor } from "../component/ui";
import AnnotatedText from "../component/AnnotatedText";
import AiGrade from "../component/AiGrade";

export default function ResultView() {
  const { kind, submissionId } = useParams();
  const navigate = useNavigate();
  const [sub, setSub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch(`/api/${kind}/submissions/${submissionId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Could not load this result."))))
      .then(setSub)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [kind, submissionId]);

  if (loading) {
    return <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}><CircularProgress /></Box>;
  }
  if (error) {
    return <Box><Button startIcon={<ArrowBackRoundedIcon />} onClick={() => navigate(-1)}>Back</Button><Alert severity="error" sx={{ mt: 2 }}>{error}</Alert></Box>;
  }

  const reviewed = sub.status === "reviewed";
  const isWriting = kind === "writing";

  return (
    <Box sx={{ maxWidth: 900 }}>
      <PageHeader
        title={sub.task_title}
        subtitle={isWriting ? `${sub.word_count} words` : `Part ${sub.part}`}
        action={<Button startIcon={<ArrowBackRoundedIcon />} onClick={() => navigate(-1)}>Back</Button>}
      />

      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
        {reviewed ? (
          <Chip color="success" label={`Overall band ${sub.band}`} sx={{ fontWeight: 700 }} />
        ) : (
          <Chip color="warning" label="Awaiting teacher review" />
        )}
      </Stack>

      {/* The task prompt */}
      {sub.task_prompt && (
        <Card sx={{ p: 3, mb: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>Task</Typography>
          {sub.image_url && (
            <Box component="img" src={sub.image_url} alt="Task chart"
              sx={{ display: "block", maxWidth: "100%", borderRadius: 1, mb: 2, border: "1px solid", borderColor: "divider" }} />
          )}
          <Typography sx={{ whiteSpace: "pre-wrap" }}>{sub.task_prompt}</Typography>
        </Card>
      )}

      {/* The student's work */}
      <Card sx={{ p: 3, mb: 2 }}>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          {isWriting ? "Your response" : "Your answer"}
        </Typography>
        {isWriting ? (
          <AnnotatedText text={sub.response_text || ""} comments={sub.comments || []} />
        ) : (
          <>
            {sub.audio_url && <Box component="audio" controls src={`${API_BASE}${sub.audio_url}`} sx={{ width: "100%", mb: 2 }} />}
            <Typography sx={{ whiteSpace: "pre-wrap" }} color={sub.transcript ? "text.primary" : "text.disabled"}>
              {sub.transcript || "(no transcript)"}
            </Typography>
          </>
        )}
      </Card>

      {/* Teacher feedback */}
      {reviewed && sub.feedback && (
        <Alert severity="info" icon={false} sx={{ mb: 2 }}>
          <strong>Teacher feedback:</strong> {sub.feedback}
        </Alert>
      )}

      {/* AI assessment */}
      {sub.ai_result && <Box sx={{ mb: 2 }}><AiGrade result={sub.ai_result} headlineBand={sub.band} /></Box>}

      {/* Inline comments (writing) */}
      {isWriting && (sub.comments?.length > 0) && (
        <Card sx={{ p: 3 }}>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>Inline comments ({sub.comments.length})</Typography>
          <Divider sx={{ mb: 1.5 }} />
          <Stack spacing={1}>
            {sub.comments.map((c) => (
              <Box key={c.id} sx={{ borderLeft: "3px solid", borderColor: "warning.main", pl: 1.5 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontStyle: "italic" }} display="block">“{c.quote}”</Typography>
                <Typography variant="body2">{c.comment}</Typography>
              </Box>
            ))}
          </Stack>
        </Card>
      )}
    </Box>
  );
}
