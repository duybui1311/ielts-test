import * as React from "react";
import {
	Box, Paper, Stack, TextField, Button, Typography,
	InputAdornment, IconButton, Alert,
} from "@mui/material";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import AccountCircleRounded from "@mui/icons-material/AccountCircleRounded";
import LockRounded from "@mui/icons-material/LockRounded";
import EmailRounded from "@mui/icons-material/EmailRounded";
import BadgeRounded from "@mui/icons-material/BadgeRounded";
import AutoAwesomeRounded from "@mui/icons-material/AutoAwesomeRounded";
import { useNavigate } from "react-router-dom";
import { setAuthed, landingFor } from "./login";

// Relative by default so the Vite dev proxy (/api -> backend) and production
// both work without a hardcoded host.
const API_BASE = import.meta.env.VITE_API_URL || "";
const joinURL = (base, path) => (base ? `${base}${path.startsWith("/") ? path : `/${path}`}` : path);

export default function Signup() {
	const navigate = useNavigate();

	const [fullName, setFullName] = React.useState("");
	const [email, setEmail] = React.useState("");
	const [password, setPassword] = React.useState("");
	const [show, setShow] = React.useState(false);

	const [submitting, setSubmitting] = React.useState(false);
	const [error, setError] = React.useState("");

	React.useEffect(() => {
		if (localStorage.getItem("osce-auth") === "1") {
			navigate(landingFor(localStorage.getItem("osce-role") || "student"), { replace: true });
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const onSubmit = async (e) => {
		e.preventDefault();
		setError("");

		const trimmedEmail = email.trim();
		if (!trimmedEmail || !trimmedEmail.includes("@")) { setError("Please enter a valid email."); return; }
		if (password.length < 6) { setError("Password must be at least 6 characters."); return; }

		try {
			setSubmitting(true);
			const res = await fetch(joinURL(API_BASE, "/api/auth/register"), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: trimmedEmail,
					password,
					full_name: fullName.trim(),
				}),
			});

			let data = null;
			try { data = await res.json(); } catch { /* not JSON */ }

			if (!res.ok) {
				setError((data && (data.detail || data.message)) || "Could not create your account.");
				return;
			}

			const newRole = data?.role || "student";
			setAuthed(newRole, {
				userId: data?.user_id,
				name: data?.name || fullName.trim(),
				email: trimmedEmail,
				token: data?.token || null,
			});
			navigate(landingFor(newRole), { replace: true });
		} catch {
			setError("Unable to create your account. Please try again.");
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
						bottom: -120, left: -120,
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
					Create your account
				</Typography>
				<Typography sx={{ maxWidth: 460, opacity: 0.92, position: "relative" }}>
					Sign up to take realistic tests across all four skills, get AI feedback on
					Writing &amp; Speaking, and track your band scores over time.
				</Typography>
			</Box>

			{/* Form panel */}
			<Box sx={{ display: "grid", placeItems: "center", p: 3 }}>
				<Paper
					component="form"
					onSubmit={onSubmit}
					elevation={0}
					sx={{
						p: 4, width: "100%", maxWidth: 400, borderRadius: 3,
						border: "1px solid", borderColor: "divider",
						boxShadow: "0 1px 2px rgba(16,24,40,0.04), 0 18px 40px rgba(16,24,40,0.08)",
						animation: "appFadeInUp .5s cubic-bezier(0.22,1,0.36,1) both",
					}}
				>
					<Stack spacing={2.5}>
						<Box>
							<Typography variant="h5" fontWeight={800}>Get started</Typography>
							<Typography variant="body2" color="text.secondary">
								It only takes a moment.
							</Typography>
						</Box>

						{error && <Alert severity="error">{error}</Alert>}

						<TextField
							label="Full name"
							type="text"
							autoComplete="name"
							value={fullName}
							onChange={(e) => setFullName(e.target.value)}
							fullWidth
							slotProps={{
								input: {
									startAdornment: (
										<InputAdornment position="start">
											<BadgeRounded fontSize="small" />
										</InputAdornment>
									),
								},
							}}
						/>

						<TextField
							label="Email"
							type="email"
							autoComplete="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							fullWidth
							required
							slotProps={{
								input: {
									startAdornment: (
										<InputAdornment position="start">
											<EmailRounded fontSize="small" />
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
							helperText="At least 6 characters"
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
							{submitting ? "Creating account…" : "Create student account"}
						</Button>

						<Typography variant="caption" color="text.secondary" textAlign="center">
							Teacher accounts are set up by an administrator.
						</Typography>

						<Typography variant="body2" color="text.secondary" textAlign="center">
							Already have an account?{" "}
							<Button
								variant="text"
								size="small"
								onClick={() => navigate("/login")}
								sx={{ p: 0, minWidth: 0, verticalAlign: "baseline", textTransform: "none" }}
							>
								Sign in
							</Button>
						</Typography>
					</Stack>
				</Paper>
			</Box>
		</Box>
	);
}
