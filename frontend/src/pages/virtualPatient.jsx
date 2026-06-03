import * as React from "react";
import {
	Box, Container, Paper, Typography, TextField, Button, Stack,
	ThemeProvider, createTheme, Avatar, Chip, List, ListItem,
	ListItemIcon, ListItemText, RadioGroup, Radio, FormControlLabel,
	Dialog, DialogTitle, DialogContent, DialogActions
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import HelpOutlineRounded from "@mui/icons-material/HelpOutlineRounded";
import { useLocation, useNavigate } from "react-router-dom";

/* ======== THEME  ======== */
const theme = createTheme({
	palette: { primary: { main: "#635bff" }, background: { default: "#F7F9FC" } },
	shape: { borderRadius: 12 },
	components: {
		MuiPaper: { styleOverrides: { root: { borderRadius: 16 } } },
		MuiButton: { styleOverrides: { root: { textTransform: "none", borderRadius: 12 } } }
	}
});

/* ======== CRA env + URL join  ======== */
const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
const joinURL = (base, path) => `${base}${path.startsWith("/") ? path : `/${path}`}`;

/* ======== Backend helpers ======== */
const userIdHeader = () => (localStorage.getItem("osce-user-id") || "1");
async function apiFetch(path, opts = {}) {
	const headers = {
		...(opts.headers || {}),
		"X-User-Id": userIdHeader(),
	};
	return fetch(joinURL(API_BASE, path), { ...opts, headers });
}

/* ======== Chat UI ======== */
function ChatBubble({ text, side }) {
	const right = side === "right";
	return (
		<Box sx={{ display: "flex", justifyContent: right ? "flex-end" : "flex-start", mb: 0.5 }}>
			<Box
				sx={{
					maxWidth: "70%",
					px: 1.5,
					py: 1,
					borderRadius: 2,
					bgcolor: right ? "#635bff" : "#fff",
					color: right ? "#fff" : "text.primary",
					boxShadow: "0 1px 4px rgba(15,23,42,0.08)"
				}}
			>
				<Typography variant="body2">{text}</Typography>
			</Box>
		</Box>
	);
}

function ChatPanel({ messages, onSend, sending, disabled, patientName }) {
	const [input, setInput] = React.useState("");
	const listRef = React.useRef(null);
	const [showJump, setShowJump] = React.useState(false);
	const [atBottom, setAtBottom] = React.useState(true);

	const handleScroll = () => {
		const el = listRef.current;
		if (!el) return;
		const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
		setAtBottom(nearBottom);
		setShowJump(!nearBottom);
	};

	React.useEffect(() => {
		const el = listRef.current;
		if (!el) return;
		if (atBottom) {
			el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
			setShowJump(false);
		}
	}, [messages, atBottom]);

	const send = () => {
		const t = (input || "").trim();
		if (!t || disabled || sending) return;
		onSend(t);
		setInput("");
	};

	return (
		<Paper sx={{ p: "1.5%", height: "60vh", display: "flex", flexDirection: "column" }}>
			{/* Header */}
			<Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
				<Avatar sx={{ bgcolor: "#635bff", width: 32, height: 32 }}>VP</Avatar>
				<Box>
					<Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
						{patientName || "Virtual Patient"}
					</Typography>
					<Typography variant="caption" color="text.secondary">
						Chat with your colleagues !
					</Typography>
				</Box>
			</Stack>

			{/* Messages list – flexGrow keeps input at bottom */}
			<Box
				ref={listRef}
				onScroll={handleScroll}
				sx={{ position: "relative", flexGrow: 1, overflowY: "auto", mb: "1.2%" }}
			>
				{messages.map((m) => <ChatBubble key={m.id} text={m.text} side={m.side} />)}
				{showJump && (
					<Box sx={{ position: "absolute", bottom: "1vh", right: "1vh" }}>
						<Button
							size="small"
							variant="contained"
							onClick={() => {
								const el = listRef.current; if (!el) return;
								el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
								setShowJump(false); setAtBottom(true);
							}}
						>
							Jump to latest
						</Button>
					</Box>
				)}
			</Box>

			{/* Input row pinned at bottom of chat card */}
			<Box sx={{ display: "flex", alignItems: "center", gap: "2%" }}>
				<TextField
					size="small"
					fullWidth
					placeholder={disabled ? "Time's up" : "Aa"}
					disabled={disabled}
					value={input}
					onChange={(e) => setInput(e.target.value)}
					onKeyDown={(e) => e.key === "Enter" && send()}
				/>
				<Button
					variant="contained"
					onClick={send}
					disabled={sending || disabled}
					sx={{ minWidth: 120 }}
				>
					{sending ? "Sending..." : "Send"}
				</Button>
			</Box>
		</Paper>
	);
}

/* ======== Questions  ======== */
function QuestionsBox({ questions, answers, onAnswer }) {
	const answered = questions.reduce(
		(n, q) => (answers[q.id] !== undefined && answers[q.id] !== "" ? n + 1 : n),
		0
	);

	return (
		<Paper sx={{ p: "1.5%" }}>
			<Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
				<Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Questions</Typography>
				<Chip size="small" label={`${answered}/${questions.length} answered`} />
			</Stack>

			<Box sx={{ maxHeight: "26vh", overflowY: "auto", pr: 1 }}>
				{questions.map((q, idx) => (
					<Box
						key={q.id}
						sx={{
							mb: 1.2,
							p: 1,
							borderRadius: 2,
							bgcolor: "#fff",
							boxShadow: "inset 0 0 0 1px #eee"
						}}
					>
						<Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
							{`Q${idx + 1}. ${q.prompt}`}
						</Typography>

						{q.type === "mcq" && Array.isArray(q.options) && (
							<RadioGroup
								value={answers[q.id] ?? ""}
								onChange={(e) => onAnswer(q.id, Number(e.target.value))}
							>
								{q.options.map((opt, i) => (
									<FormControlLabel
										key={`${q.id}-${i}`}
										value={i}
										control={<Radio size="small" />}
										label={opt}
									/>
								))}
							</RadioGroup>
						)}

						{q.type === "short" && (
							<TextField
								size="small"
								fullWidth
								placeholder="Type your answer"
								value={answers[q.id] ?? ""}
								onChange={(e) => onAnswer(q.id, e.target.value)}
							/>
						)}

						{q.type === "explain" && (
							<TextField
								size="small"
								fullWidth
								placeholder="Short reasoning"
								value={answers[q.id] ?? ""}
								onChange={(e) => onAnswer(q.id, e.target.value)}
							/>
						)}
					</Box>
				))}
			</Box>
		</Paper>
	);
}

/* ======== Patient script: card + popup ======== */
function PatientScriptCard({ onOpen }) {
	return (
		<Paper sx={{ p: "1.5%", height: "20vh", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
			<Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
				Patient script
			</Typography>
			<Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
				Click below to view the patient case details.
			</Typography>
			<Box sx={{ mt: 1, display: "flex", justifyContent: "flex-end" }}>
				<Button variant="outlined" size="small" onClick={onOpen}>
					View details
				</Button>
			</Box>
		</Paper>
	);
}

function QuestionStatusPanel({ questions, answers }) {
	const kind = (t) => (t === "mcq" ? "Multiple choice" : t === "short" ? "Short" : "Explain");
	const isAnswered = (id) => {
		const v = answers[id];
		return v !== undefined && v !== null && v !== "";
	};

	return (
		<Paper sx={{ p: "1.5%", height: "26vh" }}>
			<Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Question status</Typography>
			<List dense sx={{ height: "calc(26vh - 48px)", overflowY: "auto" }}>
				{questions.map((q, i) => (
					<ListItem key={q.id} sx={{ py: 0.5 }}>
						<ListItemIcon>
							{isAnswered(q.id)
								? <CheckCircleRounded color="success" fontSize="small" />
								: <HelpOutlineRounded color="disabled" fontSize="small" />
							}
						</ListItemIcon>
						<ListItemText
							primary={`Q${i + 1}`}
							secondary={kind(q.type)}
							slotProps={{
								primary: { variant: "body2" },
								secondary: { variant: "caption" }
							}}
						/>
						<Chip
							size="small"
							label={isAnswered(q.id) ? "Done" : "Pending"}
							color={isAnswered(q.id) ? "success" : "warning"}
							variant={isAnswered(q.id) ? "filled" : "outlined"}
						/>
					</ListItem>
				))}
			</List>
		</Paper>
	);
}

function TimerCard({ seconds }) {
	const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
	const ss = String(seconds % 60).padStart(2, "0");
	return (
		<Paper
			sx={{
				height: "14vh",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				borderRadius: "999px",
				boxShadow: "0 6px 12px rgba(0,0,0,0.08)"
			}}
		>
			<Typography variant="h4" sx={{ fontWeight: 800 }}>{`00:${mm}:${ss}`}</Typography>
		</Paper>
	);
}

/* ======== Action row ======== */
function ActionRow({ disableChat, onBack, onNext, onSubmit, backDisabled, showSubmit, submitting }) {
	return (
		<Paper sx={{ height: "7vh", p: "1%", display: "flex", alignItems: "center", gap: "2%" }}>
			<Button
				fullWidth
				variant="outlined"
				startIcon={<ArrowBackIcon />}
				sx={{ height: "100%", width: "32%" }}
				onClick={onBack}
				disabled={backDisabled}
			>
				Back
			</Button>

			<Button
				fullWidth
				variant="outlined"
				startIcon={<EditOutlinedIcon />}
				sx={{ height: "100%", width: "32%" }}
				onClick={onNext}
				disabled={disableChat}
			>
				Next
			</Button>

			{showSubmit ? (
				<Button
					fullWidth
					variant="contained"
					sx={{ height: "100%", width: "32%" }}
					onClick={onSubmit}
					disabled={submitting}
				>
					{submitting ? "Submitting..." : "Submit"}
				</Button>
			) : (
				<Box sx={{ width: "32%" }} />
			)}
		</Paper>
	);
}

/* ======== MAIN PAGE ======== */
export default function VirtualPatient() {
	const location = useLocation();
	const navigate = useNavigate();

	// from /stations → navigate("/virtual-patient", { state: { circuitId, stations, timeLimitMin } })
	// also support query params so a reload still works
	const search = new URLSearchParams(location.search);

	const circuitId = Number(
		location.state?.circuitId ??
		search.get("circuitId") ??
		0
	);

	const totalStations = Math.max(
		1,
		Number(
			location.state?.stations ??
			search.get("stations") ??
			1
		)
	);

	const timeLimitMin = Number(
		location.state?.timeLimitMin ??
		search.get("timeLimitMin") ??
		10
	);

	// position within circuit
	const [position, setPosition] = React.useState(1); // 1..N
	const isFirst = position === 1;
	const isLast = position === totalStations;

	// content cache per position
	const [contentByPos, setContentByPos] = React.useState({});
	const attemptIdRef = React.useRef(null);

	// local work per position: { [pos]: { msgs: [...], answers: {...} } }
	const [workByPos, setWorkByPos] = React.useState({});

	// derived for current position
	const sc = contentByPos[position] || {};
	const patientName = sc.patient_name || "Virtual Patient";
	const patientScript = sc.patient_script || "";
	const questions = Array.isArray(sc.questions) ? sc.questions : [];

	const msgs = workByPos[position]?.msgs ?? [];
	const answers = workByPos[position]?.answers ?? {};

	// countdown: derive initial seconds from exam time limit (fallback 10 minutes)
	const initialSeconds = Math.max(1, Math.floor(timeLimitMin * 60));
	const [timerLeft, setTimerLeft] = React.useState(initialSeconds);

	// tick every second while timer > 0
	React.useEffect(() => {
		if (timerLeft <= 0) return;
		const t = setTimeout(() => setTimerLeft((s) => s - 1), 1000);
		return () => clearTimeout(t);
	}, [timerLeft]);

	// reset timer if circuit/time limit changes
	React.useEffect(() => {
		setTimerLeft(initialSeconds);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [initialSeconds]);

	const [sending, setSending] = React.useState(false);
	const [submitting, setSubmitting] = React.useState(false);

	// patient script dialog
	const [scriptOpen, setScriptOpen] = React.useState(false);

	/* ---- Preload all stations (load station_attempt_id, script, questions, Redis draft) ---- */
	React.useEffect(() => {
		let dead = false;
		if (!circuitId) return;

		(async () => {
			for (let pos = 1; pos <= totalStations; pos++) {
				if (contentByPos[pos]) continue;

				try {
					const r = await apiFetch(`/api/attempts/circuits/${circuitId}/stations/${pos}`);
					if (!r.ok) throw new Error("load failed");
					const data = await r.json();
					if (dead) return;

					if (data?.attempt_id) attemptIdRef.current = data.attempt_id;
					setContentByPos(prev => ({ ...prev, [pos]: data }));

					// seed messages from initial_messages (convert 'user'/'ai' -> right/left)
					setWorkByPos(prev => {
						if (prev[pos]) return prev;
						const mapped = Array.isArray(data.initial_messages)
							? data.initial_messages.map((m, i) => ({
								id: Date.now() + i + pos,
								side: m.side === "user" ? "right" : "left",
								text: m.text || ""
							}))
							: [];
						return { ...prev, [pos]: { msgs: mapped, answers: {} } };
					});
				} catch (e) {
					console.error("Failed to load station", pos, e);
					setContentByPos(prev => ({ ...prev, [pos]: { patient_name: "", patient_script: "", questions: [] } }));
					setWorkByPos(prev => prev[pos] ? prev : ({ ...prev, [pos]: { msgs: [], answers: {} } }));
				}
			}
		})();

		return () => { dead = true; };
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [circuitId, totalStations]);

	/* ---- Handlers ---- */
	async function handleAnswer(questionId, value) {
		setWorkByPos(prev => {
			const cur = prev[position] || { msgs: [], answers: {} };
			return { ...prev, [position]: { ...cur, answers: { ...cur.answers, [questionId]: value } } };
		});

		const saId = contentByPos[position]?.station_attempt_id;
		if (saId) {
			try {
				await apiFetch(`/api/attempts/station/${saId}/answers`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ question_id: questionId, value })
				});
			} catch (e) {
				console.warn("Draft answer failed", e);
			}
		}
	}

	async function handleSend(text) {
		const myMsg = { id: Date.now(), side: "right", text };
		setWorkByPos(prev => {
			const cur = prev[position] || { msgs: [], answers: {} };
			return { ...prev, [position]: { ...cur, msgs: [...cur.msgs, myMsg] } };
		});

		setSending(true);
		try {
			const saId = contentByPos[position]?.station_attempt_id;
			if (saId) {
				const r = await apiFetch(`/api/attempts/station/${saId}/chat`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ text })
				});
				if (r.ok) {
					const data = await r.json();
					const m = data?.message || {};
					const textOut = typeof m === "string" ? m : (m.text || "");
					const aiMsg = {
						id: m.id || (Date.now() + 1),
						side: "left",
						text: textOut
					};
					setWorkByPos(prev => {
						const cur = prev[position] || { msgs: [], answers: {} };
						return { ...prev, [position]: { ...cur, msgs: [...cur.msgs, aiMsg] } };
					});
				} else {
					console.error("Chat failed", await r.text());
				}
			}
		} catch (e) {
			console.error("Chat error", e);
		} finally {
			setSending(false);
		}
	}

	/* ---- Submit whole circuit ---- */
	const [successOpen, setSuccessOpen] = React.useState(false);
	const [successInfo, setSuccessInfo] = React.useState({
		candidate_name: "You",
		station_name: "All stations",
		submission_time: new Date().toLocaleString(),
		submission_id: ""
	});

	async function handleSubmitAll() {
		if (submitting) return;
		setSubmitting(true);
		const attempt_id = attemptIdRef.current || null;

		const station_attempt_ids = [];
		for (let pos = 1; pos <= totalStations; pos++) {
			const sa = contentByPos[pos]?.station_attempt_id;
			if (sa) station_attempt_ids.push(sa);
		}

		try {
			const payload = {
				circuit_id: circuitId,
				attempt_id,
				stations: station_attempt_ids.map(sa => ({ station_attempt_id: sa }))
			};
			const res = await apiFetch(`/api/attempts/submit`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload)
			});
			if (!res.ok) {
				const txt = await res.text().catch(() => "");
				console.error("Submit error:", res.status, txt);
				alert(`Submit failed (${res.status}).\n${txt || "Please try again."}`);
				return;
			}
			const data = await res.json();
			setSuccessInfo(prev => ({
				...prev,
				submission_time: new Date().toLocaleString(),
				submission_id: data.reference_id || prev.submission_id
			}));
			setSuccessOpen(true);
		} catch (e) {
			console.error("Submit error", e);
			alert("Submit failed. Please try again.");
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<ThemeProvider theme={theme}>
			<Box sx={{ bgcolor: "background.default", minHeight: "100vh" }}>
				<Container maxWidth={false} sx={{ maxWidth: 1280, mx: "auto", p: { xs: 2, md: 3 } }}>
					{/* Title */}
					<Box sx={{ mb: 2 }}>
						<Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1 }}>
							Practice alone with guides
						</Typography>
						<Typography variant="body2" color="text.secondary">
							Chat with your colleagues !
						</Typography>
					</Box>

					{/* Main 2-column layout */}
					<Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "70% 30%" }, gap: { xs: "2vh", md: "2%" } }}>
						{/* LEFT */}
						<Box>
							<ChatPanel
								messages={msgs}
								onSend={handleSend}
								sending={sending}
								disabled={timerLeft === 0}
								patientName={patientName}
							/>
							<Box sx={{ mt: 2 }}>
								<QuestionsBox questions={questions} answers={answers} onAnswer={handleAnswer} />
							</Box>
						</Box>

						{/* RIGHT */}
						<Box sx={{ display: "flex", flexDirection: "column", gap: "2%" }}>
							<TimerCard seconds={timerLeft} />
							<ActionRow
								disableChat={timerLeft === 0 || submitting}
								onBack={() => !isFirst && setPosition(p => p - 1)}
								onNext={() => !isLast && setPosition(p => p + 1)}
								onSubmit={handleSubmitAll}
								backDisabled={isFirst}
								showSubmit={isLast}
								submitting={submitting}
							/>
							<PatientScriptCard onOpen={() => setScriptOpen(true)} />
							<QuestionStatusPanel questions={questions} answers={answers} />
						</Box>
					</Box>

					{/* Patient script dialog */}
					<Dialog open={scriptOpen} onClose={() => setScriptOpen(false)} maxWidth="sm" fullWidth>
						<DialogTitle sx={{ fontWeight: 700 }}>Patient script</DialogTitle>
						<DialogContent dividers>
							<Typography variant="body2" whiteSpace="pre-wrap">
								{patientScript || "No patient script available."}
							</Typography>
						</DialogContent>
						<DialogActions>
							<Button onClick={() => setScriptOpen(false)}>Close</Button>
						</DialogActions>
					</Dialog>

					{/* Submit success dialog */}
					<Dialog open={successOpen} onClose={() => setSuccessOpen(false)} maxWidth="xs" fullWidth>
						<DialogTitle sx={{ textAlign: "center", fontWeight: 700 }}>Attempt submitted</DialogTitle>
						<DialogContent>
							<Stack spacing={1} sx={{ mt: 1 }}>
								<Typography variant="body2">Candidate: {successInfo.candidate_name}</Typography>
								<Typography variant="body2">Station: {successInfo.station_name}</Typography>
								<Typography variant="body2">Submission Time: {successInfo.submission_time}</Typography>
								<Typography variant="body2">Reference ID: {successInfo.submission_id}</Typography>
							</Stack>
						</DialogContent>
						<DialogActions sx={{ justifyContent: "center", pb: 2 }}>
							<Button
								variant="contained"
								onClick={() => {
									setSuccessOpen(false);
									// go back to the previous page (stations page)
									navigate(-1);
								}}
							>
								Close
							</Button>
						</DialogActions>
					</Dialog>
				</Container>
			</Box>
		</ThemeProvider>
	);
}
