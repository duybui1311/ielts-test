import * as React from "react";
import {
	Box, Container, Paper, Typography, TextField, Button, Stack,
	ThemeProvider, createTheme, Chip, List, ListItem, ListItemIcon, ListItemText,
	RadioGroup, Radio, FormControlLabel, Dialog, DialogTitle, DialogContent, DialogActions,
	IconButton, Divider, Tooltip
} from "@mui/material";

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import NavigateNextRoundedIcon from "@mui/icons-material/NavigateNextRounded";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import HelpOutlineRounded from "@mui/icons-material/HelpOutlineRounded";
import MicRoundedIcon from "@mui/icons-material/MicRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";

import { useLocation, useNavigate } from "react-router-dom";
import ProceduralAvatar from "./ProceduralAvatar";

/* ======== THEME ======== */
const theme = createTheme({
	palette: { primary: { main: "#635bff" }, background: { default: "#F7F9FC" } },
	shape: { borderRadius: 12 },
	components: {
		MuiPaper: { styleOverrides: { root: { borderRadius: 16 } } },
		MuiButton: { styleOverrides: { root: { textTransform: "none" } } }
	}
});

/* ======== API BASE ======== */
const API_BASE = (process.env.REACT_APP_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
const joinURL = (base, path) => `${base}${path.startsWith("/") ? path : `/${path}`}`;

/* ======== STT ENDPOINT  ======== */
const STT_ENDPOINT = "/api/stt/transcribe";
const STT_VOICE_CHAT_ENDPOINT = "/api/stt/transcribe_and_chat";

/* ======== Backend helpers ======== */
const userIdHeader = () => (localStorage.getItem("osce-user-id") || "2");
async function apiFetch(path, opts = {}) {
	const headers = { ...(opts.headers || {}), "X-User-Id": userIdHeader() };
	return fetch(joinURL(API_BASE, path), { ...opts, headers });
}

/* ======== Utils ======== */
function pad2(n) { return String(n).padStart(2, "0"); }
function formatHMS(totalSeconds) {
	const s = Math.max(0, Number(totalSeconds || 0));
	const hh = Math.floor(s / 3600);
	const mm = Math.floor((s % 3600) / 60);
	const ss = Math.floor(s % 60);
	return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
}

/* ======== Questions ======== */
function QuestionsBox({ questions, answers, onAnswer }) {
	const answered = questions.reduce(
		(n, q) => (answers[q.id] !== undefined && answers[q.id] !== "" ? n + 1 : n),
		0
	);

	return (
		<Paper sx={{ p: 2, minWidth: 0 }}>
			<Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
				<Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Questions</Typography>
				<Chip size="small" label={`${answered}/${questions.length} answered`} />
			</Stack>

			<Box sx={{ maxHeight: { xs: "28vh", lg: "42vh" }, overflowY: "auto", pr: 1, minHeight: 0 }}>
				{questions.map((q, idx) => (
					<Box
						key={q.id}
						sx={{
							mb: 1.2, p: 1.2, borderRadius: 2, bgcolor: "#fff",
							boxShadow: "inset 0 0 0 1px rgba(238,240,244,1)"
						}}
					>
						<Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.75 }}>
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

function QuestionStatusPanel({ questions, answers }) {
	const kind = (t) => (t === "mcq" ? "Multiple choice" : t === "short" ? "Short" : "Explain");
	const isAnswered = (id) => {
		const v = answers[id];
		return v !== undefined && v !== null && v !== "";
	};

	return (
		<Paper sx={{ p: 2, minWidth: 0 }}>
			<Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>Question status</Typography>
			<List dense sx={{ maxHeight: { xs: "22vh", lg: "28vh" }, overflowY: "auto", minHeight: 0 }}>
				{questions.map((q, i) => (
					<ListItem key={q.id} sx={{ py: 0.5 }}>
						<ListItemIcon sx={{ minWidth: 32 }}>
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

/* ======== Chat bubble ======== */
function MessageBubble({ side, text }) {
	const right = side === "right";
	return (
		<Box sx={{ display: "flex", justifyContent: right ? "flex-end" : "flex-start", my: 0.75, minWidth: 0 }}>
			<Box
				sx={{
					maxWidth: "68%",
					px: 2,
					py: 1.5,
					borderRadius: 3,
					bgcolor: right ? "#635bff" : "#eef2f6",
					color: right ? "#fff" : "text.primary",
					boxShadow: "0 1px 4px rgba(15,23,42,0.06)",
					...(right ? { borderTopRightRadius: 12 } : { borderTopLeftRadius: 12 }),
					whiteSpace: "pre-wrap",
					wordBreak: "break-word",
					fontSize: 14,
					lineHeight: "1.25rem",
				}}
			>
				{text}
			</Box>
		</Box>
	);
}

/* ======== MAIN PAGE ======== */
export default function RealPatient() {
	const location = useLocation();
	const navigate = useNavigate();
	const search = new URLSearchParams(location.search);

	const circuitId = Number(location.state?.circuitId ?? search.get("circuitId") ?? 0);
	const totalStations = Math.max(1, Number(location.state?.stations ?? search.get("stations") ?? 1));
	const timeLimitMin = Number(location.state?.timeLimitMin ?? search.get("timeLimitMin") ?? 10);

	const [position, setPosition] = React.useState(1);
	const isFirst = position === 1;
	const isLast = position === totalStations;

	const [contentByPos, setContentByPos] = React.useState({});
	const attemptIdRef = React.useRef(null);

	const [workByPos, setWorkByPos] = React.useState({});

	const sc = contentByPos[position] || {};
	const patientName = sc.patient_name || "Virtual Patient";
	const patientScript = sc.patient_script || "";
	const questions = Array.isArray(sc.questions) ? sc.questions : [];

	const msgs = workByPos[position]?.msgs ?? [];
	const answers = workByPos[position]?.answers ?? {};
	const draft = workByPos[position]?.draft ?? "";

	const initialSeconds = Math.max(1, Math.floor(timeLimitMin * 60));
	const [timerLeft, setTimerLeft] = React.useState(initialSeconds);

	React.useEffect(() => {
		if (timerLeft <= 0) return;
		const t = setTimeout(() => setTimerLeft((s) => s - 1), 1000);
		return () => clearTimeout(t);
	}, [timerLeft]);

	React.useEffect(() => {
		setTimerLeft(initialSeconds);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [initialSeconds]);

	const [sending, setSending] = React.useState(false);
	const [awaitingLLM, setAwaitingLLM] = React.useState(false);

	const [scriptOpen, setScriptOpen] = React.useState(false);

	/* =========================
	   STT: recording + transcribe
	   ========================= */
	const mediaRecorderRef = React.useRef(null);
	const mediaStreamRef = React.useRef(null);
	const chunksRef = React.useRef([]);

	const [isRecording, setIsRecording] = React.useState(false);
	const [isTranscribing, setIsTranscribing] = React.useState(false);

	// typing => listening
	const [typingActive, setTypingActive] = React.useState(false);
	const typingTimerRef = React.useRef(null);

	// talking after LLM finishes
	const [isTalking, setIsTalking] = React.useState(false);
	const talkTimerRef = React.useRef(null);
	const audioRef = React.useRef(null);

	const stopTalking = React.useCallback(() => {
		if (talkTimerRef.current) {
			clearTimeout(talkTimerRef.current);
			talkTimerRef.current = null;
		}
		if (audioRef.current) {
			try { audioRef.current.pause(); } catch (_) {}
			audioRef.current = null;
		}
		setIsTalking(false);
	}, []);

	React.useEffect(() => {
		return () => {
			if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
			if (talkTimerRef.current) clearTimeout(talkTimerRef.current);
			if (audioRef.current) {
				try { audioRef.current.pause(); } catch (_) {}
			}
			if (mediaStreamRef.current) {
				mediaStreamRef.current.getTracks().forEach((t) => t.stop());
			}
		};
	}, []);

	React.useEffect(() => {
		// station change: stop carry-over states
		stopTalking();
		setTypingActive(false);
		setAwaitingLLM(false);
		setIsTranscribing(false);
		if (isRecording) {
			// hard stop recording if user switches station
			try { mediaRecorderRef.current?.stop(); } catch (_) {}
			setIsRecording(false);
		}
	}, [position, stopTalking]); // eslint-disable-line react-hooks/exhaustive-deps

	function pickMimeType() {
		const candidates = [
			"audio/webm;codecs=opus",
			"audio/webm",
			"audio/ogg;codecs=opus",
			"audio/ogg",
		];
		for (const t of candidates) {
			if (window.MediaRecorder && MediaRecorder.isTypeSupported(t)) return t;
		}
		return "";
	}

	async function transcribeAndChatBlob(blob) {
		const saId = contentByPos[position]?.station_attempt_id;
		if (!saId) throw new Error("Missing station_attempt_id");

		const fd = new FormData();
		const fileType = blob.type || "audio/webm";
		const ext = fileType.includes("ogg") ? "ogg" : "webm";

		fd.append("file", new File([blob], `voice.${ext}`, { type: fileType }));
		fd.append("station_attempt_id", String(saId));

		const r = await apiFetch(STT_VOICE_CHAT_ENDPOINT, { method: "POST", body: fd });
		if (!r.ok) throw new Error(await r.text().catch(() => "STT+CHAT failed"));

		const data = await r.json().catch(() => ({}));
		return {
			transcript: String(data.text || "").trim(),
			llmText: String(data.llm_text || "").trim(),
		};
	}

	async function transcribeAudioBlob(blob) {
		const saId = contentByPos[position]?.station_attempt_id;

		const fd = new FormData();
		const fileType = blob.type || "audio/webm";
		const ext = fileType.includes("ogg") ? "ogg" : "webm";
		fd.append("file", new File([blob], `stt.${ext}`, { type: fileType }));

		if (saId) fd.append("station_attempt_id", String(saId));
		if (circuitId) fd.append("circuit_id", String(circuitId));

		const r = await apiFetch(STT_ENDPOINT, { method: "POST", body: fd });
		if (!r.ok) throw new Error(await r.text().catch(() => "STT failed"));

		const data = await r.json().catch(() => ({}));

		const transcript = String(
			data.text || data.transcript || data.result || data.output || ""
		).trim();

		return {
			transcript,
			response: data.response,
			ready: data.ready,
			raw: data,
		};
	}

	async function startRecording() {
		stopTalking();
		setAwaitingLLM(false);

		const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		mediaStreamRef.current = stream;

		const mimeType = pickMimeType();
		const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

		chunksRef.current = [];
		mr.ondataavailable = (e) => {
			if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
		};

		mr.onstop = async () => {
			try {
				if (mediaStreamRef.current) {
					mediaStreamRef.current.getTracks().forEach((t) => t.stop());
					mediaStreamRef.current = null;
				}

				const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
				chunksRef.current = [];

				stopTalking();
				setAwaitingLLM(false);
				setIsTranscribing(true);

				const stt = await transcribeAudioBlob(blob);
				const transcript = String(stt?.transcript || "").trim();

				console.log("Transcribing...");
				console.log("Transcript:");
				console.log(transcript || "(empty)");
				console.log("");
				console.log("Ready to talk.");
				console.log("");

				if (!transcript) {
					return;
				}

				setIsTranscribing(false);
				await handleSendTranscript(transcript);

			} catch (e) {
				console.error("Transcribe error:", e);
			} finally {
				setIsTranscribing(false);
			}
		};

		mediaRecorderRef.current = mr;
		mr.start();
		setIsRecording(true);
	}

	async function stopRecording() {
		try {
			mediaRecorderRef.current?.stop();
		} catch (_) {}
		setIsRecording(false);
	}

	async function handleSendTranscript(text) {
		const t = String(text || "").trim();
		if (!t) return;

		const myMsg = { id: Date.now(), side: "right", text: t };
		setWorkByPos((prev) => {
			const cur = prev[position] || { msgs: [], answers: {}, draft: "" };
			return { ...prev, [position]: { ...cur, msgs: [...cur.msgs, myMsg] } };
		});

		setSending(true);
		setAwaitingLLM(true);
		stopTalking();

		try {
			const saId = contentByPos[position]?.station_attempt_id;
			if (!saId) return;

			const r = await apiFetch(`/api/attempts/station/${saId}/chat`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ text: t })
			});

			if (!r.ok) throw new Error(await r.text().catch(() => "Chat failed"));

			const data = await r.json();
			const m = data?.message || {};
			const textOut = typeof m === "string" ? m : (m.text || "");
			const aiMsg = { id: m.id || (Date.now() + 1), side: "left", text: textOut };

			setWorkByPos((prev) => {
				const cur = prev[position] || { msgs: [], answers: {}, draft: "" };
				return { ...prev, [position]: { ...cur, msgs: [...cur.msgs, aiMsg] } };
			});

			setAwaitingLLM(false);
			triggerTalkingFromBackend(data, textOut);
		} catch (e) {
			console.error("Chat error:", e);
		} finally {
			setAwaitingLLM(false);
			setSending(false);
		}
	}

	function speakInBrowser(text) {
		if (!text) return false;
		if (!("speechSynthesis" in window)) return false;

		try { window.speechSynthesis.cancel(); } catch (_) {}

		const u = new SpeechSynthesisUtterance(text);
		u.lang = "en-US";
		u.onstart = () => setIsTalking(true);
		u.onend = () => setIsTalking(false);
		u.onerror = () => setIsTalking(false);

		window.speechSynthesis.speak(u);
		return true;
	}

	function triggerTalkingFromBackend(data, textOut) {
		const audioUrl = data?.tts_audio_url || data?.audio_url || "";

		stopTalking();
		setIsTalking(true);

		if (audioUrl) {
			try {
				const a = new Audio(audioUrl);
				audioRef.current = a;
				a.addEventListener("ended", () => setIsTalking(false));
				a.addEventListener("pause", () => setIsTalking(false));
				a.play().catch(() => {
					const ms = Math.min(4000, Math.max(900, (String(textOut || "").length * 35)));
					talkTimerRef.current = setTimeout(() => setIsTalking(false), ms);
				});
				return;
			} catch (_) {
			}
		}

		const ms = Math.min(4000, Math.max(900, (String(textOut || "").length * 35)));
		talkTimerRef.current = setTimeout(() => setIsTalking(false), ms);
	}

	/* ---- preload stations (same as old virtualPatient.js) ---- */
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

					setWorkByPos(prev => {
						if (prev[pos]) return prev;
						const mapped = Array.isArray(data.initial_messages)
							? data.initial_messages.map((m, i) => {
								const s = String(m.side || "").toLowerCase();
								const isUser = (s === "user" || s === "right" || s === "student");
								return {
									id: m.id ?? (Date.now() + i + pos),
									side: isUser ? "right" : "left",
									text: m.text || "",
								};
							})
							: [];
						return { ...prev, [pos]: { msgs: mapped, answers: {}, draft: "" } };
					});
				} catch (e) {
					console.error("Failed to load station", pos, e);
					setContentByPos(prev => ({ ...prev, [pos]: { patient_name: "", patient_script: "", questions: [] } }));
					setWorkByPos(prev => prev[pos] ? prev : ({ ...prev, [pos]: { msgs: [], answers: {}, draft: "" } }));
				}
			}
		})();

		return () => { dead = true; };
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [circuitId, totalStations]);

	/* ---- handlers preserved ---- */
	async function handleAnswer(questionId, value) {
		setWorkByPos(prev => {
			const cur = prev[position] || { msgs: [], answers: {}, draft: "" };
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

	async function handleSend() {
		const text = String(draft || "").trim();
		if (!text) return;
		if (timerLeft === 0 || sending || isTranscribing) return;

		stopTalking();
		setAwaitingLLM(true);

		const myMsg = { id: Date.now(), side: "right", text };
		setWorkByPos(prev => {
			const cur = prev[position] || { msgs: [], answers: {}, draft: "" };
			return { ...prev, [position]: { ...cur, msgs: [...cur.msgs, myMsg], draft: "" } };
		});

		setSending(true);
		try {
			const saId = contentByPos[position]?.station_attempt_id;
			if (!saId) return;

			const r = await apiFetch(`/api/attempts/station/${saId}/chat`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ text })
			});

			if (!r.ok) throw new Error(await r.text().catch(() => "Chat failed"));

			const data = await r.json();
			const m = data?.message || {};
			const textOut = typeof m === "string" ? m : (m.text || "");

			const aiMsg = { id: m.id || (Date.now() + 1), side: "left", text: textOut };
			setWorkByPos(prev => {
				const cur = prev[position] || { msgs: [], answers: {}, draft: "" };
				return { ...prev, [position]: { ...cur, msgs: [...cur.msgs, aiMsg] } };
			});

			setAwaitingLLM(false);
			triggerTalkingFromBackend(data, textOut);
		} catch (e) {
			console.error("Chat error", e);
		} finally {
			setAwaitingLLM(false);
			setSending(false);
		}
	}

	/* ---- Submit (same as old) ---- */
	const [submitting, setSubmitting] = React.useState(false);
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

	const avatarState =
		(typingActive || isRecording || isTranscribing) ? "listening" :
			awaitingLLM ? "thinking" :
				isTalking ? "talking" :
					"idle";

	const gender = sc.patient_gender || sc.gender || "male";
	const disableChat = timerLeft === 0 || submitting;

	const chatRef = React.useRef(null);
	React.useEffect(() => {
		const el = chatRef.current;
		if (!el) return;
		el.scrollTop = el.scrollHeight;
	}, [msgs.length, position]);

	return (
		<ThemeProvider theme={theme}>
			<Box
				sx={{
					bgcolor: "background.default",
					width: "100%",
					height: "100dvh",
					minHeight: "100dvh",
					overflow: "hidden"
				}}
			>
				<Container
					maxWidth={false}
					disableGutters
					sx={{
						width: "100%",
						height: "100%",
						p: 0,
						overflow: "hidden"
					}}
				>
					<Paper
						elevation={0}
						sx={{
							width: "100%",
							height: "100%",
							minHeight: 0,
							border: "1px solid rgba(238,240,244,0.95)",
							borderRadius: 4,
							overflow: "hidden",
							display: "grid",
							gridTemplateRows: "76px minmax(0, 1fr) 92px",
							bgcolor: "#fff",
							mx: 0
						}}
					>
						{/* TOP BAR */}
						<Box
							sx={{
								px: 2.5,
								py: { xs: 1.25, md: 0 },
								display: "grid",
								gridTemplateColumns: {
									xs: "repeat(2, minmax(0, 1fr))",
									md: "170px minmax(0, 1fr) 170px 190px"
								},
								gridAutoRows: "minmax(44px, auto)",
								alignItems: "center",
								borderBottom: "1px solid",
								borderColor: "divider",
								gap: 2,
								minWidth: 0,
								overflow: "hidden"
							}}
						>
							<Button
								variant="outlined"
								startIcon={<ArrowBackIcon />}
								onClick={() => !isFirst && setPosition((p) => p - 1)}
								disabled={isFirst}
								sx={{
									height: 44,
									fontWeight: 900,
									borderRadius: 999,
									minWidth: 0,
									gridColumn: { xs: "1 / 2", md: "auto" },
									gridRow: { xs: "1", md: "auto" }
								}}
							>
								Back
							</Button>

							<Box
								sx={{
									display: "flex",
									justifyContent: "center",
									minWidth: 0,
									gridColumn: { xs: "1 / -1", md: "auto" },
									gridRow: { xs: "2", md: "auto" }
								}}
							>
								<Paper
									variant="outlined"
									sx={{
										height: 44,
										minWidth: 200,
										px: 2,
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										borderColor: "divider",
										borderRadius: 999,
										fontVariantNumeric: "tabular-nums",
										letterSpacing: 0.5,
										maxWidth: "100%"
									}}
								>
									<Typography sx={{ fontWeight: 900 }}>{formatHMS(timerLeft)}</Typography>
								</Paper>
							</Box>

							<Button
								variant="outlined"
								endIcon={<NavigateNextRoundedIcon />}
								onClick={() => !isLast && setPosition((p) => p + 1)}
								disabled={isLast || disableChat}
								sx={{
									height: 44,
									fontWeight: 900,
									justifySelf: "end",
									borderRadius: 999,
									minWidth: 0,
									gridColumn: { xs: "2 / 3", md: "auto" },
									gridRow: { xs: "1", md: "auto" }
								}}
							>
								Next
							</Button>

							<Button
								variant="outlined"
								startIcon={<CheckCircleRounded />}
								onClick={handleSubmitAll}
								disabled={!isLast || submitting}
								sx={{
									height: 44,
									fontWeight: 900,
									justifySelf: { xs: "stretch", md: "end" },
									borderRadius: 999,
									minWidth: 0,
									gridColumn: { xs: "1 / -1", md: "auto" },
									gridRow: { xs: "3", md: "auto" }
								}}
							>
								{submitting ? "Submitting..." : "Submit"}
							</Button>
						</Box>

						{/* MAIN */}
						<Box
							sx={{
								p: 2.5,
								display: "grid",
								gridTemplateColumns: {
									xs: "minmax(0, 1fr)",
									md: "minmax(280px, 360px) minmax(0, 1fr) minmax(280px, 360px)",
									xl: "420px minmax(0, 1fr) 420px"
								},
								gap: 3,
								minHeight: 0,
								minWidth: 0,
								overflowX: "hidden",
								overflowY: { xs: "auto", md: "hidden" },
								alignItems: "stretch"
							}}
						>
							{/* LEFT: Avatar stage */}
							<Box
								sx={{
									minHeight: 0,
									minWidth: 0,
									display: "flex",
									flexDirection: "column",
									overflow: "hidden"
								}}
							>
								<Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 0.5, pb: 1, minWidth: 0 }}>
									<Typography sx={{ fontWeight: 900, fontSize: 13 }} noWrap>{patientName}</Typography>
									<Tooltip title="Patient details">
										<IconButton onClick={() => setScriptOpen(true)} size="small">
											<DescriptionOutlinedIcon fontSize="small" />
										</IconButton>
									</Tooltip>
								</Stack>

								<Paper
									elevation={0}
									sx={{
										height: { xs: 360, md: "100%" },
										minHeight: 0,
										flex: 1,
										borderRadius: 4,
										boxShadow: "0 18px 36px rgba(15,23,42,0.10)",
										position: "relative",
										overflow: "hidden",
										p: 2,
										display: "grid",
										placeItems: "center"
									}}
								>
									<Box
										title={avatarState}
										sx={{
											position: "absolute",
											right: 16,
											top: 16,
											width: 10,
											height: 10,
											borderRadius: 999,
											bgcolor: (avatarState === "listening") ? "#ff3b5c" : "#c7cbd6",
											boxShadow: (avatarState === "listening")
												? "0 0 0 4px rgba(255,59,92,.18)"
												: "0 0 0 4px rgba(199,203,214,.18)"
										}}
									/>
									<ProceduralAvatar gender={gender} state={avatarState} size={340} />
								</Paper>
							</Box>

							{/* MIDDLE: chat */}
							<Paper
								elevation={0}
								sx={{
									borderRadius: 4,
									minHeight: 0,
									minWidth: 0,
									overflow: "hidden",
									boxShadow: "0 10px 24px rgba(15,23,42,0.06)",
									display: "flex",
									flexDirection: "column"
								}}
							>
								<Box
									ref={chatRef}
									sx={{
										flex: 1,
										minHeight: 0,
										minWidth: 0,
										overflowY: "auto",
										px: 2,
										py: 2
									}}
								>
									{msgs.map((m) => (
										<MessageBubble key={m.id} side={m.side} text={m.text} />
									))}
								</Box>
							</Paper>

							{/* RIGHT: details + Q&A */}
							<Box
								sx={{
									minHeight: 0,
									minWidth: 0,
									display: "flex",
									flexDirection: "column",
									gap: 2,
									overflowY: "auto",
									overflowX: "hidden",
									pr: 0.5
								}}
							>
								<Paper sx={{ p: 2, minWidth: 0 }}>
									<Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ minWidth: 0 }}>
										<Typography variant="subtitle1" sx={{ fontWeight: 900 }}>Patient details</Typography>
										<Button variant="outlined" size="small" onClick={() => setScriptOpen(true)} sx={{ borderRadius: 999 }}>
											View
										</Button>
									</Stack>
									<Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
										Open the patient case details in a centered window.
									</Typography>
								</Paper>

								<QuestionsBox questions={questions} answers={answers} onAnswer={handleAnswer} />
								<QuestionStatusPanel questions={questions} answers={answers} />
							</Box>
						</Box>

						{/* BOTTOM COMPOSER */}
						<Box
							sx={{
								px: 2.5,
								display: "grid",
								gridTemplateColumns: {
									xs: "48px minmax(0, 1fr) 110px",
									sm: "56px minmax(0, 1fr) 140px"
								},
								alignItems: "center",
								gap: 2,
								borderTop: "1px solid",
								borderColor: "divider",
								bgcolor: "#fff",
								minWidth: 0,
								overflow: "hidden"
							}}
						>
							<IconButton
								onClick={async () => {
									if (disableChat) return;
									stopTalking();
									setAwaitingLLM(false);

									if (!isRecording) {
										try {
											await startRecording();
										} catch (e) {
											console.error("Mic permission/recording error:", e);
											setIsRecording(false);
										}
									} else {
										await stopRecording();
									}
								}}
								disabled={disableChat || isTranscribing}
								sx={{
									width: 44,
									height: 44,
									border: "1px solid",
									borderColor: "divider",
									bgcolor: "#fff",
									color: (isRecording || isTranscribing) ? "#ff3b5c" : "text.primary",
									minWidth: 0
								}}
							>
								<MicRoundedIcon />
							</IconButton>

							<Paper
								variant="outlined"
								sx={{
									height: 44,
									borderRadius: 999,
									borderColor: "divider",
									display: "flex",
									alignItems: "center",
									px: 2,
									gap: 1,
									minWidth: 0,
									overflow: "hidden"
								}}
							>
								<Typography sx={{ fontSize: 13, color: "text.secondary", flexShrink: 0 }}>Aa</Typography>
								<Divider orientation="vertical" flexItem sx={{ borderColor: "divider", flexShrink: 0 }} />

								<TextField
									variant="standard"
									fullWidth
									value={draft}
									disabled={disableChat || isTranscribing}
									placeholder={disableChat ? "Time's up" : (isTranscribing ? "Transcribing..." : "")}
									onChange={(e) => {
										const val = e.target.value;

										stopTalking();
										setTypingActive(true);
										if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
										typingTimerRef.current = setTimeout(() => setTypingActive(false), 700);

										setWorkByPos((prev) => {
											const cur = prev[position] || { msgs: [], answers: {}, draft: "" };
											return { ...prev, [position]: { ...cur, draft: val } };
										});
									}}
									onBlur={() => setTypingActive(false)}
									onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
									InputProps={{ disableUnderline: true }}
									sx={{ minWidth: 0 }}
								/>
							</Paper>

							<Button
								variant="outlined"
								endIcon={<SendRoundedIcon />}
								onClick={handleSend}
								disabled={disableChat || sending || awaitingLLM || isTranscribing || !String(draft || "").trim()}
								sx={{
									height: 44,
									fontWeight: 900,
									borderRadius: 999,
									minWidth: 0,
									px: { xs: 1.25, sm: 2 }
								}}
							>
								{awaitingLLM ? "Thinking..." : (sending ? "Sending..." : "Send")}
							</Button>
						</Box>
					</Paper>

					{/* Patient script dialog */}
					<Dialog open={scriptOpen} onClose={() => setScriptOpen(false)} maxWidth="sm" fullWidth>
						<DialogTitle sx={{ fontWeight: 900 }}>Patient script</DialogTitle>
						<DialogContent dividers>
							<Typography variant="body2" whiteSpace="pre-wrap">
								{patientScript || "No patient script available."}
							</Typography>
						</DialogContent>
						<DialogActions>
							<Button onClick={() => setScriptOpen(false)} sx={{ borderRadius: 999 }}>Close</Button>
						</DialogActions>
					</Dialog>

					{/* Submit success dialog */}
					<Dialog open={successOpen} onClose={() => setSuccessOpen(false)} maxWidth="xs" fullWidth>
						<DialogTitle sx={{ textAlign: "center", fontWeight: 900 }}>Attempt submitted</DialogTitle>
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
									navigate(-1);
								}}
								sx={{ borderRadius: 999 }}
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