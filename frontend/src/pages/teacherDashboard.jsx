import * as React from "react";
import {
	Box, Paper, Stack, Typography, Chip, Grid, Divider,
	IconButton, MenuItem, Select, List, ListItem, ListItemText,
	Avatar, Tooltip, CssBaseline
} from "@mui/material";
import MoreVertRounded from "@mui/icons-material/MoreVertRounded";
import CalendarTodayRounded from "@mui/icons-material/CalendarTodayRounded";
import AccessTimeRounded from "@mui/icons-material/AccessTimeRounded";
import GroupRounded from "@mui/icons-material/GroupRounded";
import {
	AreaChart, Area, XAxis, YAxis, Tooltip as RTooltip,
	ResponsiveContainer, CartesianGrid
} from "recharts";

/* ------------------------------- Helpers ------------------------------- */
const CardShell = ({ title, action, children, sx }) => (
	<Paper sx={{ p: 2, borderRadius: 3, border: "1px solid", borderColor: "divider", ...sx }}>
		<Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
			<Typography variant="h6" fontWeight={700}>{title}</Typography>
			{action ?? <IconButton size="small"><MoreVertRounded /></IconButton>}
		</Stack>
		{children}
	</Paper>
);

const StatusChip = ({ value }) => {
	const map = {
		"Graded":         { color: "success", label: "Graded" },
		"Submitted":      { color: "info",    label: "Submitted" },
		"In progress":    { color: "warning", label: "In progress" },
		"Not submitted":  { color: "warning", label: "Not submitted" },
		"Failed":         { color: "error",   label: "Failed" }
	};
	const cfg = map[value] || map["Submitted"];
	return <Chip size="small" color={cfg.color} label={cfg.label} sx={{ borderRadius: 999 }} />;
};

