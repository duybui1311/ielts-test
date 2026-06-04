import * as React from "react";
import {
    Box, Paper, List, ListItemButton, ListItemIcon, ListItemText,
    Tooltip, Divider, Avatar, Stack, Typography, alpha,
} from "@mui/material";
import { useNavigate } from "react-router-dom";

import SchoolRoundedIcon         from "@mui/icons-material/SchoolRounded";
import DashboardRoundedIcon      from "@mui/icons-material/DashboardRounded";
import InsightsRoundedIcon       from "@mui/icons-material/InsightsRounded";
import AddBoxRoundedIcon         from "@mui/icons-material/AddBoxRounded";
import EditNoteRoundedIcon       from "@mui/icons-material/EditNoteRounded";
import MicRoundedIcon            from "@mui/icons-material/MicRounded";
import RateReviewRoundedIcon     from "@mui/icons-material/RateReviewRounded";
import StyleRoundedIcon          from "@mui/icons-material/StyleRounded";
import HistoryRoundedIcon        from "@mui/icons-material/HistoryRounded";
import SettingsRoundedIcon       from "@mui/icons-material/SettingsRounded";
import HelpOutlineRoundedIcon    from "@mui/icons-material/HelpOutlineRounded";
import LogoutRoundedIcon         from "@mui/icons-material/LogoutRounded";
import DarkModeRoundedIcon       from "@mui/icons-material/DarkModeRounded";
import LightModeRoundedIcon      from "@mui/icons-material/LightModeRounded";

import { logout } from "../pages/login";
import { useColorMode } from "../theme/ColorModeContext";

export const NAVBAR_WIDTH_COLLAPSED = 72;
export const NAVBAR_WIDTH_EXPANDED  = 220;

const STUDENT_ITEMS = [
    { key: "exams",     label: "My Tests",   icon: <SchoolRoundedIcon />,      path: "/exams" },
    { key: "dashboard", label: "Dashboard",  icon: <DashboardRoundedIcon />,   path: "/dashboard" },
    { key: "writing",   label: "Writing",    icon: <EditNoteRoundedIcon />,    path: "/writing" },
    { key: "speaking",  label: "Speaking",   icon: <MicRoundedIcon />,         path: "/speaking" },
    { key: "flashcard", label: "Flashcards", icon: <StyleRoundedIcon />,       path: "/flashcard" },
    { key: "history",   label: "History",    icon: <HistoryRoundedIcon />,     path: "/history" },
    { key: "settings",  label: "Settings",   icon: <SettingsRoundedIcon />,    path: "/settings" },
    { key: "help",      label: "Help",       icon: <HelpOutlineRoundedIcon />, path: "/help" },
];

const TEACHER_ITEMS = [
    { key: "exams",     label: "My Tests",        icon: <SchoolRoundedIcon />,      path: "/exams" },
    { key: "teacher",   label: "Class Dashboard", icon: <InsightsRoundedIcon />,    path: "/teacher_dashboard" },
    { key: "create",    label: "Create Exam",     icon: <AddBoxRoundedIcon />,      path: "/create-exam" },
    { key: "review",    label: "Review",          icon: <RateReviewRoundedIcon />,  path: "/review" },
    { key: "flashcard", label: "Flashcards",      icon: <StyleRoundedIcon />,       path: "/flashcard" },
    { key: "history",   label: "History",         icon: <HistoryRoundedIcon />,     path: "/history" },
    { key: "settings",  label: "Settings",        icon: <SettingsRoundedIcon />,    path: "/settings" },
    { key: "help",      label: "Help",            icon: <HelpOutlineRoundedIcon />, path: "/help" },
];

