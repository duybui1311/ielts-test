import React from "react";
import {
  Box, Card, Stack, Typography, Accordion, AccordionSummary,
  AccordionDetails, Chip,
} from "@mui/material";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import SchoolRoundedIcon from "@mui/icons-material/SchoolRounded";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import StyleRoundedIcon from "@mui/icons-material/StyleRounded";
import { PageHeader } from "../component/ui";

const STEPS = [
  { icon: <SchoolRoundedIcon />, title: "Take a test", body: "Open My Tests, pick a test and press Start. Reading and Listening questions are answered inline; your answers save as you go and the test auto-submits when the timer runs out." },
  { icon: <InsightsRoundedIcon />, title: "See your results", body: "As soon as you submit, Reading and Listening are graded automatically. You get an overall band, a per-question breakdown, and a chart of your most common mistake types." },
  { icon: <StyleRoundedIcon />, title: "Review with flashcards", body: "Build decks of vocabulary or collocations and study them in flip-card mode. Rate each card so you know what to revisit." },
];

const FAQ = [
  { q: "How is my band score calculated?", a: "Reading and Listening are scored automatically: your raw score is scaled to /40 and mapped to a band using a standard conversion table. Your overall band is the average of your section bands, rounded to the nearest 0.5." },
  { q: "Are Writing and Speaking graded?", a: "Not yet. Writing and Speaking answers are saved but left for a teacher to mark — automated AI grading for these is planned for a future version." },
  { q: "Why does my dashboard look empty?", a: "The dashboard fills in once you've completed at least one test. Take a test from My Tests and your stats, band trend and weaknesses will appear." },
  { q: "I'm a teacher — how do I create a test?", a: "Open Create Exam, give the test a name and time limit, add Reading/Listening sections with a passage, then add multiple-choice or short-answer questions with their correct answers. Save and it appears in students' My Tests." },
];

export default function Help() {
  return (
    <Box sx={{ maxWidth: 860 }}>
      <PageHeader title="Help & getting started" subtitle="A quick tour of how the platform works." />

      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={2}
        sx={{ mb: 3 }}
      >
        {STEPS.map((s, i) => (
          <Card key={s.title} sx={{ p: 2.5, flex: 1 }}>
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Box sx={{ color: "primary.main" }}>{s.icon}</Box>
                <Chip size="small" label={`Step ${i + 1}`} />
              </Stack>
              <Typography variant="subtitle1">{s.title}</Typography>
              <Typography variant="body2" color="text.secondary">{s.body}</Typography>
            </Stack>
          </Card>
        ))}
      </Stack>

      <Typography variant="h6" sx={{ mb: 1.5 }}>Frequently asked questions</Typography>
      {FAQ.map((f) => (
        <Accordion key={f.q} disableGutters sx={{ mb: 1, borderRadius: 2, "&:before": { display: "none" } }}>
          <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
            <Typography fontWeight={600}>{f.q}</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body2" color="text.secondary">{f.a}</Typography>
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
  );
}
