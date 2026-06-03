import * as React from "react";
import {
  Box,
  Grid,
  Paper,
  Stack,
  Typography,
  TextField,
  Button,
  IconButton,
  Divider,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  LinearProgress,
  Avatar,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import FilterListIcon from "@mui/icons-material/FilterList";
import LocalOfferIcon from "@mui/icons-material/LocalOffer";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import DashboardIcon from "@mui/icons-material/Dashboard";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";

const API = "http://127.0.0.1:8000";
const CIRCUIT_ID = "demo";
const EXAM_ID = 1;

async function fetchWithTimeout(url, opts = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

function ScoreChip({ ok }) {
  return (
      <Chip
          size="small"
          label={ok ? "Met" : "Unmet"}
          color={ok ? "success" : "default"}
          variant={ok ? "filled" : "outlined"}
          sx={{ height: 22 }}
      />
  );
}

/* ---------------- Left rail ---------------- */
function LeftRail() {
  const Item = ({ icon, selected }) => (
      <IconButton
          size="large"
          color={selected ? "primary" : "default"}
          sx={{
            my: 1.5,
            bgcolor: selected ? "primary.light" : "white",
            "&:hover": { bgcolor: selected ? "primary.light" : "#f2f3f7" },
            boxShadow: selected ? 1 : 0,
            borderRadius: 3,
          }}
      >
        {icon}
      </IconButton>
  );

  return (
      <Box
          component={Paper}
          elevation={0}
          sx={{
            display: { xs: "none", md: "flex" },
            width: { md: 72 },
            height: "100vh",
            position: "fixed",
            top: 0,
            left: 0,
            alignItems: "center",
            flexDirection: "column",
            gap: 1,
            py: 2,
            borderRight: "1px solid #e5e7eb",
            bgcolor: "#f6f7fb",
          }}
      >
        <Avatar sx={{ width: 40, height: 40, bgcolor: "#ddd", mb: 1 }} />
        <Item icon={<DashboardIcon />} />
        <Item icon={<ChatBubbleOutlineIcon />} selected />
        <Item icon={<InsertDriveFileIcon />} />
        <Box sx={{ flexGrow: 1 }} />
        <Item icon={<HelpOutlineIcon />} />
      </Box>
  );
}

/* ---------------- Main page ---------------- */
export default function Marking() {
  /* ---------- top-level mode: 'list' or 'grading' ---------- */
  const [viewMode, setViewMode] = React.useState("list");

  // try to get teacher id from login (fallback 1)
  const teacherId = React.useMemo(() => {
    try {
      const raw = window.localStorage.getItem("user_id");
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? n : 1;
    } catch {
      return 1;
    }
  }, []);

  /* ---------- LIST OF EXAMS (submitted / graded) ---------- */
  const [examList, setExamList] = React.useState([]);
  const [examLoading, setExamLoading] = React.useState(false);
  const [examError, setExamError] = React.useState("");

  React.useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        setExamLoading(true);
        setExamError("");
        // use marking submissions endpoint (PageOut<SubmissionListItemOut>)
        const res = await fetch(
            `${API}/api/marking/submissions?exam_id=${EXAM_ID}&page=1&size=50`
        );
        if (!res.ok) throw new Error("fetch failed");
        const data = await res.json();
        const items = Array.isArray(data.items) ? data.items : [];
        if (!cancel) setExamList(items);
      } catch (e) {
        console.error(e);
        if (!cancel)
          setExamError("Unable to load submitted / graded exams.");
      } finally {
        if (!cancel) setExamLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  /* ---------- dialog for exam detail ---------- */
  const [examDialogOpen, setExamDialogOpen] = React.useState(false);
  const [examDialogExam, setExamDialogExam] = React.useState(null);
  const [examDialogStations, setExamDialogStations] = React.useState([]);
  const [examDialogLoading, setExamDialogLoading] = React.useState(false);
  const [examDialogError, setExamDialogError] = React.useState("");

  const openExamDialog = async (exam) => {
    setExamDialogExam(exam);
    setExamDialogStations([]);
    setExamDialogError("");
    setExamDialogOpen(true);

    try {
      setExamDialogLoading(true);
      // load stations by exam_attempt_id = attempt_id from marking schema
      const res = await fetch(
          `${API}/api/station_attempts?exam_attempt_id=${exam.attempt_id}`
      );
      if (!res.ok) throw new Error("station attempts failed");
      const data = await res.json();
      setExamDialogStations(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setExamDialogError("Unable to load stations for this exam.");
    } finally {
      setExamDialogLoading(false);
    }
  };
  const [currentExam, setCurrentExam] = React.useState(null);

  // order of station numbers for this exam (e.g. [3,5,7] from station_attempts.station_id)
  const [order, setOrder] = React.useState([1, 2, 3, 4]);
  const [idx, setIdx] = React.useState(0);
  const stationNo = order[Math.max(0, Math.min(idx, order.length - 1))];

  const circuitId = CIRCUIT_ID;
  const canPrev = idx > 0;
  const canNext = idx < order.length - 1;

  const handleGradeFromDialog = () => {
    if (!examDialogExam) return;
    const stations = examDialogStations || [];

    // use station_id from station_attempts table so each station is unique
    const stationNos = stations
        .map((s) => s.station_id ?? s.station_no)
        .filter((x) => x != null);

    if (stationNos.length) {
      setOrder(stationNos);
      setIdx(0);
    } else {
      // fallback if somehow no station attempts
      setOrder([1, 2, 3, 4]);
      setIdx(0);
    }

    setCurrentExam(examDialogExam);
    setViewMode("grading");
    setExamDialogOpen(false);
  };
  const examAttemptId = currentExam?.attempt_id ?? null;

  /* ---------- Station info ---------- */
  const [stationInfo, setStationInfo] = React.useState(null);

  React.useEffect(() => {
    let cancel = false;
    if (!examAttemptId) {
      setStationInfo(null);
      return;
    }

    (async () => {
      try {
        const qs = new URLSearchParams({
          circuit_id: circuitId,
          station_no: String(stationNo),
          exam_attempt_id: String(examAttemptId),
        });
        const r = await fetch(
            `${API}/api/station_attempt_info?${qs.toString()}`
        );
        if (!r.ok) return;
        const data = await r.json();
        if (!cancel) setStationInfo(data);
      } catch (e) {
        console.error(e);
        if (!cancel) setStationInfo(null);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [circuitId, stationNo, examAttemptId]);

  // This is the station_attempt_id will use everywhere
  const selectedAttemptId = stationInfo?.station_attempt_id ?? null;

  /* ---------- Rubrics  ---------- */
  const [rubrics, setRubrics] = React.useState([]);
  const [feedback, setFeedback] = React.useState("");

  /* ---------- CHAT  ---------- */
  const [chatMessages, setChatMessages] = React.useState([]);
  const [chatLoading, setChatLoading] = React.useState(false);
  const [chatError, setChatError] = React.useState("");

  /* ---------- STUDENT ANSWERS  ---------- */
  const [answers, setAnswers] = React.useState([]);
  const [answersLoading, setAnswersLoading] = React.useState(false);
  const [answersError, setAnswersError] = React.useState("");
  const [answerMarks, setAnswerMarks] = React.useState({});

  /* ---------- Station attempts list  ---------- */
  const [attempts, setAttempts] = React.useState([]);
  const [attemptsLoading, setAttemptsLoading] = React.useState(false);
  const [attemptsError, setAttemptsError] = React.useState("");

  // Load station attempts for this exam attempt (right panel list)
  React.useEffect(() => {
    if (!examAttemptId) {
      setAttempts([]);
      return;
    }
    let cancel = false;
    (async () => {
      try {
        setAttemptsLoading(true);
        setAttemptsError("");
        const r = await fetch(
            `${API}/api/station_attempts?exam_attempt_id=${examAttemptId}`
        );
        if (!r.ok) throw new Error(`attempts load failed (${r.status})`);
        const data = await r.json();
        if (!cancel) setAttempts(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error(e);
        if (!cancel) setAttemptsError("Unable to load station attempts.");
      } finally {
        if (!cancel) setAttemptsLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [examAttemptId]);

  const visibleAttempts = attempts;

  // ------------ load all marking data for this station_attempt -------------
  React.useEffect(() => {
    if (!selectedAttemptId) {
      setRubrics([]);
      setAnswers([]);
      setAnswerMarks({});
      setChatMessages([]);
      setFeedback("");
      return;
    }

    let cancel = false;
    (async () => {
      try {
        setAnswersLoading(true);
        setChatLoading(true);
        setAnswersError("");
        setChatError("");

        const r = await fetchWithTimeout(
            `${API}/api/marking/station/${selectedAttemptId}`
        );
        if (!r.ok) throw new Error(`marking load failed (${r.status})`);
        const data = await r.json();
        if (cancel) return;

        // rubrics + existing marks
        const existingMarks = Array.isArray(data.existing_marks)
            ? data.existing_marks
            : [];

        const rubricItems = (data.rubrics || []).map((rb) => {
          const mark = existingMarks.find((m) => m.rubric_id === rb.id);
          const score = mark?.score ?? 0;
          return {
            id: rb.id,
            key: String(rb.id),
            title: rb.criterion,
            max_points: rb.max_score,
            met: score > 0,
            points: score,
          };
        });
        setRubrics(rubricItems);

        // answers
        const mappedAnswers = (data.answers || []).map((a, idx) => {
          const answerText =
              a.value_text != null
                  ? a.value_text
                  : a.choice_index != null
                      ? String(a.choice_index)
                      : "";
          return {
            id: a.question_id ?? idx,
            question_id: a.question_id,
            prompt: a.prompt,
            answer_text: answerText,
          };
        });
        setAnswers(mappedAnswers);

        const initMarks = {};
        mappedAnswers.forEach((a) => {
          initMarks[a.id] = {
            is_correct: null,
            score: 0,
          };
        });
        setAnswerMarks(initMarks);

        // chat messages
        const msgs = (data.messages || []).map((m, i) => ({
          id: i,
          side: m.side === "user" ? "user" : "ai",
          content: m.text,
          created_at: m.created_at || null,
        }));
        setChatMessages(msgs);
      } catch (err) {
        console.error(err);
        if (!cancel) {
          setAnswersError("Unable to load answers.");
          setChatError("Unable to load chat messages.");
        }
      } finally {
        if (!cancel) {
          setAnswersLoading(false);
          setChatLoading(false);
        }
      }
    })();

    return () => {
      cancel = true;
    };
  }, [selectedAttemptId]);

  // rubric interaction helpers
  const updateRubricPoints = (key, rawValue) => {
    const value = Number(rawValue);

    setRubrics((rs) =>
        rs.map((r) => {
          if (r.key !== key) return r;

          const safeValue = Math.min(Math.max(value, 0), r.max_points);

          return {
            ...r,
            points: safeValue,
            met: safeValue > 0,
          };
        })
    );
  };

  const totalMax = React.useMemo(
      () => rubrics.reduce((sum, r) => sum + (r.max_points ?? 0), 0),
      [rubrics]
  );
  const totalScore = rubrics.reduce(
      (sum, r) => sum + (r.points || 0),
      0
  );

  const visibleChatMessages = chatMessages;
  const visibleAnswers = answers;

  const updateAnswerMark = (id, patch) => {
    setAnswerMarks((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), ...patch },
    }));
  };

  // ------------ Save / Publish buttons (no POST calls) -------------
  async function handleSave() {
    alert("Demo mode: this page currently only shows chat & answers. Marks are not saved yet.");
  }

  async function handlePublish() {
    alert("Demo mode: publishing grades is not enabled yet.");
  }

  return (
      <Box
          sx={{
            bgcolor: "#ffffffff",
            width: "100%",
            minHeight: "100dvh",
            display: "flex",
            overflow: "hidden",
          }}
      >
        <LeftRail />

        <Box
            sx={{
              pl: { md: "250px" },
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
        >
          {/* Top bar */}
          <Stack
              direction="row"
              alignItems="center"
              spacing={2}
              sx={{
                px: { xs: 2, sm: 3, md: 0 },
                py: 2,
              }}
          >
            <Typography variant="h4" sx={{ fontWeight: 900 }}>
              Test Grading
            </Typography>

            <Box sx={{ flexGrow: 1 }} />
          </Stack>

          {/* ===================== STUDENT TESTS ===================== */}
          {viewMode === "list" && (
              <Box
                  sx={{
                    flex: 1,
                    overflow: "auto",
                    px: { xs: 2, sm: 3, md: 4 },
                    pb: 3,
                  }}
              >
                <Box
                    sx={{
                      mb: 3,
                    }}
                >
                  {examLoading && (
                      <Stack spacing={1} sx={{ mb: 2 }}>
                        <LinearProgress />
                        <Typography variant="body2" color="text.secondary">
                          Loading exam attempts…
                        </Typography>
                      </Stack>
                  )}

                  {examError && (
                      <Typography color="error" sx={{ mb: 2 }}>
                        {examError}
                      </Typography>
                  )}

                  {!examLoading && !examError && !examList.length && (
                      <Typography color="text.secondary">
                        No submitted exams found.
                      </Typography>
                  )}

                  <Grid container spacing={2.5}>
                    {examList.map((e) => {
                      const statusColor =
                          e.status === "graded"
                              ? "#22c55e"
                              : e.status === "submitted"
                                  ? "#f97316"
                                  : "#9ca3af";
                      const progressPct =
                          typeof e.progress_pct === "number"
                              ? Math.round(e.progress_pct)
                              : null;
                      return (
                          <Grid
                              item
                              xs={12}
                              sm={6}
                              md={4}
                              lg={3}
                              key={e.attempt_id}
                          >
                            <Paper
                                onClick={() => openExamDialog(e)}
                                sx={{
                                  cursor: "pointer",
                                  borderRadius: 4,
                                  p: 3,
                                  height: "100%",
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 1.5,
                                  bgcolor: "#ffffff",
                                  boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
                                  transition: "0.2s",
                                  "&:hover": {
                                    boxShadow: "0 6px 26px rgba(0,0,0,0.12)",
                                    transform: "translateY(-2px)",
                                  },
                                }}
                            >
                              <Typography
                                  variant="caption"
                                  color="text.secondary"
                              >
                                Circuit name
                              </Typography>
                              <Typography
                                  variant="subtitle2"
                                  sx={{ fontWeight: 700 }}
                                  noWrap
                              >
                                Attempt #{e.attempt_id}
                              </Typography>

                              <Typography
                                  variant="body2"
                                  sx={{ mt: 0.5 }}
                                  color="text.secondary"
                              >
                                {e.student_name} (ID {e.user_id})
                              </Typography>

                              <Box sx={{ flexGrow: 1 }} />

                              <Stack
                                  direction="row"
                                  justifyContent="space-between"
                                  alignItems="center"
                                  sx={{ mt: 1 }}
                              >
                                <Chip
                                    size="small"
                                    label={e.status}
                                    sx={{
                                      textTransform: "capitalize",
                                    }}
                                />
                                <Typography
                                    variant="caption"
                                    color="text.secondary"
                                >
                                  Progress:{" "}
                                  {progressPct != null ? `${progressPct}%` : "-"}
                                </Typography>
                              </Stack>

                              {/* bottom color bar */}
                              <Box
                                  sx={{
                                    mt: 1,
                                    height: 6,
                                    borderRadius: 999,
                                    bgcolor: "#e5e7eb",
                                    overflow: "hidden",
                                  }}
                              >
                                <Box
                                    sx={{
                                      width: "100%",
                                      height: "100%",
                                      bgcolor: statusColor,
                                    }}
                                />
                              </Box>
                            </Paper>
                          </Grid>
                      );
                    })}
                  </Grid>
                </Box>

                {/* exam detail popup */}
                <Dialog
                    open={examDialogOpen}
                    onClose={() => setExamDialogOpen(false)}
                    maxWidth="md"
                    fullWidth
                >
                  <DialogTitle sx={{ fontWeight: 800 }}>
                    {examDialogExam
                        ? `Attempt #${examDialogExam.attempt_id}`
                        : "Circuit detail"}
                  </DialogTitle>
                  <DialogContent dividers sx={{ pt: 1.5 }}>
                    {examDialogExam && (
                        <Stack spacing={1.5}>
                          <Stack spacing={0.5}>
                            <Typography variant="body2">
                              <strong>Student:</strong>{" "}
                              {examDialogExam.student_name} (ID{" "}
                              {examDialogExam.user_id})
                            </Typography>
                            <Typography variant="body2">
                              <strong>Status:</strong>{" "}
                              <Chip
                                  size="small"
                                  label={examDialogExam.status}
                                  sx={{ ml: 0.5 }}
                              />
                            </Typography>
                            <Typography variant="body2">
                              <strong>Submitted at:</strong>{" "}
                              {examDialogExam.submitted_at
                                  ? new Date(
                                      examDialogExam.submitted_at
                                  ).toLocaleString()
                                  : "-"}
                            </Typography>
                            <Typography variant="body2">
                              <strong>Progress:</strong>{" "}
                              {typeof examDialogExam.progress_pct === "number"
                                  ? `${Math.round(
                                      examDialogExam.progress_pct
                                  )}%`
                                  : "-"}
                            </Typography>
                          </Stack>

                          <Divider />

                          <Typography
                              variant="subtitle2"
                              sx={{ fontWeight: 700 }}
                          >
                            Stations
                          </Typography>

                          {examDialogLoading ? (
                              <Stack spacing={1}>
                                <LinearProgress />
                                <Typography
                                    variant="caption"
                                    color="text.secondary"
                                >
                                  Loading stations…
                                </Typography>
                              </Stack>
                          ) : examDialogError ? (
                              <Typography color="error">
                                {examDialogError}
                              </Typography>
                          ) : !examDialogStations.length ? (
                              <Typography color="text.secondary">
                                No station attempts found.
                              </Typography>
                          ) : (
                              <Stack spacing={1}>
                                {examDialogStations.map((s, i) => (
                                    <Paper
                                        key={s.id ?? i}
                                        variant="outlined"
                                        sx={{
                                          p: 1.5,
                                          borderRadius: 2,
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "space-between",
                                        }}
                                    >
                                      <Stack>
                                        <Typography
                                            variant="body2"
                                            sx={{ fontWeight: 600 }}
                                        >
                                          Station {s.station_id ?? s.station_no}
                                        </Typography>
                                        <Typography
                                            variant="caption"
                                            color="text.secondary"
                                        >
                                          Status: {s.status ?? "-"} • Score:{" "}
                                          {s.score ?? "-"}
                                        </Typography>
                                      </Stack>
                                      <Typography
                                          variant="caption"
                                          color="text.secondary"
                                      >
                                        {s.submitted_at
                                            ? new Date(
                                                s.submitted_at
                                            ).toLocaleString()
                                            : ""}
                                      </Typography>
                                    </Paper>
                                ))}
                              </Stack>
                          )}

                          <Divider sx={{ mt: 1 }} />

                          <Typography
                              variant="body2"
                              color="text.secondary"
                          >
                            Final score and academic inquiry comments will be
                            edited in the grading interface.
                          </Typography>
                        </Stack>
                    )}
                  </DialogContent>
                  <DialogActions>
                    <Button onClick={() => setExamDialogOpen(false)}>
                      Close
                    </Button>
                    <Button
                        variant="contained"
                        onClick={handleGradeFromDialog}
                        disabled={!examDialogExam}
                    >
                      Grade
                    </Button>
                  </DialogActions>
                </Dialog>
              </Box>
          )}

          {/* ===================== GRADING INTERFACE  ===================== */}
          {viewMode === "grading" && currentExam && (
              <Box
                  sx={{
                    flex: 1,
                    overflow: "auto",
                    px: { xs: 2, sm: 3, md: 0 },
                    pb: 3,
                  }}
              >
                <Grid
                    container
                    spacing={3}
                    sx={{ mx: "auto", maxWidth: 1560, alignItems: "stretch" }}
                >
                  {/* Main board: CHAT + STUDENT ANSWERS */}
                  <Grid xs={12} lg={9} sx={{ display: "flex" }}>
                    <Paper
                        sx={{
                          p: { xs: 2, md: 2.5 },
                          borderRadius: 3,
                          width: "100%",
                          display: "flex",
                          flexDirection: "column",
                          gap: 2,
                        }}
                    >
                      {/* Header + station switch */}
                      <Stack
                          direction="row"
                          alignItems="center"
                          spacing={1}
                          sx={{ mb: 1 }}
                      >
                        <Typography
                            variant="subtitle1"
                            sx={{ fontWeight: 800 }}
                        >
                          Chat & answers — Station {stationNo}
                        </Typography>
                        <Box sx={{ flexGrow: 1 }} />

                        <Button
                            size="small"
                            variant="outlined"
                            disabled={!canPrev}
                            onClick={() => setIdx((i) => Math.max(0, i - 1))}
                        >
                          {"<"}
                        </Button>
                        <Button
                            size="small"
                            variant="outlined"
                            disabled={!canNext}
                            onClick={() =>
                                setIdx((i) => Math.min(order.length - 1, i + 1))
                            }
                        >
                          {">"}
                        </Button>
                      </Stack>

                      {/* CHAT MESSAGES */}
                      <Paper
                          variant="outlined"
                          sx={{
                            borderRadius: 2,
                            mb: 2,
                            p: 2,
                            maxHeight: 280,
                            overflow: "auto",
                            bgcolor: "#f9fafb",
                          }}
                      >
                        <Typography
                            variant="subtitle2"
                            sx={{ fontWeight: 700, mb: 1 }}
                        >
                          Chat transcript
                        </Typography>

                        {chatLoading ? (
                            <Stack spacing={2}>
                              <LinearProgress />
                              <Typography
                                  variant="body2"
                                  color="text.secondary"
                              >
                                Loading chat…
                              </Typography>
                            </Stack>
                        ) : chatError ? (
                            <Typography color="error">{chatError}</Typography>
                        ) : visibleChatMessages.length === 0 ? (
                            <Typography color="text.secondary">
                              No chat messages for this station.
                            </Typography>
                        ) : (
                            <Stack spacing={1.5}>
                              {visibleChatMessages.map((m, i) => {
                                const side = m.side || m.role || "user";
                                const isUser = side === "user";
                                return (
                                    <Box
                                        key={m.id ?? i}
                                        sx={{
                                          display: "flex",
                                          justifyContent: isUser
                                              ? "flex-end"
                                              : "flex-start",
                                        }}
                                    >
                                      <Box
                                          sx={{
                                            maxWidth: "90%",
                                            px: 2,
                                            py: 1.5,
                                            borderRadius: 2,
                                            bgcolor: isUser
                                                ? "primary.main"
                                                : "#e0e7ff",
                                            color: isUser
                                                ? "primary.contrastText"
                                                : "black",
                                            boxShadow: 1,
                                          }}
                                      >
                                        <Typography
                                            variant="caption"
                                            sx={{
                                              fontWeight: 600,
                                              opacity: 0.8,
                                            }}
                                        >
                                          {isUser ? "Student" : "AI"}
                                        </Typography>
                                        <Typography
                                            variant="body2"
                                            sx={{ whiteSpace: "pre-wrap" }}
                                        >
                                          {m.content ?? ""}
                                        </Typography>
                                        {m.created_at && (
                                            <Typography
                                                variant="caption"
                                                sx={{
                                                  display: "block",
                                                  mt: 0.5,
                                                  opacity: 0.7,
                                                }}
                                            >
                                              {new Date(
                                                  m.created_at
                                              ).toLocaleString()}
                                            </Typography>
                                        )}
                                      </Box>
                                    </Box>
                                );
                              })}
                            </Stack>
                        )}
                      </Paper>

                      {/* STUDENT ANSWERS */}
                      <Typography
                          variant="subtitle1"
                          sx={{ fontWeight: 800, mb: 1 }}
                      >
                        Student answers
                      </Typography>

                      {answersLoading ? (
                          <Paper
                              variant="outlined"
                              sx={{ p: 2, borderRadius: 2, mb: 2 }}
                          >
                            <Stack
                                direction="row"
                                spacing={2}
                                alignItems="center"
                            >
                              <LinearProgress sx={{ flex: 1 }} />
                              <Typography
                                  variant="body2"
                                  color="text.secondary"
                              >
                                Loading answers…
                              </Typography>
                            </Stack>
                          </Paper>
                      ) : answersError ? (
                          <Paper
                              variant="outlined"
                              sx={{ p: 2, borderRadius: 2, mb: 2 }}
                          >
                            <Typography color="error">{answersError}</Typography>
                          </Paper>
                      ) : visibleAnswers.length === 0 ? (
                          <Paper
                              variant="outlined"
                              sx={{ p: 2, borderRadius: 2, mb: 2 }}
                          >
                            <Typography color="text.secondary">
                              No answers found for this station.
                            </Typography>
                          </Paper>
                      ) : (
                          <Stack spacing={1.5}>
                            {visibleAnswers.map((a, idxA) => {
                              const id = a.id ?? a.answer_id ?? idxA;
                              const marks = answerMarks[id] || {
                                is_correct: null,
                                score: 0,
                              };
                              const answerText =
                                  a.answer_text ??
                                  a.value_text ??
                                  a.choice_index ??
                                  "";

                              return (
                                  <Paper
                                      key={id}
                                      variant="outlined"
                                      sx={{ p: 1.5, borderRadius: 2 }}
                                  >
                                    <Stack spacing={1}>
                                      <Stack
                                          direction="row"
                                          justifyContent="space-between"
                                          alignItems="center"
                                      >
                                        <Typography
                                            variant="subtitle2"
                                            sx={{ fontWeight: 700 }}
                                        >
                                          Q{a.question_id ?? "-"}
                                        </Typography>
                                      </Stack>

                                      {/* show the question prompt from backend */}
                                      {a.prompt && (
                                          <Typography
                                              variant="body2"
                                              sx={{ whiteSpace: "pre-wrap" }}
                                          >
                                            {a.prompt}
                                          </Typography>
                                      )}

                                      <Typography
                                          variant="body2"
                                          sx={{ whiteSpace: "pre-wrap" }}
                                      >
                                        <strong>Answer:</strong>{" "}
                                        {String(answerText)}
                                      </Typography>

                                      <Stack
                                          direction={{ xs: "column", sm: "row" }}
                                          spacing={1}
                                          alignItems={{
                                            xs: "stretch",
                                            sm: "center",
                                          }}
                                      >
                                        <Stack direction="row" spacing={1}>
                                          <Button
                                              size="small"
                                              variant={
                                                marks.is_correct === true
                                                    ? "contained"
                                                    : "outlined"
                                              }
                                              color="success"
                                              onClick={() =>
                                                  updateAnswerMark(id, {
                                                    is_correct: true,
                                                  })
                                              }
                                          >
                                            Correct
                                          </Button>
                                          <Button
                                              size="small"
                                              variant={
                                                marks.is_correct === false
                                                    ? "contained"
                                                    : "outlined"
                                              }
                                              color="error"
                                              onClick={() =>
                                                  updateAnswerMark(id, {
                                                    is_correct: false,
                                                  })
                                              }
                                          >
                                            Incorrect
                                          </Button>
                                        </Stack>
                                      </Stack>
                                    </Stack>
                                  </Paper>
                              );
                            })}
                          </Stack>
                      )}
                    </Paper>
                  </Grid>

                  {/* Right panel: station attempts + rubrics + feedback */}
                  <Grid xs={12} lg={3} sx={{ display: "flex" }}>
                    <Paper
                        sx={{
                          p: { xs: 2, md: 2.5 },
                          borderRadius: 3,
                          width: "100%",
                          display: "flex",
                          flexDirection: "column",
                          gap: 1.5,
                        }}
                    >
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Avatar />
                        <Stack>
                          <Typography fontWeight={700}>
                            Student: {stationInfo?.student_name || "-"}
                          </Typography>
                          <Typography
                              variant="caption"
                              color="text.secondary"
                          >
                            ID: {stationInfo?.student_id || "-"}
                          </Typography>
                        </Stack>
                      </Stack>

                      <Stack spacing={0.5}>
                        <Typography
                            variant="caption"
                            color="text.secondary"
                        >
                          Date: {stationInfo?.date || "-"}
                        </Typography>
                        <Typography
                            variant="caption"
                            color="text.secondary"
                        >
                          Time: {stationInfo?.work_min ?? "-"} min
                        </Typography>
                        <Typography
                            variant="caption"
                            color="text.secondary"
                        >
                          Time per Q: {stationInfo?.avg_per_q ?? "-"} min
                        </Typography>
                      </Stack>

                      <Stack direction="row" spacing={1}>
                        <Button
                            fullWidth
                            variant="outlined"
                            startIcon={<FilterListIcon />}
                        >
                          Filter
                        </Button>
                        <Button
                            fullWidth
                            variant="outlined"
                            startIcon={<LocalOfferIcon />}
                        >
                          Add tag
                        </Button>
                      </Stack>

                      <Divider />

                      {/* Station attempts list */}
                      <Typography
                          variant="subtitle2"
                          sx={{ fontWeight: 800 }}
                      >
                        Station attempts
                      </Typography>

                      <Paper
                          variant="outlined"
                          sx={{
                            borderRadius: 2,
                            maxHeight: 200,
                            overflow: "auto",
                          }}
                      >
                        {attemptsLoading ? (
                            <Stack sx={{ p: 2 }} spacing={1}>
                              <LinearProgress />
                              <Typography
                                  variant="caption"
                                  color="text.secondary"
                              >
                                Loading attempts…
                              </Typography>
                            </Stack>
                        ) : attemptsError ? (
                            <Stack sx={{ p: 2 }} spacing={1}>
                              <Typography
                                  variant="body2"
                                  color="error"
                              >
                                {attemptsError}
                              </Typography>
                            </Stack>
                        ) : visibleAttempts.length === 0 ? (
                            <Stack sx={{ p: 2 }} spacing={1}>
                              <Typography
                                  variant="body2"
                                  color="text.secondary"
                              >
                                No attempts found.
                              </Typography>
                            </Stack>
                        ) : (
                            <List dense disablePadding>
                              {visibleAttempts.map((a, i) => (
                                  <ListItem
                                      key={a.id ?? i}
                                      sx={{ cursor: "pointer" }}
                                      onClick={() => {
                                        const num = a.station_id ?? a.station_no;
                                        if (num != null) {
                                          const idxInOrder = order.indexOf(num);
                                          if (idxInOrder >= 0) {
                                            setIdx(idxInOrder);
                                          }
                                        }
                                      }}
                                  >
                                    <ListItemText
                                        primary={`Station ${
                                            a.station_id ?? a.station_no ?? "—"
                                        }`}
                                        secondary={[
                                          a.status && `Status: ${a.status}`,
                                          a.score != null && `Score: ${a.score}`,
                                          a.started_at &&
                                          `Start: ${new Date(
                                              a.started_at
                                          ).toLocaleString()}`,
                                          a.submitted_at &&
                                          `Submitted: ${new Date(
                                              a.submitted_at
                                          ).toLocaleString()}`,
                                        ]
                                            .filter(Boolean)
                                            .join(" • ")}
                                    />
                                  </ListItem>
                              ))}
                            </List>
                        )}
                      </Paper>

                      {/* Station rubrics */}
                      <Typography
                          variant="subtitle2"
                          sx={{ fontWeight: 800, mt: 1 }}
                      >
                        Station rubrics
                      </Typography>

                      <Box
                          sx={{
                            maxHeight: 220,
                            overflow: "auto",
                          }}
                      >
                        {rubrics.map((r) => (
                            <Accordion
                                key={r.key}
                                disableGutters
                                sx={{
                                  mb: 0.75,
                                  borderRadius: 2,
                                  overflow: "hidden",
                                }}
                            >
                              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                <Stack
                                    direction="row"
                                    spacing={1}
                                    alignItems="center"
                                    sx={{ width: "100%" }}
                                >
                                  {r.points > 0 ? (
                                      <CheckCircleOutlineIcon color="success" />
                                  ) : (
                                      <RadioButtonUncheckedIcon color="disabled" />
                                  )}

                                  <Typography
                                      sx={{ fontWeight: 600, flex: 1 }}
                                      noWrap
                                  >
                                    {r.title}
                                  </Typography>

                                  <Chip
                                      label={`${r.points}/${r.max_points}`}
                                      size="small"
                                      color={
                                        r.points > 0 ? "success" : "default"
                                      }
                                  />
                                </Stack>
                              </AccordionSummary>

                              <AccordionDetails>
                                <Stack spacing={1.5}>
                                  {/* Toggle met/unmet – still local-only */}
                                  <Button
                                      size="small"
                                      variant={r.met ? "contained" : "outlined"}
                                      onClick={() =>
                                          setRubrics((rb) =>
                                              rb.map((x) =>
                                                  x.key === r.key
                                                      ? {
                                                        ...x,
                                                        met: !x.met,
                                                        points: !x.met
                                                            ? x.max_points
                                                            : 0,
                                                      }
                                                      : x
                                              )
                                          )
                                      }
                                  >
                                    {r.met ? "Marked as met" : "Mark as met"}
                                  </Button>

                                  {/* Manual points input – local-only */}
                                  <TextField
                                      size="small"
                                      label="Points"
                                      type="number"
                                      value={r.points}
                                      inputProps={{
                                        min: 0,
                                        max: r.max_points,
                                      }}
                                      onChange={(e) =>
                                          updateRubricPoints(r.key, e.target.value)
                                      }
                                      sx={{ maxWidth: 120 }}
                                  />
                                </Stack>
                              </AccordionDetails>
                            </Accordion>
                        ))}
                      </Box>

                      {/* Feedback + totals + actions */}
                      <Typography
                          variant="subtitle2"
                          sx={{ fontWeight: 800, mt: 1 }}
                      >
                        Teacher’s feedback for Station {stationNo}
                      </Typography>

                      <TextField
                          multiline
                          minRows={4}
                          fullWidth
                          value={feedback}
                          onChange={(e) => setFeedback(e.target.value)}
                          placeholder="Write overall feedback here..."
                      />

                      <Paper
                          variant="outlined"
                          sx={{ p: 1.5, borderRadius: 2 }}
                      >
                        <Stack
                            direction="row"
                            justifyContent="space-between"
                            alignItems="center"
                        >
                          <Typography fontWeight={800}>
                            Station total score:
                          </Typography>
                          <Typography fontWeight={800}>
                            {totalScore}/{totalMax || 0}
                          </Typography>
                        </Stack>
                        <LinearProgress
                            variant="determinate"
                            value={
                              totalMax > 0 ? (totalScore / totalMax) * 100 : 0
                            }
                            sx={{ mt: 1 }}
                        />
                      </Paper>

                      <Stack direction="row" spacing={1}>
                        <Tooltip title="Demo only – not saved yet">
                          <Button
                              fullWidth
                              variant="outlined"
                              onClick={handleSave}
                          >
                            Save
                          </Button>
                        </Tooltip>
                        <Tooltip title="Demo only – publishing disabled">
                          <Button
                              fullWidth
                              variant="contained"
                              onClick={handlePublish}
                          >
                            Publish
                          </Button>
                        </Tooltip>
                      </Stack>
                    </Paper>
                  </Grid>
                </Grid>
              </Box>
          )}
        </Box>
      </Box>
  );
}
