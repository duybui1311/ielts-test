import * as React from "react";
import {
  Box, Paper, Typography,
  Button, Collapse, Stack, Chip, alpha,
} from "@mui/material";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import CancelRoundedIcon from "@mui/icons-material/CancelRounded";
import MenuBookRoundedIcon from "@mui/icons-material/MenuBookRounded";
import { mediaUrl } from "../api";
import { SkillChip } from "./ui";
import ExplanationPanel from "./ExplanationPanel";
import QuestionInput from "./QuestionInput";

/**
 * A single drillable question — shared by the Practice and Review pages. Renders
 * an optional collapsible passage/audio/image, the prompt and an MCQ/short input.
 * When `result` is provided it switches to a graded, read-only view with an
 * explanation panel.
 */
export default function QuestionStem({
  question,
  number,
  value = {},
  onChange,
  result,            // { is_correct, correct_answer } once graded
  showPassage = true,
}) {
  const [openPassage, setOpenPassage] = React.useState(false);
  const graded = !!result;
  const hasPassage = showPassage && question.passage_md && question.passage_md.trim();

  return (
    <Paper
      variant="outlined"
      sx={(t) => ({
        p: 2.5,
        borderLeft: graded
          ? `4px solid ${result.is_correct ? t.palette.success.main : t.palette.error.main}`
          : undefined,
      })}
    >
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        {number != null && (
          <Box
            sx={(t) => ({
              minWidth: 26, height: 26, px: 0.5, borderRadius: 1.5,
              display: "grid", placeItems: "center", fontWeight: 700, fontSize: 13,
              color: "primary.main",
              bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.2 : 0.12),
            })}
          >
            {number}
          </Box>
        )}
        {question.skill && <SkillChip skill={question.skill} />}
        {graded && (
          <Chip
            size="small"
            icon={result.is_correct ? <CheckCircleRoundedIcon /> : <CancelRoundedIcon />}
            label={result.is_correct ? "Correct" : "Incorrect"}
            color={result.is_correct ? "success" : "error"}
            variant="outlined"
            sx={{ ml: "auto" }}
          />
        )}
      </Stack>

      {hasPassage && (
        <Box sx={{ mb: 1 }}>
          <Button
            size="small"
            variant="text"
            onClick={() => setOpenPassage((o) => !o)}
            startIcon={<MenuBookRoundedIcon />}
          >
            {openPassage ? "Hide passage" : "Show passage"}
          </Button>
          <Collapse in={openPassage} unmountOnExit>
            <Box
              sx={(t) => ({
                mt: 1, p: 2, borderRadius: 2, maxHeight: 320, overflowY: "auto",
                border: `1px solid ${t.palette.divider}`, bgcolor: "background.default",
                whiteSpace: "pre-wrap", lineHeight: 1.9,
              })}
            >
              {question.passage_md}
            </Box>
          </Collapse>
        </Box>
      )}

      {question.audio_url && (
        <Box component="audio" controls preload="metadata" src={mediaUrl(question.audio_url)} sx={{ width: "100%", mb: 1.5 }} />
      )}
      {question.image_url && (
        <Box
          component="img"
          src={mediaUrl(question.image_url)}
          alt="Question chart or diagram"
          sx={{ display: "block", maxWidth: "100%", borderRadius: 1, mb: 1.5, border: "1px solid", borderColor: "divider" }}
        />
      )}

      {question.qformat !== "gap_fill" && (
        <Typography variant="body1" fontWeight={600} sx={{ mb: 1 }}>
          {question.prompt}
        </Typography>
      )}

      <QuestionInput
        question={question}
        value={value}
        onChange={onChange}
        disabled={graded}
      />

      {graded && !result.is_correct && result.correct_answer && (
        <Typography variant="body2" color="success.main" sx={{ mt: 1 }}>
          Correct answer: <strong>{result.correct_answer}</strong>
        </Typography>
      )}

      {graded && (
        <ExplanationPanel
          questionId={question.id}
          explanation={result.explanation}
          supportSentences={result.support_sentences}
          paraphrases={result.paraphrases}
          studentAnswer={result.your_answer}
          wasWrong={result.is_correct === false}
        />
      )}
    </Paper>
  );
}
