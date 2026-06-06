import React, { useEffect, useState } from "react";
import {
  Box, Card, Stack, Typography, Button, Chip, IconButton, CircularProgress,
  Alert, Snackbar, Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  Tooltip,
} from "@mui/material";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import DriveFileRenameOutlineRoundedIcon from "@mui/icons-material/DriveFileRenameOutlineRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import AddBoxRoundedIcon from "@mui/icons-material/AddBoxRounded";
import { useNavigate } from "react-router-dom";
import { apiFetch, getUserId } from "../api";
import { PageHeader, SkillChip } from "../component/ui";

export default function TestManage() {
  const navigate = useNavigate();
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(null);          // exam id with an action in flight

  const [renameFor, setRenameFor] = useState(null); // exam being renamed
  const [renameVal, setRenameVal] = useState("");
  const [deleteFor, setDeleteFor] = useState(null); // exam being deleted

  const load = () => {
    setLoading(true);
    apiFetch("/api/exams")
      .then((r) => r.json())
      .then((d) => setExams(Array.isArray(d) ? d : []))
      .catch(() => setError("Could not load tests."))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const doTest = async (examId) => {
    const userId = parseInt(getUserId(), 10);
    if (!userId) { navigate("/login"); return; }
    setBusy(examId);
    try {
      const res = await apiFetch("/api/attempts/start", {
        method: "POST",
        body: JSON.stringify({ exam_id: examId, user_id: userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to start");
      navigate(`/exam/${data.attempt_id}`, { state: data });
    } catch (e) {
      setError(e.message);
      setBusy(null);
    }
  };

  const submitRename = async () => {
    const name = renameVal.trim();
    if (!name) return;
    const id = renameFor.id;
    setBusy(id);
    try {
      const res = await apiFetch(`/api/tests/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Rename failed");
      setExams((xs) => xs.map((e) => (e.id === id ? { ...e, name } : e)));
      setToast("Test renamed.");
      setRenameFor(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const confirmDelete = async () => {
    const id = deleteFor.id;
    setBusy(id);
    try {
      const res = await apiFetch(`/api/tests/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Delete failed");
      setExams((xs) => xs.filter((e) => e.id !== id));
      setToast("Test deleted.");
      setDeleteFor(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}><CircularProgress /></Box>;
  }

  return (
    <Box>
      <PageHeader
        title="Test Manage"
        subtitle="Edit, rename, delete or take any test."
        action={
          <Button variant="contained" startIcon={<AddBoxRoundedIcon />} onClick={() => navigate("/create-exam")}>
            Create Exam
          </Button>
        }
      />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}

      {exams.length === 0 ? (
        <Card sx={{ p: 5, textAlign: "center" }}>
          <Typography color="text.secondary" sx={{ mb: 2 }}>No tests yet.</Typography>
          <Button variant="contained" onClick={() => navigate("/create-exam")}>Create your first test</Button>
        </Card>
      ) : (
        <Stack spacing={1.5}>
          {exams.map((exam) => (
            <Card key={exam.id} sx={{ p: 2 }}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography fontWeight={700} noWrap>{exam.name}</Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                    {(exam.skills || []).map((s) => <SkillChip key={s} skill={s} />)}
                    <Chip size="small" variant="outlined" label={`${exam.total_questions} Q`} />
                    <Chip size="small" variant="outlined" label={`${exam.time_limit_min} min`} />
                    <Chip size="small" variant="outlined" sx={{ textTransform: "capitalize" }} label={exam.difficulty} />
                  </Stack>
                </Box>
                <Stack direction="row" spacing={0.5}>
                  <Button
                    size="small" variant="contained" startIcon={<PlayArrowRoundedIcon />}
                    disabled={busy === exam.id} onClick={() => doTest(exam.id)}
                  >
                    Do it
                  </Button>
                  <Tooltip title="Edit content">
                    <IconButton size="small" onClick={() => navigate(`/create-exam?edit=${exam.id}`)}>
                      <EditRoundedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Rename">
                    <IconButton size="small" onClick={() => { setRenameFor(exam); setRenameVal(exam.name); }}>
                      <DriveFileRenameOutlineRoundedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton size="small" color="error" onClick={() => setDeleteFor(exam)}>
                      <DeleteOutlineRoundedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Stack>
            </Card>
          ))}
        </Stack>
      )}

      {/* Rename dialog */}
      <Dialog open={!!renameFor} onClose={() => setRenameFor(null)} fullWidth maxWidth="xs">
        <DialogTitle>Rename test</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus fullWidth label="Test name" sx={{ mt: 1 }}
            value={renameVal} onChange={(e) => setRenameVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submitRename(); }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameFor(null)}>Cancel</Button>
          <Button variant="contained" onClick={submitRename} disabled={!renameVal.trim()}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteFor} onClose={() => setDeleteFor(null)} fullWidth maxWidth="xs">
        <DialogTitle>Delete test?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            <strong>{deleteFor?.name}</strong> and all of its student attempts will be permanently deleted.
            This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteFor(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={confirmDelete} disabled={busy === deleteFor?.id}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!toast} autoHideDuration={2500} onClose={() => setToast("")} message={toast}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </Box>
  );
}
