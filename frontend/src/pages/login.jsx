import * as React from "react";
import {
	Box, Paper, Stack, TextField, Button, Typography,
	InputAdornment, IconButton, Alert,
} from "@mui/material";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import AccountCircleRounded from "@mui/icons-material/AccountCircleRounded";
import LockRounded from "@mui/icons-material/LockRounded";
import AutoAwesomeRounded from "@mui/icons-material/AutoAwesomeRounded";
import MenuBookRounded from "@mui/icons-material/MenuBookRounded";
import HeadphonesRounded from "@mui/icons-material/HeadphonesRounded";
import EditNoteRounded from "@mui/icons-material/EditNoteRounded";
import MicRounded from "@mui/icons-material/MicRounded";
import { useNavigate, useLocation } from "react-router-dom";

/* ---------- API base + URL helper ---------- */
// Relative by default so the Vite dev proxy (/api -> backend) and production
// both work without a hardcoded host.
const API_BASE = import.meta.env.VITE_API_URL || "";

const joinURL = (base, path) => {
	if (!base) return path;
	return `${base}${path.startsWith("/") ? path : `/${path}`}`;
};

/* ---------- Auth helpers (kept for Navbar compatibility) ---------- */
function normalizeRole(r) {
	if (!r) return null;
	const v = String(r).toLowerCase().trim();
	if (v === "teacher" || v === "student" || v === "admin") return v;
	return null;
}

export function setAuthed(role, info = {}) {
	const cleanRole = normalizeRole(role) || "student";
	try {
		localStorage.setItem("osce-auth", "1");
		localStorage.setItem("osce-role", cleanRole);

		if (info.userId != null) {
			localStorage.setItem("osce-user-id", String(info.userId));
		}
		if (info.name) {
			localStorage.setItem("osce-name", info.name);
		}
		if (info.email) {
			localStorage.setItem("osce-email", info.email);
		}
		if (info.token) {
			localStorage.setItem("osce-token", info.token);
		}
	} catch {
		// ignore storage errors
	}
}

export function logout() {
	try {
		localStorage.removeItem("osce-auth");
		localStorage.removeItem("osce-role");
		localStorage.removeItem("osce-user-id");
		localStorage.removeItem("osce-name");
		localStorage.removeItem("osce-email");
		localStorage.removeItem("osce-token");
		sessionStorage.setItem("osce-just-logged-out", "1"); // one-shot flag
	} catch {
		// ignore
	}
}

export function getRole() {
	try {
		return normalizeRole(localStorage.getItem("osce-role")) || "student";
	} catch {
		return "student";
	}
}

export function landingFor(role) {
	if (role === "admin") return "/admin";
	if (role === "teacher") return "/manage-tests";
	return "/exams";
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
		const authed = localStorage.getItem("osce-auth") === "1";
		if (authed) navigate(nextParam || landingFor(getRole()), { replace: true });
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
				gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
				bgcolor: "background.default",
			}}
		>
			{/* Brand panel (desktop) */}
			<Box
				sx={{
					position: "relative",
					overflow: "hidden",
					display: { xs: "none", md: "flex" },
					flexDirection: "column",
					justifyContent: "center",
					gap: 3,
					p: 8,
					color: "#fff",
					background: "linear-gradient(150deg, #4338CA 0%, #6D28D9 55%, #9333EA 100%)",
					"&::after": {
						content: '""',
						position: "absolute",
						top: -120, right: -120,
						width: 360, height: 360,
						borderRadius: "50%",
						background: "radial-gradient(circle, rgba(245,158,11,0.35) 0%, rgba(245,158,11,0) 70%)",
					},
				}}
			>
				<Stack direction="row" spacing={1.5} alignItems="center" sx={{ position: "relative" }}>
					<Box
						sx={{
							width: 44, height: 44, borderRadius: 2,
							display: "grid", placeItems: "center", fontWeight: 800, fontSize: 22,
							bgcolor: "rgba(255,255,255,0.16)", border: "1px solid rgba(255,255,255,0.25)",
						}}
					>
						B
					</Box>
					<Typography variant="h5" fontWeight={800}>Bandly</Typography>
				</Stack>
				<Stack direction="row" spacing={1} alignItems="center" sx={{ position: "relative" }}>
					<AutoAwesomeRounded sx={{ fontSize: 18 }} />
					<Typography variant="overline" sx={{ opacity: 0.9, letterSpacing: "0.12em" }}>
						AI-powered IELTS preparation
					</Typography>
				</Stack>
				<Typography variant="h3" fontWeight={800} sx={{ maxWidth: 460, position: "relative" }}>
					Practice. Auto-grade. Improve.
				</Typography>
				<Typography sx={{ maxWidth: 460, opacity: 0.92, position: "relative" }}>
					Realistic tests across all four skills, instant band scores, AI feedback
					on Writing &amp; Speaking, and a clear map of what to work on next.
				</Typography>
				<Stack direction="row" spacing={1.25} sx={{ position: "relative", flexWrap: "wrap", gap: 1 }}>
					{[
						{ icon: <MenuBookRounded sx={{ fontSize: 18 }} />, label: "Reading" },
						{ icon: <HeadphonesRounded sx={{ fontSize: 18 }} />, label: "Listening" },
						{ icon: <EditNoteRounded sx={{ fontSize: 18 }} />, label: "Writing" },
						{ icon: <MicRounded sx={{ fontSize: 18 }} />, label: "Speaking" },
					].map((s) => (
						<Stack
							key={s.label}
							direction="row" spacing={0.75} alignItems="center"
							sx={{ px: 1.5, py: 0.75, borderRadius: 999, bgcolor: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)" }}
						>
							{s.icon}
							<Typography variant="body2" fontWeight={600}>{s.label}</Typography>
						</Stack>
					))}
				</Stack>
			</Box>

			{/* Form panel */}
			<Box sx={{ display: "grid", placeItems: "center", p: 3 }}>
				<Paper
					component="form"
					onSubmit={onSubmit}
					elevation={0}
					sx={{
						p: 4, width: "100%", maxWidth: 400,
						borderRadius: 3,
						border: "1px solid",
						borderColor: "divider",
						boxShadow: "0 1px 2px rgba(16,24,40,0.04), 0 18px 40px rgba(16,24,40,0.08)",
						animation: "appFadeInUp .5s cubic-bezier(0.22,1,0.36,1) both",
					}}
				>
					<Stack spacing={2.5}>
						<Box sx={{ display: { xs: "block", md: "none" }, mb: 0.5 }}>
							<Stack direction="row" spacing={1} alignItems="center">
								<Box
									sx={{
										width: 36, height: 36, borderRadius: 1.5, color: "#fff",
										display: "grid", placeItems: "center", fontWeight: 800,
										background: "linear-gradient(135deg, #4F46E5 0%, #8B5CF6 100%)",
									}}
								>
									B
								</Box>
								<Typography variant="h6" fontWeight={800}>Bandly</Typography>
							</Stack>
						</Box>
						<Box>
							<Typography variant="h5" fontWeight={800}>Welcome back</Typography>
							<Typography variant="body2" color="text.secondary">
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
				</Paper>
			</Box>
		</Box>
	);
}
