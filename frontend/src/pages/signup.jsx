import * as React from "react";
import {
	Box, Stack, TextField, Button, Typography,
	InputAdornment, IconButton, Alert,
} from "@mui/material";
import { motion } from "framer-motion";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import LockRounded from "@mui/icons-material/LockRounded";
import EmailRounded from "@mui/icons-material/EmailRounded";
import BadgeRounded from "@mui/icons-material/BadgeRounded";
import { useNavigate } from "react-router-dom";
import { setAuthed, landingFor, isAuthed, getRole } from "../auth";
import { GradientText } from "../component/ui";
import AuthHero from "../component/AuthHero";

const MotionBox = motion.create(Box);

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
		if (isAuthed()) navigate(landingFor(getRole()), { replace: true });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const onSubmit = async (e) => {
		e.preventDefault();
		setError("");

		const trimmedEmail = email.trim();
		if (!trimmedEmail || !trimmedEmail.includes("@")) { setError("Please enter a valid email."); return; }
		// Mirror the backend policy (validate_password): non-blank, at least 8 chars.
		if (!password.trim()) { setError("Password is required."); return; }
		if (password.length < 8) { setError("Password must be at least 8 characters."); return; }

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
				gridTemplateColumns: { xs: "1fr", md: "1.05fr 1fr" },
				bgcolor: "background.default",
			}}
		>
			<AuthHero
				headline={<>Start your <Box component="span" sx={{ color: "#FF9013" }}>journey.</Box></>}
				sub="Sign up to take realistic tests across all four skills, get AI feedback on Writing & Speaking, and track your band scores over time."
			/>

			{/* Form panel */}
			<Box sx={{ display: "grid", placeItems: "center", p: { xs: 3, sm: 4 } }}>
				<MotionBox
					component="form"
					onSubmit={onSubmit}
					initial={{ opacity: 0, y: 18 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
					sx={(theme) => ({
						p: { xs: 3, sm: 4 }, width: "100%", maxWidth: 420, borderRadius: 4,
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
							<Typography variant="h4" fontWeight={800}>Get <GradientText>started</GradientText></Typography>
							<Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
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
							helperText="At least 8 characters"
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
				</MotionBox>
			</Box>
		</Box>
	);
}
