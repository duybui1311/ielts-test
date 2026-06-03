import * as React from "react";
import {
    Box, Container, Paper, Stack, Typography, TextField, Button,
    Grid, Chip, MenuItem, Select, FormControl, InputLabel, Divider,
    IconButton, Dialog, DialogTitle, DialogContent, DialogActions, Avatar, InputAdornment,
    List, ListItemText, ListItemButton, Radio, Popover, ClickAwayListener, Popper,
    CircularProgress
} from "@mui/material";
import { useNavigate } from "react-router-dom";

import ArrowBackRounded from "@mui/icons-material/ArrowBackRounded";
import AccessTimeRounded from "@mui/icons-material/AccessTimeRounded";
import DescriptionRounded from "@mui/icons-material/DescriptionRounded";
import ClassRounded from "@mui/icons-material/ClassRounded";
import SecurityRounded from "@mui/icons-material/SecurityRounded";
import EditOutlined from "@mui/icons-material/EditOutlined";
import SearchIcon from "@mui/icons-material/Search";
import AddCircleOutlineRounded from "@mui/icons-material/AddCircleOutlineRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import AutoAwesomeRounded from "@mui/icons-material/AutoAwesomeRounded";

const SELECT_MENU_PROPS = {
    disableScrollLock: true,
    PaperProps: {
        sx: {
            minWidth: 320,
            maxWidth: 520,
        },
    },
    MenuListProps: {
        sx: {
            "& .MuiMenuItem-root": {
                whiteSpace: "normal",
                alignItems: "flex-start",
            },
        },
    },
};

const FIELD_SX = {
    minWidth: 260,
    width: "100%",
    "& .MuiInputBase-root": {
        height: 44,
    },
    "& .MuiInputBase-input": {
        paddingTop: 10,
        paddingBottom: 10,
    },
    "& .MuiSelect-select": {
        display: "flex",
        alignItems: "center",
    },
};

const RAW_API_BASE =
    typeof process !== "undefined" &&
    process.env &&
    process.env.REACT_APP_API_URL
        ? process.env.REACT_APP_API_URL
        : "";

if (!RAW_API_BASE) {
    console.error(
        "[CreateNewExam] REACT_APP_API_URL is NOT set. " +
        "Set it in your frontend .env (e.g. REACT_APP_API_URL=http://127.0.0.1:8000/)"
    );
}

const API_BASE = (RAW_API_BASE || "http://127.0.0.1:8000").replace(/\/+$/, "");
console.log("[CreateNewExam] API_BASE =", API_BASE);

function joinApi(path) {
    if (!path.startsWith("/")) path = "/" + path;
    return API_BASE + path;
}

function makeEmptyMcq() {
    const base = Date.now() + Math.floor(Math.random() * 100000);
    return {
        type: "mcq",
        text: "",
        options: [0, 1, 2, 3].map((i) => ({ id: base + i, text: "" })),
        correctIndex: 0,
    };
}

function makeEmptyShort() {
    return { type: "short", text: "", answerText: "" };
}

function makeEmptyExplain() {
    return { type: "explain", text: "", answerText: "" };
}

function toEditorQuestion(q) {
    if (q.type === "mcq") {
        const rawOptions = Array.isArray(q.options) ? q.options.slice(0, 4) : [];
        while (rawOptions.length < 4) rawOptions.push("");
        const base = Date.now() + Math.floor(Math.random() * 100000);

        return {
            type: "mcq",
            text: q.text || "",
            options: rawOptions.map((text, idx) => ({
                id: base + idx,
                text: text || "",
            })),
            correctIndex:
                typeof q.correct_index === "number" && q.correct_index >= 0
                    ? q.correct_index
                    : 0,
        };
    }

    if (q.type === "short") {
        return {
            type: "short",
            text: q.text || "",
            answerText: q.answer || "",
        };
    }

    return {
        type: "explain",
        text: q.text || "",
        answerText: q.reference || "",
    };
}

async function loadMeta() {
    const url = joinApi("/api/exams/metadata");
    console.log("[CreateNewExam] loading metadata from:", url);

    let res;
    try {
        res = await fetch(url, {
            method: "GET",
            headers: { Accept: "application/json" },
        });
    } catch (err) {
        console.error("[CreateNewExam] network error while loading metadata:", err);
        throw new Error("Cannot reach backend /api/exams/metadata");
    }

    if (!res.ok) {
        console.error(
            "[CreateNewExam] backend error:",
            res.status,
            res.statusText
        );
        throw new Error("Failed to load exam metadata");
    }

    let data;
    try {
        data = await res.json();
    } catch (err) {
        console.error("[CreateNewExam] JSON parse error:", err);
        throw new Error("Invalid JSON from /api/exams/metadata");
    }

    let classes = [];
    let types = ["Exam", "Practice"];
    let difficulties = ["Low", "Medium", "High"];

    if (Array.isArray(data)) {
        classes = data.map((row) => ({
            id: row.id,
            name: row.name,
        }));
    } else {
        if (Array.isArray(data.classes)) {
            classes = data.classes;
        }
        if (Array.isArray(data.types)) {
            types = data.types;
        }
        if (Array.isArray(data.difficulties)) {
            difficulties = data.difficulties;
        }
    }

    console.log("[CreateNewExam] loaded classes:", classes);
    return { classes, types, difficulties };
}