export default function Navbar({
    activeKey = "exams",
    onNavigate,
    title = "IELTS Platform",
    logo,
    onWidthChange,
}) {
    const [expanded, setExpanded] = React.useState(false);
    const navigate = useNavigate();
    const { mode, toggle } = useColorMode();

    React.useEffect(() => {
        onWidthChange?.(expanded ? NAVBAR_WIDTH_EXPANDED : NAVBAR_WIDTH_COLLAPSED);
    }, [expanded, onWidthChange]);

    const role = React.useMemo(() => {
        try {
            return (localStorage.getItem("osce-role") || "student").toLowerCase() === "teacher"
                ? "teacher" : "student";
        } catch { return "student"; }
    }, []);

    const userName = React.useMemo(() => {
        try { return localStorage.getItem("osce-name") || ""; } catch { return ""; }
    }, []);

    const NAV_ITEMS = role === "teacher" ? TEACHER_ITEMS : STUDENT_ITEMS;

    const commonItemSx = (theme, selected) => ({
        mb: 0.5,
        mx: 0.5,
        borderRadius: 2,
        color: selected ? theme.palette.primary.main : theme.palette.text.secondary,
        "& .MuiListItemIcon-root": {
            minWidth: 0,
            mr: expanded ? 2 : "auto",
            justifyContent: "center",
            color: "inherit",
        },
        "&.Mui-selected, &.Mui-selected:hover": {
            bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.22 : 0.12),
            color: theme.palette.primary.main,
            fontWeight: 600,
        },
        "&:hover": { bgcolor: selected ? undefined : theme.palette.action.hover },
    });

    return (
        <Box
            onMouseEnter={() => setExpanded(true)}
            onMouseLeave={() => setExpanded(false)}
            component={Paper}
            elevation={0}
            sx={(theme) => ({
                position: "fixed",
                left: 0,
                top: 0,
                height: "100vh",
                width: expanded ? NAVBAR_WIDTH_EXPANDED : NAVBAR_WIDTH_COLLAPSED,
                transition: theme.transitions.create("width"),
                overflow: "hidden",
                bgcolor: theme.palette.background.paper,
                borderRight: `1px solid ${theme.palette.divider}`,
                zIndex: 1200,
                display: "flex",
                flexDirection: "column",
            })}
        >
            {/* Brand */}
            <Stack direction="row" alignItems="center" spacing={1.25} sx={{ p: 2 }}>
                <Avatar
                    src={logo}
                    variant="rounded"
                    sx={{
                        width: 38, height: 38, fontWeight: 800,
                        background: "linear-gradient(135deg, #6366F1 0%, #06B6D4 100%)",
                    }}
                >
                    {!logo && "I"}
                </Avatar>
                {expanded && (
                    <Typography variant="subtitle1" noWrap fontWeight={800}>
                        {title}
                    </Typography>
                )}
            </Stack>

            <Divider />

            {/* Main nav */}
            <List dense sx={{ px: 1, pt: 1, flexGrow: 1 }}>
                {NAV_ITEMS.map((it) => {
                    const selected = it.key === activeKey;
                    return (
                        <Tooltip
                            key={it.key}
                            title={expanded ? "" : it.label}
                            placement="right"
                            arrow={!expanded}
                        >
                            <ListItemButton
                                onClick={() => {
                                    if (it.path) navigate(it.path);
                                    onNavigate?.(it);
                                }}
                                selected={selected}
                                sx={(theme) => commonItemSx(theme, selected)}
                            >
                                <ListItemIcon>{it.icon}</ListItemIcon>
                                {expanded && (
                                    <ListItemText
                                        primary={it.label}
                                        slotProps={{ primary: { noWrap: true, fontWeight: selected ? 600 : 500 } }}
                                    />
                                )}
                            </ListItemButton>
                        </Tooltip>
                    );
                })}
            </List>

            <Divider />

            {/* Theme toggle + user + sign out */}
            <List dense sx={{ px: 1, py: 1 }}>
                <Tooltip
                    title={expanded ? "" : (mode === "dark" ? "Light mode" : "Dark mode")}
                    placement="right"
                    arrow={!expanded}
                >
                    <ListItemButton onClick={toggle} sx={(theme) => commonItemSx(theme, false)}>
                        <ListItemIcon>
                            {mode === "dark" ? <LightModeRoundedIcon /> : <DarkModeRoundedIcon />}
                        </ListItemIcon>
                        {expanded && <ListItemText primary={mode === "dark" ? "Light mode" : "Dark mode"} />}
                    </ListItemButton>
                </Tooltip>

                {expanded && userName && (
                    <Box sx={{ px: 1.5, pt: 1, pb: 0.5 }}>
                        <Typography variant="caption" color="text.secondary" noWrap display="block">
                            Signed in as
                        </Typography>
                        <Typography variant="body2" fontWeight={600} noWrap>
                            {userName}
                        </Typography>
                    </Box>
                )}
                <Tooltip
                    title={expanded ? "" : "Sign out"}
                    placement="right"
                    arrow={!expanded}
                >
                    <ListItemButton
                        onClick={() => {
                            logout();
                            navigate("/login", { replace: true });
                            onNavigate?.({ key: "logout" });
                        }}
                        sx={(theme) => commonItemSx(theme, false)}
                    >
                        <ListItemIcon><LogoutRoundedIcon /></ListItemIcon>
                        {expanded && <ListItemText primary="Sign out" />}
                    </ListItemButton>
                </Tooltip>
            </List>
        </Box>
    );
}
