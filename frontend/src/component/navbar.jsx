import * as React from "react";
import {
    Box, Paper, List, ListItemButton, ListItemIcon, ListItemText,
    Tooltip, Divider, Avatar, Stack, Typography, alpha, Badge, Drawer, useMediaQuery,
    ButtonBase,
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
import MoreHorizRoundedIcon         from "@mui/icons-material/MoreHorizRounded";

import { logout } from "../auth";

// Placeholder brand wordmark — change `BRAND` to rebrand the whole app.
const BRAND = "Bandly";

export const NAVBAR_WIDTH_COLLAPSED = 72;
export const NAVBAR_WIDTH_EXPANDED  = 220;

const STUDENT_ITEMS = [
    { key: "exams",     label: "My Tests",        short: "Tests",    icon: <SchoolRoundedIcon />,        path: "/exams" },
    { key: "dashboard", label: "Dashboard",       short: "Home",     icon: <DashboardRoundedIcon />,     path: "/dashboard" },
    { key: "practice",  label: "Practice by Type", short: "Practice", icon: <FitnessCenterRoundedIcon />, path: "/practice", ai: true },
    { key: "review",    label: "Review",          short: "Review",   icon: <ReplayRoundedIcon />,        path: "/review" },
    { key: "flashcard", label: "Flashcards",      icon: <StyleRoundedIcon />,         path: "/flashcard" },
    { key: "history",   label: "History",         icon: <HistoryRoundedIcon />,       path: "/history" },
    { key: "settings",  label: "Settings",        icon: <SettingsRoundedIcon />,      path: "/settings" },
    { key: "help",      label: "Help",            icon: <HelpOutlineRoundedIcon />,   path: "/help" },
];

const TEACHER_ITEMS = [
    { key: "manage",    label: "Test Manage",     short: "Manage",  icon: <LibraryBooksRoundedIcon />, path: "/manage-tests" },
    { key: "teacher",   label: "Class Dashboard", short: "Class",   icon: <InsightsRoundedIcon />,    path: "/teacher_dashboard" },
    { key: "create",    label: "Create Exam",     short: "Create",  icon: <AddBoxRoundedIcon />,      path: "/create-exam" },
    { key: "review",    label: "Review",          short: "Review",  icon: <RateReviewRoundedIcon />,  path: "/review" },
    { key: "flashcard", label: "Flashcards",      icon: <StyleRoundedIcon />,       path: "/flashcard" },
    { key: "history",   label: "History",         icon: <HistoryRoundedIcon />,     path: "/history" },
    { key: "settings",  label: "Settings",        icon: <SettingsRoundedIcon />,    path: "/settings" },
    { key: "help",      label: "Help",            icon: <HelpOutlineRoundedIcon />, path: "/help" },
];

const ADMIN_ITEMS = [
    { key: "admin",     label: "Admin",       short: "Admin",  icon: <AdminPanelSettingsRoundedIcon />, path: "/admin" },
    { key: "manage",    label: "Test Manage", short: "Manage", icon: <LibraryBooksRoundedIcon />,       path: "/manage-tests" },
    { key: "create",    label: "Create Exam", short: "Create", icon: <AddBoxRoundedIcon />,             path: "/create-exam" },
    { key: "review",    label: "Review",      short: "Review", icon: <RateReviewRoundedIcon />,         path: "/review" },
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
    mobileOpen = false,
    onMobileClose,
    onMobileOpen,
}) {
    const [expanded, setExpanded] = React.useState(false);
    const navigate = useNavigate();

    // Desktop (lg+) gets the fixed hover-expand rail; phones and tablets share a
    // single slide-in drawer so they work the same on touch (no hover needed).
    const isDesktop = useMediaQuery((theme) => theme.breakpoints.up("lg"), { noSsr: true });

    React.useEffect(() => {
        // On the drawer layout the nav overlays content, so it claims no width.
        onWidthChange?.(isDesktop ? (expanded ? NAVBAR_WIDTH_EXPANDED : NAVBAR_WIDTH_COLLAPSED) : 0);
    }, [expanded, isDesktop, onWidthChange]);

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

    const commonItemSx = (theme, selected, showLabels) => ({
        position: "relative",
        mb: 0.5,
        mx: 0.5,
        borderRadius: 2,
        color: selected ? theme.palette.primary.main : theme.palette.text.secondary,
        transition: "background-color .2s ease, color .2s ease, transform .12s ease",
        "& .MuiListItemIcon-root": {
            minWidth: 0,
            mr: showLabels ? 2 : "auto",
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

    // Shared inner content. `showLabels` forces full labels (drawer) regardless
    // of hover; on the collapsed desktop rail it's driven by `expanded`.
    const renderContent = (showLabels) => (
        <>
            {/* Brand wordmark */}
            <Stack direction="row" alignItems="center" spacing={1.25} sx={{ p: 2, height: 64 }}>
                <Avatar
                    src={logo}
                    variant="rounded"
                    sx={{
                        width: 38, height: 38, fontWeight: 800, fontSize: 20, flexShrink: 0,
                        background: "linear-gradient(135deg, #0046FF 0%, #73C8D2 100%)",
                        boxShadow: "0 6px 16px rgba(0,70,255,0.30)",
                    }}
                >
                    {!logo && BRAND[0]}
                </Avatar>
                {showLabels && (
                    <Box sx={{ minWidth: 0 }}>
                        <Typography
                            variant="subtitle1"
                            noWrap
                            sx={{
                                fontWeight: 800,
                                lineHeight: 1.1,
                                background: "linear-gradient(135deg, #0046FF 0%, #2BA8B5 100%)",
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
                            title={showLabels ? "" : it.label}
                            placement="right"
                            arrow={!showLabels}
                        >
                            <ListItemButton
                                onClick={() => {
                                    if (it.path) navigate(it.path);
                                    onNavigate?.(it);
                                    onMobileClose?.();
                                }}
                                selected={selected}
                                sx={(theme) => commonItemSx(theme, selected, showLabels)}
                            >
                                <ListItemIcon>{itemIcon(it)}</ListItemIcon>
                                {showLabels && (
                                    <ListItemText
                                        primary={it.label}
                                        slotProps={{ primary: { noWrap: true, fontWeight: selected ? 600 : 500 } }}
                                    />
                                )}
                                {showLabels && it.ai && (
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
                    title={showLabels ? "" : "Sign out"}
                    placement="right"
                    arrow={!showLabels}
                >
                    <ListItemButton
                        onClick={() => {
                            logout();
                            navigate("/login", { replace: true });
                            onNavigate?.({ key: "logout" });
                            onMobileClose?.();
                        }}
                        sx={(theme) => commonItemSx(theme, false, showLabels)}
                    >
                        <ListItemIcon><LogoutRoundedIcon /></ListItemIcon>
                        {showLabels && <ListItemText primary="Sign out" />}
                    </ListItemButton>
                </Tooltip>

                {showLabels && (
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
        </>
    );

    // Phone / tablet: a thumb-reachable bottom dock for the primary destinations
    // (+ "More" → the full drawer that slides in over the content).
    if (!isDesktop) {
        const primary = NAV_ITEMS.slice(0, 4);
        const primaryKeys = primary.map((it) => it.key);
        const moreActive = !primaryKeys.includes(activeKey);

        const DockItem = ({ icon, label, active, onClick }) => (
            <ButtonBase
                onClick={onClick}
                aria-label={label}
                sx={(theme) => ({
                    flex: 1,
                    minWidth: 0,
                    py: 0.75,
                    flexDirection: "column",
                    gap: 0.25,
                    position: "relative",
                    color: active ? theme.palette.primary.main : theme.palette.text.secondary,
                    transition: "color .2s ease",
                    "&::before": {
                        content: '""',
                        position: "absolute",
                        top: 0,
                        left: "50%",
                        transform: "translateX(-50%)",
                        width: active ? 26 : 0,
                        height: 3,
                        borderRadius: 3,
                        background: theme.gradients.brand,
                        transition: "width .22s ease",
                    },
                    "& .dock-icon": {
                        display: "grid",
                        placeItems: "center",
                        transition: "transform .2s ease",
                        transform: active ? "translateY(-1px) scale(1.1)" : "none",
                    },
                })}
            >
                <Box className="dock-icon">{icon}</Box>
                <Typography noWrap sx={{ fontSize: 11, fontWeight: active ? 700 : 600, lineHeight: 1, maxWidth: "100%" }}>
                    {label}
                </Typography>
            </ButtonBase>
        );

        return (
            <>
                <Drawer
                    variant="temporary"
                    open={mobileOpen}
                    onClose={onMobileClose}
                    ModalProps={{ keepMounted: true }}
                    sx={{
                        zIndex: (theme) => theme.zIndex.appBar + 2,
                        "& .MuiDrawer-paper": {
                            width: NAVBAR_WIDTH_EXPANDED,
                            boxSizing: "border-box",
                            border: "none",
                            display: "flex",
                            flexDirection: "column",
                            backgroundImage: "none",
                        },
                    }}
                >
                    {renderContent(true)}
                </Drawer>

                <Paper
                    component="nav"
                    elevation={0}
                    square
                    sx={(theme) => ({
                        position: "fixed",
                        left: 0,
                        right: 0,
                        bottom: 0,
                        zIndex: theme.zIndex.appBar + 1,
                        display: "flex",
                        alignItems: "stretch",
                        borderTop: `1px solid ${theme.palette.divider}`,
                        // Fully opaque so scrolled content never shows through the bar.
                        bgcolor: theme.palette.background.paper,
                        backgroundImage: "none",
                        boxShadow: theme.palette.mode === "dark"
                            ? "0 -2px 16px rgba(0,0,0,0.5)"
                            : "0 -2px 16px rgba(16,24,40,0.08)",
                        pb: "env(safe-area-inset-bottom)",
                    })}
                >
                    {primary.map((it) => (
                        <DockItem
                            key={it.key}
                            icon={itemIcon(it)}
                            label={it.short || it.label}
                            active={it.key === activeKey}
                            onClick={() => { if (it.path) navigate(it.path); onNavigate?.(it); }}
                        />
                    ))}
                    <DockItem
                        icon={<MoreHorizRoundedIcon />}
                        label="More"
                        active={moreActive}
                        onClick={() => onMobileOpen?.()}
                    />
                </Paper>
            </>
        );
    }

    // Desktop: fixed rail that expands on hover.
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
            {renderContent(expanded)}
        </Box>
    );
}
