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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Menu,
  MenuItem
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import FilterListIcon from "@mui/icons-material/FilterList";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import DashboardIcon from "@mui/icons-material/Dashboard";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";
import ArrowForwardIosIcon from "@mui/icons-material/ArrowForwardIos";

const API = "http://127.0.0.1:8000";
const CIRCUIT_ID = "demo";


/* fetch with timeout helper */
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

/* ---------------- Helpers ---------------- */
// Determines an image URL based on the category (or exam name as fallback)
const getCategoryImage = (category, examName) => {
  const textToMatch = (category || examName || "").toLowerCase();
  
  if (textToMatch.includes("cardio") || textToMatch.includes("heart")) {
    return "https://images.unsplash.com/...";
  }
  // ... other categories ...
  return "https://images.unsplash.com/..."; // Default fallback
};

function ChatAndAnswers(chatMessages, answers) {
  const chat = (chatMessages || []).map((m, i) => ({
    id: `chat-${m.id ?? i}`,
    type: "chat",
    role: m.side || "user",
  content: m.content,  
      created_at: m.created_at,
  }));

  const ans = (answers || []).map((a, i) => ({
    id: `ans-${a.id ?? i}`,
    type: "answer",
    role: "user",
    content:
      a.value_text ??
      (a.choice_index != null ? String(a.choice_index) : ""),
    question_id: a.question_id,
    created_at: a.created_at,
  }));

  return [...chat, ...ans].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  );
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
  const [viewMode, setViewMode] = React.useState("list");
  const [contentMode, setContentMode] = React.useState("answer"); 
  const [stationInfo, setStationInfo] = React.useState(null);
  const [stationAttemptId, setStationAttemptId] = React.useState(null);

  React.useEffect(() => {
    console.log("DEBUG stationAttemptId =", stationAttemptId);
  }, [stationAttemptId]);

  /* ---------- Rubrics (station-level; used for total score) ---------- */
  const [rubrics, setRubrics] = React.useState([]);
  const [feedback, setFeedback] = React.useState("");

  const persist = async (status) => {
    if (!stationAttemptId) {
      alert("Missing station_attempt_id");
      return;
    }

    const payload = {
      rubrics: rubrics.map((r) => ({
        rubric_id: r.id,
        met: r.met,
        points: Number(r.points) || 0,
        comment: r.comment || "",
      })),
      feedback,
      status: status === "graded" ? "published" : "draft",
    };

    console.log("POSTING RUBRICS");
    console.log("stationAttemptId =", stationAttemptId);
    console.log("payload =", payload);

    try {
      const res = await fetch( 
        `${API}/api/grading/${stationAttemptId}/rubrics`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) throw new Error(await res.text());

      const data = await res.json();
      console.log("Saved:", data);
      const r = await fetch(
        `${API}/api/grading/station_attempts?exam_attempt_id=${examAttemptId}`
      );
      const updated = await r.json();
      setAttempts(updated);
    } catch (err) {
      console.error(err);
      alert("Save failed.");
    }
  };

  /* ---------- 1) LIST OF EXAMS (submitted / graded) ---------- */
  const [examList, setExamList] = React.useState([]);
  const [examLoading, setExamLoading] = React.useState(false);
  const [examError, setExamError] = React.useState("");

  React.useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        setExamLoading(true);
        setExamError("");
        const res = await fetch(`${API}/api/grading/teacher/exam_attempts_done`);
        if (!res.ok) throw new Error("fetch failed");
        const data = await res.json();
        if (!cancel) setExamList(Array.isArray(data) ? data : []);
      } catch (e) {
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

      const id = exam.exam_attempt_id || exam.id;
      if (!id) throw new Error("Missing exam_attempt_id");

      const res = await fetch(
        `${API}/api/grading/station_attempts?exam_attempt_id=${id}`
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

  /* ---------- 2) state for actual grading UI ---------- */
  const [currentExam, setCurrentExam] = React.useState(null);
  const examAttemptId = currentExam?.exam_attempt_id ?? null;

  React.useEffect(() => {
    console.log("DEBUG examAttemptId =", examAttemptId);
    console.log("DEBUG currentExam =", currentExam);
  }, [examAttemptId, currentExam]);

  const [order, setOrder] = React.useState([1, 2, 3, 4]);
  const [idx, setIdx] = React.useState(0);
  const stationNo = order[Math.max(0, Math.min(idx, order.length - 1))];
  const [studentInfo, setStudentInfo] = React.useState(null);
React.useEffect(() => {
  if (!examAttemptId) return;

  let cancel = false;

  async function loadStationAttempt() {
    try {
      console.log("====== LOAD STATION ATTEMPT ======");
      console.log("examAttemptId =", examAttemptId);
      console.log("stationNo =", stationNo);

      const res = await fetch(
        `${API}/api/grading/station_attempts?exam_attempt_id=${examAttemptId}`
      );

      if (!res.ok) throw new Error("Failed to load station attempts");

      const list = await res.json();
      console.log("station_attempts result =", list);

      if (cancel) return;

      const matched = list.find(
        (s) => Number(s.station_id) === Number(stationNo)
      );

      if (!matched) {
        console.warn("No station attempt found for station:", stationNo);
        setStationAttemptId(null);
        setStationInfo(null);
        return;
      }

      const attemptId = matched.station_attempt_id || matched.id;

      console.log("SETTING stationAttemptId =", attemptId);

      setStationAttemptId(attemptId);
      setStationInfo(matched);

    } catch (err) {
      console.error("Station load error:", err);
      setStationAttemptId(null);
      setStationInfo(null);
    }
  }

  loadStationAttempt();

  return () => {
    cancel = true;
  };
}, [examAttemptId, stationNo]);


  const studentId = currentExam?.student_id ?? null;
  
  const canPrev = idx > 0;
  const canNext = idx < order.length - 1;
  const goPrev = () => setIdx((i) => (i - 1 + order.length) % order.length);
  const goNext = () => setIdx((i) => (i + 1) % order.length);

  const handleGradeFromDialog = () => {
    if (!examDialogExam) return;
    const stations = examDialogStations || [];

    // use station_id from station_attempts table so each station is unique
    const stationNos = stations
      .map((s) => s.station_id)
      .filter(Boolean);

    if (stationNos.length) {
      setOrder(stationNos);
      setIdx(0);
    } else {
      setOrder([1, 2, 3, 4]);
      setIdx(0);
    }
    
    const normalizedExam = {
      ...examDialogExam,
      exam_attempt_id: examDialogExam.exam_attempt_id || examDialogExam.id,
    };
    setCurrentExam(normalizedExam);
    setViewMode("grading");
    setExamDialogOpen(false);
  };

  // ---------- load saved rubric_marks + feedback ----------
  
  React.useEffect(() => {
    // We rely on stationAttemptId now to load rubrics related to this attempt
    if (!stationAttemptId) return;

    let cancel = false;

    (async () => {
      try {
        // First, fetch the definition of the station (specifically its ID in station table)
        // However, we can also just fetch the station details from the attempt detail endpoint 
        // which includes rubrics.
        // But following existing logic:
        
        const r = await fetch(
            `${API}/api/grading/station/${stationAttemptId}`
        );
        if (!r.ok) return;

        const data = await r.json();
        console.log("Station Detail API response =", data);
        
        if (cancel) return;

        // Map rubrics from the detail response
        if (Array.isArray(data.rubrics)) {
          const formatted = data.rubrics.map((r) => ({
          id: r.id,
          key: String(r.id),
          title: r.title,
          max_points: Number(r.max_points) || 0,
          met: r.met || false,
          points: r.points ?? 0,
          comment: r.comment || "",
        }));

  setRubrics(formatted);
}


      } catch (err) {
        console.error("Rubric load error:", err);
      }
    })();

    return () => (cancel = true);
  }, [stationAttemptId]);

  // Load saved rubric marks specifically
  React.useEffect(() => {
    if (!stationAttemptId) return;

    let cancel = false;
    (async () => {
        // You might need a specific endpoint for fetching saved marks if not in detail
        // Or you might use the one in your original code if valid.
        // Assuming there isn't a dedicated GET /rubrics_marks, 
        // but we can assume we want to preserve state if the user returns.
        // NOTE: The previous code tried to call /api/grading/{id}/rubrics (POST)
        // If there is no GET, we rely on `get_station_detail` returning marks (which I added to backend).
        
        // If get_station_detail (above) handles it, this might be redundant unless we want separate calls.
    })();
    return () => (cancel = true);
  }, [stationAttemptId]);

  const toggleRubric = (key) => {
    setRubrics((rs) =>
      rs.map((r) =>
        r.key === key
          ? {
              ...r,
              met: !r.met,
              points: !r.met ? r.max_points : 0,
            }
          : r
      )
    );
  };

  const totalScore = React.useMemo(() => {
  return rubrics.reduce(
    (sum, r) => sum + (Number(r.points) || 0),
    0
  );
}, [rubrics]);


const totalMax = React.useMemo(() => {
  return rubrics.reduce(
    (sum, r) => sum + Number(r.max_points || 0),
    0
  );
}, [rubrics]);


  async function handleSave() {
    await persist("draft");
    alert("Draft saved.");
    setViewMode("list");
  }

  async function handlePublish() {
    await persist("graded");
    alert("Published!");
    setViewMode("list");
  }

  /* ---------- CHAT (from chat_messages) ---------- */
  const [chatMessages, setChatMessages] = React.useState([]);
  const [chatLoading, setChatLoading] = React.useState(false);
  const [chatError, setChatError] = React.useState("");

  /* ---------- STUDENT ANSWERS ---------- */
  const [answers, setAnswers] = React.useState([]);
  const [answersLoading, setAnswersLoading] = React.useState(false);
  const [answersError, setAnswersError] = React.useState("");
  const [answerMarks, setAnswerMarks] = React.useState({});


  React.useEffect(() => {
  if (!stationAttemptId) {
    setChatMessages([]);
    setAnswers([]);
    return;
  }

  let cancel = false;

  async function loadStationDetail() {
    try {
      console.log("LOADING station detail for", stationAttemptId);

      const res = await fetch(
        `${API}/api/grading/station/${stationAttemptId}`
      );

      if (!res.ok) throw new Error("Failed to load station detail");

      const data = await res.json();
      console.log("Station detail =", data);

      if (cancel) return;

      setChatMessages(data.messages || []);
      setAnswers(data.answers || []);

      if (currentExam) {
        setStudentInfo({
          name: currentExam.student_name,
          id: currentExam.student_id,
        });
      }

    } catch (err) {
      console.error("Detail load error:", err);
      if (!cancel) {
        setChatMessages([]);
        setAnswers([]);
      }
    }
  }

  loadStationDetail();

  return () => {
    cancel = true;
  };
}, [stationAttemptId]);

  const visibleAnswers = answers;

  const updateAnswerMark = (id, patch) => {
    setAnswerMarks((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), ...patch },
    }));
  };

  /* ---------- Station attempts list (right panel while GRADING) ---------- */
  const [attempts, setAttempts] = React.useState([]);
  const [attemptsLoading, setAttemptsLoading] = React.useState(false);
  const [attemptsError, setAttemptsError] = React.useState("");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [anchorEl, setAnchorEl] = React.useState(null);
