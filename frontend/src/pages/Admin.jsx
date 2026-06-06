import React, { useEffect, useState } from "react";
import {
  Box, Card, Stack, Typography, Tabs, Tab, Table, TableHead, TableBody, TableRow,
  TableCell, TextField, MenuItem, Switch, IconButton, Button, Chip, CircularProgress,
  Alert, Snackbar, Dialog, DialogTitle, DialogContent, DialogActions, Tooltip,
} from "@mui/material";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import PeopleAltRoundedIcon from "@mui/icons-material/PeopleAltRounded";
import SchoolRoundedIcon from "@mui/icons-material/SchoolRounded";
import MenuBookRoundedIcon from "@mui/icons-material/MenuBookRounded";
import AssignmentTurnedInRoundedIcon from "@mui/icons-material/AssignmentTurnedInRounded";
import { Navigate } from "react-router-dom";
import { apiFetch, getUserId } from "../api";
import { PageHeader, StatCard } from "../component/ui";

const isAdmin = () => {
  try { return (localStorage.getItem("osce-role") || "").toLowerCase() === "admin"; }
  catch { return false; }
};

export default function Admin() {
  const [tab, setTab] = useState(0);
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [confirm, setConfirm] = useState(null); // { kind: 'user'|'test', id, name }

  const myId = getUserId();

  const load = () => {
    setLoading(true);
    Promise.all([
      apiFetch("/api/admin/overview").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      apiFetch("/api/admin/users").then((r) => (r.ok ? r.json() : [])).catch(() => []),
      apiFetch("/api/admin/tests").then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]).then(([o, u, t]) => {
      setOverview(o);
      setUsers(Array.isArray(u) ? u : []);
      setTests(Array.isArray(t) ? t : []);
    }).finally(() => setLoading(false));
  };
  useEffect(() => { if (isAdmin()) load(); }, []);

  if (!isAdmin()) return <Navigate to="/" replace />;

  const patchUser = async (id, body) => {
    try {
      const res = await apiFetch(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Update failed");
      setUsers((us) => us.map((u) => (u.id === id ? { ...u, ...data } : u)));
      setToast("User updated.");
    } catch (e) { setError(e.message); }
  };

  const doDelete = async () => {
    const { kind, id } = confirm;
    try {
      const url = kind === "user" ? `/api/admin/users/${id}` : `/api/tests/${id}`;
      const res = await apiFetch(url, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Delete failed");
      if (kind === "user") setUsers((us) => us.filter((u) => u.id !== id));
      else setTests((ts) => ts.filter((t) => t.id !== id));
      setToast(kind === "user" ? "User deleted." : "Test deleted.");
      setConfirm(null);
    } catch (e) { setError(e.message); setConfirm(null); }
  };

  if (loading) {
    return <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}><CircularProgress /></Box>;
  }

  return (
    <Box>
      <PageHeader title="Admin" subtitle="Manage users, tests and monitor the platform." />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}

      {/* Overview KPIs */}
      {overview && (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4,1fr)" }, gap: 2, mb: 3 }}>
          <StatCard icon={<PeopleAltRoundedIcon />} label="Users" value={overview.users} hint={`${overview.active_users} active`} color="primary.main" />
          <StatCard icon={<SchoolRoundedIcon />} label="Students / Teachers" value={`${overview.students} / ${overview.teachers}`} color="secondary.main" />
          <StatCard icon={<MenuBookRoundedIcon />} label="Tests" value={overview.exams} color="success.main" />
          <StatCard icon={<AssignmentTurnedInRoundedIcon />} label="Attempts" value={overview.attempts} color="warning.main" />
        </Box>
      )}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label={`Users (${users.length})`} />
        <Tab label={`Tests (${tests.length})`} />
      </Tabs>

      {tab === 0 && (
        <Card sx={{ p: 0, overflowX: "auto" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Role</TableCell>
                <TableCell align="center">Active</TableCell>
                <TableCell align="right">Attempts</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((u) => {
                const self = String(u.id) === String(myId);
                return (
                  <TableRow key={u.id} hover>
                    <TableCell>
                      {u.full_name || u.username || "—"}
                      {self && <Chip size="small" label="you" sx={{ ml: 1 }} />}
                    </TableCell>
                    <TableCell sx={{ color: "text.secondary" }}>{u.email}</TableCell>
                    <TableCell>
                      <TextField
                        select size="small" value={u.role} disabled={self}
                        onChange={(e) => patchUser(u.id, { role: e.target.value })}
                        sx={{ minWidth: 110 }}
                      >
                        {["student", "teacher", "admin"].map((r) => (
                          <MenuItem key={r} value={r} sx={{ textTransform: "capitalize" }}>{r}</MenuItem>
                        ))}
                      </TextField>
                    </TableCell>
                    <TableCell align="center">
                      <Switch
                        size="small" checked={u.is_active} disabled={self}
                        onChange={(e) => patchUser(u.id, { is_active: e.target.checked })}
                      />
                    </TableCell>
                    <TableCell align="right">{u.attempts}</TableCell>
                    <TableCell align="right">
                      <Tooltip title={self ? "You can't delete yourself" : "Delete user"}>
                        <span>
                          <IconButton
                            size="small" color="error" disabled={self}
                            onClick={() => setConfirm({ kind: "user", id: u.id, name: u.full_name || u.email })}
                          >
                            <DeleteOutlineRoundedIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {tab === 1 && (
        <Card sx={{ p: 0, overflowX: "auto" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Test</TableCell>
                <TableCell>Skills</TableCell>
                <TableCell>Owner</TableCell>
                <TableCell align="right">Attempts</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {tests.map((t) => (
                <TableRow key={t.id} hover>
                  <TableCell>{t.name}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                      {(t.skills || []).map((s) => <Chip key={s} size="small" label={s} sx={{ textTransform: "capitalize" }} />)}
                    </Stack>
                  </TableCell>
                  <TableCell sx={{ color: "text.secondary" }}>{t.owner}</TableCell>
                  <TableCell align="right">{t.attempts}</TableCell>
                  <TableCell align="right">
                    <Tooltip title="Delete test">
                      <IconButton size="small" color="error" onClick={() => setConfirm({ kind: "test", id: t.id, name: t.name })}>
                        <DeleteOutlineRoundedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={!!confirm} onClose={() => setConfirm(null)} fullWidth maxWidth="xs">
        <DialogTitle>Delete {confirm?.kind}?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            <strong>{confirm?.name}</strong> will be permanently deleted. This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={doDelete}>Delete</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!toast} autoHideDuration={2500} onClose={() => setToast("")} message={toast}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </Box>
  );
}
