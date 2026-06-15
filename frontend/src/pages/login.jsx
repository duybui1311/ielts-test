import * as React from "react";
import {
	Box, Stack, TextField, Button, Typography,
	InputAdornment, IconButton, Alert, alpha,
} from "@mui/material";
import { motion } from "framer-motion";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import AccountCircleRounded from "@mui/icons-material/AccountCircleRounded";
import LockRounded from "@mui/icons-material/LockRounded";
import AutoAwesomeRounded from "@mui/icons-material/AutoAwesomeRounded";
import MenuBookRounded from "@mui/icons-material/MenuBookRounded";
import HeadphonesRounded from "@mui/icons-material/HeadphonesRounded";
import EditNoteRounded from "@mui/icons-material/EditNoteRounded";
import MicRounded from "@mui/icons-material/MicRounded";
import BoltRounded from "@mui/icons-material/BoltRounded";
import { useNavigate, useLocation } from "react-router-dom";
import { GradientText } from "../component/ui";

/* ---------- API base + URL helper ---------- */
// Relative by default so the Vite dev proxy (/api -> backend) and production
// both work without a hardcoded host.
const API_BASE = import.meta.env.VITE_API_URL || "";

const joinURL = (base, path) => {
	if (!base) return path;
	return `${base}${path.startsWith("/") ? path : `/${path}`}`;
};

/* ---------- Auth helpers now live in ../auth (re-exported for compatibility) ---------- */
import {
	setAuthed, logout, getRole, landingFor, isAuthed, normalizeRole,
} from "../auth";
export { setAuthed, logout, getRole, landingFor };

const MotionBox = motion.create(Box);

const SKILLS = [
	{ icon: <MenuBookRounded />, label: "Reading", grad: "linear-gradient(135deg,#3B82F6,#06B6D4)" },
	{ icon: <HeadphonesRounded />, label: "Listening", grad: "linear-gradient(135deg,#10B981,#34D399)" },
	{ icon: <EditNoteRounded />, label: "Writing", grad: "linear-gradient(135deg,#8B5CF6,#EC4899)" },
	{ icon: <MicRounded />, label: "Speaking", grad: "linear-gradient(135deg,#F97316,#F59E0B)" },
];

/* ------------------------------ Hero panel ------------------------------ */

