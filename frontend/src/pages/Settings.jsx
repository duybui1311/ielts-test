import React from "react";
import {
  Box, Card, Stack, Typography, Avatar, Chip, Divider, Switch,
  Button, FormControlLabel, TextField, Alert, Snackbar,
} from "@mui/material";
import DarkModeRoundedIcon from "@mui/icons-material/DarkModeRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import ManageAccountsRoundedIcon from "@mui/icons-material/ManageAccountsRounded";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../component/ui";
import { useColorMode } from "../theme/ColorModeContext";
import { logout } from "../auth";
import { apiFetch } from "../api";

function readLS(key) {
  try { return localStorage.getItem(key) || ""; } catch { return ""; }
}

export default function Settings() {
  const navigate = useNavigate();
  const { mode, toggle } = useColorMode();

  const [name, setName] = React.useState(readLS("osce-name") || "");
  const [savingName, setSavingName] = React.useState(false);
  const [toast, setToast] = React.useState("");
  const [profileError, setProfileError] = React.useState("");

  const [curPw, setCurPw] = React.useState("");
  const [newPw, setNewPw] = React.useState("");
  const [confirmPw, setConfirmPw] = React.useState("");
  const [savingPw, setSavingPw] = React.useState(false);
  const [pwError, setPwError] = React.useState("");

  const email = readLS("osce-email");
  const role = (readLS("osce-role") || "student").toLowerCase();
  const initial = (name || "?").trim().charAt(0).toUpperCase();

  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setProfileError("Name cannot be empty."); return; }
    setSavingName(true);
    setProfileError("");
    try {
      const res = await apiFetch("/api/me", { method: "PATCH", body: JSON.stringify({ full_name: trimmed }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Could not save.");
      try { localStorage.setItem("osce-name", data.full_name || trimmed); } catch { /* ignore */ }
      setToast("Profile updated.");
    } catch (e) {
      setProfileError(e.message);
    } finally {
      setSavingName(false);
    }
  };

  const savePassword = async () => {
    setPwError("");
    if (!newPw.trim()) { setPwError("New password is required."); return; }
    if (newPw.length < 8) { setPwError("New password must be at least 8 characters."); return; }
    if (newPw !== confirmPw) { setPwError("New passwords don't match."); return; }
    setSavingPw(true);
    try {
      const res = await apiFetch("/api/me/password", {
        method: "POST",
        body: JSON.stringify({ current_password: curPw, new_password: newPw }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Could not change password.");
      setCurPw(""); setNewPw(""); setConfirmPw("");
      setToast("Password changed.");
    } catch (e) {
      setPwError(e.message);
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 720 }}>
      <PageHeader eyebrow="Account" title="Settings" subtitle="Manage your profile, security and appearance." icon={<ManageAccountsRoundedIcon />} />

      {/* Profile */}
      <Card sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" sx={{ mb: 2 }}>Profile</Typography>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
          <Avatar sx={{ width: 56, height: 56, fontWeight: 800, bgcolor: "primary.main" }}>{initial}</Avatar>
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            {email && <Typography variant="body2" color="text.secondary" noWrap>{email}</Typography>}
          </Box>
          <Chip
            label={role}
            color={role === "admin" ? "error" : role === "teacher" ? "secondary" : "primary"}
            sx={{ textTransform: "capitalize" }}
          />
        </Stack>
        {profileError && <Alert severity="error" sx={{ mb: 2 }}>{profileError}</Alert>}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}>
          <TextField label="Full name" value={name} onChange={(e) => setName(e.target.value)} fullWidth size="small" />
          <Button variant="contained" onClick={saveName} disabled={savingName} sx={{ flexShrink: 0 }}>
            {savingName ? "Saving…" : "Save"}
          </Button>
        </Stack>
      </Card>

      {/* Security */}
      <Card sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" sx={{ mb: 2 }}>Change password</Typography>
        {pwError && <Alert severity="error" sx={{ mb: 2 }}>{pwError}</Alert>}
        <Stack spacing={2} sx={{ maxWidth: 360 }}>
          <TextField label="Current password" type="password" size="small" value={curPw} onChange={(e) => setCurPw(e.target.value)} />
          <TextField label="New password" type="password" size="small" value={newPw} onChange={(e) => setNewPw(e.target.value)} helperText="At least 8 characters" />
          <TextField label="Confirm new password" type="password" size="small" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
          <Box>
            <Button variant="outlined" onClick={savePassword} disabled={savingPw || !curPw || !newPw}>
              {savingPw ? "Saving…" : "Update password"}
            </Button>
          </Box>
        </Stack>
      </Card>

      {/* Appearance */}
      <Card sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>Appearance</Typography>
        <FormControlLabel
          control={<Switch checked={mode === "dark"} onChange={toggle} />}
          label={
            <Stack direction="row" spacing={1} alignItems="center">
              <DarkModeRoundedIcon fontSize="small" />
              <span>Dark mode</span>
            </Stack>
          }
        />
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
          Your choice is saved on this device.
        </Typography>
      </Card>

      {/* Account */}
      <Card sx={{ p: 3 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>Account</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Signing out clears your session on this device.
        </Typography>
        <Divider sx={{ mb: 2 }} />
        <Button
          variant="outlined"
          color="error"
          startIcon={<LogoutRoundedIcon />}
          onClick={() => { logout(); navigate("/login", { replace: true }); }}
        >
          Sign out
        </Button>
      </Card>

      <Snackbar
        open={!!toast} autoHideDuration={2500} onClose={() => setToast("")} message={toast}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </Box>
  );
}
