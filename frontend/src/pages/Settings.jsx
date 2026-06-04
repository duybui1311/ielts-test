import React from "react";
import {
  Box, Card, Stack, Typography, Avatar, Chip, Divider, Switch,
  Button, FormControlLabel,
} from "@mui/material";
import DarkModeRoundedIcon from "@mui/icons-material/DarkModeRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../component/ui";
import { useColorMode } from "../theme/ColorModeContext";
import { logout } from "./login";

function readLS(key) {
  try { return localStorage.getItem(key) || ""; } catch { return ""; }
}

export default function Settings() {
  const navigate = useNavigate();
  const { mode, toggle } = useColorMode();

  const name = readLS("osce-name") || "Your account";
  const email = readLS("osce-email");
  const role = (readLS("osce-role") || "student").toLowerCase();
  const initial = (name || "?").trim().charAt(0).toUpperCase();

  return (
    <Box sx={{ maxWidth: 720 }}>
      <PageHeader title="Settings" subtitle="Manage your profile and appearance." />

      {/* Profile */}
      <Card sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" sx={{ mb: 2 }}>Profile</Typography>
        <Stack direction="row" spacing={2} alignItems="center">
          <Avatar sx={{ width: 56, height: 56, fontWeight: 800, bgcolor: "primary.main" }}>
            {initial}
          </Avatar>
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="h6" noWrap>{name}</Typography>
            {email && (
              <Typography variant="body2" color="text.secondary" noWrap>{email}</Typography>
            )}
          </Box>
          <Chip label={role} color={role === "teacher" ? "secondary" : "primary"} sx={{ textTransform: "capitalize" }} />
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
          onClick={() => {
            logout();
            navigate("/login", { replace: true });
          }}
        >
          Sign out
        </Button>
      </Card>
    </Box>
  );
}