/* ------------------------------- Sections ------------------------------- */
function GreetingCardTeacher() {
	const now = new Date();
	const dateStr = now.toLocaleDateString();
	const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

	return (
		<Paper sx={{ p: 2, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
			<Stack direction="row" alignItems="center" spacing={1.5}>
				<Avatar sx={{ bgcolor: "grey.200", width: 44, height: 44 }} />
				<Box>
					<Typography variant="h6" fontWeight={800}>Good morning, Teacher!</Typography>
					<Typography variant="caption" color="text.secondary">
						Monitor your classes, stations and grading timelines.
					</Typography>
				</Box>
				<Box sx={{ flex: 1 }} />
				<Stack direction="row" spacing={1}>
					<Chip icon={<CalendarTodayRounded />} label={dateStr} variant="outlined" />
					<Chip icon={<AccessTimeRounded />} label={timeStr} variant="outlined" />
				</Stack>
			</Stack>
		</Paper>
	);
}

function ClassAverageChart({ data = [] }) {
	const [range, setRange] = React.useState("Monthly");

	// support either {label, avg} or {month, avg}
	const normalized = Array.isArray(data)
		? data.map(d => ({ label: d.label ?? d.month ?? "", avg: Number(d.avg ?? 0) }))
		: [];

	return (
		<CardShell
			title="Class average grade over time"
			action={
				<Stack direction="row" spacing={1} alignItems="center">
					<Select size="small" value={range} onChange={(e) => setRange(e.target.value)}>
						<MenuItem value="Weekly">Weekly</MenuItem>
						<MenuItem value="Monthly">Monthly</MenuItem>
						<MenuItem value="Quarterly">Quarterly</MenuItem>
					</Select>
					<Tooltip title="More">
						<IconButton size="small"><MoreVertRounded /></IconButton>
					</Tooltip>
				</Stack>
			}
			sx={{ overflow: "hidden" }}
		>
			<Box sx={{ height: 320 }}>
				<ResponsiveContainer width="100%" height="100%">
					<AreaChart data={normalized} margin={{ left: 8, right: 16, top: 8, bottom: 0 }}>
						<defs>
							<linearGradient id="gradeAvgGradient" x1="0" y1="0" x2="0" y2="1">
								<stop offset="5%" stopColor="#1976d2" stopOpacity={0.35} />
								<stop offset="95%" stopColor="#1976d2" stopOpacity={0.05} />
							</linearGradient>
						</defs>
						<CartesianGrid vertical={false} stroke="#e0e0e0" />
						<XAxis dataKey="label" />
						<YAxis domain={[0, 100]} />
						<RTooltip />
						<Area type="monotone" dataKey="avg" stroke="#1976d2" strokeWidth={2} fill="url(#gradeAvgGradient)" />
					</AreaChart>
				</ResponsiveContainer>
			</Box>
		</CardShell>
	);
}

function ClassBoxes({ classes = [] }) {
	// Only fully graded classes (either already filtered by backend or filter here)
	const graded = classes.filter(c => c.fully_graded === true);

	return (
		<Stack spacing={2}>
			{graded.length === 0 ? (
				<Paper sx={{ p: 2, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
					<Typography variant="body2" color="text.secondary">No graded classes yet.</Typography>
				</Paper>
			) : graded.map(cls => (
				<Paper key={cls.id} sx={{ p: 2, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
					<Stack direction="row" alignItems="center" spacing={1}>
						<Typography variant="subtitle1" fontWeight={800}>{cls.name}</Typography>
						<Chip size="small" icon={<GroupRounded />} label={`${cls.students ?? 0} students`} variant="outlined" />
						<Box sx={{ flex: 1 }} />
						<IconButton size="small"><MoreVertRounded /></IconButton>
					</Stack>

					<Divider sx={{ my: 1.5 }} />

					<Grid container spacing={1.5}>
						{(cls.stations ?? []).map(st => (
							<Grid item xs={12} md={6} lg={4} key={st.id}>
								<Paper sx={{ p: 1.5, borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
									<Stack spacing={0.5}>
										<Stack direction="row" alignItems="center" spacing={1}>
											<Typography variant="body1" fontWeight={700}>{st.title}</Typography>
											{st.type && <Chip size="small" label={st.type} sx={{ bgcolor: "#635bff", color: "#fff", borderRadius: 999 }} />}
											<Box sx={{ flex: 1 }} />
											<StatusChip value={st.status} />
										</Stack>
										<Typography variant="body2" color="text.secondary">
											Avg: {typeof st.avg === "number" ? `${Math.round(st.avg)}%` : "—"}
										</Typography>
										<Typography variant="caption" color="text.disabled">
											Attempts: {st.attempts ?? 0}
										</Typography>
									</Stack>
								</Paper>
							</Grid>
						))}
					</Grid>
				</Paper>
			))}
		</Stack>
	);
}

function DeadlinesPanel({ schedule = [] }) {
	return (
		<CardShell title="Schedule">
			<List dense>
				{schedule.length === 0 ? (
					<ListItem disableGutters sx={{ px: 0 }}>
						<ListItemText
							primary={<Typography variant="body2" color="text.secondary">No upcoming items.</Typography>}
						/>
					</ListItem>
				) : schedule.map(d => (
					<ListItem key={d.id} disableGutters sx={{ px: 0, py: 0.75 }}>
						<ListItemText
							primary={<Typography variant="body2" fontWeight={600}>{d.text}</Typography>}
							secondary={
								<Stack direction="row" spacing={1} alignItems="center" sx={{ color: "text.secondary" }}>
									<CalendarTodayRounded fontSize="small" />
									<Typography variant="caption">{d.when}</Typography>
									<AccessTimeRounded fontSize="small" />
									<Typography variant="caption">{d.time}</Typography>
								</Stack>
							}
						/>
					</ListItem>
				))}
			</List>
		</CardShell>
	);
}

/* ---------------------------------- Page ---------------------------------- */
export default function TeacherDashboard() {
	const [loading, setLoading] = React.useState(true);
	const [chart, setChart] = React.useState([]);
	const [classes, setClasses] = React.useState([]);
	const [schedule, setSchedule] = React.useState([]);

	React.useEffect(() => {
		let alive = true;
		(async () => {
			try {
				const res = await fetch("/api/teacher/dashboard");
				const data = res.ok ? await res.json() : {};
				if (!alive) return;

				setChart(Array.isArray(data?.chart) ? data.chart : []);
				setClasses(Array.isArray(data?.classes) ? data.classes : []);
				setSchedule(Array.isArray(data?.schedule) ? data.schedule : []);
			} catch {
				if (alive) {
					setChart([]);
					setClasses([]);
					setSchedule([]);
				}
			} finally {
				if (alive) setLoading(false);
			}
		})();
		return () => { alive = false; };
	}, []);

	return (
		<Box sx={{ bgcolor: "background.default", minHeight: "100vh" }}>
			<CssBaseline />
			<Box sx={{ px: { xs: 2, md: 3 }, py: 2 }}>
				{/* Two-column layout: main content + right notes (same student dashboard positioning) */}
				<Box
					sx={{
						display: { xs: "block", md: "grid" },
						gridTemplateColumns: { md: "minmax(0, 1fr) 320px" },
						gap: 2,
					}}
				>
					{/* Left column */}
					<Stack spacing={2}>
						<GreetingCardTeacher />
						<ClassAverageChart data={chart} />
						<ClassBoxes classes={classes} />
					</Stack>

					{/* Right rail (sticky) */}
					<Box sx={{ position: { md: "sticky" }, top: { md: 16 } }}>
						<DeadlinesPanel schedule={schedule} />
					</Box>
				</Box>
			</Box>
		</Box>
	);
}