const openFilter = Boolean(anchorEl);
const [filterStatus, setFilterStatus] = React.useState("all");
  const filteredExams = examList.filter((e) => {
  const matchesSearch = 
    (e.exam_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (e.student_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    String(e.student_id).includes(searchQuery);
    
  const matchesFilter = filterStatus === "all" || e.status === filterStatus;
  
  return matchesSearch && matchesFilter;
});
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
          `${API}/api/grading/station_attempts?exam_attempt_id=${examAttemptId}`
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

  /* ===================================================================== */

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
        flex: 1,
        ml: { md: "72px" }, 
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center", 
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
  <Box sx={{ flexGrow: 1 }} />
</Stack>

{/* ===================== STUDENT TESTS GRID ===================== */}
{viewMode === "list" && (
  <Box
    sx={{
      flex: 1,
      overflow: "auto",
      px: { xs: 2, sm: 3, md: 4 },
      pb: 3,
    }}
  >
    
    {/* Search and Filter Bar */}
    <Stack 
      direction="row" 
      spacing={2} 
      sx={{ mb: 4, maxWidth: 1200, mx: "auto" }}
    >
      <TextField 
        size="small"
        placeholder="Search students, IDs, or circuits..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        sx={{ 
          flexGrow: 1, 
          bgcolor: "white", 
          "& .MuiOutlinedInput-root": { borderRadius: 2 } 
        }}
      />
      <Button 
        variant="outlined" 
        startIcon={<FilterListIcon />} 
        onClick={(e) => setAnchorEl(e.currentTarget)}
        sx={{ bgcolor: "white", borderRadius: 2, px: 3, borderColor: "#e5e7eb", color: "text.primary" }}
      >
        {filterStatus === "all" ? "Filter" : filterStatus}
      </Button>

      <Menu
        anchorEl={anchorEl}
        open={openFilter}
        onClose={() => setAnchorEl(null)}
        sx={{ mt: 1 }}
      >
        <MenuItem onClick={() => { setFilterStatus("all"); setAnchorEl(null); }}>All Tests</MenuItem>
        <MenuItem onClick={() => { setFilterStatus("graded"); setAnchorEl(null); }}>Graded</MenuItem>
        <MenuItem onClick={() => { setFilterStatus("submitted"); setAnchorEl(null); }}>Submitted</MenuItem>
      </Menu>
    </Stack>

    <Box sx={{ mb: 3 }}>
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

      {!examLoading && !examError && !filteredExams.length && (
        <Stack alignItems="center" justifyContent="center" spacing={2} sx={{ py: 10, opacity: 0.6 }}>
          <DashboardIcon sx={{ fontSize: 48, color: "text.disabled" }} />
          <Typography variant="body1" color="text.secondary">
            No virtual patient interactions found matching your search.
          </Typography>
        </Stack>
      )}

     {/* Updated Grid container for wider layout */}
<Grid
  container
  spacing={4}
  justifyContent="flex-start"
  sx={{ 
    maxWidth: "2400px", 
    width: "100%",
    mx: "auto" 
  }}
>
  {filteredExams.map((e) => (
    <Grid
      key={e.exam_attempt_id || e.id}
      item
      xs={12}
      sm={12}
      md={12} 
      lg={12} 
      display="flex"
    >
      <Paper
        onClick={() => openExamDialog(e)}
        sx={{
          width: "100%",
          height: 520, // Fixed height for identical box sizes
          borderRadius: 5,
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          bgcolor: "#ffffff",
          boxShadow: "0 8px 32px rgba(0,0,0,0.08)",
          transition: "all 0.3s ease",
          overflow: "hidden",
          border: "1px solid #f0f1f4",
          "&:hover": {
            boxShadow: "0 15px 45px rgba(0,0,0,0.12)",
            transform: "translateY(-6px)",
          },
        }}
      >
        <Box sx={{ p: 4, flexGrow: 1, display: "flex", flexDirection: "column" }}>
          {/* HEADER: Test Name and Category */}
          <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: 1, fontWeight: 600 }}>
            CIRCUIT NAME
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 800, mt: 0.5 }} noWrap>
            {e.exam_name}
          </Typography>          
          <Typography variant="body1" sx={{ mt: 1, mb: 1, color: "text.secondary" }}>
            Student: <strong>{e.student_name}</strong>
          </Typography>

          {/* MIDDLE: Centered Image after the name */}
          <Box 
            sx={{ 
              flexGrow: 1, 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center",
              width: "100%",
              my: 2
            }}
          >
            <Box
              component="img"
              src={getCategoryImage(e.category, e.exam_name)}
              alt={e.category || "Exam Category"}
              sx={{
                width: "100%",
                height: 240, // Increased image size
                borderRadius: 4,
                objectFit: "cover",
                bgcolor: "#f8fafc",
                boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.05)"
              }}
            />
          </Box>

          {/* FOOTER: Status and Score */}
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 2 }}>
            <Chip
              label={e.status}
              sx={{
                height: 36,
                px: 1,
                fontSize: "0.85rem",
                fontWeight: 800,
                textTransform: "uppercase",
                bgcolor: e.status === "graded" ? "#dcfce7" : "#ffedd5",
                color: e.status === "graded" ? "#166534" : "#9a3412",
              }}
            />
            <Stack direction="row" alignItems="baseline" spacing={0.5}>
              <Typography variant="caption" color="text.secondary">SCORE:</Typography>
              <Typography variant="h5" sx={{ fontWeight: 900 }}>
                {e.total_score ?? "-"}
              </Typography>
            </Stack>
          </Stack>
        </Box>
      </Paper>
    </Grid>
  ))}
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
                  ? `Circuit – ${examDialogExam.exam_name}`
                  : "Circuit detail"}
              </DialogTitle>
              <DialogContent dividers sx={{ pt: 1.5 }}>
                {examDialogExam && (
                  <Stack spacing={1.5}>
                    <Stack spacing={0.5}>
                      <Typography variant="body2">
                        <strong>Student:</strong>{" "}
                        {examDialogExam.student_name} (ID{" "}
                        {examDialogExam.student_id})
                      </Typography>
                      {/* ... Status info ... */}
                    </Stack>

                    <Divider />

                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      Stations
                    </Typography>

                    {examDialogLoading ? (
                      <Stack spacing={1}>
                        <LinearProgress />
                      </Stack>
                    ) : examDialogError ? (
                      <Typography color="error">{examDialogError}</Typography>
                    ) : !examDialogStations.length ? (
                      <Typography color="text.secondary">
                        No station attempts found.
                      </Typography>
                    ) : (
                      <Stack spacing={1}>
                        {examDialogStations.map((s, i) => (
                          <Paper 
                            key={`station-${s.id ?? s.station_id ?? i}`}
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
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                Station {s.station_id ?? "—"}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                Status: {s.status ?? "-"} • Points: {s.points ?? "-"}
                              </Typography>
                            </Stack>
                            <Typography variant="caption" color="text.secondary">
                              {s.submitted_at
                                ? new Date(s.submitted_at).toLocaleString()
                                : ""}
                            </Typography>
                          </Paper>
                        ))}
                      </Stack>
                    )}
                  </Stack>
                )}
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setExamDialogOpen(false)}>Close</Button>
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
                    width: "100%",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    mt: 2
                  }}
                >            
                <Grid
                  container
                  spacing={6}
                  justifyContent="center"
                  alignItems="stretch"
                  sx={{
                    width: "100%",
                    maxWidth: 1500,
                    mx: "auto",
                    px: 2
                  }}
                >
              {/* Main board */}
                <Grid item xs={12} lg={7} display= "flex" justifyContent= "center">
                <Paper
                      sx={{
                        width: 900,
                        height: 720,
                        p: 3,
                        borderRadius: 4,
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                        backgroundColor: "#fafafa",
                        position: "relative",   // IMPORTANT
                        overflow: "visible"
                      }}
                    >
                  {/* Header + station switch */}
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                      {/* Nav Buttons */}
                      {/* LEFT ARROW */}
                      <IconButton
                        onClick={goPrev}
                        disabled={!canPrev}
                        sx={{
                          position: "absolute",
                          left: -35,
                          top: "50%",
                          transform: "translateY(-50%)",
                          width: 44,
                          height: 44,
                          borderRadius: "50%",
                          bgcolor: "#ffffff",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                          "&:hover": { bgcolor: "#f3f4f6" },
                          zIndex: 10
                        }}
                      >
                        <ArrowBackIosNewIcon />
                      </IconButton>

                      {/* RIGHT ARROW */}
                      <IconButton
                        onClick={goNext}
                        disabled={!canNext}
                        sx={{
                          position: "absolute",
                          right: -35,
                          top: "50%",
                          transform: "translateY(-50%)",
                          width: 44,
                          height: 44,
                          borderRadius: "50%",
                          bgcolor: "#ffffff",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                          "&:hover": { bgcolor: "#f3f4f6" },
                          zIndex: 10
                        }}
                      >
                        <ArrowForwardIosIcon />
                      </IconButton>

                    <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                      Station {stationNo}
                    </Typography>
                    <Box sx={{ flexGrow: 1 }} />

                    <Button
                      size="small"
                      variant={contentMode === "answer" ? "contained" : "outlined"}
                      onClick={() => setContentMode("answer")}
                    >
                      Answer
                    </Button>
                    <Button
                      size="small"
                      variant={contentMode === "chat" ? "contained" : "outlined"}
                      onClick={() => setContentMode("chat")}
                    >
                      Chat
                    </Button>
                  </Stack>


                  {/* CHAT MESSAGES */}
                  {contentMode === "chat" && (
                  <Paper
                    variant="outlined"
                    sx={{
                      borderRadius: 2,
                      mb: 2,
                      p: 2,
                      maxHeight: "70vh",
                      overflow: "auto",
                      bgcolor: "#f9fafb",
                    }}
                  >
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                      Chat transcript
                    </Typography>

                    {chatLoading ? (
                      <LinearProgress />
                    ) : chatError ? (
                      <Typography color="error">{chatError}</Typography>
                    ) : chatMessages.length === 0 ? (
                      <Typography color="text.secondary">No chat messages.</Typography>
                    ) : (
                      <Stack spacing={1.5}>
                        {chatMessages.map((msg, i) => {
                    const isUser = msg.side === "user";
                    return (
                      <Box
                        key={msg.id ?? i}
                        sx={{
                          display: "flex",
                          justifyContent: isUser ? "flex-end" : "flex-start",
                        }}
                      >
                        <Box
                          sx={{
                            maxWidth: "70%",
                            px: 2,
                            py: 1.5,
                            borderRadius: 2,
                            bgcolor: isUser ? "primary.main" : "#e0e7ff",
                            color: isUser ? "white" : "black",
                            boxShadow: 1,
                          }}
                        >
                          <Typography
                            variant="caption"
                            sx={{ fontWeight: 700, opacity: 0.8 }}
                          >
                            {isUser ? "Student" : "AI"}
                          </Typography>
                          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                            {msg.content}
                          </Typography>
                        </Box>
                      </Box>
                    );
                  })}
                </Stack>
              )}
            </Paper>
          )}

                  {/* STUDENT ANSWERS */}
                  {contentMode === "answer" && (
                    <>
                  <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>
                    Student answers
                  </Typography>
                  
                  {answersLoading ? (
                    <LinearProgress />
                  ) : answersError ? (
                    <Typography color="error">{answersError}</Typography>
                  ) : visibleAnswers.length === 0 ? (
                    <Typography color="text.secondary">No answers found.</Typography>
                  ) : (
                    <Stack spacing={1.5}>
                      {visibleAnswers.map((a, idxA) => {
                    const id = a.id ?? a.answer_id ?? idxA;
                    const answerText =
                      a.value_text ?? (a.choice_index != null ? String(a.choice_index) : "");

                    const marks = answerMarks[id] || {
                      score: 0,
                      comment: "",
                    };

                    return (
                      <Paper
                        key={id}
                        variant="outlined"
                        sx={{
                          p: 2,
                          borderRadius: 2,
                          width: "100%",
                        }}
                      >
                        <Stack spacing={1.5}>

                          {/* Question label */}
                          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                            Question {a.question_id ?? "-"}
                          </Typography>

                          {/* Student Answer */}
                          <Box
                            sx={{
                              width: "100%",
                              px: 2,
                              py: 1.5,
                              borderRadius: 2,
                              bgcolor: "#ede9fe",
                              boxShadow: 1,
                            }}
                          >
                            <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                              {answerText}
                            </Typography>
                          </Box>

                          {/* Score + Comment Row */}
                          <Stack direction="row" spacing={2} alignItems="center">
                            <TextField
                              size="small"
                              label="Comment"
                              fullWidth
                              value={marks.comment}
                              onChange={(e) =>
                                updateAnswerMark(id, {
                                  comment: e.target.value,
                                })
                              }
                            />
                          </Stack>
                        </Stack>
                      </Paper>
                    );
                  })}


                    </Stack>                  
                  )}
                    </>
                  )}
                </Paper>
              </Grid>

              {/* Right panel */}
                <Grid item xs={12} lg={5} sx={{ display: "flex", justifyContent: "center" }}>
                <Paper
                    sx={{
                      width: 420,          
                      height: 720,
                      p: 3,
                      borderRadius: 4,
                      display: "flex", flexDirection: "column", gap: 2,
                    }}
                  >
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Avatar />
                    <Stack>
                      <Typography fontWeight={700}>
                        Student: {studentInfo?.name || "-"}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        ID: {studentInfo?.id || "-"}
                      </Typography>
                    </Stack>
                  </Stack>

                  <Divider />

                  {/* Station attempts list */}
                  <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                    Station attempts
                  </Typography>

                  <Paper variant="outlined" sx={{ borderRadius: 2, maxHeight: 200, overflow: "auto" }}>
                    {attemptsLoading ? (
                        <LinearProgress />
                    ) : visibleAttempts.length === 0 ? (
                        <Typography sx={{p:1}} variant="body2">No attempts.</Typography>
                    ) : (
                      <List dense disablePadding>
                        {visibleAttempts.map((a, i) => (
                          <ListItem 
                            key={`attempt-${a.id ?? a.station_id ?? i}`}
                            button
                            onClick={() => {
                              const num = a.station_id;
                              if (num != null) {
                                // find index of this station in our 'order' array
                                const idxInOrder = order.indexOf(num);
                                if (idxInOrder >= 0) {
                                  setIdx(idxInOrder);
                                }
                              }
                            }}
                            selected={a.station_id === stationNo}
                          >
                            <ListItemText
                              primary={`Station ${a.station_id ?? "—"}`}
                              secondary={`Points: ${a.points ?? 0}`}
                            />
                          </ListItem>
                        ))}
                      </List>
                    )}
                  </Paper>

                  {/* Station rubrics */}
                  <Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 1 }}>
                    Station rubrics
                  </Typography>

                  <Box sx={{ maxHeight: 300, overflow: "auto" }}>
                    {rubrics.map((r) => (
                      <Accordion key={r.key} disableGutters sx={{ mb: 0.5, borderRadius: 1 }}>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                          <Stack direction="row" spacing={1} alignItems="center" sx={{ width: "100%" }}>
                            {r.met ? <CheckCircleOutlineIcon color="success" /> : <RadioButtonUncheckedIcon color="disabled" />}
                            <Typography sx={{ fontWeight: 600, flex: 1 }} noWrap>{r.title}</Typography>
                            <ScoreChip ok={r.met} />
                          </Stack>
                        </AccordionSummary>
                        <AccordionDetails>
  <Stack spacing={1.5}>

    {/* Toggle Met */}
    <Button
      size="small"
      variant={r.met ? "contained" : "outlined"}
      onClick={() => {
        setRubrics(prev =>
          prev.map(item =>
            item.key === r.key
              ? {
                  ...item,
                  met: !item.met,
                  points: !item.met ? item.max_points : 0,
                }
              : item
          )
        );
      }}
      fullWidth
    >
      {r.met ? "Marked as Met" : "Mark as Met"}
    </Button>

    {/* Manual Points */}
    <TextField
      size="small"
      type="number"
      label={`Points (max ${r.max_points})`}
      value={r.points}
      onChange={(e) => {
        const value = Number(e.target.value) || 0;

        setRubrics(prev =>
          prev.map(item =>
            item.key === r.key
              ? {
                  ...item,
                  points:
                    value > item.max_points
                      ? item.max_points
                      : value,
                  met: value > 0,
                }
              : item
          )
        );
      }}
      fullWidth
    />

    {/* Comment */}
    <TextField
      size="small"
      label="Comment"
      multiline
      minRows={2}
      value={r.comment}
      onChange={(e) => {
        const value = e.target.value;
        setRubrics(prev =>
          prev.map(item =>
            item.key === r.key
              ? { ...item, comment: value }
              : item
          )
        );
      }}
      fullWidth
    />

  </Stack>
</AccordionDetails>

                      </Accordion>
                    ))}
                  </Box>

                  {/* Feedback + totals + actions */}
                  <Divider />
                  <TextField
                    multiline minRows={3} fullWidth
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Overall feedback..."
                  />

                  <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography fontWeight={800}>Total Score:</Typography>
                      <Typography fontWeight={800}>{totalScore}/{totalMax || 0}</Typography>
                    </Stack>
                    <LinearProgress variant="determinate" value={totalMax > 0 ? (totalScore / totalMax) * 100 : 0} sx={{ mt: 1 }} />
                  </Paper>

                  <Stack direction="row" spacing={1}>
                    <Button fullWidth variant="outlined" onClick={handleSave}>Save</Button>
                    <Button fullWidth variant="contained" onClick={handlePublish}>Publish</Button>
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
