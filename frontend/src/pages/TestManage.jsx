import React, { useEffect, useState } from "react";
import {
  Box, Card, Stack, Typography, Button, Chip, IconButton, CircularProgress,
  Alert, Snackbar, Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  Tooltip, InputAdornment, Menu, MenuItem,
} from "@mui/material";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import DriveFileRenameOutlineRoundedIcon from "@mui/icons-material/DriveFileRenameOutlineRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import AddBoxRoundedIcon from "@mui/icons-material/AddBoxRounded";
import ArrowDropDownRoundedIcon from "@mui/icons-material/ArrowDropDownRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import { useNavigate } from "react-router-dom";
import { apiFetch, getUserId } from "../api";
import { PageHeader, SkillChip } from "../component/ui";

// Normalise exams + writing/speaking tasks into one manageable list.
function toItems(exams, writing, speaking) {
  const ex = exams.map((e) => ({
    type: "exam", id: e.id, name: e.name, skills: e.skills || [],
    meta: `${e.total_questions} Q · ${e.time_limit_min} min · ${e.difficulty}`,
  }));
  const wr = writing.map((t) => ({
    type: "writing", id: t.id, name: t.title, skills: ["writing"], raw: t,
    meta: `${t.task_type === "task1" ? "Task 1" : "Task 2"} · ${t.time_limit_min} min`,
  }));
  const sp = speaking.map((t) => ({
    type: "speaking", id: t.id, name: t.title, skills: ["speaking"], raw: t,
    meta: `Part ${t.part}`,
  }));
  return [...ex, ...wr, ...sp];
}

const itemApi = (it) => (it.type === "exam" ? `/api/tests/${it.id}` : `/api/${it.type}/tasks/${it.id}`);

