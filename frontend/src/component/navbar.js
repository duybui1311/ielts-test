import * as React from "react";
import {
	Box, Paper, List, ListItemButton, ListItemIcon, ListItemText,
	Tooltip, Divider, Avatar, Stack, Typography
} from "@mui/material";
import { useNavigate } from "react-router-dom";

import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import ChecklistRoundedIcon from "@mui/icons-material/ChecklistRounded";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import HelpOutlineRoundedIcon from "@mui/icons-material/HelpOutlineRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import AssignmentTurnedInRounded from "@mui/icons-material/AssignmentTurnedInRounded";

import { logout } from "../pages/login";

export const NAVBAR_WIDTH_COLLAPSED = 72;
export const NAVBAR_WIDTH_EXPANDED  = 220;

const ITEMS = [
	{ key: "dashboard", label: "Dashboard",       icon: <DashboardRoundedIcon />, path: "/dashboard" },
	{ key: "stations",  label: "Stations",        icon: <ChecklistRoundedIcon />, path: "/stations" },
	{ key: "flash",     label: "Flash cards",     icon: <CalendarTodayIcon /> , path: "/flashcard"},
	{ key: "history",   label: "History of work", icon: <HistoryRoundedIcon />,   path: "/history" },
	{ key: "settings",  label: "Settings",        icon: <SettingsRoundedIcon />,  path: "/settings" },
	{ key: "help",      label: "Help",            icon: <HelpOutlineRoundedIcon />, path: "/help" },
];

// ⬇️ teacher-only item (inserted at runtime, nothing else changed)
const TEACHER_ITEM = {
	key: "marking",
	label: "Grading exam",
	icon: <AssignmentTurnedInRounded />,
	path: "/marking",
};

export default function Navbar({
	                               activeKey = "dashboard",
	                               onNavigate,
	                               title = "OSCE Platform",
	                               logo,
	                               onWidthChange
                               }) {
	const [expanded, setExpanded] = React.useState(false);
	const navigate = useNavigate();

	React.useEffect(() => {
		onWidthChange?.(expanded ? NAVBAR_WIDTH_EXPANDED : NAVBAR_WIDTH_COLLAPSED);
	}, [expanded, onWidthChange]);

	// ⬇️ read role once (default student)
	const role = React.useMemo(() => {
		try {
			const raw = (localStorage.getItem("osce-role") || "student").toLowerCase();
			return raw === "teacher" ? "teacher" : "student";
		} catch {
			return "student";
		}
	}, []);

	// ⬇️ build list with teacher-only item inserted right after "Stations"
	const NAV_ITEMS = React.useMemo(() => {
		if (role !== "teacher") return ITEMS;
		const idx = ITEMS.findIndex(i => i.key === "stations");
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
				: theme.palette.text.secondary
		},
		"&.Mui-selected": {
			bgcolor: "primary.main",
			color: "primary.contrastText",
			"&:hover": { bgcolor: "primary.main" }
		},
		"&:hover": { bgcolor: selected ? "primary.main" : "action.hover" }
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
				flexDirection: "column"
			})}
		>
			{/* Brand (unchanged, still uses your `logo` prop) */}
			<Stack direction="row" alignItems="center" spacing={1.25} sx={{ p: 2 }}>
				<Avatar
					src={logo}
					sx={{
						width: 36,
						height: 36,
					}}
				/>
				{expanded && (
					<Typography variant="subtitle2" noWrap>
						{title}
					</Typography>
				)}
			</Stack>

			<Divider />

			{/* Main nav */}
			<List dense sx={{ px: 1, pt: 1 }}>
				{NAV_ITEMS.map((it) => {
					const selected = it.key === activeKey;
					return (
						<Tooltip key={it.key} title={expanded ? "" : it.label} placement="right" arrow={!expanded}>
							<ListItemButton
								onClick={() => { if (it.path) navigate(it.path); onNavigate?.(it); }}
								selected={selected}
								sx={(theme) => commonItemSx(theme, selected)}
							>
								<ListItemIcon>{it.icon}</ListItemIcon>
								{expanded && <ListItemText primary={it.label} slotProps={{ primary: { noWrap: true } }} />}
							</ListItemButton>
						</Tooltip>
					);
				})}
			</List>

			<Box sx={{ flexGrow: 1 }} />
			<Divider />

			{/* Sign out */}
			<List dense sx={{ px: 1, py: 1 }}>
				<ListItemButton
					onClick={() => { logout(); navigate("/login", { replace: true }); onNavigate?.({ key: "logout" }); }}
					sx={(theme) => commonItemSx(theme, false)}
				>
					<ListItemIcon><LogoutRoundedIcon /></ListItemIcon>
					{expanded && <ListItemText primary="Sign out" />}
				</ListItemButton>
			</List>
		</Box>
	);
}
