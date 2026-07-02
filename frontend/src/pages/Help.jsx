import React from "react";
import {
  Box, Card, Stack, Typography, Accordion, AccordionSummary,
  AccordionDetails, Chip, Divider,
} from "@mui/material";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import SchoolRoundedIcon from "@mui/icons-material/SchoolRounded";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import ReplayRoundedIcon from "@mui/icons-material/ReplayRounded";
import HelpOutlineRoundedIcon from "@mui/icons-material/HelpOutlineRounded";
import { PageHeader } from "../component/ui";

// A quick four-step tour shown as cards at the top of the page.
const STEPS = [
  {
    icon: <SchoolRoundedIcon />,
    title: "Take a test",
    body: "Open My Tests, pick a skill tab and press Start. Reading and Listening questions are answered inline and numbered like a real IELTS paper. Your answers save as you go and the test auto-submits when the timer ends.",
  },
  {
    icon: <InsightsRoundedIcon />,
    title: "See instant results",
    body: "Reading and Listening are graded the moment you submit. You get an overall band, a per-question breakdown with explanations, and a chart of your most common mistake types.",
  },
  {
    icon: <AutoAwesomeRoundedIcon />,
    title: "Practise Writing & Speaking",
    body: "Write an essay or record a spoken answer. It's graded by AI against the official band descriptors, then a teacher checks and approves it before you see your band, tips and feedback.",
  },
  {
    icon: <ReplayRoundedIcon />,
    title: "Review & improve",
    body: "Drill your weak question types in Practice, revisit mistakes with spaced-repetition Review, and study vocabulary with Flashcards. Track it all on your Dashboard.",
  },
];

// FAQ grouped into readable sections.
const FAQ_GROUPS = [
  {
    group: "Taking tests",
    items: [
      {
        q: "How do I take a test?",
        a: "Go to My Tests, choose a skill tab (Reading, Listening, Writing or Speaking), pick a test and press Start. Reading and Listening questions are answered inline; use the question navigator at the top to jump to any question and see your progress.",
      },
      {
        q: "Do my answers save automatically?",
        a: "Yes. Every answer is saved as you go — you'll see a \"Saved\" indicator near the timer. If the timer runs out, the test submits automatically, so you never lose your work.",
      },
      {
        q: "How is my band score calculated?",
        a: "Reading and Listening are scored automatically: your raw score is scaled to /40 and mapped to a band using the standard IELTS conversion table. Your overall band is the average of your section bands, rounded to the nearest 0.5.",
      },
      {
        q: "Can I see my past tests?",
        a: "Yes — open History for a list of your previous attempts and results. You can reopen any result to review the per-question breakdown again.",
      },
    ],
  },
  {
    group: "Writing & Speaking",
    items: [
      {
        q: "Are Writing and Speaking graded?",
        a: "Yes. Submit an essay (Writing) or a recorded answer (Speaking) and it's graded by AI against the official band descriptors — per-criterion bands, common-mistake tags and improvement tips. A teacher then reviews, edits and approves the result before you see it, so the feedback is fast and fair.",
      },
      {
        q: "How do I record a Speaking answer?",
        a: "Open a Speaking task, tap the microphone to start, and tap again to stop. You can play the recording back before submitting. In Chrome or Edge a live transcript appears as you speak (you can edit it, or type it in any browser). Recording works on phones and tablets too.",
      },
      {
        q: "My recording won't play back — what should I do?",
        a: "Make sure you allowed microphone access and that the page is secure (https) or localhost. Recording uses your browser's native audio format (for example mp4 on iPhone), which the player understands automatically. If it still won't play, try Chrome, Edge, or Safari 14.3 or newer.",
      },
      {
        q: "Where do I see my Writing/Speaking grade?",
        a: "Once your teacher approves it, open the submission and tap View result. You'll see the overall band, the AI criterion breakdown, improvement tips, your teacher's feedback, and any inline comments highlighted on your essay.",
      },
    ],
  },
  {
    group: "Tracking your progress",
    items: [
      {
        q: "Why does my dashboard look empty?",
        a: "The dashboard fills in once you've completed at least one test. Take a test from My Tests and your stats, band trend and weak spots will appear.",
      },
      {
        q: "What is Practice by Type?",
        a: "Targeted drills for a single question type (for example, matching headings or gap-fill). You answer a short set and get instant grading plus an AI explanation for each question — a quick way to train your weakest skills. You can jump straight into a weak spot from the heatmap on your dashboard.",
      },
      {
        q: "What does Review do?",
        a: "Review brings back questions you got wrong as spaced-repetition practice, so you revisit them at the right time to lock them in. The badge on the Review icon shows how many are due today.",
      },
      {
        q: "What are Flashcards?",
        a: "Build decks of vocabulary or collocations and study them in flip-card mode. Rate each card Again / Hard / Good / Easy and the harder ones come back sooner.",
      },
    ],
  },
  {
    group: "Using the app",
    items: [
      {
        q: "Does it work on my phone or tablet?",
        a: "Yes. The layout adapts to any screen: a bottom navigation bar on phones and tablets, and a side menu on desktop. Taking tests, recording Speaking answers and everything else are designed to work on touch devices.",
      },
      {
        q: "How do I switch to dark mode?",
        a: "Tap the moon/sun icon in the top bar, or go to Settings → Appearance. Your choice is remembered on this device.",
      },
      {
        q: "How do I change my name or password?",
        a: "Open Settings → Profile to update your name, or Settings → Change password to set a new one.",
      },
    ],
  },
  {
    group: "For teachers & admins",
    items: [
      {
        q: "How do I create a test?",
        a: "Open Test Manage → Create. Build a Reading or Listening test in the visual builder (add a passage or audio, then multiple-choice or short-answer questions with their correct answers), or add a Writing/Speaking task. Save it and it appears in students' My Tests.",
      },
      {
        q: "Can I import a test from a file?",
        a: "Yes. In Create Exam, choose Import from file (AI), upload a PDF, Word document or image, and the AI converts it into the builder for you to review and adjust before saving. If you also attach the test's answer sheet, the AI fills every correct answer straight from the key instead of solving the test itself — much more accurate for auto-grading.",
      },
      {
        q: "How do I grade Writing and Speaking?",
        a: "Open Review to see pending submissions. Click AI grade to generate a draft, optionally highlight parts of the essay to add inline comments, choose whether to share the AI breakdown with the student, then Approve & save to release the result.",
      },
      {
        q: "How are teacher and admin accounts created?",
        a: "Students self-register from the sign-up page. Teacher and admin accounts are created by an admin in the Admin area (New account) — where you can also set a temporary password and copy it to share securely.",
      },
      {
        q: "What can admins do?",
        a: "The Admin area shows platform stats and lets you manage users (change role, activate or deactivate, reset password, delete) and every test on the platform.",
      },
    ],
  },
];