// ---------------------------------------------------------------------------
// GET /api/cases?search=foo&page=1&page_size=6 -> { items, total }
// ---------------------------------------------------------------------------
async function searchCases(query, page = 1, pageSize = 6) {
    const params = new URLSearchParams();
    if (query && query.trim()) {
        params.set("search", query.trim());
    }
    params.set("page", String(page));
    params.set("page_size", String(pageSize));

    const url = joinApi(`/api/cases?${params.toString()}`);
    const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
    });

    if (!res.ok) {
        console.error(
            "[CreateNewExam] Failed to search cases:",
            res.status,
            res.statusText
        );
        throw new Error("Failed to search cases");
    }

    const data = await res.json();
    const items = Array.isArray(data.items)
        ? data.items.map((c) => ({
            id: c.id,
            name: c.name || c.title || `Case #${c.id}`,
        }))
        : [];

    return {
        items,
        total: typeof data.total === "number" ? data.total : 0,
    };
}

async function generateStationQuestions(payload) {
    const url = joinApi("/api/exams/generate-station-questions");
    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        body: JSON.stringify(payload),
    });

    let data = null;
    try {
        data = await res.json();
    } catch {
        // ignore parse error
    }

    if (!res.ok) {
        const msg =
            (data && (data.detail || data.message)) ||
            "Failed to generate station questions.";
        throw new Error(msg);
    }

    return data;
}

async function createExam(payload) {
    const url = joinApi("/api/exams");
    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        body: JSON.stringify(payload),
    });

    let data = null;
    try {
        data = await res.json();
    } catch {
        // ignore JSON parse error
    }

    if (!res.ok) {
        const msg =
            (data && (data.detail || data.message)) ||
            "Failed to create exam.";
        console.error("[CreateNewExam] createExam error:", msg);
        throw new Error(msg);
    }

    return data;
}

function HeaderShell({ title, subtitle }) {
    return (
        <Box
            sx={{
                bgcolor: "#fff",
                borderRadius: "20px",
                border: "1px solid",
                borderColor: "divider",
                p: { xs: 1.5, md: 2 },
                mb: 2,
            }}
        >
            <Grid container spacing={2} alignItems="center">
                <Grid item xs={12} md={7}>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                        <Avatar sx={{ bgcolor: "grey.200", width: 48, height: 48 }} />
                        <Box>
                            <Typography variant="h5" fontWeight={800} lineHeight={1.2}>
                                {title}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {subtitle}
                            </Typography>
                        </Box>
                    </Stack>
                </Grid>
                <Grid item xs={12} md={5}>
                    <Stack
                        direction="row"
                        spacing={1}
                        justifyContent={{ xs: "flex-start", md: "flex-end" }}
                    >
                        <Chip label={new Date().toLocaleDateString()} variant="outlined" />
                        <Chip label="Create mode" color="primary" variant="outlined" />
                    </Stack>
                </Grid>
            </Grid>
        </Box>
    );
}

/* ----------------------------- Question Editors ---------------------------- */

function MCQEditor({ q, onChange }) {
    const setStem = (v) => onChange({ ...q, text: v });
    const setCorrect = (idx) => onChange({ ...q, correctIndex: idx });
    const setOption = (idx, text) => {
        const opts = q.options.map((o, i) => (i === idx ? { ...o, text } : o));
        onChange({ ...q, options: opts });
    };
    const addOption = () =>
        onChange({
            ...q,
            options: [...q.options, { id: Date.now(), text: "" }],
        });
    const removeOption = (idx) => {
        const opts = q.options.filter((_, i) => i !== idx);
        const nextCorrect = Math.min(q.correctIndex ?? 0, opts.length - 1);
        onChange({
            ...q,
            options: opts,
            correctIndex: Math.max(0, nextCorrect),
        });
    };

    return (
        <Stack spacing={1.25}>
            <TextField
                label="Question"
                value={q.text || ""}
                onChange={(e) => setStem(e.target.value)}
                fullWidth
                multiline
                minRows={2}
            />
            <Typography variant="caption" color="text.secondary">
                Options
            </Typography>
            <Stack spacing={1}>
                {q.options.map((opt, idx) => (
                    <Stack
                        key={opt.id}
                        direction="row"
                        spacing={1}
                        alignItems="center"
                    >
                        <Radio
                            checked={(q.correctIndex ?? 0) === idx}
                            onChange={() => setCorrect(idx)}
                        />
                        <TextField
                            value={opt.text}
                            onChange={(e) => setOption(idx, e.target.value)}
                            placeholder={`Option ${idx + 1}`}
                            fullWidth
                            size="small"
                        />
                        <IconButton
                            color="error"
                            onClick={() => removeOption(idx)}
                            disabled={q.options.length <= 2}
                        >
                            <DeleteOutlineRounded />
                        </IconButton>
                    </Stack>
                ))}
            </Stack>
            <Button
                variant="text"
                startIcon={<AddCircleOutlineRounded />}
                onClick={addOption}
                sx={{ alignSelf: "flex-start" }}
            >
                Add option
            </Button>
        </Stack>
    );
}

