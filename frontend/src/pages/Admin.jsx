import React, { useEffect, useState } from "react";
import {
  Box, Card, Stack, Typography, Tabs, Tab, Table, TableHead, TableBody, TableRow,
  TableCell, TextField, MenuItem, Switch, IconButton, Button, Chip, CircularProgress,
  Alert, Snackbar, Dialog, DialogTitle, DialogContent, DialogActions, Tooltip,
  InputAdornment, useTheme, useMediaQuery, Avatar, Divider,
} from "@mui/material";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import PeopleAltRoundedIcon from "@mui/icons-material/PeopleAltRounded";
import SchoolRoundedIcon from "@mui/icons-material/SchoolRounded";
import MenuBookRoundedIcon from "@mui/icons-material/MenuBookRounded";
import AssignmentTurnedInRoundedIcon from "@mui/icons-material/AssignmentTurnedInRounded";
import PersonAddRoundedIcon from "@mui/icons-material/PersonAddRounded";
import LockResetRoundedIcon from "@mui/icons-material/LockResetRounded";
import AdminPanelSettingsRoundedIcon from "@mui/icons-material/AdminPanelSettingsRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import AutorenewRoundedIcon from "@mui/icons-material/AutorenewRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import VisibilityOffRoundedIcon from "@mui/icons-material/VisibilityOffRounded";
import { Navigate } from "react-router-dom";
import { apiFetch, getUserId } from "../api";
import { PageHeader, StatCard } from "../component/ui";

const isAdmin = () => {
  try { return (localStorage.getItem("osce-role") || "").toLowerCase() === "admin"; }
  catch { return false; }
};

const BLANK_CREATE = { full_name: "", email: "", username: "", password: "", role: "teacher" };

const ROLE_COLOR = { admin: "error", teacher: "secondary", student: "primary" };

function userInitials(u) {
  const s = (u.full_name || u.username || u.email || "?").trim();
  return s.charAt(0).toUpperCase();
}

/** Cryptographically-random, readable temporary password (no ambiguous chars). */
function genPassword(len = 14) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const out = [];
  const arr = new Uint32Array(len);
  (window.crypto || window.msCrypto).getRandomValues(arr);
  for (let i = 0; i < len; i++) out.push(chars[arr[i] % chars.length]);
  return out.join("");
}

/** Password input with show/hide, "generate" and "copy" — a QoL helper for admins. */
function PasswordField({ label, value, onChange, helperText, autoFocus }) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (!value) return;
    navigator.clipboard?.writeText(value)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); })
      .catch(() => {});
  };
  return (
    <TextField
      label={label}
      type={show ? "text" : "password"}
      value={value}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      helperText={helperText}
      fullWidth
      InputProps={{
        endAdornment: (
          <InputAdornment position="end">
            <Tooltip title="Generate strong password">
              <IconButton size="small" edge="end" onClick={() => onChange(genPassword())}>
                <AutorenewRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={copied ? "Copied!" : "Copy"}>
              <span>
                <IconButton size="small" onClick={copy} disabled={!value}>
                  <ContentCopyRoundedIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <IconButton size="small" edge="end" onClick={() => setShow((s) => !s)} aria-label="toggle password visibility">
              {show ? <VisibilityOffRoundedIcon fontSize="small" /> : <VisibilityRoundedIcon fontSize="small" />}
            </IconButton>
          </InputAdornment>
        ),
      }}
    />
  );
}

