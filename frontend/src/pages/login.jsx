import * as React from "react";
import {
	Box, Stack, TextField, Button, Typography,
	InputAdornment, IconButton, Alert,
} from "@mui/material";
import { motion } from "framer-motion";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import AccountCircleRounded from "@mui/icons-material/AccountCircleRounded";
import LockRounded from "@mui/icons-material/LockRounded";
import { useNavigate, useLocation } from "react-router-dom";
import { GradientText } from "../component/ui";
import AuthHero from "../component/AuthHero";

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
	const [forgotMode, setForgotMode] = React.useState(false);
	const [forgotSent, setForgotSent] = React.useState("");
	const googleDivRef = React.useRef(null);

	React.useEffect(() => {
		if (isAuthed()) navigate(nextParam || landingFor(getRole()), { replace: true });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const finishLogin = React.useCallback((data, emailUsed) => {
		const role = normalizeRole(data?.role) || "student";
		setAuthed(role, {
			userId: data?.user_id,
			name: data?.name || "",
			email: emailUsed || data?.email || "",
			token: data?.token || null,
		});
		try {
			localStorage.setItem("bandly-email-verified", data?.email_verified === false ? "0" : "1");
		} catch { /* ignore */ }
		navigate(nextParam || landingFor(role), { replace: true });
	}, [navigate, nextParam]);

	// Google sign-in: render the official button when a client id is configured.
	const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
	React.useEffect(() => {
		if (!googleClientId || !googleDivRef.current) return;
		const onCredential = async (response) => {
			setError("");
			try {
				const res = await fetch(joinURL(API_BASE, "/api/auth/google"), {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ credential: response.credential }),
				});
				const data = await res.json().catch(() => ({}));
				if (!res.ok) { setError(data.detail || "Google sign-in failed."); return; }
				finishLogin(data);
			} catch {
				setError("Google sign-in failed. Please try again.");
			}
		};
		const render = () => {
			if (!window.google?.accounts?.id || !googleDivRef.current) return;
			window.google.accounts.id.initialize({ client_id: googleClientId, callback: onCredential });
			window.google.accounts.id.renderButton(googleDivRef.current, {
				theme: "outline", size: "large", width: 352, text: "continue_with",
			});
		};
		if (window.google?.accounts?.id) { render(); return; }
		const s = document.createElement("script");
		s.src = "https://accounts.google.com/gsi/client";
		s.async = true;
		s.onload = render;
		document.head.appendChild(s);
	}, [googleClientId, finishLogin]);

	const sendReset = async () => {
		setError("");
		const email = identifier.trim();
		if (!email || !email.includes("@")) { setError("Enter your account email first."); return; }
		try {
			setSubmitting(true);
			const res = await fetch(joinURL(API_BASE, "/api/auth/forgot"), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email }),
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) { setError(data.detail || "Could not send the reset email."); return; }
			setForgotSent(data.detail || "If that email has an account, a reset link is on its way.");
		} catch {
			setError("Could not send the reset email. Please try again.");
		} finally {
			setSubmitting(false);
		}
	};

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

			finishLogin(data, trimmedId);
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
			<AuthHero />

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
						{forgotSent && <Alert severity="success" onClose={() => setForgotSent("")}>{forgotSent}</Alert>}

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

						{!forgotMode && <TextField
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
						/>}

						{forgotMode ? (
							<Button variant="contained" size="large" disabled={submitting} onClick={sendReset}>
								{submitting ? "Sending…" : "Email me a reset link"}
							</Button>
						) : (
							<Button type="submit" variant="contained" size="large" disabled={submitting}>
								{submitting ? "Signing in…" : "Sign in"}
							</Button>
						)}

						<Typography variant="body2" textAlign="center">
							<Button
								variant="text" size="small"
								onClick={() => { setForgotMode((m) => !m); setError(""); setForgotSent(""); }}
								sx={{ p: 0, minWidth: 0, textTransform: "none" }}
							>
								{forgotMode ? "Back to sign in" : "Forgot password?"}
							</Button>
						</Typography>

						{googleClientId && !forgotMode && (
							<Box sx={{ display: "grid", placeItems: "center" }}>
								<Box ref={googleDivRef} />
							</Box>
						)}

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

						<Typography variant="caption" color="text.secondary" textAlign="center">
							By using Bandly you agree to our{" "}
							<Button variant="text" size="small" onClick={() => navigate("/terms")}
								sx={{ p: 0, minWidth: 0, verticalAlign: "baseline", textTransform: "none", fontSize: "inherit" }}>
								Terms
							</Button>{" "}and{" "}
							<Button variant="text" size="small" onClick={() => navigate("/privacy")}
								sx={{ p: 0, minWidth: 0, verticalAlign: "baseline", textTransform: "none", fontSize: "inherit" }}>
								Privacy Policy
							</Button>.
						</Typography>
					</Stack>
				</MotionBox>
			</Box>
		</Box>
	);
}