function ShortAnswerEditor({ q, onChange }) {
    return (
        <Stack spacing={1.25}>
            <TextField
                label="Question"
                value={q.text || ""}
                onChange={(e) => onChange({ ...q, text: e.target.value })}
                fullWidth
                multiline
                minRows={2}
            />
            <TextField
                label="Sample answer / keywords (optional)"
                value={q.answerText || ""}
                onChange={(e) => onChange({ ...q, answerText: e.target.value })}
                fullWidth
                multiline
                minRows={2}
            />
        </Stack>
    );
}

function ExplanationEditor({ q, onChange }) {
    return (
        <Stack spacing={1.25}>
            <TextField
                label="Prompt"
                value={q.text || ""}
                onChange={(e) => onChange({ ...q, text: e.target.value })}
                fullWidth
                multiline
                minRows={2}
            />
            <TextField
                label="Reference explanation (optional)"
                value={q.answerText || ""}
                onChange={(e) => onChange({ ...q, answerText: e.target.value })}
                fullWidth
                multiline
                minRows={3}
            />
        </Stack>
    );
}

function QuestionEditor({ value, onChange, index }) {
    const setType = (t) => {
        if (t === "mcq") {
            onChange(makeEmptyMcq());
        } else if (t === "short") {
            onChange(makeEmptyShort());
        } else {
            onChange(makeEmptyExplain());
        }
    };

    return (
        <Paper
            sx={{
                p: 2,
                borderRadius: 2,
                border: "1px solid",
                borderColor: "divider",
            }}
        >
            <Stack spacing={1.25}>
                <Stack direction="row" alignItems="center" spacing={1}>
                    <Typography variant="subtitle2" fontWeight={700}>
                        Question {index + 1}
                    </Typography>
                    <Box sx={{ flex: 1 }} />
                    <FormControl size="small" sx={{ minWidth: 220 }}>
                        <InputLabel id={`qtype-${index}`}>Question type</InputLabel>
                        <Select
                            labelId={`qtype-${index}`}
                            value={value.type}
                            label="Question type"
                            onChange={(e) => setType(e.target.value)}
                            MenuProps={SELECT_MENU_PROPS}
                            sx={{ "& .MuiSelect-select": { whiteSpace: "normal" } }}
                        >
                            <MenuItem value="mcq">Multiple choice</MenuItem>
                            <MenuItem value="short">Short answer</MenuItem>
                            <MenuItem value="explain">Explanation</MenuItem>
                        </Select>
                    </FormControl>
                </Stack>

                {value.type === "mcq" && (
                    <MCQEditor q={value} onChange={onChange} />
                )}
                {value.type === "short" && (
                    <ShortAnswerEditor q={value} onChange={onChange} />
                )}
                {value.type === "explain" && (
                    <ExplanationEditor q={value} onChange={onChange} />
                )}
            </Stack>
        </Paper>
    );
}