function HeroPanel() {
	return (
		<Box
			sx={(theme) => ({
				position: "relative",
				overflow: "hidden",
				display: { xs: "none", md: "flex" },
				flexDirection: "column",
				justifyContent: "center",
				gap: 3.5,
				p: { md: 6, lg: 8 },
				color: "#fff",
				background: theme.gradients.hero,
				backgroundSize: "200% 200%",
				animation: "appGradientShift 14s ease infinite",
			})}
		>
			{/* floating glow orbs */}
			<Box sx={{ position: "absolute", top: -110, right: -90, width: 360, height: 360, borderRadius: "50%",
				background: "radial-gradient(circle, rgba(251,191,36,0.45) 0%, rgba(251,191,36,0) 70%)",
				animation: "appPulseGlow 9s ease-in-out infinite" }} />
			<Box sx={{ position: "absolute", bottom: -120, left: -80, width: 320, height: 320, borderRadius: "50%",
				background: "radial-gradient(circle, rgba(56,189,248,0.4) 0%, rgba(56,189,248,0) 70%)",
				animation: "appPulseGlow 11s ease-in-out infinite 1s" }} />

			<MotionBox
				initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
				sx={{ position: "relative" }}
			>
				<Stack direction="row" spacing={1.5} alignItems="center">
					<Box sx={{ width: 48, height: 48, borderRadius: 2.5, display: "grid", placeItems: "center",
						fontWeight: 800, fontSize: 24, bgcolor: "rgba(255,255,255,0.16)", border: "1px solid rgba(255,255,255,0.28)",
						backdropFilter: "blur(6px)" }}>
						B
					</Box>
					<Typography variant="h5" fontWeight={800}>Bandly</Typography>
				</Stack>
			</MotionBox>

			<MotionBox
				initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.08 }}
				sx={{ position: "relative" }}
			>
				<Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
					<AutoAwesomeRounded sx={{ fontSize: 18 }} />
					<Typography variant="overline" sx={{ opacity: 0.92 }}>
						AI-powered IELTS preparation
					</Typography>
				</Stack>
				<Typography variant="h2" fontWeight={800} sx={{ maxWidth: 520, lineHeight: 1.05 }}>
					Practice. Auto-grade.{" "}
					<Box component="span" sx={{ color: "#FCD34D" }}>Improve.</Box>
				</Typography>
				<Typography sx={{ maxWidth: 480, opacity: 0.92, mt: 2, fontSize: "1.05rem" }}>
					Realistic tests across all four skills, instant band scores, AI feedback on
					Writing &amp; Speaking, and a clear map of what to work on next.
				</Typography>
			</MotionBox>

			{/* floating skill cards */}
			<Box sx={{ position: "relative", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, maxWidth: 460 }}>
				{SKILLS.map((s, i) => (
					<MotionBox
						key={s.label}
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.45, delay: 0.2 + i * 0.08 }}
						whileHover={{ y: -5, scale: 1.02 }}
						sx={{
							display: "flex", alignItems: "center", gap: 1.5, p: 1.75, borderRadius: 3,
							bgcolor: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)",
							backdropFilter: "blur(8px)", cursor: "default",
						}}
					>
						<Box sx={{ width: 38, height: 38, borderRadius: 2, display: "grid", placeItems: "center",
							background: s.grad, boxShadow: "0 6px 16px rgba(0,0,0,0.25)", "& svg": { fontSize: 20 } }}>
							{s.icon}
						</Box>
						<Typography fontWeight={700}>{s.label}</Typography>
					</MotionBox>
				))}
			</Box>

			<MotionBox
				initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.55 }}
				sx={{ position: "relative" }}
			>
				<Stack direction="row" spacing={3} sx={{ mt: 1 }}>
					{[
						{ icon: <BoltRounded sx={{ fontSize: 18 }} />, k: "Instant", v: "band scores" },
						{ icon: <AutoAwesomeRounded sx={{ fontSize: 18 }} />, k: "AI-graded", v: "writing & speaking" },
						{ icon: <MenuBookRounded sx={{ fontSize: 18 }} />, k: "All 4", v: "skills covered" },
					].map((m) => (
						<Stack key={m.k} spacing={0.25}>
							<Stack direction="row" spacing={0.5} alignItems="center">
								{m.icon}
								<Typography fontWeight={800}>{m.k}</Typography>
							</Stack>
							<Typography variant="caption" sx={{ opacity: 0.85 }}>{m.v}</Typography>
						</Stack>
					))}
				</Stack>
			</MotionBox>
		</Box>
	);
}

/* ------------------------------ Component ------------------------------ */

