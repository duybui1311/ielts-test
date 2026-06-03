import * as React from "react";
import {
	Box, Grid, Paper, Stack, Typography, Button, TextField,
	Chip, LinearProgress, Menu, MenuItem, Divider, CssBaseline
} from "@mui/material";
import {
	Play, Clock, Calendar as CalendarIcon, TrendingUp,
	AlertTriangle, ListFilter, Filter, ChevronRight, ChevronDown, FolderOpenDot
} from "lucide-react";
import {
	AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";

const API_BASE = (process.env.REACT_APP_API_URL || "").replace(/\/$/, "");
const dashboardUrl = () =>
	API_BASE ? `${API_BASE}/api/dashboard` : "/api/dashboard";

/* ---------------- Page header (not sticky) ---------------- */
function DashboardHeader() {
	return (
		<Box sx={{ mb: 2 }}>
			<Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
				<Typography variant="h4" fontWeight={700}>Dashboard</Typography>
				<Typography color="text.secondary">Monitor all your stations and your work</Typography>
				<Box sx={{ flexGrow: 1 }} />
				<TextField size="small" placeholder="Search anything here..." sx={{ minWidth: 320 }} />
			</Stack>
		</Box>
	);
}

/* ---------------- Sections ---------------- */
function GreetingCard() {
	const now = new Date();
	const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
	const date = now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

	return (
		<Paper variant="outlined" sx={{ p: 3 }}>
			<Grid container spacing={3} alignItems="center">
				<Grid item xs={12} md="auto">
					<Stack direction="row" spacing={2} alignItems="center">
						<Box sx={{ width: 56, height: 56, borderRadius: 2, bgcolor: "action.hover", display: "grid", placeItems: "center" }}>
							<Play size={24} />
						</Box>
						<Box>
							<Typography variant="h6" fontWeight={700}>Welcome back</Typography>
							<Typography color="text.secondary">Ready to continue your practice?</Typography>
						</Box>
					</Stack>
				</Grid>
				<Grid item xs />
				<Grid item xs={12} md="auto">
					<Stack direction="row" spacing={2} alignItems="center">
						<Chip icon={<Clock size={14} />} label={time} />
						<Chip icon={<CalendarIcon size={14} />} label={date} />
					</Stack>
				</Grid>
			</Grid>
		</Paper>
	);
}

function KPI({ icon, label, value, sub }) {
	return (
		<Stack direction="row" spacing={1.5} alignItems="center">
			<Box sx={{ width: 40, height: 40, borderRadius: 2, bgcolor: "action.hover", display: "grid", placeItems: "center" }}>
				{icon}
			</Box>
			<Box>
				<Typography variant="body2" color="text.secondary">{label}</Typography>
				<Typography fontWeight={600}>{value}</Typography>
				<Typography variant="caption" color="text.disabled">{sub}</Typography>
			</Box>
		</Stack>
	);
}

function StationOverviewCard({ chartData = [], kpis }) {
	const [anchor, setAnchor] = React.useState(null);
	const [range, setRange] = React.useState("Monthly");
	const safe = (n, def = 0) => (typeof n === "number" ? n : def);

	return (
		<Paper variant="outlined" sx={{ p: 3 }}>
			<Stack direction="row" alignItems="center" mb={2}>
				<Typography variant="h6" fontWeight={600}>Station work overview</Typography>
				<Box sx={{ flexGrow: 1 }} />
				<Button
					variant="outlined"
					size="small"
					endIcon={<ChevronDown size={16} />}
					onClick={(e) => setAnchor(e.currentTarget)}
				>
					{range}
				</Button>
			</Stack>

			<Stack spacing={3}>
				<Box sx={{ height: 280 }}>
					<ResponsiveContainer width="100%" height="100%">
						<AreaChart data={chartData} margin={{ left: 0, right: 0, top: 10, bottom: 0 }}>
							<defs>
								<linearGradient id="primaryGradient" x1="0" y1="0" x2="0" y2="1">
									<stop offset="5%" stopColor="#1976d2" stopOpacity={0.35} />
									<stop offset="95%" stopColor="#1976d2" stopOpacity={0.05} />
								</linearGradient>
							</defs>
							<CartesianGrid vertical={false} stroke="#e0e0e0" />
							<XAxis dataKey="month" />
							<YAxis />
							<Tooltip />
							<Area type="monotone" dataKey="attempts" stroke="#1976d2" strokeWidth={2} fill="url(#primaryGradient)" />
						</AreaChart>
					</ResponsiveContainer>
				</Box>

				<Stack direction="row" spacing={9} alignItems="center" sx={{ flexWrap: "wrap" }}>
					<KPI icon={<Clock size={18} />} label="Time spent" value={`${safe(kpis?.time_spent_min)} min`} sub="last 30 days" />
					<KPI icon={<TrendingUp size={18} />} label="Average score" value={`${safe(kpis?.avg_score_pct)}%`} sub="last 10 attempts" />
					<KPI icon={<AlertTriangle size={18} />} label="Critical misses" value={safe(kpis?.critical_misses)} sub="last attempt" />
					<KPI icon={<FolderOpenDot size={18} />} label="Attempts" value={safe(kpis?.attempts)} sub="lifetime" />
				</Stack>
			</Stack>

			<Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
				{["Weekly", "Monthly"].map((opt) => (
					<MenuItem key={opt} selected={opt === range} onClick={() => { setRange(opt); setAnchor(null); }}>
						{opt}
					</MenuItem>
				))}
			</Menu>
		</Paper>
	);
}

function NotesPanel({ notes = [] }) {
	return (
		<Paper variant="outlined" sx={{ p: 3 }}>
			<Typography variant="h6" fontWeight={600} mb={2}>Notes</Typography>
			<Stack spacing={1.5}>
				{notes.length === 0 ? (
					<Typography variant="body2" color="text.disabled">No notes yet.</Typography>
				) : (
					notes.map((n, i) => (
						<Box key={`${n.time}-${i}`}>
							<Typography variant="caption" color="text.disabled">{n.time}</Typography>
							<Typography variant="body2">{n.text}</Typography>
							{i < notes.length - 1 && <Divider sx={{ my: 1.25 }} />}
						</Box>
					))
				)}
			</Stack>
		</Paper>
	);
}

function HistorySection({ stations = [] }) {
	return (
		<Paper variant="outlined" sx={{ p: 3 }}>
			<Stack direction="row" alignItems="center" mb={2} spacing={1.5}>
				<Typography variant="h6" fontWeight={600}>History</Typography>
				<Box sx={{ flexGrow: 1 }} />
				<Button variant="outlined" size="small" startIcon={<ListFilter size={16} />}>Difficulty: High to low</Button>
				<Button variant="outlined" size="small" startIcon={<Filter size={16} />}>Filter</Button>
			</Stack>

			<Grid container spacing={2}>
				{stations.length === 0 ? (
					<Grid item xs={12}>
						<Typography variant="body2" color="text.disabled">No history yet.</Typography>
					</Grid>
				) : (
					stations.map((s) => (
						<Grid key={s.id} item xs={12} sm={6} md={4} lg={3}>
							<StationCard station={s} />
						</Grid>
					))
				)}
			</Grid>
		</Paper>
	);
}

function StationCard({ station }) {
	const statusColor =
		station.status === "Pass" ? "success" :
			station.status === "Borderline" ? "warning" : "error";
	const progressColor =
		station.progress >= 0.66 ? "success" :
			station.progress >= 0.33 ? "warning" : "error";

	return (
		<Paper variant="outlined" sx={{ p: 2 }}>
			<Typography variant="caption" color="text.disabled">
				Task number: {String(station.id).padStart(8, "0")}
			</Typography>
			<Stack direction="row" alignItems="center" spacing={1} mt={1} mb={1}>
				<Typography variant="subtitle1" fontWeight={600} sx={{ flexGrow: 1 }} noWrap>
					{station.title}
				</Typography>
				<Chip label={station.type} size="small" color="primary" variant="outlined" />
			</Stack>
			<Typography variant="body2" color="text.secondary" mb={1}>
				System: {station.system} · Difficulty: {station.difficulty}
			</Typography>
			<Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
				<Typography variant="body2" color="text.secondary">Result</Typography>
				<Chip label={station.status} size="small" color={statusColor} variant="outlined" />
			</Stack>
			<LinearProgress variant="determinate" value={Math.round((station.progress || 0) * 100)} color={progressColor} sx={{ borderRadius: 1 }} />
			<Button size="small" endIcon={<ChevronRight size={16} />} sx={{ mt: 1.25 }}>
				Resume
			</Button>
		</Paper>
	);
}

/* ---------------- Main ---------------- */
export default function Dashboard() {
	const [loading, setLoading] = React.useState(true);
	const [kpis, setKpis] = React.useState(null);
	const [chart, setChart] = React.useState([]);
	const [stations, setStations] = React.useState([]);
	const [notes, setNotes] = React.useState([]);

	React.useEffect(() => {
		let alive = true;
		(async () => {
			try {
				const userId = localStorage.getItem("osce-user-id") || "";
				const res = await fetch(dashboardUrl(), {
					headers: { "X-User-Id": userId },
				});
				const data = res.ok ? await res.json() : {};
				if (!alive) return;
				setKpis(data?.kpis || null);
				setChart(Array.isArray(data?.chart) ? data.chart : []);
				setStations(Array.isArray(data?.stations) ? data.stations : []);
				setNotes(Array.isArray(data?.notes) ? data.notes : []);
			} catch {
				if (alive) {
					setKpis(null);
					setChart([]);
					setStations([]);
					setNotes([]);
				}
			} finally {
				if (alive) setLoading(false);
			}
		})();
		return () => { alive = false; };
	}, []);

	return (
		<Box>
			<CssBaseline />
			<Box sx={{ p: { xs: 2, md: 3 } }}>
				<DashboardHeader />

				<Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 320px" }, gap: 2 }}>
					{/* Left column */}
					<Stack spacing={2}>
						<GreetingCard />
						<StationOverviewCard chartData={chart} kpis={kpis || {}} />
						<HistorySection stations={stations} />
					</Stack>

					{/* Right notes rail */}
					<Box sx={{ position: { md: "sticky" }, top: { md: 16 } }}>
						<NotesPanel notes={notes} />
					</Box>
				</Box>

			</Box>
		</Box>
	);
}