/* ------------------------------ Station Editor ----------------------------- */
function StationEditor({ idx, value, onChange }) {
    const [caseResults, setCaseResults] = React.useState([]);
    const [caseDropdownOpen, setCaseDropdownOpen] = React.useState(false);
    const [aiAnchorEl, setAiAnchorEl] = React.useState(null);
    const [aiGenerating, setAiGenerating] = React.useState(false);
    const [aiError, setAiError] = React.useState("");
    const [aiConfig, setAiConfig] = React.useState({
        mcq: value.autoConfig?.mcq ?? 0,
        short: value.autoConfig?.short ?? 0,
        explain: value.autoConfig?.explain ?? 0,
    });

    const timersRef = React.useRef({});
    const caseAnchorRef = React.useRef(null);

    React.useEffect(() => {
        setAiConfig({
            mcq: value.autoConfig?.mcq ?? 0,
            short: value.autoConfig?.short ?? 0,
            explain: value.autoConfig?.explain ?? 0,
        });
    }, [value.autoConfig?.mcq, value.autoConfig?.short, value.autoConfig?.explain]);

    const handleCaseQuery = (q) => {
        const timers = timersRef.current;
        if (timers.case) clearTimeout(timers.case);

        const next = { ...(value || {}), caseQuery: q };
        onChange(next);

        if (!q || !q.trim()) {
            setCaseResults([]);
            setCaseDropdownOpen(false);
            return;
        }

        timers.case = setTimeout(async () => {
            try {
                const res = await searchCases(q, 1, 6);
                setCaseResults(res.items);
                setCaseDropdownOpen(res.items.length > 0);
            } catch {
                setCaseResults([]);
                setCaseDropdownOpen(false);
            }
        }, 250);
    };

    const selectCase = (c) => {
        onChange({
            ...value,
            selectedCase: c,
            caseQuery: `${c.id} — ${c.name}`,
        });
        setCaseDropdownOpen(false);
    };

    const setQuestionCount = (n) => {
        const count = Math.max(0, Number(n) || 0);
        const curr = value.questions || [];
        const next = [...curr];

        while (next.length < count) {
            next.push(makeEmptyMcq());
        }
        if (next.length > count) next.length = count;

        onChange({ ...value, questionsCount: count, questions: next });
    };

    const setQuestion = (i, q) => {
        const list = [...(value.questions || [])];
        list[i] = q;
        onChange({ ...value, questions: list });
    };

    const totalAutoRequested =
        Number(aiConfig.mcq || 0) +
        Number(aiConfig.short || 0) +
        Number(aiConfig.explain || 0);

    const openAiPopover = (event) => {
        setAiError("");
        setAiAnchorEl(event.currentTarget);
    };

    const closeAiPopover = () => {
        if (!aiGenerating) {
            setAiAnchorEl(null);
        }
    };

    const runAutoGenerate = async () => {
        if (!value.selectedCase?.id) {
            setAiError("Please select a case first.");
            return;
        }

        if (totalAutoRequested <= 0) {
            setAiError("Please enter at least one question.");
            return;
        }

        try {
            setAiError("");
            setAiGenerating(true);

            const res = await generateStationQuestions({
                case_id: value.selectedCase.id,
                station_index: idx + 1,
                mcq_count: Number(aiConfig.mcq || 0),
                short_count: Number(aiConfig.short || 0),
                explain_count: Number(aiConfig.explain || 0),
            });

            const nextQuestions = Array.isArray(res.questions)
                ? res.questions.map(toEditorQuestion)
                : [];

            onChange({
                ...value,
                autoConfig: {
                    mcq: Number(aiConfig.mcq || 0),
                    short: Number(aiConfig.short || 0),
                    explain: Number(aiConfig.explain || 0),
                },
                questionsCount: nextQuestions.length,
                questions: nextQuestions,
            });

            setAiAnchorEl(null);
        } catch (e) {
            setAiError(
                e && e.message
                    ? e.message
                    : "Failed to auto generate questions."
            );
        } finally {
            setAiGenerating(false);
        }
    };

    const casePopperWidth = caseAnchorRef.current?.clientWidth || undefined;

    return (
        <Paper
            sx={{
                p: 2,
                borderRadius: 3,
                border: "1px solid",
                borderColor: "divider",
                mb: 2,
                overflow: "visible",
            }}
        >
            <Stack spacing={1.5}>
                <Typography variant="h6" fontWeight={800}>
                    Station {idx + 1}
                </Typography>

                <ClickAwayListener onClickAway={() => setCaseDropdownOpen(false)}>
                    <Box ref={caseAnchorRef} sx={{ position: "relative" }}>
                        <TextField
                            label="Search patient case"
                            value={value.caseQuery || ""}
                            onChange={(e) => handleCaseQuery(e.target.value)}
                            onFocus={() => {
                                if (caseResults.length > 0) {
                                    setCaseDropdownOpen(true);
                                }
                            }}
                            fullWidth
                            placeholder="Type case name or ID…"
                            slotProps={{
                                input: {
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <SearchIcon fontSize="small" />
                                        </InputAdornment>
                                    ),
                                },
                            }}
                        />

                        <Popper
                            open={caseDropdownOpen && caseResults.length > 0}
                            anchorEl={caseAnchorRef.current}
                            placement="bottom-start"
                            sx={{
                                zIndex: (theme) => theme.zIndex.modal + 1,
                                width: casePopperWidth,
                            }}
                        >
                            <Paper
                                sx={{
                                    mt: 0.5,
                                    borderRadius: 2,
                                    border: "1px solid",
                                    borderColor: "divider",
                                    maxHeight: 240,
                                    overflowY: "auto",
                                }}
                            >
                                <List dense disablePadding>
                                    {caseResults.map((c) => (
                                        <ListItemButton
                                            key={c.id}
                                            onMouseDown={(e) => e.preventDefault()}
                                            onClick={() => selectCase(c)}
                                        >
                                            <ListItemText
                                                primary={c.name}
                                                secondary={c.id}
                                            />
                                        </ListItemButton>
                                    ))}
                                </List>
                            </Paper>
                        </Popper>
                    </Box>
                </ClickAwayListener>

                <Grid container spacing={1.5} alignItems="center">
                    <Grid item xs={12} md={3}>
                        <TextField
                            label="Number of questions"
                            type="number"
                            slotProps={{
                                input: { inputProps: { min: 0 } },
                            }}
                            value={value.questionsCount ?? 0}
                            onChange={(e) => setQuestionCount(e.target.value)}
                            fullWidth
                        />
                    </Grid>

                    <Grid item xs={12} md={3}>
                        <Button
                            variant="outlined"
                            fullWidth
                            startIcon={
                                aiGenerating ? (
                                    <CircularProgress size={16} />
                                ) : (
                                    <AutoAwesomeRounded />
                                )
                            }
                            onClick={openAiPopover}
                            disabled={!value.selectedCase}
                            sx={{
                                height: 56,
                                borderRadius: 2,
                            }}
                        >
                            {aiGenerating ? "Generating..." : "Auto generate"}
                        </Button>
                    </Grid>

                    <Grid item xs={12} md={6}>
                        {value.selectedCase ? (
                            <Chip
                                color="primary"
                                variant="outlined"
                                icon={<CheckCircleRounded />}
                                label={`Selected case: ${value.selectedCase.id} — ${value.selectedCase.name}`}
                            />
                        ) : (
                            <Typography variant="caption" color="text.secondary">
                                Pick a case to anchor the station.
                            </Typography>
                        )}
                    </Grid>
                </Grid>

                {value.autoConfig && (
                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                        <Chip size="small" label={`MCQ: ${value.autoConfig.mcq || 0}`} />
                        <Chip size="small" label={`Short: ${value.autoConfig.short || 0}`} />
                        <Chip size="small" label={`Explain: ${value.autoConfig.explain || 0}`} />
                    </Stack>
                )}

                <Stack spacing={1.25}>
                    {(value.questions || []).map((q, i) => (
                        <QuestionEditor
                            key={i}
                            value={q}
                            onChange={(next) => setQuestion(i, next)}
                            index={i}
                        />
                    ))}
                </Stack>

                <Popover
                    open={Boolean(aiAnchorEl)}
                    anchorEl={aiAnchorEl}
                    onClose={closeAiPopover}
                    anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
                    transformOrigin={{ vertical: "top", horizontal: "left" }}
                    PaperProps={{
                        sx: {
                            p: 2,
                            width: 340,
                            borderRadius: 2,
                        },
                    }}
                >
                    <Stack spacing={1.5}>
                        <Typography variant="subtitle2" fontWeight={800}>
                            Auto generate questions
                        </Typography>

                        <Typography variant="caption" color="text.secondary">
                            Choose how many questions of each type should be created
                            for this station.
                        </Typography>

                        <TextField
                            label="Multiple choice"
                            type="number"
                            value={aiConfig.mcq}
                            onChange={(e) =>
                                setAiConfig((prev) => ({
                                    ...prev,
                                    mcq: Math.max(0, Number(e.target.value) || 0),
                                }))
                            }
                            slotProps={{ htmlInput: { min: 0 } }}
                            fullWidth
                            size="small"
                        />

                        <TextField
                            label="Short answer"
                            type="number"
                            value={aiConfig.short}
                            onChange={(e) =>
                                setAiConfig((prev) => ({
                                    ...prev,
                                    short: Math.max(0, Number(e.target.value) || 0),
                                }))
                            }
                            slotProps={{ htmlInput: { min: 0 } }}
                            fullWidth
                            size="small"
                        />

                        <TextField
                            label="Explanation"
                            type="number"
                            value={aiConfig.explain}
                            onChange={(e) =>
                                setAiConfig((prev) => ({
                                    ...prev,
                                    explain: Math.max(0, Number(e.target.value) || 0),
                                }))
                            }
                            slotProps={{ htmlInput: { min: 0 } }}
                            fullWidth
                            size="small"
                        />

                        {aiError && (
                            <Typography variant="caption" color="error">
                                {aiError}
                            </Typography>
                        )}

                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                            <Button onClick={closeAiPopover} disabled={aiGenerating}>
                                Cancel
                            </Button>
                            <Button
                                variant="contained"
                                onClick={runAutoGenerate}
                                disabled={aiGenerating}
                                sx={{
                                    bgcolor: "#635bff",
                                    "&:hover": {
                                        bgcolor: "#554fff",
                                    },
                                }}
                            >
                                {aiGenerating ? "Generating..." : "Generate"}
                            </Button>
                        </Stack>
                    </Stack>
                </Popover>
            </Stack>
        </Paper>
    );
}

