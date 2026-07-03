import * as React from "react";
import { Box, Container, Typography, Button, Divider } from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import { useNavigate } from "react-router-dom";

function Section({ title, children }) {
  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="h6" fontWeight={700} gutterBottom>{title}</Typography>
      <Typography variant="body2" color="text.secondary" component="div" sx={{ lineHeight: 1.8 }}>
        {children}
      </Typography>
    </Box>
  );
}

/** Plain-language privacy policy. Public page, linked from login and Help. */
export default function Privacy() {
  const navigate = useNavigate();
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default", py: 5 }}>
      <Container maxWidth="md">
        <Button startIcon={<ArrowBackRoundedIcon />} onClick={() => navigate(-1)} sx={{ mb: 2 }}>
          Back
        </Button>
        <Typography variant="h4" fontWeight={800} gutterBottom>Privacy Policy</Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Last updated: July 2026
        </Typography>
        <Divider sx={{ my: 3 }} />

        <Section title="What we collect">
          <ul>
            <li><strong>Account details</strong> — your name, email address and role (student or teacher).</li>
            <li><strong>Study data</strong> — your test answers, scores, practice history, flashcards and review schedule.</li>
            <li><strong>Writing and Speaking work</strong> — essays you submit and, if you use the Speaking feature,
              audio recordings of your voice. Recordings are stored securely and served only through
              time-limited private links.</li>
          </ul>
        </Section>

        <Section title="How we use it">
          Your data is used for exactly one purpose: running your IELTS preparation — grading your work,
          showing your progress, and letting your teacher review and give feedback. We do not sell your
          data or use it for advertising. Test content and answers may be processed by an AI service
          (Google Gemini) to generate feedback and explanations; recordings and essays are shared with it
          only for grading your own work.
        </Section>

        <Section title="Who can see your work">
          Your results and submissions are visible to you, to teachers of the classes you have joined,
          and to the site administrator. Other students never see your work.
        </Section>

        <Section title="Where it lives and how long">
          Data is stored with our hosting providers (Supabase and Render). We keep it while your account
          is active. If you stop using Bandly, you can ask for your account and all associated data —
          including voice recordings — to be deleted at any time.
        </Section>

        <Section title="Your choices">
          <ul>
            <li>You can use the platform without the Speaking feature if you prefer not to record audio.</li>
            <li>You can request a copy of your data, or its deletion, by contacting your teacher or the
              administrator at <strong>congduy.workspace@gmail.com</strong>.</li>
          </ul>
        </Section>

        <Section title="Changes">
          If this policy changes in a way that matters, we'll show a notice on the site before the change
          takes effect.
        </Section>
      </Container>
    </Box>
  );
}
