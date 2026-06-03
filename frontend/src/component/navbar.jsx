import * as React from "react";
import {
    Box, Paper, List, ListItemButton, ListItemIcon, ListItemText,
    Tooltip, Divider, Avatar, Stack, Typography,
} from "@mui/material";
import { useNavigate } from "react-router-dom";

import DashboardRoundedIcon       from "@mui/icons-material/DashboardRounded";
import ChecklistRoundedIcon       from "@mui/icons-material/ChecklistRounded";
import CalendarTodayIcon          from "@mui/icons-material/CalendarToday";
import HistoryRoundedIcon         from "@mui/icons-material/HistoryRounded";
import SettingsRoundedIcon        from "@mui/icons-material/SettingsRounded";
import HelpOutlineRoundedIcon     from "@mui/icons-material/HelpOutlineRounded";
import LogoutRoundedIcon          from "@mui/icons-material/LogoutRounded";
import AssignmentTurnedInRounded  from "@mui/icons-material/AssignmentTurnedInRounded";
import SchoolRoundedIcon          from "@mui/icons-material/SchoolRounded";

import { logout } from "../pages/login";

export const NAVBAR_WIDTH_COLLAPSED = 72;
export const NAVBAR_WIDTH_EXPANDED  = 220;

const ITEMS = [
    { key: "exams",     label: "My Tests",       icon: <SchoolRoundedIcon />,        path: "/exams" },
    { key: "dashboard", label: "Dashboard",      icon: <DashboardRoundedIcon />,     path: "/dashboard" },
    { key: "stations",  label: "Stations",       icon: <ChecklistRoundedIcon />,     path: "/stations" },
    { key: "flash",     label: "Flash cards",    icon: <CalendarTodayIcon />,        path: "/flashcard" },
    { key: "history",   label: "History",        icon: <HistoryRoundedIcon />,       path: "/history" },
    { key: "settings",  label: "Settings",       icon: <SettingsRoundedIcon />,      path: "/settings" },
    { key: "help",      label: "Help",           icon: <HelpOutlineRoundedIcon />,   path: "/help" },
];

const TEACHER_ITEM = {
    key: "marking",
    label: "Grading exam",
    icon: <AssignmentTurnedInRounded />,
    path: "/marking",
};

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
            const raw = (localStorage.getItem("osce-role") || "student").toLowerCase();
            return raw === "teacher" ? "teacher" : "student";
        } catch { return "student"; }
    }, []);

    const userName = React.useMemo(() => {
        try { return localStorage.getItem("osce-name") || ""; } catch { return ""; }
    }, []);

    const NAV_ITEMS = React.useMemo(() => {
        if (role !== "teacher") return ITEMS;
        const idx = ITEMS.findIndex((i) => i.key === "stations");
        const arr = [...ITEMS];
        arr.splice((idx >= 0 ? idx : 0) + 1, 0, TEACHER_ITEM);
        return arr;
    }, [role]);

    const commonItemSx = (theme, selected) => ({
        mb: 0.5,
        mx: 0.5,
        borderRadius: 2,
        "& .MuiListItemIcon-root": {
            minWidth: 0,
            mr: expanded ? 2 : "auto",
            justifyContent: "center",
            color: selected
                ? theme.palette.primary.contrastText
                : theme.palette.text.secondary,
        },
        "&.Mui-selected": {
            bgcolor: "primary.main",
            color: "primary.contrastText",
            "&:hover": { bgcolor: "primary.main" },
        },
        "&:hover": { bgcolor: selected ? "primary.main" : "action.hover" },
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
                <Avatar src={logo} sx={{ width: 36, height: 36, bgcolor: "primary.main" }}>
                    {!logo && "I"}
                </Avatar>
                {expanded && (
                    <Typography variant="subtitle2" noWrap fontWeight={700}>
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
                                        slotProps={{ primary: { noWrap: true } }}
                                    />
                                )}
                            </ListItemButton>
                        </Tooltip>
                    );
                })}
            </List>

            <Divider />

            {/* User name + sign out */}
            <List dense sx={{ px: 1, py: 1 }}>
                {expanded && userName && (
                    <Box sx={{ px: 1.5, pt: 0.5, pb: 1 }}>
                        <Typography
                            variant="caption"
                            color="text.secondary"
                            noWrap
                            display="block"
                        >
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