export default function Help() {
  return (
    <Box sx={{ maxWidth: 860 }}>
      <PageHeader
        eyebrow="Guide"
        title="Help & getting started"
        subtitle="Everything you need to use the platform — a quick tour, then answers to common questions."
        icon={<HelpOutlineRoundedIcon />}
      />

      {/* Quick tour */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "repeat(4, 1fr)" },
          gap: 2,
          mb: 4,
        }}
      >
        {STEPS.map((s, i) => (
          <Card key={s.title} sx={{ p: 2.5 }}>
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
      </Box>

      {/* Grouped FAQ */}
      <Typography variant="h6" sx={{ mb: 0.5 }}>Frequently asked questions</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
        Tap a question to expand its answer.
      </Typography>

      {FAQ_GROUPS.map((section) => (
        <Box key={section.group} sx={{ mb: 3 }}>
          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1.5 }}>
            <Typography variant="overline" color="primary" sx={{ letterSpacing: "0.08em" }}>
              {section.group}
            </Typography>
            <Divider sx={{ flexGrow: 1 }} />
          </Stack>
          {section.items.map((f) => (
            <Accordion
              key={f.q}
              disableGutters
              sx={{ mb: 1, borderRadius: 2, border: "1px solid", borderColor: "divider", "&:before": { display: "none" } }}
            >
              <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
                <Typography fontWeight={600}>{f.q}</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Typography variant="body2" color="text.secondary">{f.a}</Typography>
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>
      ))}

      {/* Closing note */}
      <Card sx={{ p: 2.5, mt: 1 }}>
        <Typography variant="body2" color="text.secondary">
          Still stuck? If something isn't working, check that you're signed in and connected,
          then try refreshing. Teachers and admins can manage tests and accounts from the side menu.
        </Typography>
      </Card>
    </Box>
  );
}