/* ---------------------------------- Page ---------------------------------- */
export default function CreateNewExam() {
    const navigate = useNavigate();

    const [meta, setMeta] = React.useState({
        classes: [],
        types: [],
        difficulties: [],
    });
    const [loadingMeta, setLoadingMeta] = React.useState(true);

    const [title, setTitle] = React.useState("");
    const [classId, setClassId] = React.useState("");
    const [type, setType] = React.useState("Exam");
    const [difficulty, setDifficulty] = React.useState("Low");
    const [stations, setStations] = React.useState(6);
    const [timeLimit, setTimeLimit] = React.useState(18);
    const [perStation, setPerStation] = React.useState(8);
    const [readingMin, setReadingMin] = React.useState(1);
    const [accessCode, setAccessCode] = React.useState("");
    const [startAt, setStartAt] = React.useState("");
    const [description, setDescription] = React.useState("");

    const [builderActive, setBuilderActive] = React.useState(false);
    const [stationDetails, setStationDetails] = React.useState([]);

    const [creating, setCreating] = React.useState(false);
    const [successOpen, setSuccessOpen] = React.useState(false);
    const [createdInfo, setCreatedInfo] = React.useState({ id: "", name: "" });
    const [error, setError] = React.useState("");
    const [redirectIn, setRedirectIn] = React.useState(20);

    React.useEffect(() => {
        let on = true;
        (async () => {
            try {
                const m = await loadMeta();
                if (!on) return;
                setMeta(m);
            } catch (e) {
                console.error("[CreateNewExam] Failed to load metadata:", e);
                if (on) {
                    setMeta({ classes: [], types: [], difficulties: [] });
                }
            } finally {
                if (on) setLoadingMeta(false);
            }
        })();

        return () => {
            on = false;
        };
    }, []);

    const canStartBuilder =
        title.trim() &&
        classId &&
        type &&
        difficulty &&
        Number(stations) > 0 &&
        Number(timeLimit) > 0 &&
        Number(perStation) > 0 &&
        accessCode.trim();

    const startBuilder = () => {
        if (!canStartBuilder) return;
        const n = Math.max(1, Number(stations) || 1);
        const next = Array.from({ length: n }, () => ({
            selectedCase: null,
            caseQuery: "",
            questionsCount: 0,
            questions: [],
            autoConfig: { mcq: 0, short: 0, explain: 0 },
        }));
        setStationDetails(next);
        setBuilderActive(true);

        requestAnimationFrame(() => {
            const el = document.getElementById("stations-builder-top");
            if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "start" });
            }
        });
    };

    const updateStation = (i, val) => {
        const next = [...stationDetails];
        next[i] = val;
        setStationDetails(next);
    };

    const canCreate = builderActive && stationDetails.length > 0;

    const handleCreate = async () => {
        setError("");
        if (!canCreate) return;

        const payload = {
            name: title.trim(),
            class_id: classId,
            exam_type: type,
            difficulty,
            total_stations: Number(stations),
            time_limit_min: Number(timeLimit),
            per_station: {
                work_min: Number(perStation),
                reading_min: Number(readingMin),
            },
            access_code: accessCode.trim(),
            description: description.trim(),
            start_at: startAt || null,
            stations: stationDetails.map((st, i) => ({
                index: i + 1,
                case_id: st.selectedCase?.id || null,
                questions: (st.questions || []).map((q) => {
                    if (q.type === "mcq") {
                        return {
                            type: "mcq",
                            text: q.text || "",
                            options: q.options.map((o) => o.text),
                            correct_index: q.correctIndex ?? 0,
                        };
                    } else if (q.type === "short") {
                        return {
                            type: "short",
                            text: q.text || "",
                            answer: q.answerText || "",
                        };
                    }

                    return {
                        type: "explain",
                        text: q.text || "",
                        reference: q.answerText || "",
                    };
                }),
            })),
        };

        try {
            setCreating(true);
            const res = await createExam(payload);
            setCreatedInfo({ id: res.id, name: payload.name });
            setSuccessOpen(true);
            setRedirectIn(20);
        } catch (e) {
            setError(
                e && e.message
                    ? e.message
                    : "Failed to create exam. Please try again."
            );
        } finally {
            setCreating(false);
        }
    };

    React.useEffect(() => {
        if (!successOpen) return;
        const id = setInterval(() => {
            setRedirectIn((s) => {
                if (s <= 1) {
                    clearInterval(id);
                    navigate("/stations", { replace: true });
                    return 0;
                }
                return s - 1;
            });
        }, 1000);

        return () => clearInterval(id);
    }, [successOpen, navigate]);

    return (
        <Box sx={{ bgcolor: "background.default", minHeight: "100vh" }}>
            <Container maxWidth={false} sx={{ px: { xs: 2, md: 4 }, py: 2 }}>
                <HeaderShell
                    title="Create new exam"
                    subtitle="Define your OSCE circuit settings and publish when ready."
                />

                <Paper
                    sx={{
                        p: 2,
                        borderRadius: 3,
                        border: "1px solid",
                        borderColor: "divider",
                        mb: 2,
                    }}
                >
                    <Stack spacing={2}>
                        <Stack direction="row" spacing={1}>
                            <Button
                                variant="outlined"
                                startIcon={<ArrowBackRounded />}
                                onClick={() => navigate(-1)}
                                sx={{ borderRadius: 2 }}
                            >
                                Back
                            </Button>
                            <Box sx={{ flex: 1 }} />
                            {!builderActive ? (
                                <Button
                                    variant="contained"
                                    onClick={startBuilder}
                                    disabled={!canStartBuilder || loadingMeta}
                                    sx={{
                                        borderRadius: 2,
                                        bgcolor: "#635bff",
                                        "&:hover": {
                                            bgcolor: "#554fff",
                                        },
                                    }}
                                >
                                    Start Create Exam
                                </Button>
                            ) : (
                                <Button
                                    variant="contained"
                                    onClick={handleCreate}
                                    disabled={creating}
                                    sx={{
                                        borderRadius: 2,
                                        bgcolor: "#635bff",
                                        "&:hover": {
                                            bgcolor: "#554fff",
                                        },
                                    }}
                                >
                                    {creating ? "Creating…" : "Create"}
                                </Button>
                            )}
                        </Stack>

                        <Divider />

                        <Typography variant="subtitle2" fontWeight={800}>
                            Exam details
                        </Typography>

                        <Grid container spacing={2}>
                            <Grid item xs={12} md={4}>
                                <TextField
                                    label="Exam title"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    fullWidth
                                    required
                                    sx={FIELD_SX}
                                    slotProps={{
                                        input: {
                                            startAdornment: (
                                                <InputAdornment position="start">
                                                    <EditOutlined fontSize="small" />
                                                </InputAdornment>
                                            ),
                                        },
                                    }}
                                />
                            </Grid>

                            <Grid item xs={12} md={4}>
                                <FormControl fullWidth required sx={FIELD_SX}>
                                    <InputLabel id="class-label">Class</InputLabel>
                                    <Select
                                        labelId="class-label"
                                        label="Class"
                                        value={classId}
                                        onChange={(e) => setClassId(e.target.value)}
                                        disabled={loadingMeta}
                                        MenuProps={SELECT_MENU_PROPS}
                                        renderValue={(val) => {
                                            const found = meta.classes.find((c) => c.id === val);
                                            return found ? found.name : "";
                                        }}
                                        fullWidth
                                        sx={{
                                            "& .MuiSelect-select": {
                                                whiteSpace: "normal",
                                                lineHeight: 1.25,
                                            },
                                        }}
                                    >
                                        {meta.classes.length === 0 && !loadingMeta && (
                                            <MenuItem disabled value="">
                                                <em>No classes available</em>
                                            </MenuItem>
                                        )}
                                        {meta.classes.map((c) => (
                                            <MenuItem key={c.id} value={c.id}>
                                                <Stack
                                                    direction="row"
                                                    spacing={1}
                                                    alignItems="center"
                                                >
                                                    <ClassRounded fontSize="small" />
                                                    <Typography variant="body2">
                                                        {c.name}
                                                    </Typography>
                                                </Stack>
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Grid>

                            <Grid item xs={12} md={4}>
                                <TextField
                                    label="Start (optional)"
                                    type="datetime-local"
                                    value={startAt}
                                    onChange={(e) => setStartAt(e.target.value)}
                                    fullWidth
                                    sx={FIELD_SX}
                                    InputLabelProps={{ shrink: true }}
                                    slotProps={{
                                        input: {
                                            startAdornment: (
                                                <InputAdornment position="start">
                                                    <AccessTimeRounded fontSize="small" />
                                                </InputAdornment>
                                            ),
                                        },
                                    }}
                                />
                            </Grid>
                        </Grid>

                        <Grid container spacing={2}>
                            <Grid item xs={12} md={4}>
                                <FormControl fullWidth required sx={FIELD_SX}>
                                    <InputLabel id="type-label">Type</InputLabel>
                                    <Select
                                        labelId="type-label"
                                        label="Type"
                                        value={type}
                                        onChange={(e) => setType(e.target.value)}
                                        disabled={loadingMeta}
                                        MenuProps={SELECT_MENU_PROPS}
                                        fullWidth
                                        sx={{ "& .MuiSelect-select": { whiteSpace: "normal" } }}
                                    >
                                        {meta.types.map((t) => (
                                            <MenuItem key={t} value={t}>
                                                {t}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Grid>

                            <Grid item xs={12} md={4}>
                                <FormControl fullWidth required sx={FIELD_SX}>
                                    <InputLabel id="diff-label">Difficulty</InputLabel>
                                    <Select
                                        labelId="diff-label"
                                        label="Difficulty"
                                        value={difficulty}
                                        onChange={(e) => setDifficulty(e.target.value)}
                                        disabled={loadingMeta}
                                        MenuProps={SELECT_MENU_PROPS}
                                        fullWidth
                                        sx={{ "& .MuiSelect-select": { whiteSpace: "normal" } }}
                                    >
                                        {meta.difficulties.map((d) => (
                                            <MenuItem key={d} value={d}>
                                                {d}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Grid>

                            <Grid item xs={12} md={4}>
                                <TextField
                                    label="Stations"
                                    type="number"
                                    slotProps={{
                                        input: {
                                            inputProps: { min: 1 },
                                        },
                                    }}
                                    value={stations}
                                    onChange={(e) => setStations(e.target.value)}
                                    fullWidth
                                    required
                                    sx={FIELD_SX}
                                />
                            </Grid>
                        </Grid>

                        <Divider />
                        <Typography variant="subtitle2" fontWeight={800}>
                            Timing
                        </Typography>

                        <Grid container spacing={2}>
                            <Grid item xs={12} md={4}>
                                <TextField
                                    label="Time limit (min)"
                                    type="number"
                                    value={timeLimit}
                                    onChange={(e) => setTimeLimit(e.target.value)}
                                    fullWidth
                                    required
                                    sx={FIELD_SX}
                                    slotProps={{
                                        input: {
                                            startAdornment: (
                                                <InputAdornment position="start">
                                                    <AccessTimeRounded fontSize="small" />
                                                </InputAdornment>
                                            ),
                                        },
                                        htmlInput: {
                                            min: 1,
                                        },
                                    }}
                                />
                            </Grid>

                            <Grid item xs={12} md={4}>
                                <TextField
                                    label="Per station (min)"
                                    type="number"
                                    value={perStation}
                                    onChange={(e) => setPerStation(e.target.value)}
                                    fullWidth
                                    required
                                    sx={FIELD_SX}
                                    slotProps={{
                                        htmlInput: {
                                            min: 1,
                                        },
                                    }}
                                />
                            </Grid>

                            <Grid item xs={12} md={4}>
                                <TextField
                                    label="Reading time (min)"
                                    type="number"
                                    value={readingMin}
                                    onChange={(e) => setReadingMin(e.target.value)}
                                    fullWidth
                                    sx={FIELD_SX}
                                    slotProps={{
                                        htmlInput: {
                                            min: 0,
                                        },
                                    }}
                                />
                            </Grid>
                        </Grid>

                        <Divider />
                        <Typography variant="subtitle2" fontWeight={800}>
                            Access & notes
                        </Typography>

                        <Grid container spacing={2}>
                            <Grid item xs={12} md={4}>
                                <TextField
                                    label="Access code"
                                    value={accessCode}
                                    onChange={(e) => setAccessCode(e.target.value)}
                                    fullWidth
                                    required
                                    sx={FIELD_SX}
                                    slotProps={{
                                        input: {
                                            startAdornment: (
                                                <InputAdornment position="start">
                                                    <SecurityRounded fontSize="small" />
                                                </InputAdornment>
                                            ),
                                        },
                                    }}
                                />
                            </Grid>

                            <Grid item xs={12} md={4}>
                                <TextField
                                    label="Description"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    fullWidth
                                    sx={FIELD_SX}
                                    slotProps={{
                                        input: {
                                            startAdornment: (
                                                <InputAdornment position="start">
                                                    <DescriptionRounded fontSize="small" />
                                                </InputAdornment>
                                            ),
                                        },
                                    }}
                                />
                            </Grid>

                            <Grid item xs={12} md={4} />
                        </Grid>

                        {error && (
                            <Paper
                                variant="outlined"
                                sx={{
                                    p: 1.25,
                                    borderRadius: 2,
                                    borderColor: "error.light",
                                }}
                            >
                                <Typography variant="body2" color="error">
                                    {error}
                                </Typography>
                            </Paper>
                        )}
                    </Stack>
                </Paper>

                {builderActive && (
                    <Box id="stations-builder-top">
                        {stationDetails.map((st, i) => (
                            <StationEditor
                                key={i}
                                idx={i}
                                value={st}
                                onChange={(next) => updateStation(i, next)}
                            />
                        ))}
                    </Box>
                )}
            </Container>

            <Dialog
                open={successOpen}
                onClose={() => setSuccessOpen(false)}
                maxWidth="xs"
                fullWidth
            >
                <DialogTitle>Exam created</DialogTitle>
                <DialogContent dividers>
                    <Typography gutterBottom>
                        Your exam <strong>{createdInfo.name}</strong> was created
                        successfully.
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Exam ID: <code>{createdInfo.id}</code>
                    </Typography>
                    <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mt: 1.5 }}
                    >
                        You will be redirected to the stations list in {redirectIn} seconds.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => navigate("/stations", { replace: true })}>
                        Go now
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}