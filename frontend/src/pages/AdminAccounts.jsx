import * as React from "react";
import {
	Box,
	Paper,
	Stack,
	Typography,
	TextField,
	Button,
	Select,
	MenuItem,
	FormControl,
	InputLabel,
	Table,
	TableHead,
	TableRow,
	TableCell,
	TableBody,
	Chip,
	Dialog,
	DialogTitle,
	DialogContent,
	DialogActions,
	Alert,
	IconButton,
	Tooltip,
	Snackbar,
	TableSortLabel
} from "@mui/material";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import { Navigate } from "react-router-dom";
import { getRole } from "./login";

const API_BASE = "http://127.0.0.1:8000";

const userIdHeader = () => localStorage.getItem("osce-user-id") || "";

const joinURL = (base, path) => {
	if (!base) return path;
	return `${base}${path.startsWith("/") ? path : `/${path}`}`;
};

export default function AdminAccounts() {
	const role = getRole();

	const [roleFilter, setRoleFilter] = React.useState("all");
	const [statusFilter, setStatusFilter] = React.useState("all");
	const [searchInput, setSearchInput] = React.useState("");
	const [search, setSearch] = React.useState("");
	const [page, setPage] = React.useState(1);
	const pageSize = 20;
	const [sortBy, setSortBy] = React.useState("created_at");
	const [sortDir, setSortDir] = React.useState("desc");

	const [data, setData] = React.useState({ items: [], meta: { page: 1, size: pageSize, total: 0 } });
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState("");
	const [snack, setSnack] = React.useState({ open: false, message: "", severity: "success" });

	const [createForm, setCreateForm] = React.useState({
		email: "",
		username: "",
		full_name: "",
		role: "student"
	});
	const [creating, setCreating] = React.useState(false);

	const [passwordDialog, setPasswordDialog] = React.useState({ open: false, password: "", title: "" });
	const [confirmDialog, setConfirmDialog] = React.useState({
		open: false,
		title: "",
		body: "",
		onConfirm: null,
	});

	const adminId = localStorage.getItem("osce-user-id") || "";

	const sortedItems = React.useMemo(() => {
		const items = Array.isArray(data.items) ? [...data.items] : [];
		const dir = sortDir === "asc" ? 1 : -1;
		const norm = (v) => (v == null ? "" : String(v).toLowerCase());
		return items.sort((a, b) => {
			let av = a?.[sortBy];
			let bv = b?.[sortBy];
			if (sortBy === "created_at") {
				const ad = av ? new Date(av).getTime() : 0;
				const bd = bv ? new Date(bv).getTime() : 0;
				return ad === bd ? 0 : (ad > bd ? dir : -dir);
			}
			const as = norm(av);
			const bs = norm(bv);
			if (as === bs) return 0;
			return as > bs ? dir : -dir;
		});
	}, [data.items, sortBy, sortDir]);

	const toggleSort = (field) => {
		if (sortBy === field) {
			setSortDir((d) => (d === "asc" ? "desc" : "asc"));
		} else {
			setSortBy(field);
			setSortDir("asc");
		}
	};

	const totalPages = Math.max(1, Math.ceil((data.meta?.total || 0) / pageSize));

	const loadUsers = React.useCallback(async () => {
		setLoading(true);
		setError("");
		try {
			const params = new URLSearchParams();
			if (roleFilter !== "all") params.set("role", roleFilter);
			if (statusFilter !== "all") params.set("status", statusFilter);
			if (search) params.set("search", search);
			params.set("page", String(page));
			params.set("size", String(pageSize));

			const res = await fetch(joinURL(API_BASE, `/api/admin/users?${params.toString()}`), {
				headers: {
					"X-User-Id": userIdHeader(),
				},
			});

			const payload = await res.json();
			if (!res.ok) {
				throw new Error(payload?.detail || "Failed to load users.");
			}
			setData(payload);
			setSnack({ open: true, message: "Loaded users", severity: "success" });
		} catch (e) {
			setError(e.message || "Failed to load users.");
			setSnack({ open: true, message: e.message || "Failed to load users.", severity: "error" });
		} finally {
			setLoading(false);
		}
	}, [roleFilter, statusFilter, search, page]);

	React.useEffect(() => {
		loadUsers();
	}, [loadUsers]);

	const onSearch = () => {
		setPage(1);
		setSearch(searchInput.trim());
	};

	React.useEffect(() => {
		const t = setTimeout(() => {
			setPage(1);
			setSearch(searchInput.trim());
		}, 400);
		return () => clearTimeout(t);
	}, [searchInput]);

	const openPasswordDialog = (title, password) => {
		setPasswordDialog({ open: true, title, password });
	};

	const createUser = async (e) => {
		e.preventDefault();
		setError("");
		setCreating(true);
		try {
			const res = await fetch(joinURL(API_BASE, "/api/admin/users"), {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-User-Id": userIdHeader(),
				},
				body: JSON.stringify({
					email: createForm.email || null,
					username: createForm.username || null,
					full_name: createForm.full_name || null,
					role: createForm.role,
				}),
			});
			const payload = await res.json();
			if (!res.ok) {
				throw new Error(payload?.detail || "Failed to create user.");
			}
			openPasswordDialog("Temp password created", payload?.temp_password || "");
			setCreateForm({ email: "", username: "", full_name: "", role: "student" });
			loadUsers();
			setSnack({ open: true, message: "User created", severity: "success" });
		} catch (e) {
			setError(e.message || "Failed to create user.");
			setSnack({ open: true, message: e.message || "Failed to create user.", severity: "error" });
		} finally {
			setCreating(false);
		}
	};

	const updateUser = async (userId, patch) => {
		setError("");
		try {
			const res = await fetch(joinURL(API_BASE, `/api/admin/users/${userId}`), {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
					"X-User-Id": userIdHeader(),
				},
				body: JSON.stringify(patch),
			});
			const payload = await res.json();
			if (!res.ok) {
				throw new Error(payload?.detail || "Failed to update user.");
			}
			loadUsers();
			setSnack({ open: true, message: "User updated", severity: "success" });
		} catch (e) {
			setError(e.message || "Failed to update user.");
			setSnack({ open: true, message: e.message || "Failed to update user.", severity: "error" });
		}
	};

	const resetPassword = async (userId) => {
		setError("");
		try {
			const res = await fetch(joinURL(API_BASE, `/api/admin/users/${userId}/reset-password`), {
				method: "POST",
				headers: {
					"X-User-Id": userIdHeader(),
				},
			});
			const payload = await res.json();
			if (!res.ok) {
				throw new Error(payload?.detail || "Failed to reset password.");
			}
			openPasswordDialog("Password reset", payload?.temp_password || "");
			setSnack({ open: true, message: "Password reset", severity: "success" });
		} catch (e) {
			setError(e.message || "Failed to reset password.");
			setSnack({ open: true, message: e.message || "Failed to reset password.", severity: "error" });
		}
	};

	const openConfirm = (title, body, onConfirm) => {
		setConfirmDialog({ open: true, title, body, onConfirm });
	};

	const closeConfirm = () => {
		setConfirmDialog({ open: false, title: "", body: "", onConfirm: null });
	};

	if (role !== "admin") {
		return <Navigate to="/dashboard" replace />;
	}

	return (
		<Box sx={{ maxWidth: 1200, mx: "auto", bgcolor: "grey.100", p: { xs: 1, md: 2 }, borderRadius: 2 }}>
			<Stack spacing={2}>
				<Typography variant="h4" fontWeight={700}>Account List</Typography>

				{error && <Alert severity="error">{error}</Alert>}

				<Paper component="form" onSubmit={createUser} sx={{ p: 2 }}>
					<Stack spacing={2}>
						<Typography variant="subtitle1" fontWeight={600}>Create Account</Typography>
						<Stack direction={{ xs: "column", md: "row" }} spacing={2}>
							<TextField
								label="Full name"
								value={createForm.full_name}
								onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })}
								fullWidth
							/>
							<TextField
								label="Email"
								value={createForm.email}
								onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
								fullWidth
							/>
							<TextField
								label="Username"
								value={createForm.username}
								onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
								fullWidth
							/>
							<FormControl fullWidth>
								<InputLabel>Role</InputLabel>
								<Select
									label="Role"
									value={createForm.role}
									onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
								>
									<MenuItem value="student">Student</MenuItem>
									<MenuItem value="teacher">Teacher</MenuItem>
									<MenuItem value="admin">Admin</MenuItem>
								</Select>
							</FormControl>
						</Stack>
						<Box>
							<Button type="submit" variant="contained" disabled={creating}>
								{creating ? "Creating..." : "Create user"}
							</Button>
						</Box>
					</Stack>
				</Paper>

				<Paper sx={{ p: 2 }}>
					<Stack spacing={2}>
						<Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="center">
							<TextField
								label="Search (name, email, username)"
								value={searchInput}
								onChange={(e) => setSearchInput(e.target.value)}
								fullWidth
							/>
							<FormControl sx={{ minWidth: 160 }}>
								<InputLabel>Role</InputLabel>
								<Select
									label="Role"
									value={roleFilter}
									onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
								>
									<MenuItem value="all">All</MenuItem>
									<MenuItem value="student">Student</MenuItem>
									<MenuItem value="teacher">Teacher</MenuItem>
									<MenuItem value="admin">Admin</MenuItem>
								</Select>
							</FormControl>
							<FormControl sx={{ minWidth: 160 }}>
								<InputLabel>Status</InputLabel>
								<Select
									label="Status"
									value={statusFilter}
									onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
								>
									<MenuItem value="all">All</MenuItem>
									<MenuItem value="active">Active</MenuItem>
									<MenuItem value="disabled">Disabled</MenuItem>
								</Select>
							</FormControl>
							<Tooltip title="Refresh">
								<IconButton onClick={loadUsers}>
									<RefreshRoundedIcon />
								</IconButton>
							</Tooltip>
						</Stack>

						<Table size="small">
							<TableHead>
								<TableRow>
									<TableCell>ID</TableCell>
								<TableCell>
									<TableSortLabel
										active={sortBy === "username"}
										direction={sortBy === "username" ? sortDir : "asc"}
										onClick={() => toggleSort("username")}
									>
										Username
									</TableSortLabel>
								</TableCell>
								<TableCell>
									<TableSortLabel
										active={sortBy === "email"}
										direction={sortBy === "email" ? sortDir : "asc"}
										onClick={() => toggleSort("email")}
									>
										Email
									</TableSortLabel>
								</TableCell>
								<TableCell>Full name</TableCell>
								<TableCell>
									<TableSortLabel
										active={sortBy === "role"}
										direction={sortBy === "role" ? sortDir : "asc"}
										onClick={() => toggleSort("role")}
									>
										Role
									</TableSortLabel>
								</TableCell>
								<TableCell>Status</TableCell>
								<TableCell>
									<TableSortLabel
										active={sortBy === "created_at"}
										direction={sortBy === "created_at" ? sortDir : "asc"}
										onClick={() => toggleSort("created_at")}
									>
										Created
									</TableSortLabel>
								</TableCell>
								<TableCell align="right">Actions</TableCell>
							</TableRow>
						</TableHead>
						<TableBody>
								{sortedItems.map((u) => (
									<TableRow key={u.id}>
										<TableCell>{u.id}</TableCell>
										<TableCell>{u.username || "-"}</TableCell>
										<TableCell>{u.email || "-"}</TableCell>
										<TableCell>{u.full_name || "-"}</TableCell>
										<TableCell>
											<FormControl size="small" sx={{ minWidth: 120 }}>
												<Select
													value={u.role}
													onChange={(e) => updateUser(u.id, { role: e.target.value })}
												>
													<MenuItem value="student">Student</MenuItem>
													<MenuItem value="teacher">Teacher</MenuItem>
													<MenuItem value="admin">Admin</MenuItem>
												</Select>
											</FormControl>
										</TableCell>
										<TableCell>
											<Chip
												label={u.is_active ? "Active" : "Disabled"}
												color={u.is_active ? "success" : "default"}
												size="small"
											/>
										</TableCell>
										<TableCell>{u.created_at ? new Date(u.created_at).toLocaleDateString() : "-"}</TableCell>
										<TableCell align="right">
											<Stack direction="row" spacing={1} justifyContent="flex-end">
												<Tooltip
													title={
														String(u.id) === String(adminId) && u.is_active
															? "You cannot disable your own admin account."
															: ""
													}
												>
													<span>
														<Button
															size="small"
															variant="outlined"
															onClick={() => openConfirm(
																u.is_active ? "Disable account?" : "Enable account?",
																u.is_active
																	? `Disable ${u.username || u.email || `user ${u.id}`}. This account will be disabled and cannot log in.`
																	: "This account will be enabled and can log in.",
																() => updateUser(u.id, { is_active: !u.is_active })
															)}
															disabled={String(u.id) === String(adminId) && u.is_active}
														>
															{u.is_active ? "Disable" : "Enable"}
														</Button>
													</span>
												</Tooltip>
												<Button
													size="small"
													variant="contained"
													onClick={() => openConfirm(
														"Reset password?",
														`Reset password for ${u.username || u.email || `user ${u.id}`}. A new password will be generated.`,
														() => resetPassword(u.id)
													)}
												>
													Reset password
												</Button>
											</Stack>
										</TableCell>
									</TableRow>
								))}
								{!loading && data.items.length === 0 && (
									<TableRow>
										<TableCell colSpan={8}>
											<Typography color="text.secondary">No users found.</Typography>
										</TableCell>
									</TableRow>
								)}
							</TableBody>
						</Table>

						<Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
							<Typography variant="body2" color="text.secondary">
								{loading ? "Loading..." : `Total ${data.meta?.total || 0} users`}
							</Typography>
							<Stack direction="row" spacing={1} alignItems="center">
								<Button
									size="small"
									disabled={page <= 1}
									onClick={() => setPage((p) => Math.max(1, p - 1))}
								>
									Prev
								</Button>
								<Typography variant="body2">{page} / {totalPages}</Typography>
								<Button
									size="small"
									disabled={page >= totalPages}
									onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
								>
									Next
								</Button>
							</Stack>
						</Stack>
					</Stack>
				</Paper>
			</Stack>

			<Dialog open={passwordDialog.open} onClose={() => setPasswordDialog({ open: false, password: "", title: "" })}>
				<DialogTitle>{passwordDialog.title}</DialogTitle>
				<DialogContent>
					<Stack direction="row" spacing={1} alignItems="center">
						<Typography variant="body1" sx={{ wordBreak: "break-all" }}>
							{passwordDialog.password || "(empty)"}
						</Typography>
						<Tooltip title="Copy">
							<IconButton
								onClick={() => navigator.clipboard.writeText(passwordDialog.password || "")}
								size="small"
							>
								<ContentCopyRoundedIcon fontSize="small" />
							</IconButton>
						</Tooltip>
					</Stack>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setPasswordDialog({ open: false, password: "", title: "" })}>Close</Button>
				</DialogActions>
			</Dialog>

			<Dialog open={confirmDialog.open} onClose={closeConfirm}>
				<DialogTitle>{confirmDialog.title}</DialogTitle>
				<DialogContent>
					<Typography variant="body2">{confirmDialog.body}</Typography>
				</DialogContent>
				<DialogActions>
					<Button onClick={closeConfirm}>Cancel</Button>
					<Button
						variant="contained"
						onClick={() => {
							const fn = confirmDialog.onConfirm;
							closeConfirm();
							if (typeof fn === "function") fn();
						}}
					>
						Confirm
					</Button>
				</DialogActions>
			</Dialog>

			<Snackbar
				open={snack.open}
				autoHideDuration={2000}
				onClose={() => setSnack({ ...snack, open: false })}
				message={snack.message}
			/>
		</Box>
	);
}
