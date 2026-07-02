import React, { useEffect, useState } from "react";
import {
  Box, Card, Stack, Typography, Button, TextField, MenuItem, IconButton,
  Divider, Radio, RadioGroup, FormControlLabel, Alert, Snackbar, Chip, Checkbox,
  Collapse, Dialog, DialogTitle, DialogContent, DialogActions, CircularProgress,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import TipsAndUpdatesRoundedIcon from "@mui/icons-material/TipsAndUpdatesRounded";
import { useNavigate, useLocation } from "react-router-dom";
import { apiFetch, getUserId, API_BASE, authHeaders, mediaUrl } from "../api";
import { PageHeader, SkillChip } from "../component/ui";

/** Map the AI importer's TestIn-shaped JSON into the builder's section state. */
function aiToSections(result) {
  const skills = ["reading", "listening", "writing", "speaking"];
  const subDefault = (qtype) =>
    qtype === "mcq" ? "multiple_choice" : qtype === "short" ? "short_answer" : "short_answer";
  return (result.sections || []).map((sec, si) => ({
    key: uid(),
    position: si + 1,
    skill: skills.includes(sec.skill) ? sec.skill : "reading",
    title: sec.title || `Section ${si + 1}`,
    passage_md: sec.passage_md || "",
    audio_url: sec.audio_url || "",
    image_url: sec.image_url || "",
    open: true,
    questions: (sec.questions && sec.questions.length ? sec.questions : [{ qtype: "short", prompt: "" }]).map((q) => ({
      key: uid(),
      qtype: ["mcq", "short", "explain"].includes(q.qtype) ? q.qtype : "short",
      prompt: q.prompt || "",
      options: Array.isArray(q.options) && q.options.length ? q.options : ["", "", "", ""],
      correct_index: Number.isInteger(q.correct_index) ? q.correct_index : 0,
      accept_answers: Array.isArray(q.accept_answers) ? q.accept_answers.join(", ") : "",
      sub_skill: q.sub_skill || subDefault(q.qtype),
      qformat: q.qformat || "",
      correct_indices: Array.isArray(q.correct_indices) ? q.correct_indices : [],
      select_count: Number.isInteger(q.select_count) ? q.select_count : 2,
    })),
  }));
}

// Exams cover the auto-gradable skills only. Writing & Speaking are created as
// tasks (TaskEdit) so they get the submit -> AI-grade -> teacher-review flow.
const SKILLS = ["reading", "listening"];
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
// Display formats: how the question renders on the student's test screen.
const FORMATS_BY_QTYPE = {
  mcq: [
    { value: "", label: "Standard (radio buttons)" },
    { value: "tfng", label: "True / False / Not Given" },
    { value: "ynng", label: "Yes / No / Not Given" },
    { value: "matching", label: "Matching (dropdown list)" },
    { value: "multi_select", label: "Choose N letters (checkboxes)" },
  ],
  short: [
    { value: "", label: "Standard (text box)" },
    { value: "gap_fill", label: "Gap-fill (inline blank)" },
  ],
};
const FIXED_OPTIONS = { tfng: ["TRUE", "FALSE", "NOT GIVEN"], ynng: ["YES", "NO", "NOT GIVEN"] };

let _uid = 0;
const uid = () => ++_uid;

const newQuestion = () => ({
  key: uid(), qtype: "mcq", prompt: "",
  options: ["", "", "", ""], correct_index: 0,
  accept_answers: "", sub_skill: "multiple_choice",
  qformat: "", correct_indices: [], select_count: 2,
});
const newSection = (position) => ({
  key: uid(), position, skill: "reading", title: "", passage_md: "",
  audio_url: "", image_url: "", uploading: false, questions: [newQuestion()], open: true,
});

const isProductive = (skill) => skill === "writing" || skill === "speaking";

// One-click question presets for the streamlined builder.
const QUESTION_PRESETS = {
  mcq:     { qtype: "mcq",     sub_skill: "multiple_choice", options: ["", "", "", ""], correct_index: 0, accept_answers: "", prompt: "", qformat: "", correct_indices: [], select_count: 2 },
  short:   { qtype: "short",   sub_skill: "gap_fill",        options: ["", "", "", ""], correct_index: 0, accept_answers: "", prompt: "", qformat: "gap_fill", correct_indices: [], select_count: 2 },
  explain: { qtype: "explain", sub_skill: "short_answer",    options: ["", "", "", ""], correct_index: 0, accept_answers: "", prompt: "", qformat: "", correct_indices: [], select_count: 2 },
};
const presetQuestion = (type) => ({ key: uid(), ...QUESTION_PRESETS[type] });

export default function CreateNewExam() {
  const navigate = useNavigate();
  const location = useLocation();
  const editId = React.useMemo(
    () => new URLSearchParams(location.search).get("edit"),
    [location.search]
  );
  const skillParam = React.useMemo(() => {
    const s = new URLSearchParams(location.search).get("skill");
    return ["reading", "listening"].includes(s) ? s : "";
  }, [location.search]);

  const [examSkill, setExamSkill] = useState(skillParam);   // one skill per test
  const [name, setName] = useState("");
  const [difficulty, setDifficulty] = useState("medium");
  const [timeLimit, setTimeLimit] = useState(40);
  const [accessCode, setAccessCode] = useState("1234");
  const [classId, setClassId] = useState("");
  const [classes, setClasses] = useState([]);
  const [sections, setSections] = useState(() => [{ ...newSection(1), skill: skillParam || "reading" }]);
  const [loadingExam, setLoadingExam] = useState(!!editId);
  const [detailsOpen, setDetailsOpen] = useState(true);

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState("");

  // AI import dialog
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importAnswerFile, setImportAnswerFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");

  const runImport = async () => {
    if (!importFile) { setImportError("Choose a file first."); return; }
    setImporting(true);
    setImportError("");
    try {
      const fd = new FormData();
      fd.append("file", importFile);
      if (importAnswerFile) fd.append("answer_sheet", importAnswerFile);
      const res = await fetch(`${API_BASE}/api/import/ai`, {
        method: "POST",
        headers: authHeaders(),
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Import failed.");
      if (data.name) setName(data.name);
      if (data.difficulty) setDifficulty(data.difficulty);
      if (data.time_limit_min) setTimeLimit(data.time_limit_min);
      const secs = aiToSections(data);
      if (secs.length) setSections(secs);
      setImportOpen(false);
      setImportFile(null);
      setImportAnswerFile(null);
      setToast("Imported — review and edit, then Save.");
    } catch (e) {
      setImportError(e.message);
    } finally {
      setImporting(false);
    }
  };

  useEffect(() => {
    apiFetch("/api/teacher/classes")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setClasses(Array.isArray(d) ? d : []))
      .catch(() => setClasses([]));
  }, []);

  // Edit mode: load the existing test into the builder.
  useEffect(() => {
    if (!editId) return;
    setLoadingExam(true);
    apiFetch(`/api/tests/${editId}/export`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Could not load test"))))
      .then((data) => {
        if (data.name) setName(data.name);
        if (data.difficulty) setDifficulty(data.difficulty);
        if (data.time_limit_min) setTimeLimit(data.time_limit_min);
        const secs = aiToSections(data);
        if (secs.length) {
          setSections(secs);
          setExamSkill(secs[0].skill || "reading");
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoadingExam(false));
  }, [editId]);

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
    setSections((s) => [...s, { ...newSection(s.length + 1), skill: examSkill || "reading" }]);
  const removeSection = (si) =>
    setSections((s) => s.filter((_, i) => i !== si).map((sec, i) => ({ ...sec, position: i + 1 })));

  // Changing a section to Writing/Speaking auto-switches its questions to the
  // extended "explain" (text, manual-marking) type.
  const changeSkill = (si, skill) =>
    setSections((s) =>
      s.map((sec, i) =>
        i === si
          ? {
              ...sec,
              skill,
              questions: isProductive(skill)
                ? sec.questions.map((q) => ({ ...q, qtype: "explain" }))
                : sec.questions,
            }
          : sec
      )
    );

  // Upload a Writing chart image or Listening audio file to Supabase Storage and
  // store the returned public URL on the section.
  const uploadMedia = async (si, kind, file) => {
    if (!file) return;
    updateSection(si, { uploading: true });
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API_BASE}/api/tests/upload?kind=${kind}`, {
        method: "POST",
        headers: authHeaders(),
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Upload failed.");
      updateSection(si, kind === "image" ? { image_url: data.url } : { audio_url: data.url });
      setToast(kind === "image" ? "Chart uploaded." : "Audio uploaded.");
    } catch (e) {
      setError(e.message);
    } finally {
      updateSection(si, { uploading: false });
    }
  };

  const addQuestion = (si) =>
    setSections((s) =>
      s.map((sec, i) => {
        if (i !== si) return sec;
        const q = isProductive(sec.skill) ? { ...newQuestion(), qtype: "explain" } : newQuestion();
        return { ...sec, questions: [...sec.questions, q] };
      })
    );

  // Quick-add a pre-configured question (streamlined builder).
  const addPreset = (si, type) =>
    setSections((s) =>
      s.map((sec, i) => (i === si ? { ...sec, questions: [...sec.questions, presetQuestion(type)] } : sec))
    );
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
        if (q.qformat === "multi_select" && (q.correct_indices || []).length < 2)
          return "Choose-N questions need at least two correct options ticked.";
        if (q.qformat === "gap_fill" && !/_{3,}/.test(q.prompt))
          return "Gap-fill prompts need a blank written as underscores, e.g. 'filtered through ________ plates'.";
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
        image_url: sec.skill === "writing" ? (sec.image_url || null) : null,
        questions: sec.questions.map((q, qi) => {
          const base = {
            qtype: q.qtype,
            prompt: q.prompt.trim(),
            sub_skill: q.sub_skill || null,
            display_order: qi + 1,
          };
          if (q.qtype === "mcq") {
            const options = q.options.map((o) => o.trim()).filter(Boolean);
            const out = { ...base, options, correct_index: Math.min(q.correct_index, options.length - 1), qformat: q.qformat || null };
            if (q.qformat === "multi_select") {
              out.correct_indices = (q.correct_indices || []).filter((i) => i < options.length);
              out.select_count = Number(q.select_count) || out.correct_indices.length || 2;
              out.correct_index = out.correct_indices[0] ?? 0;
            }
            return out;
          }
          if (q.qtype === "short") {
            return { ...base, qformat: q.qformat || null, accept_answers: q.accept_answers.split(",").map((a) => a.trim()).filter(Boolean) };
          }
          return base; // explain
        }),
      })),
    };

    try {
      setSubmitting(true);
      const res = editId
        ? await apiFetch(`/api/tests/${editId}`, { method: "PUT", body: JSON.stringify(payload) })
        : await apiFetch("/api/tests/import", { method: "POST", body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || (editId ? "Failed to update exam." : "Failed to create exam."));
      setToast(editId ? "Test updated." : `Exam created (#${data.exam_id}).`);
      setTimeout(() => navigate(editId ? "/manage-tests" : "/exams"), 1200);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingExam) {
    return <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}><CircularProgress /></Box>;
  }

  // Skill-first: choose Reading or Listening before building the test.
  if (!editId && !examSkill) {
    return (
      <Box sx={{ maxWidth: 720 }}>
        <PageHeader title="Create Test" subtitle="Which skill is this test for?" />
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
          {[
            ["reading", "Reading", "A passage with question types (MCQ, gap-fill, matching…)."],
            ["listening", "Listening", "Audio with question types."],
          ].map(([k, label, desc]) => (
            <Card
              key={k}
              onClick={() => { setExamSkill(k); setSections([{ ...newSection(1), skill: k }]); }}
              sx={{ p: 3, cursor: "pointer", "&:hover": { boxShadow: 4 } }}
            >
              <SkillChip skill={k} />
              <Typography variant="h6" sx={{ mt: 1 }}>{label}</Typography>
              <Typography variant="body2" color="text.secondary">{desc}</Typography>
            </Card>
          ))}
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: "block" }}>
          Writing and Speaking are created as tasks — use “Create ▾” on Test Manage.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 900 }}>
      <PageHeader
        title={`${editId ? "Edit" : "Create"} ${examSkill ? examSkill.charAt(0).toUpperCase() + examSkill.slice(1) : ""} Test`}
        subtitle={editId
          ? "Update this test's sections and questions, then save."
          : "Build the test section by section. It will appear in students' My Tests."}
        action={
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              startIcon={<AutoAwesomeRoundedIcon />}
              onClick={() => { setImportError(""); setImportOpen(true); }}
            >
              Import from file (AI)
            </Button>
            <Button variant="contained" disabled={submitting} onClick={handleSubmit}>
              {submitting ? "Saving…" : "Save test"}
            </Button>
          </Stack>
        }
      />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}

      {/* Test details (collapsible) */}
      <Card sx={{ p: 3, mb: 3 }}>
        <Stack
          direction="row" alignItems="center" sx={{ cursor: "pointer" }}
          onClick={() => setDetailsOpen((o) => !o)}
        >
          <Typography variant="subtitle1" sx={{ flexGrow: 1 }}>Test details</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }} noWrap>
            {name || "Untitled"} · {difficulty} · {timeLimit} min
          </Typography>
          <ExpandMoreRoundedIcon sx={{ transform: detailsOpen ? "rotate(180deg)" : "none", transition: "0.2s" }} />
        </Stack>
        <Collapse in={detailsOpen}>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2, mt: 2 }}>
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
        </Collapse>
      </Card>

      <Alert severity="info" icon={<TipsAndUpdatesRoundedIcon />} sx={{ mb: 2 }}>
        Tip: choose each section's <strong>skill</strong> first. Reading shows a passage,
        Listening lets you add audio, and Writing/Speaking switch to a text answer with an
        optional chart. Use the quick-add buttons to drop in a question type instantly.
      </Alert>

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
              <TextField label="Section title" value={sec.title} onChange={(e) => updateSection(si, { title: e.target.value })} sx={{ gridColumn: { sm: "1 / -1" } }} />

              {/* Listening: paste an audio URL OR upload a file */}
              {sec.skill === "listening" && (
                <Box sx={{ gridColumn: { sm: "1 / -1" } }}>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }}>
                    <TextField
                      label="Audio URL" fullWidth value={sec.audio_url}
                      placeholder="https://…  (or upload a file →)"
                      onChange={(e) => updateSection(si, { audio_url: e.target.value })}
                    />
                    <Button component="label" variant="outlined" startIcon={<UploadFileRoundedIcon />} disabled={sec.uploading} sx={{ flexShrink: 0 }}>
                      {sec.uploading ? "Uploading…" : "Upload audio"}
                      <input hidden type="file" accept="audio/*,.mp3,.m4a,.wav,.webm,.ogg"
                        onChange={(e) => uploadMedia(si, "audio", e.target.files?.[0])} />
                    </Button>
                  </Stack>
                  {sec.audio_url && <Box component="audio" controls src={mediaUrl(sec.audio_url)} sx={{ width: "100%", mt: 1 }} />}
                </Box>
              )}

              {/* Writing: upload the Task 1 chart / diagram */}
              {sec.skill === "writing" && (
                <Box sx={{ gridColumn: { sm: "1 / -1" } }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Button component="label" variant="outlined" startIcon={<UploadFileRoundedIcon />} disabled={sec.uploading}>
                      {sec.uploading ? "Uploading…" : sec.image_url ? "Replace chart / diagram" : "Upload chart / diagram (Task 1)"}
                      <input hidden type="file" accept="image/*"
                        onChange={(e) => uploadMedia(si, "image", e.target.files?.[0])} />
                    </Button>
                    {sec.image_url && (
                      <Button size="small" color="error" onClick={() => updateSection(si, { image_url: "" })}>Remove</Button>
                    )}
                  </Stack>
                  {sec.image_url && (
                    <Box component="img" src={mediaUrl(sec.image_url)} alt="Task 1 chart"
                      sx={{ display: "block", mt: 1, maxWidth: "100%", maxHeight: 240, borderRadius: 1, border: "1px solid", borderColor: "divider" }} />
                  )}
                </Box>
              )}

              <TextField
                label={
                  sec.skill === "reading" ? "Passage"
                    : sec.skill === "listening" ? "Transcript / notes (optional)"
                    : "Task instructions"
                }
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
                  <TextField
                    select label="Type" value={q.qtype}
                    onChange={(e) => updateQuestion(si, qi, { qtype: e.target.value, qformat: "" })}
                    disabled={isProductive(sec.skill)}
                    helperText={isProductive(sec.skill) ? "Writing/Speaking answers are marked manually" : undefined}
                  >
                    {QTYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                  </TextField>
                  {q.qtype !== "explain" && (
                    <TextField
                      select label="Format (how students answer)"
                      value={q.qformat || ""}
                      onChange={(e) => {
                        const f = e.target.value;
                        const patch = { qformat: f };
                        if (FIXED_OPTIONS[f]) patch.options = [...FIXED_OPTIONS[f]];
                        updateQuestion(si, qi, patch);
                      }}
                    >
                      {(FORMATS_BY_QTYPE[q.qtype] || []).map((f) => (
                        <MenuItem key={f.value} value={f.value}>{f.label}</MenuItem>
                      ))}
                    </TextField>
                  )}
                  {q.qtype !== "explain" && (
                    <TextField select label="Sub-skill" value={q.sub_skill} onChange={(e) => updateQuestion(si, qi, { sub_skill: e.target.value })}>
                      {SUB_SKILLS.map((s) => <MenuItem key={s} value={s}>{s.replace(/_/g, " ")}</MenuItem>)}
                    </TextField>
                  )}
                  <TextField
                    label={q.qformat === "gap_fill" ? "Sentence with the blank as underscores" : "Prompt"}
                    placeholder={q.qformat === "gap_fill" ? "e.g. Whales filter food through ________ plates." : undefined}
                    value={q.prompt}
                    onChange={(e) => updateQuestion(si, qi, { prompt: e.target.value })}
                    sx={{ gridColumn: { sm: "1 / -1" } }}
                  />
                </Box>

                {q.qtype === "mcq" && q.qformat === "multi_select" && (
                  <Box sx={{ mt: 1.5 }}>
                    <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 0.5 }}>
                      <Typography variant="caption" color="text.secondary">Options (tick every correct one)</Typography>
                      <TextField
                        size="small" type="number" label="Students choose"
                        value={q.select_count}
                        onChange={(e) => updateQuestion(si, qi, { select_count: Math.max(2, Number(e.target.value) || 2) })}
                        inputProps={{ min: 2 }}
                        sx={{ width: 130 }}
                      />
                    </Stack>
                    {q.options.map((opt, oi) => (
                      <Stack key={oi} direction="row" alignItems="center" spacing={1}>
                        <Checkbox
                          size="small"
                          checked={(q.correct_indices || []).includes(oi)}
                          onChange={() => {
                            const cur = q.correct_indices || [];
                            updateQuestion(si, qi, {
                              correct_indices: cur.includes(oi)
                                ? cur.filter((x) => x !== oi)
                                : [...cur, oi].sort((a, b) => a - b),
                            });
                          }}
                        />
                        <TextField
                          size="small" fullWidth placeholder={`Option ${oi + 1}`}
                          value={opt} onChange={(e) => updateOption(si, qi, oi, e.target.value)}
                          sx={{ my: 0.5 }}
                        />
                      </Stack>
                    ))}
                    <Button size="small" startIcon={<AddRoundedIcon />} onClick={() => addOption(si, qi)}>Add option</Button>
                  </Box>
                )}

                {q.qtype === "mcq" && q.qformat !== "multi_select" && (
                  <Box sx={{ mt: 1.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      {q.qformat === "tfng" || q.qformat === "ynng"
                        ? "Select the correct answer"
                        : "Options (select the correct one)"}
                    </Typography>
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
                            disabled={!!FIXED_OPTIONS[q.qformat]}
                            sx={{ my: 0.5 }}
                          />
                        </Stack>
                      ))}
                    </RadioGroup>
                    {!FIXED_OPTIONS[q.qformat] && (
                      <Button size="small" startIcon={<AddRoundedIcon />} onClick={() => addOption(si, qi)}>Add option</Button>
                    )}
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

            {isProductive(sec.skill) ? (
              <Button size="small" variant="outlined" startIcon={<AddRoundedIcon />} onClick={() => addPreset(si, "explain")}>
                Add response
              </Button>
            ) : (
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "center", mr: 0.5 }}>Add:</Typography>
                <Button size="small" variant="outlined" startIcon={<AddRoundedIcon />} onClick={() => addPreset(si, "mcq")}>MCQ</Button>
                <Button size="small" variant="outlined" startIcon={<AddRoundedIcon />} onClick={() => addPreset(si, "short")}>Gap-fill</Button>
                <Button size="small" variant="outlined" startIcon={<AddRoundedIcon />} onClick={() => addPreset(si, "explain")}>Essay</Button>
              </Stack>
            )}
          </Collapse>
        </Card>
      ))}

      <Button variant="outlined" startIcon={<AddRoundedIcon />} onClick={addSection} sx={{ mb: 4 }}>
        Add section
      </Button>

      <Snackbar
        open={!!toast}
        autoHideDuration={2500}
        onClose={() => setToast("")}
        message={toast}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />

      {/* AI import dialog */}
      <Dialog open={importOpen} onClose={() => !importing && setImportOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Import a test from a file</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Upload a PDF, Word doc, or image of an IELTS test. The AI converts it into
            editable sections and questions — you review and edit before saving.
            If you also have the answer sheet, add it too: the AI then takes every
            correct answer from it instead of solving the test itself.
          </Typography>

          {importError && <Alert severity="warning" sx={{ mb: 2 }}>{importError}</Alert>}

          <Stack spacing={1.5} alignItems="flex-start">
            <Button
              component="label"
              variant="outlined"
              startIcon={<UploadFileRoundedIcon />}
              disabled={importing}
            >
              {importFile ? importFile.name : "Choose test file"}
              <input
                hidden
                type="file"
                accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp"
                onChange={(e) => { setImportFile(e.target.files?.[0] || null); setImportError(""); }}
              />
            </Button>

            <Button
              component="label"
              variant="outlined"
              color="secondary"
              startIcon={<UploadFileRoundedIcon />}
              disabled={importing}
            >
              {importAnswerFile ? importAnswerFile.name : "Answer sheet (optional)"}
              <input
                hidden
                type="file"
                accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp"
                onChange={(e) => { setImportAnswerFile(e.target.files?.[0] || null); setImportError(""); }}
              />
            </Button>
            {importAnswerFile && (
              <Button size="small" color="inherit" disabled={importing}
                onClick={() => setImportAnswerFile(null)}>
                Remove answer sheet
              </Button>
            )}
          </Stack>

          {importing && (
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 2 }}>
              <CircularProgress size={20} />
              <Typography variant="body2" color="text.secondary">Converting… this can take a few seconds.</Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImportOpen(false)} disabled={importing}>Cancel</Button>
          <Button variant="contained" onClick={runImport} disabled={importing || !importFile}>
            {importing ? "Converting…" : "Convert"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