export default function Admin() {
  const theme = useTheme();
  const isMobile = useMediaQuery((t) => t.breakpoints.down("md"));
  const [tab, setTab] = useState(0);
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [confirm, setConfirm] = useState(null); // { kind: 'user'|'test', id, name }
  const [query, setQuery] = useState("");

  // create-user dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(BLANK_CREATE);
  const [createErr, setCreateErr] = useState("");
  const [saving, setSaving] = useState(false);

  // reset-password dialog
  const [pwTarget, setPwTarget] = useState(null); // { id, name }
  const [pwValue, setPwValue] = useState("");
  const [pwErr, setPwErr] = useState("");

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

  const createUser = async () => {
    setCreateErr("");
    const f = createForm;
    if (!f.email.trim() || !f.email.includes("@")) { setCreateErr("A valid email is required."); return; }
    if (f.password.length < 8) { setCreateErr("Password must be at least 8 characters."); return; }
    setSaving(true);
    try {
      const res = await apiFetch("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({
          email: f.email.trim(),
          password: f.password,
          full_name: f.full_name.trim() || null,
          username: f.username.trim() || null,
          role: f.role,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Could not create user.");
      setUsers((us) => [...us, data]);
      setOverview((o) => o && ({ ...o, users: o.users + 1, active_users: o.active_users + 1,
        teachers: o.teachers + (f.role === "teacher" ? 1 : 0),
        students: o.students + (f.role === "student" ? 1 : 0),
        admins: o.admins + (f.role === "admin" ? 1 : 0) }));
      setToast(`${f.role[0].toUpperCase()}${f.role.slice(1)} account created.`);
      setCreateOpen(false);
      setCreateForm(BLANK_CREATE);
    } catch (e) { setCreateErr(e.message); }
    finally { setSaving(false); }
  };

  const resetPassword = async () => {
    setPwErr("");
    if (pwValue.length < 8) { setPwErr("Password must be at least 8 characters."); return; }
    setSaving(true);
    try {
      const res = await apiFetch(`/api/admin/users/${pwTarget.id}/password`, {
        method: "POST",
        body: JSON.stringify({ password: pwValue }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Could not reset password.");
      setToast(`Password reset for ${pwTarget.name}.`);
      setPwTarget(null);
      setPwValue("");
    } catch (e) { setPwErr(e.message); }
    finally { setSaving(false); }
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

  const q = query.trim().toLowerCase();
  const filteredUsers = users.filter((u) =>
    !q || (u.full_name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q)
  );
  const filteredTests = tests.filter((t) =>
    !q || t.name.toLowerCase().includes(q) || (t.owner || "").toLowerCase().includes(q)
  );

  // Shared per-user controls so the desktop table and mobile cards stay in sync.
  const roleSelect = (u, self) => (
    <TextField
      select size="small" value={u.role} disabled={self}
      onChange={(e) => patchUser(u.id, { role: e.target.value })}
      sx={{ minWidth: 110 }}
    >
      {["student", "teacher", "admin"].map((r) => (
        <MenuItem key={r} value={r} sx={{ textTransform: "capitalize" }}>{r}</MenuItem>
      ))}
    </TextField>
  );
  const activeSwitch = (u, self) => (
    <Switch
      size="small" checked={u.is_active} disabled={self}
      onChange={(e) => patchUser(u.id, { is_active: e.target.checked })}
    />
  );
  const userActions = (u, self) => (
    <>
      <Tooltip title="Reset password">
        <IconButton
          size="small"
          onClick={() => { setPwErr(""); setPwValue(""); setPwTarget({ id: u.id, name: u.full_name || u.email }); }}
        >
          <LockResetRoundedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
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
    </>
  );

  return (
    <Box>
      <PageHeader
        eyebrow="Platform"
        title="Admin"
        subtitle="Manage users, tests and monitor the platform."
        icon={<AdminPanelSettingsRoundedIcon />}
        action={
          <Button variant="contained" startIcon={<PersonAddRoundedIcon />} onClick={() => { setCreateErr(""); setCreateForm(BLANK_CREATE); setCreateOpen(true); }}>
            New account
          </Button>
        }
      />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}

      {/* Overview KPIs */}
      {overview && (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4,1fr)" }, gap: 2, mb: 3 }}>
          <StatCard icon={<PeopleAltRoundedIcon />} label="Users" value={overview.users} hint={`${overview.active_users} active`} gradient={theme.gradients.brand} color="primary.main" delay={40} />
          <StatCard icon={<SchoolRoundedIcon />} label="Students / Teachers" value={`${overview.students} / ${overview.teachers}`} gradient={theme.gradients.ocean} color="info.main" delay={120} />
          <StatCard icon={<MenuBookRoundedIcon />} label="Tests" value={overview.exams} gradient={theme.gradients.emerald} color="success.main" delay={200} />
          <StatCard icon={<AssignmentTurnedInRoundedIcon />} label="Attempts" value={overview.attempts} gradient={theme.gradients.sunset} color="warning.main" delay={280} />
        </Box>
      )}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label={`Users (${users.length})`} />
        <Tab label={`Tests (${tests.length})`} />
      </Tabs>

      <TextField
        fullWidth size="small" sx={{ mb: 1 }}
        placeholder={tab === 0 ? "Search users by name or email…" : "Search tests by name or owner…"}
        value={query} onChange={(e) => setQuery(e.target.value)}
        InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment> }}
      />
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
        {tab === 0
          ? `Showing ${filteredUsers.length} of ${users.length} user${users.length === 1 ? "" : "s"}`
          : `Showing ${filteredTests.length} of ${tests.length} test${tests.length === 1 ? "" : "s"}`}
      </Typography>

      {tab === 0 && (
        isMobile ? (
          <Stack spacing={1.5}>
            {filteredUsers.length === 0 && (
              <Card sx={{ p: 3, textAlign: "center" }}>
                <Typography color="text.secondary">{q ? "No users match your search." : "No users yet."}</Typography>
              </Card>
            )}
            {filteredUsers.map((u) => {
              const self = String(u.id) === String(myId);
              return (
                <Card key={u.id} sx={{ p: 2 }}>
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <Avatar sx={{ bgcolor: "primary.main", width: 40, height: 40, fontWeight: 700 }}>{userInitials(u)}</Avatar>
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                      <Stack direction="row" spacing={0.75} alignItems="center">
                        <Typography fontWeight={700} noWrap>{u.full_name || u.username || "—"}</Typography>
                        {self && <Chip size="small" label="you" />}
                      </Stack>
                      <Typography variant="body2" color="text.secondary" noWrap>{u.email}</Typography>
                    </Box>
                  </Stack>
                  <Divider sx={{ my: 1.5 }} />
                  <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap" useFlexGap>
                    {roleSelect(u, self)}
                    <Stack direction="row" alignItems="center" spacing={0.25}>
                      {activeSwitch(u, self)}
                      <Typography variant="body2" color="text.secondary">{u.is_active ? "Active" : "Inactive"}</Typography>
                    </Stack>
                    <Chip size="small" variant="outlined" label={`${u.attempts} attempt${u.attempts === 1 ? "" : "s"}`} />
                    <Box sx={{ flexGrow: 1 }} />
                    {userActions(u, self)}
                  </Stack>
                </Card>
              );
            })}
          </Stack>
        ) : (
          <Card sx={{ p: 0, overflowX: "auto" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell align="center">Active</TableCell>
                  <TableCell align="right">Attempts</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredUsers.map((u) => {
                  const self = String(u.id) === String(myId);
                  return (
                    <TableRow key={u.id} hover>
                      <TableCell>
                        {u.full_name || u.username || "—"}
                        {self && <Chip size="small" label="you" sx={{ ml: 1 }} />}
                      </TableCell>
                      <TableCell sx={{ color: "text.secondary" }}>{u.email}</TableCell>
                      <TableCell>{roleSelect(u, self)}</TableCell>
                      <TableCell align="center">{activeSwitch(u, self)}</TableCell>
                      <TableCell align="right">{u.attempts}</TableCell>
                      <TableCell align="right">{userActions(u, self)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )
      )}

      {tab === 1 && (
        isMobile ? (
          <Stack spacing={1.5}>
            {filteredTests.length === 0 && (
              <Card sx={{ p: 3, textAlign: "center" }}>
                <Typography color="text.secondary">{q ? "No tests match your search." : "No tests yet."}</Typography>
              </Card>
            )}
            {filteredTests.map((t) => (
              <Card key={t.id} sx={{ p: 2 }}>
                <Stack direction="row" alignItems="flex-start" spacing={1}>
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography fontWeight={700}>{t.name}</Typography>
                    <Typography variant="body2" color="text.secondary" noWrap>by {t.owner || "—"}</Typography>
                  </Box>
                  <Tooltip title="Delete test">
                    <IconButton size="small" color="error" onClick={() => setConfirm({ kind: "test", id: t.id, name: t.name })}>
                      <DeleteOutlineRoundedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 1 }} alignItems="center">
                  {(t.skills || []).map((s) => <Chip key={s} size="small" label={s} sx={{ textTransform: "capitalize" }} />)}
                  <Box sx={{ flexGrow: 1 }} />
                  <Chip size="small" variant="outlined" label={`${t.attempts} attempt${t.attempts === 1 ? "" : "s"}`} />
                </Stack>
              </Card>
            ))}
          </Stack>
        ) : (
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
                {filteredTests.map((t) => (
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
        )
      )}

      {/* Create-account dialog */}
      <Dialog open={createOpen} onClose={() => !saving && setCreateOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>New account</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Create a teacher, student or admin account. Teachers can't self-register, so add them here.
          </Typography>
          {createErr && <Alert severity="error" sx={{ mb: 2 }}>{createErr}</Alert>}
          <Stack spacing={2}>
            <TextField label="Full name" value={createForm.full_name} onChange={(e) => setCreateForm((f) => ({ ...f, full_name: e.target.value }))} fullWidth autoFocus />
            <TextField label="Email" type="email" required value={createForm.email} onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))} fullWidth />
            <TextField label="Username (optional)" value={createForm.username} onChange={(e) => setCreateForm((f) => ({ ...f, username: e.target.value }))} fullWidth />
            <PasswordField
              label="Temporary password"
              helperText="At least 8 characters — use the ↻ button for a strong one"
              value={createForm.password}
              onChange={(v) => setCreateForm((f) => ({ ...f, password: v }))}
            />
            <TextField select label="Role" value={createForm.role} onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value }))} fullWidth>
              {["teacher", "student", "admin"].map((r) => (
                <MenuItem key={r} value={r} sx={{ textTransform: "capitalize" }}>{r}</MenuItem>
              ))}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)} disabled={saving}>Cancel</Button>
          <Button variant="contained" onClick={createUser} disabled={saving}>
            {saving ? "Creating…" : "Create account"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reset-password dialog */}
      <Dialog open={!!pwTarget} onClose={() => !saving && setPwTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle>Reset password</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Set a new password for <strong>{pwTarget?.name}</strong>. They can sign in with it immediately.
          </Typography>
          {pwErr && <Alert severity="error" sx={{ mb: 2 }}>{pwErr}</Alert>}
          <PasswordField
            label="New password" autoFocus
            helperText="At least 8 characters — use the ↻ button for a strong one"
            value={pwValue} onChange={setPwValue}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPwTarget(null)} disabled={saving}>Cancel</Button>
          <Button variant="contained" onClick={resetPassword} disabled={saving}>
            {saving ? "Saving…" : "Set password"}
          </Button>
        </DialogActions>
      </Dialog>

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