export default function TestManage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(null);
  const [query, setQuery] = useState("");

  const [renameFor, setRenameFor] = useState(null);
  const [renameVal, setRenameVal] = useState("");
  const [deleteFor, setDeleteFor] = useState(null);
  const [createAnchor, setCreateAnchor] = useState(null);   // "Create" menu
  const [sortBy, setSortBy] = useState("default");

  const load = () => {
    setLoading(true);
    Promise.all([
      apiFetch("/api/exams").then((r) => (r.ok ? r.json() : [])).catch(() => []),
      apiFetch("/api/writing/tasks").then((r) => (r.ok ? r.json() : [])).catch(() => []),
      apiFetch("/api/speaking/tasks").then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]).then(([e, w, s]) => {
      setItems(toItems(
        Array.isArray(e) ? e : [],
        Array.isArray(w) ? w : [],
        Array.isArray(s) ? s : [],
      ));
    }).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const doItem = async (it) => {
    if (it.type !== "exam") { navigate(it.type === "writing" ? "/writing" : "/speaking"); return; }
    const userId = parseInt(getUserId(), 10);
    if (!userId) { navigate("/login"); return; }
    setBusy(it.id);
    try {
      const res = await apiFetch("/api/attempts/start", {
        method: "POST", body: JSON.stringify({ exam_id: it.id, user_id: userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to start");
      navigate(`/exam/${data.attempt_id}`, { state: data });
    } catch (e) { setError(e.message); setBusy(null); }
  };

  const editItem = (it) => {
    if (it.type === "exam") navigate(`/create-exam?edit=${it.id}`);
    else navigate(`/task/${it.type}/${it.id}`);
  };

  const submitRename = async () => {
    const name = renameVal.trim();
    if (!name) return;
    const it = renameFor;
    setBusy(it.id);
    try {
      const body = it.type === "exam" ? { name } : { title: name };
      const res = await apiFetch(itemApi(it), { method: "PATCH", body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Rename failed");
      setItems((xs) => xs.map((x) => (x.type === it.type && x.id === it.id ? { ...x, name } : x)));
      setToast("Renamed.");
      setRenameFor(null);
    } catch (e) { setError(e.message); } finally { setBusy(null); }
  };

  const confirmDelete = async () => {
    const it = deleteFor;
    setBusy(it.id);
    try {
      const res = await apiFetch(itemApi(it), { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Delete failed");
      setItems((xs) => xs.filter((x) => !(x.type === it.type && x.id === it.id)));
      setToast("Deleted.");
      setDeleteFor(null);
    } catch (e) { setError(e.message); } finally { setBusy(null); }
  };

  if (loading) {
    return <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}><CircularProgress /></Box>;
  }

  const q = query.trim().toLowerCase();
  const SKILL_RANK = { reading: 0, listening: 1, writing: 2, speaking: 3 };
  const visible = items
    .filter((it) =>
      !q || it.name.toLowerCase().includes(q) || it.skills.some((s) => s.includes(q)) || it.type.includes(q)
    )
    .sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "skill")
        return (SKILL_RANK[a.skills[0]] ?? 9) - (SKILL_RANK[b.skills[0]] ?? 9) || a.name.localeCompare(b.name);
      if (sortBy === "type") return a.type.localeCompare(b.type) || a.name.localeCompare(b.name);
      return 0;
    });

  return (
    <Box>
      <PageHeader
        title="Test Manage"
        subtitle="Edit, rename, delete or take any test — including Writing & Speaking tasks."
        action={
          <>
            <Button
              variant="contained" startIcon={<AddBoxRoundedIcon />} endIcon={<ArrowDropDownRoundedIcon />}
              onClick={(e) => setCreateAnchor(e.currentTarget)}
            >
              Create
            </Button>
            <Menu anchorEl={createAnchor} open={!!createAnchor} onClose={() => setCreateAnchor(null)}>
              <MenuItem onClick={() => { setCreateAnchor(null); navigate("/create-exam?skill=reading"); }}>Reading test</MenuItem>
              <MenuItem onClick={() => { setCreateAnchor(null); navigate("/create-exam?skill=listening"); }}>Listening test</MenuItem>
              <MenuItem onClick={() => { setCreateAnchor(null); navigate("/task/writing/new"); }}>Writing task</MenuItem>
              <MenuItem onClick={() => { setCreateAnchor(null); navigate("/task/speaking/new"); }}>Speaking task</MenuItem>
            </Menu>
          </>
        }
      />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}

      {items.length === 0 ? (
        <Card sx={{ p: 5, textAlign: "center" }}>
          <Typography color="text.secondary" sx={{ mb: 2 }}>No tests yet.</Typography>
          <Button variant="contained" onClick={() => navigate("/create-exam")}>Create your first test</Button>
        </Card>
      ) : (
        <>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 2 }}>
          <TextField
            fullWidth size="small" placeholder="Search by name, skill or type…"
            value={query} onChange={(e) => setQuery(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment> }}
          />
          <TextField select size="small" label="Sort by" value={sortBy} onChange={(e) => setSortBy(e.target.value)} sx={{ minWidth: 160 }}>
            <MenuItem value="default">Default</MenuItem>
            <MenuItem value="name">Name (A–Z)</MenuItem>
            <MenuItem value="skill">Skill</MenuItem>
            <MenuItem value="type">Type</MenuItem>
          </TextField>
        </Stack>
        <Stack spacing={1.5}>
          {visible.map((it) => (
            <Card key={`${it.type}-${it.id}`} sx={{ p: 2 }}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography fontWeight={700} noWrap>{it.name}</Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                    {it.skills.map((s) => <SkillChip key={s} skill={s} />)}
                    {it.type !== "exam" && <Chip size="small" color="default" label="task" />}
                    <Chip size="small" variant="outlined" label={it.meta} />
                  </Stack>
                </Box>
                <Stack direction="row" spacing={0.5}>
                  <Button size="small" variant="contained" startIcon={<PlayArrowRoundedIcon />}
                    disabled={busy === it.id} onClick={() => doItem(it)}>
                    {it.type === "exam" ? "Do it" : "Open"}
                  </Button>
                  <Tooltip title="Edit">
                    <IconButton size="small" onClick={() => editItem(it)}><EditRoundedIcon fontSize="small" /></IconButton>
                  </Tooltip>
                  <Tooltip title="Rename">
                    <IconButton size="small" onClick={() => { setRenameFor(it); setRenameVal(it.name); }}>
                      <DriveFileRenameOutlineRoundedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton size="small" color="error" onClick={() => setDeleteFor(it)}>
                      <DeleteOutlineRoundedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Stack>
            </Card>
          ))}
          {visible.length === 0 && (
            <Typography color="text.secondary" sx={{ p: 2 }}>No matches.</Typography>
          )}
        </Stack>
        </>
      )}

      {/* Rename */}
      <Dialog open={!!renameFor} onClose={() => setRenameFor(null)} fullWidth maxWidth="xs">
        <DialogTitle>Rename</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth label="Name" sx={{ mt: 1 }}
            value={renameVal} onChange={(e) => setRenameVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submitRename(); }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameFor(null)}>Cancel</Button>
          <Button variant="contained" onClick={submitRename} disabled={!renameVal.trim()}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteFor} onClose={() => setDeleteFor(null)} fullWidth maxWidth="xs">
        <DialogTitle>Delete {deleteFor?.type === "exam" ? "test" : "task"}?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            <strong>{deleteFor?.name}</strong> and all of its {deleteFor?.type === "exam" ? "attempts" : "submissions"} will
            be permanently deleted. This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteFor(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={confirmDelete} disabled={busy === deleteFor?.id}>Delete</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!toast} autoHideDuration={2500} onClose={() => setToast("")} message={toast}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }} />
    </Box>
  );
}
