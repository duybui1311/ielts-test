import * as React from "react";
import {
	Box, Paper, Stack, TextField, Button, Typography,
	InputAdornment, IconButton, Alert
} from "@mui/material";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import AccountCircleRounded from "@mui/icons-material/AccountCircleRounded";
import LockRounded from "@mui/icons-material/LockRounded";
import { useNavigate, useLocation } from "react-router-dom";

/* ---------- API base + URL helper ---------- */
const API_BASE = "http://127.0.0.1:8000";

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

function setAuthed(role, info = {}) {
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

/* ------------------------------ Component ------------------------------ */

export default function Login() {
	const navigate = useNavigate();
	const location = useLocation();

	const next = React.useMemo(() => {
		const p = new URLSearchParams(location.search);
		return p.get("next") || "/dashboard";
	}, [location.search]);

	// form state
	const [identifier, setIdentifier] = React.useState(""); // email or username
	const [password, setPassword] = React.useState("");
	const [show, setShow] = React.useState(false);

	// ui state
	const [submitting, setSubmitting] = React.useState(false);
	const [error, setError] = React.useState("");

	// If already signed in, redirect away from login (no auto-login)
	React.useEffect(() => {
		const authed = localStorage.getItem("osce-auth") === "1";
		if (authed) navigate(next, { replace: true });
	}, [navigate, next]);

	const onSubmit = async (e) => {
		e.preventDefault();
		setError("");

		const trimmedId = identifier.trim();

		if (!trimmedId) {
			setError("Please enter your email or username.");
			return;
		}
		if (!password) {
			setError("Please enter your password.");
			return;
		}

		try {
			setSubmitting(true);

			const res = await fetch(joinURL(API_BASE, "/api/auth/login"), {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					// Backend accepts either email OR username in this field
					email: trimmedId,
					password: password,
				}),
			});

			let data = null;
			try {
				data = await res.json();
			} catch {
				// response might not be JSON on error
			}

			if (!res.ok) {
				const msg =
					(data && (data.detail || data.message)) ||
					"Invalid email/username or password.";
				setError(msg);
				return;
			}

			// Expected shape: { user_id, name, role, token }
			const role = normalizeRole(data?.role) || "student";
			const userId = data?.user_id;
			const name = data?.name || "";
			const token = data?.token || null;

			setAuthed(role, {
				userId,
				name,
				email: trimmedId,
				token,
			});

			if (role === "admin") {
				navigate("/admin/accounts", { replace: true });
			} else {
				navigate(next, { replace: true });
			}
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
				placeItems: "center",
				bgcolor: "background.default",
				p: 2
			}}
		>
			<Paper component="form" onSubmit={onSubmit} sx={{ p: 3, width: 360 }}>
				<Stack spacing={2}>
					<Typography variant="h5" fontWeight={700}>Sign in</Typography>

					{sessionStorage.getItem("osce-just-logged-out") === "1" && (
						<Alert
							onClose={() => sessionStorage.removeItem("osce-just-logged-out")}
							severity="success"
						>
							You’ve signed out.
						</Alert>
					)}

					{error && <Alert severity="error">{error}</Alert>}

					{/* Email or Username */}
					<TextField
						label="Email or username"
						type="text"
						autoComplete="username"
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

					{/* Password */}
					<TextField
						label="Password"
						type={show ? "text" : "password"}
						autoComplete="current-password"
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

					<Button type="submit" variant="contained" disabled={submitting}>
						{submitting ? "Signing in…" : "Sign in"}
					</Button>

					{/* Helper text (kept same style/position) */}
					<Typography variant="caption" color="text.secondary">
						Use your registered email/username and password to sign in.
					</Typography>
				</Stack>
			</Paper>
		</Box>
	);
}