export default function Login() {
	const navigate = useNavigate();
	const location = useLocation();

	const nextParam = React.useMemo(() => {
		const p = new URLSearchParams(location.search);
		return p.get("next");
	}, [location.search]);

	// form state
	const [identifier, setIdentifier] = React.useState("");
	const [password, setPassword] = React.useState("");
	const [show, setShow] = React.useState(false);

	// ui state
	const [submitting, setSubmitting] = React.useState(false);
	const [error, setError] = React.useState("");

	React.useEffect(() => {
		if (isAuthed()) navigate(nextParam || landingFor(getRole()), { replace: true });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const onSubmit = async (e) => {
		e.preventDefault();
		setError("");

		const trimmedId = identifier.trim();
		if (!trimmedId) { setError("Please enter your email or username."); return; }
		if (!password) { setError("Please enter your password."); return; }

		try {
			setSubmitting(true);
			const res = await fetch(joinURL(API_BASE, "/api/auth/login"), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email: trimmedId, password }),
			});

			let data = null;
			try { data = await res.json(); } catch { /* not JSON */ }

			if (!res.ok) {
				setError((data && (data.detail || data.message)) || "Invalid email/username or password.");
				return;
			}

			const role = normalizeRole(data?.role) || "student";
			setAuthed(role, {
				userId: data?.user_id,
				name: data?.name || "",
				email: trimmedId,
				token: data?.token || null,
			});

			navigate(nextParam || landingFor(role), { replace: true });
		} catch {
			setError("Unable to sign in. Please try again.");
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Box
			sx={{
				minHeight: "100vh",
				display: "grid",
				gridTemplateColumns: { xs: "1fr", md: "1.05fr 1fr" },
				bgcolor: "background.default",
			}}
		>
			<HeroPanel />

			{/* Form panel */}
			<Box sx={{ display: "grid", placeItems: "center", p: { xs: 3, sm: 4 } }}>
				<MotionBox
					component="form"
					onSubmit={onSubmit}
					initial={{ opacity: 0, y: 18 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
					sx={(theme) => ({
						p: { xs: 3, sm: 4 }, width: "100%", maxWidth: 420,
						borderRadius: 4,
						bgcolor: "background.paper",
						border: `1px solid ${theme.palette.divider}`,
						boxShadow: theme.customShadows.card,
					})}
				>
					<Stack spacing={2.5}>
						{/* mobile brand mark */}
						<Box sx={{ display: { xs: "block", md: "none" } }}>
							<Stack direction="row" spacing={1} alignItems="center">
								<Box sx={(theme) => ({ width: 38, height: 38, borderRadius: 2, color: "#fff",
									display: "grid", placeItems: "center", fontWeight: 800, background: theme.gradients.brand })}>
									B
								</Box>
								<Typography variant="h6" fontWeight={800}>Bandly</Typography>
							</Stack>
						</Box>

						<Box>
							<Typography variant="h4" fontWeight={800}>
								Welcome <GradientText>back</GradientText>
							</Typography>
							<Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
								Sign in to continue your practice.
							</Typography>
						</Box>

						{sessionStorage.getItem("osce-just-logged-out") === "1" && (
							<Alert
								onClose={() => sessionStorage.removeItem("osce-just-logged-out")}
								severity="success"
							>
								You've signed out.
							</Alert>
						)}

						{error && <Alert severity="error">{error}</Alert>}

						<TextField
							label="Email or username"
							type="text"
							autoComplete="off"
							value={identifier}
							onChange={(e) => setIdentifier(e.target.value)}
							fullWidth
							required
							slotProps={{
								input: {
									startAdornment: (
										<InputAdornment position="start">
											<AccountCircleRounded fontSize="small" />
										</InputAdornment>
									),
								},
							}}
						/>

						<TextField
							label="Password"
							type={show ? "text" : "password"}
							autoComplete="new-password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							fullWidth
							required
							slotProps={{
								input: {
									startAdornment: (
										<InputAdornment position="start">
											<LockRounded fontSize="small" />
										</InputAdornment>
									),
									endAdornment: (
										<InputAdornment position="end">
											<IconButton
												onClick={() => setShow((s) => !s)}
												edge="end"
												aria-label="toggle password visibility"
											>
												{show ? <VisibilityOff /> : <Visibility />}
											</IconButton>
										</InputAdornment>
									),
								},
							}}
						/>

						<Button type="submit" variant="contained" size="large" disabled={submitting}>
							{submitting ? "Signing in…" : "Sign in"}
						</Button>

						<Typography variant="body2" color="text.secondary" textAlign="center">
							New here?{" "}
							<Button
								variant="text"
								size="small"
								onClick={() => navigate("/signup")}
								sx={{ p: 0, minWidth: 0, verticalAlign: "baseline", textTransform: "none" }}
							>
								Create an account
							</Button>
						</Typography>
					</Stack>
				</MotionBox>
			</Box>
		</Box>
	);
}
