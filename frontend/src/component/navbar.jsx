import * as React from "react";
import {
    Box, Paper, List, ListItemButton, ListItemIcon, ListItemText,
    Tooltip, Divider, Avatar, Stack, Typography, alpha, Badge,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api";

import SchoolRoundedIcon         from "@mui/icons-material/SchoolRounded";
import DashboardRoundedIcon      from "@mui/icons-material/DashboardRounded";
import InsightsRoundedIcon       from "@mui/icons-material/InsightsRounded";
import AddBoxRoundedIcon         from "@mui/icons-material/AddBoxRounded";
import RateReviewRoundedIcon     from "@mui/icons-material/RateReviewRounded";
import StyleRoundedIcon          from "@mui/icons-material/StyleRounded";
import HistoryRoundedIcon        from "@mui/icons-material/HistoryRounded";
import SettingsRoundedIcon       from "@mui/icons-material/SettingsRounded";
import HelpOutlineRoundedIcon    from "@mui/icons-material/HelpOutlineRounded";
import LogoutRoundedIcon         from "@mui/icons-material/LogoutRounded";
import LibraryBooksRoundedIcon   from "@mui/icons-material/LibraryBooksRounded";
import FitnessCenterRoundedIcon  from "@mui/icons-material/FitnessCenterRounded";
import ReplayRoundedIcon         from "@mui/icons-material/ReplayRounded";
import AutoAwesomeRoundedIcon    from "@mui/icons-material/AutoAwesomeRounded";
import AdminPanelSettingsRoundedIcon from "@mui/icons-material/AdminPanelSettingsRounded";

import { logout } from "../auth";

// Placeholder brand wordmark — change `BRAND` to rebrand the whole app.
const BRAND = "Bandly";

export const NAVBAR_WIDTH_COLLAPSED = 72;
export const NAVBAR_WIDTH_EXPANDED  = 220;

const STUDENT_ITEMS = [
    { key: "exams",     label: "My Tests",        icon: <SchoolRoundedIcon />,        path: "/exams" },
    { key: "dashboard", label: "Dashboard",       icon: <DashboardRoundedIcon />,     path: "/dashboard" },
    { key: "practice",  label: "Practice by Type", icon: <FitnessCenterRoundedIcon />, path: "/practice", ai: true },
    { key: "review",    label: "Review",          icon: <ReplayRoundedIcon />,        path: "/review" },
    { key: "flashcard", label: "Flashcards",      icon: <StyleRoundedIcon />,         path: "/flashcard" },
    { key: "history",   label: "History",         icon: <HistoryRoundedIcon />,       path: "/history" },
    { key: "settings",  label: "Settings",        icon: <SettingsRoundedIcon />,      path: "/settings" },
    { key: "help",      label: "Help",            icon: <HelpOutlineRoundedIcon />,   path: "/help" },
];

const TEACHER_ITEMS = [
    { key: "manage",    label: "Test Manage",     icon: <LibraryBooksRoundedIcon />, path: "/manage-tests" },
    { key: "teacher",   label: "Class Dashboard", icon: <InsightsRoundedIcon />,    path: "/teacher_dashboard" },
    { key: "create",    label: "Create Exam",     icon: <AddBoxRoundedIcon />,      path: "/create-exam" },
    { key: "review",    label: "Review",          icon: <RateReviewRoundedIcon />,  path: "/review" },
    { key: "flashcard", label: "Flashcards",      icon: <StyleRoundedIcon />,       path: "/flashcard" },
    { key: "history",   label: "History",         icon: <HistoryRoundedIcon />,     path: "/history" },
    { key: "settings",  label: "Settings",        icon: <SettingsRoundedIcon />,    path: "/settings" },
    { key: "help",      label: "Help",            icon: <HelpOutlineRoundedIcon />, path: "/help" },
];

const ADMIN_ITEMS = [
    { key: "admin",     label: "Admin",       icon: <AdminPanelSettingsRoundedIcon />, path: "/admin" },
    { key: "manage",    label: "Test Manage", icon: <LibraryBooksRoundedIcon />,       path: "/manage-tests" },
    { key: "create",    label: "Create Exam", icon: <AddBoxRoundedIcon />,             path: "/create-exam" },
    { key: "review",    label: "Review",      icon: <RateReviewRoundedIcon />,         path: "/review" },
    { key: "settings",  label: "Settings",    icon: <SettingsRoundedIcon />,           path: "/settings" },
    { key: "help",      label: "Help",        icon: <HelpOutlineRoundedIcon />,        path: "/help" },
];

const ITEMS_BY_ROLE = { student: STUDENT_ITEMS, teacher: TEACHER_ITEMS, admin: ADMIN_ITEMS };

export default function Navbar({
    activeKey = "exams",
    onNavigate,
    title = "IELTS Platform",
    logo,
    onWidthChange,
}) {
    const [expanded, setExpanded] = React.useState(false);
    const navigate = useNavigate();

    React.useEffect(() => {
        onWidthChange?.(expanded ? NAVBAR_WIDTH_EXPANDED : NAVBAR_WIDTH_COLLAPSED);
    }, [expanded, onWidthChange]);

    const role = React.useMemo(() => {
        try {
            const r = (localStorage.getItem("osce-role") || "student").toLowerCase();
            return ["student", "teacher", "admin"].includes(r) ? r : "student";
        } catch { return "student"; }
    }, []);

    // "Review" badge: teachers/admins see the pending grading count; students
    // see how many spaced-review questions are due today.
    const [reviewCount, setReviewCount] = React.useState(0);
    React.useEffect(() => {
        const isTeacher = role === "teacher" || role === "admin";
        const url = isTeacher ? "/api/review/count" : "/api/review/due_count";
        const key = isTeacher ? "pending" : "due";
        apiFetch(url)
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => { if (d) setReviewCount(d[key] || 0); })
            .catch(() => {});
    }, [role]);

    const NAV_ITEMS = ITEMS_BY_ROLE[role] || STUDENT_ITEMS;

    const itemIcon = (it) =>
        it.key === "review" && reviewCount > 0
            ? <Badge badgeContent={reviewCount} color="error">{it.icon}</Badge>
            : it.icon;

    const commonItemSx = (theme, selected) => ({
        position: "relative",
        mb: 0.5,
        mx: 0.5,
        borderRadius: 2,
        color: selected ? theme.palette.primary.main : theme.palette.text.secondary,
        transition: "background-color .2s ease, color .2s ease, transform .12s ease",
        "& .MuiListItemIcon-root": {
            minWidth: 0,
            mr: expanded ? 2 : "auto",
            justifyContent: "center",
            color: "inherit",
        },
        // gradient accent bar on the active item
        ...(selected && {
            "&::before": {
                content: '""',
                position: "absolute",
                left: 0,
                top: "50%",
                transform: "translateY(-50%)",
                width: 3,
                height: 22,
                borderRadius: 3,
                background: theme.gradients.brand,
            },
        }),
        "&.Mui-selected, &.Mui-selected:hover": {
            bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.22 : 0.1),
            color: theme.palette.primary.main,
            fontWeight: 600,
        },
        "&:hover": {
            bgcolor: selected ? undefined : theme.palette.action.hover,
            transform: "translateX(2px)",
        },
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
            {/* Brand wordmark */}
            <Stack direction="row" alignItems="center" spacing={1.25} sx={{ p: 2, height: 64 }}>
                <Avatar
                    src={logo}
                    variant="rounded"
                    sx={{
                        width: 38, height: 38, fontWeight: 800, fontSize: 20, flexShrink: 0,
                        background: "linear-gradient(135deg, #4F46E5 0%, #8B5CF6 100%)",
                        boxShadow: "0 6px 16px rgba(79,70,229,0.35)",
                    }}
                >
                    {!logo && BRAND[0]}
                </Avatar>
                {expanded && (
                    <Box sx={{ minWidth: 0 }}>
                        <Typography
                            variant="subtitle1"
                            noWrap
                            sx={{
                                fontWeight: 800,
                                lineHeight: 1.1,
                                background: "linear-gradient(135deg, #4F46E5 0%, #8B5CF6 100%)",
                                WebkitBackgroundClip: "text",
                                WebkitTextFillColor: "transparent",
                            }}
                        >
                            {BRAND}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ letterSpacing: "0.06em" }}>
                            IELTS PLATFORM
                        </Typography>
                    </Box>
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
                                <ListItemIcon>{itemIcon(it)}</ListItemIcon>
                                {expanded && (
                                    <ListItemText
                                        primary={it.label}
                                        slotProps={{ primary: { noWrap: true, fontWeight: selected ? 600 : 500 } }}
                                    />
                                )}
                                {expanded && it.ai && (
                                    <AutoAwesomeRoundedIcon sx={{ fontSize: 15, color: "secondary.main", ml: 0.5 }} />
                                )}
                            </ListItemButton>
                        </Tooltip>
                    );
                })}
            </List>

            <Divider />

            {/* AI tagline + sign out */}
            <List dense sx={{ px: 1, py: 1 }}>
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

                {expanded && (
                    <Stack
                        direction="row"
                        spacing={0.75}
                        alignItems="center"
                        sx={{ px: 1.5, pt: 1.5, pb: 0.5 }}
                    >
                        <AutoAwesomeRoundedIcon sx={{ fontSize: 15, color: "secondary.main" }} />
                        <Typography variant="caption" color="text.secondary" noWrap>
                            Powered by AI · All 4 Skills
                        </Typography>
                    </Stack>
                )}
            </List>
        </Box>
    );
}
