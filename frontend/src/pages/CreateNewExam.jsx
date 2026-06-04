import React, { useEffect, useState } from "react";
import {
  Box, Card, Stack, Typography, Button, TextField, MenuItem, IconButton,
  Divider, Radio, RadioGroup, FormControlLabel, Alert, Snackbar, Chip,
  Collapse,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import { useNavigate } from "react-router-dom";
import { apiFetch, getUserId } from "../api";
import { PageHeader, SkillChip } from "../component/ui";

const SKILLS = ["reading", "listening", "writing", "speaking"];
const DIFFICULTIES = ["low", "medium", "high"];
const QTYPES = [
  { value: "mcq", label: "Multiple choice" },
  { value: "short", label: "Short answer" },
  { value: "explain", label: "Writing / extended (manual marking)" },
];
const SUB_SKILLS = [
  "multiple_choice", "gap_fill", "true_false_notgiven",
  "matching_headings", "sentence_completion", "short_answer",
];

let _uid = 0;
const uid = () => ++_uid;

const newQuestion = () => ({
  key: uid(), qtype: "mcq", prompt: "",
  options: ["", "", "", ""], correct_index: 0,
  accept_answers: "", sub_skill: "multiple_choice",
});
const newSection = (position) => ({
  key: uid(), position, skill: "reading", title: "", passage_md: "",
  audio_url: "", questions: [newQuestion()], open: true,
});

export default function CreateNewExam() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [difficulty, setDifficulty] = useState("medium");
  const [timeLimit, setTimeLimit] = useState(40);
  const [accessCode, setAccessCode] = useState("1234");
  const [classId, setClassId] = useState("");
  const [classes, setClasses] = useState([]);
  const [sections, setSections] = useState([newSection(1)]);

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    apiFetch("/api/teacher/classes")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setClasses(Array.isArray(d) ? d : []))
      .catch(() => setClasses([]));
  }, []);

  // ── nested-state helpers ──────────────────────────────────────────────
  const updateSection = (si, patch) =>
    setSections((s) => s.map((sec, i) => (i === si ? { ...sec, ...patch } : sec)));

  const updateQuestion = (si, qi, patch) =>
    setSections((s) =>
      s.map((sec, i) =>
        i === si
          ? { ...sec, questions: sec.questions.map((q, j) => (j === qi ? { ...q, ...patch } : q)) }
          : sec
      )
    );

  const addSection = () =>
    setSections((s) => [...s, newSection(s.length + 1)]);
  const removeSection = (si) =>
    setSections((s) => s.filter((_, i) => i !== si).map((sec, i) => ({ ...sec, position: i + 1 })));

  const addQuestion = (si) =>
    setSections((s) => s.map((sec, i) => (i === si ? { ...sec, questions: [...sec.questions, newQuestion()] } : sec)));
  const removeQuestion = (si, qi) =>
    setSections((s) => s.map((sec, i) => (i === si ? { ...sec, questions: sec.questions.filter((_, j) => j !== qi) } : sec)));

  const updateOption = (si, qi, oi, val) =>
    setSections((s) =>
      s.map((sec, i) =>
        i === si
          ? {
              ...sec,
              questions: sec.questions.map((q, j) =>
                j === qi ? { ...q, options: q.options.map((o, k) => (k === oi ? val : o)) } : q
              ),
            }
          : sec
      )
    );
  const addOption = (si, qi) =>
    setSections((s) =>
      s.map((sec, i) =>
        i === si
          ? { ...sec, questions: sec.questions.map((q, j) => (j === qi ? { ...q, options: [...q.options, ""] } : q)) }
          : sec
      )
    );

  // ── build + submit ────────────────────────────────────────────────────
  const validate = () => {
    if (!name.trim()) return "Give the test a name.";
    if (sections.length === 0) return "Add at least one section.";
    for (const sec of sections) {
      if (!sec.title.trim()) return "Every section needs a title.";
      if (sec.questions.length === 0) return `Section "${sec.title}" has no questions.`;
      for (const q of sec.questions) {
        if (!q.prompt.trim()) return "Every question needs a prompt.";
        if (q.qtype === "mcq") {
          const filled = q.options.filter((o) => o.trim());
          if (filled.length < 2) return "Multiple-choice questions need at least two options.";
        }
        if (q.qtype === "short" && !q.accept_answers.trim())
          return "Short-answer questions need at least one accepted answer.";
      }
    }
    return "";
  };

  const handleSubmit = async () => {
    const msg = validate();
    if (msg) { setError(msg); return; }
    setError("");

    const created_by = parseInt(getUserId(), 10);
    if (!created_by) { setError("You must be signed in as a teacher."); return; }

    const payload = {
      name: name.trim(),
      difficulty,
      time_limit_min: Number(timeLimit) || 40,
      reading_min: 0,
      access_code: accessCode || "1234",
      class_id: classId || null,
      created_by,
      sections: sections.map((sec) => ({
        position: sec.position,
        skill: sec.skill,
        title: sec.title.trim(),
        passage_md: sec.passage_md,
        audio_url: sec.skill === "listening" ? (sec.audio_url || null) : null,
        questions: sec.questions.map((q, qi) => {
          const base = {
            qtype: q.qtype,
            prompt: q.prompt.trim(),
            sub_skill: q.sub_skill || null,
            display_order: qi + 1,
          };
          if (q.qtype === "mcq") {
            const options = q.options.map((o) => o.trim()).filter(Boolean);
            return { ...base, options, correct_index: Math.min(q.correct_index, options.length - 1) };
          }
          if (q.qtype === "short") {
            return { ...base, accept_answers: q.accept_answers.split(",").map((a) => a.trim()).filter(Boolean) };
          }
          return base; // explain
        }),
      })),
    };

    try {
      setSubmitting(true);
      const res = await apiFetch("/api/tests/import", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to create exam.");
      setToast(`Exam created (#${data.exam_id}).`);
      setTimeout(() => navigate("/exams"), 1200);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 900 }}>
      <PageHeader
        title="Create Exam"
        subtitle="Build an IELTS test section by section. It will appear in students' My Tests."
        action={
          <Button variant="contained" disabled={submitting} onClick={handleSubmit}>
            {submitting ? "Saving…" : "Save test"}
          </Button>
        }
      />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}

      {/* Test details */}
      <Card sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" sx={{ mb: 2 }}>Test details</Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
          <TextField label="Test name" value={name} onChange={(e) => setName(e.target.value)} fullWidth sx={{ gridColumn: { sm: "1 / -1" } }} />
          <TextField select label="Difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
            {DIFFICULTIES.map((d) => <MenuItem key={d} value={d} sx={{ textTransform: "capitalize" }}>{d}</MenuItem>)}
          </TextField>
          <TextField type="number" label="Time limit (minutes)" value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)} />
          <TextField label="Access code" value={accessCode} onChange={(e) => setAccessCode(e.target.value)} />
          <TextField select label="Class (optional)" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <MenuItem value=""><em>Sandbox (default)</em></MenuItem>
            {classes.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
          </TextField>
        </Box>
      </Card>

      {/* Sections */}
      {sections.map((sec, si) => (
        <Card key={sec.key} sx={{ p: 3, mb: 2 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
            <Chip label={`Section ${sec.position}`} color="primary" size="small" />
            <SkillChip skill={sec.skill} />
            <Box sx={{ flexGrow: 1 }} />
            <IconButton size="small" onClick={() => updateSection(si, { open: !sec.open })}>
              <ExpandMoreRoundedIcon sx={{ transform: sec.open ? "rotate(180deg)" : "none", transition: "0.2s" }} />
            </IconButton>
            <IconButton size="small" color="error" disabled={sections.length === 1} onClick={() => removeSection(si)}>
              <DeleteOutlineRoundedIcon />
            </IconButton>
          </Stack>

          <Collapse in={sec.open}>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
              <TextField select label="Skill" value={sec.skill} onChange={(e) => updateSection(si, { skill: e.target.value })}>
                {SKILLS.map((s) => <MenuItem key={s} value={s} sx={{ textTransform: "capitalize" }}>{s}</MenuItem>)}
              </TextField>
              <TextField label="Section title" value={sec.title} onChange={(e) => updateSection(si, { title: e.target.value })} />
              {sec.skill === "listening" && (
                <TextField label="Audio URL (optional)" value={sec.audio_url} onChange={(e) => updateSection(si, { audio_url: e.target.value })} sx={{ gridColumn: { sm: "1 / -1" } }} />
              )}
              <TextField
                label={sec.skill === "reading" ? "Passage" : "Transcript / notes (optional)"}
                value={sec.passage_md}
                onChange={(e) => updateSection(si, { passage_md: e.target.value })}
                multiline minRows={4} sx={{ gridColumn: { sm: "1 / -1" } }}
              />
            </Box>

            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Questions</Typography>

            {sec.questions.map((q, qi) => (
              <Box key={q.key} sx={{ p: 2, mb: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                  <Typography variant="body2" fontWeight={600}>Q{qi + 1}</Typography>
                  <Box sx={{ flexGrow: 1 }} />
                  <IconButton size="small" color="error" disabled={sec.questions.length === 1} onClick={() => removeQuestion(si, qi)}>
                    <DeleteOutlineRoundedIcon fontSize="small" />
                  </IconButton>
                </Stack>

                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
                  <TextField select label="Type" value={q.qtype} onChange={(e) => updateQuestion(si, qi, { qtype: e.target.value })}>
                    {QTYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                  </TextField>
                  {q.qtype !== "explain" && (
                    <TextField select label="Sub-skill" value={q.sub_skill} onChange={(e) => updateQuestion(si, qi, { sub_skill: e.target.value })}>
                      {SUB_SKILLS.map((s) => <MenuItem key={s} value={s}>{s.replace(/_/g, " ")}</MenuItem>)}
                    </TextField>
                  )}
                  <TextField label="Prompt" value={q.prompt} onChange={(e) => updateQuestion(si, qi, { prompt: e.target.value })} sx={{ gridColumn: { sm: "1 / -1" } }} />
                </Box>

                {q.qtype === "mcq" && (
                  <Box sx={{ mt: 1.5 }}>
                    <Typography variant="caption" color="text.secondary">Options (select the correct one)</Typography>
                    <RadioGroup
                      value={String(q.correct_index)}
                      onChange={(e) => updateQuestion(si, qi, { correct_index: Number(e.target.value) })}
                    >
                      {q.options.map((opt, oi) => (
                        <Stack key={oi} direction="row" alignItems="center" spacing={1}>
                          <FormControlLabel value={String(oi)} control={<Radio size="small" />} label="" sx={{ m: 0 }} />
                          <TextField
                            size="small" fullWidth placeholder={`Option ${oi + 1}`}
                            value={opt} onChange={(e) => updateOption(si, qi, oi, e.target.value)}
                            sx={{ my: 0.5 }}
                          />
                        </Stack>
                      ))}
                    </RadioGroup>
                    <Button size="small" startIcon={<AddRoundedIcon />} onClick={() => addOption(si, qi)}>Add option</Button>
                  </Box>
                )}

                {q.qtype === "short" && (
                  <TextField
                    sx={{ mt: 1.5 }} fullWidth
                    label="Accepted answers (comma-separated)"
                    placeholder="e.g. water, H2O"
                    value={q.accept_answers}
                    onChange={(e) => updateQuestion(si, qi, { accept_answers: e.target.value })}
                  />
                )}

                {q.qtype === "explain" && (
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: "block" }}>
                    Extended answers are saved for manual marking — not auto-graded.
                  </Typography>
                )}
              </Box>
            ))}

            <Button startIcon={<AddRoundedIcon />} onClick={() => addQuestion(si)}>Add question</Button>
          </Collapse>
        </Card>
      ))}

      <Button variant="outlined" startIcon={<AddRoundedIcon />} onClick={addSection} sx={{ mb: 4 }}>
        Add section
      </Button>

      <Snackbar
        open={!!toast}
        autoHideDuration={2000}
        onClose={() => setToast("")}
        message={toast}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </Box>
  );
}
