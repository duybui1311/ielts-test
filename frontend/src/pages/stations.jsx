import * as React from "react";
import {
    Box, Container, Grid, Typography,
    Chip, TextField, Stack, IconButton, InputAdornment, Button,
    Dialog, DialogContent, DialogActions, Checkbox, FormControlLabel, Paper,
    Divider, Tooltip, Avatar, Menu, MenuItem
} from "@mui/material";
import ButtonBase from "@mui/material/ButtonBase";
import SearchIcon from "@mui/icons-material/Search";
import TuneIcon from "@mui/icons-material/Tune";
import SortIcon from "@mui/icons-material/Sort";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import CategoryIcon from "@mui/icons-material/Category";
import TimelineIcon from "@mui/icons-material/Timeline";
import LayersIcon from "@mui/icons-material/Layers";
import SpeedIcon from "@mui/icons-material/Speed";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import { useNavigate } from "react-router-dom";

const API_BASE = "http://127.0.0.1:8000";

function CircuitRow({ item, onOpen }) {
    const releaseLabel = (() => {
        const raw = item.startAt || item.start_at || item.release_at;
        if (!raw) return "Not scheduled";
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) return String(raw);
        return d.toLocaleString();
    })();

    return (
        <Paper
            elevation={0}
            sx={{
                borderRadius: 1.5,
                border: "1px solid",
                borderColor: "divider",
                bgcolor: "#fff",
                boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
                overflow: "hidden",
            }}
        >
            <ButtonBase
                onClick={() => onOpen(item)}
                sx={{
                    width: "100%",
                    textAlign: "left",
                    display: "block",
                }}
            >
                <Box
                    sx={{
                        p: 2,
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 2,
                        alignItems: "center",
                    }}
                >
                    <Box sx={{ minWidth: 120 }}>
                        <TypeChip type={item.type} />
                    </Box>

                    <Box sx={{ minWidth: 260, flex: "2 1 260px" }}>
                        <Typography variant="subtitle1" fontWeight={700} noWrap>
                            {item.name}
                        </Typography>
                    </Box>

                    <Box sx={{ minWidth: 140 }}>
                        <DifficultyPill level={item.difficulty} />
                    </Box>

                    <Box sx={{ minWidth: 120 }}>
                        <StatusChip state={item.statusState} />
                    </Box>

                    <Box sx={{ minWidth: 180 }}>
                        <Typography variant="body2" fontWeight={600}>
                            {releaseLabel}
                        </Typography>
                    </Box>
                </Box>
            </ButtonBase>
        </Paper>
    );
}

function BulletRow({ icon, label, value }) {
    return (
        <Stack direction="row" spacing={1.2} alignItems="center" sx={{ minHeight: 28 }}>
            {icon}
            <Typography variant="body2" color="text.secondary" sx={{ width: 160 }}>
                {label}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>{value}</Typography>
        </Stack>
    );
}

function DifficultyPill({ level = "Low" }) {
    return (
        <Chip
            size="small"
            label={level}
            variant="outlined"
            sx={{
                height: 22,
                borderRadius: 999,
                px: 1,
                borderColor: "success.light",
                color: "success.main",
                "& .MuiChip-label": { display: "flex", alignItems: "center", gap: .5, py: 0 },
                "::before": {
                    content: '""',
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    backgroundColor: "success.main",
                    display: "inline-block"
                }
            }}
        />
    );
}

function TypeChip({ type }) {
    return (
        <Chip
            size="small"
            label={type}
            sx={{ height: 22, borderRadius: 999, bgcolor: "#635bff", color: "#fff" }}
        />
    );
}

function StatusChip({ state }) {
    const map = {
        submitted:     { label: "Submitted",     color: "info"    },
        not_submitted: { label: "Not submitted", color: "warning" },
        graded:        { label: "Graded",        color: "success" },
        in_progress:   { label: "In progress",   color: "default" },
        not_started:   { label: "Not started",   color: "default" },
    };
    const cfg = map[state] || map.not_submitted;
    return (
        <Chip
            size="small"
            label={cfg.label}
            color={cfg.color}
            variant="filled"
            sx={{ height: 22, borderRadius: 999, fontWeight: 600 }}
        />
    );
}

/* -------------------- Detail Modal (stacked list) -------------------- */
function CircuitDetailModal({ open, onClose, data, onStart }) {
    const [agree, setAgree] = React.useState(false);
    const [code, setCode] = React.useState("");

    React.useEffect(() => {
        if (!open) { setAgree(false); setCode(""); }
    }, [open]);

    if (!data) return null;

    const canStart = agree && code.trim() !== "";

    return (
        <Dialog
            open={open}
            onClose={onClose}
            aria-labelledby="circuit-title"
            maxWidth={false}
            slotProps={{
                paper: {
                    sx: {
                        width: { xs: "92vw", sm: "86vw", md: "820px" },
                        maxHeight: "86vh",
                        borderRadius: 3,
                        overflow: "hidden",
                        border: "1px solid",
                        borderColor: "divider",
                    }
                }
            }}
        >
            <DialogContent sx={{ p: { xs: 2, sm: 3 } }}>
                {/* Header */}
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                    <Typography id="circuit-title" variant="h5" fontWeight={800}>
                        {data.name}
                    </Typography>
                    <Tooltip title="Close">
                        <IconButton size="small" onClick={onClose}><CloseRoundedIcon /></IconButton>
                    </Tooltip>
                </Stack>

                {/* Stacked bullets */}
                <Stack spacing={1.0} sx={{ mt: .5, mb: 2 }}>
                    <BulletRow icon={<LayersIcon fontSize="small" color="action" />}     label="Stations"         value={`${data.stations} stations`} />
                    <BulletRow icon={<SpeedIcon fontSize="small" color="action" />}      label="Difficulty"        value={<DifficultyPill level={data.difficulty} />} />
                    <BulletRow icon={<AccessTimeIcon fontSize="small" color="action" />} label="Time limit"        value={`${data.timeLimit} min`} />
                    <BulletRow icon={<CategoryIcon fontSize="small" color="action" />}   label="Type"              value={<TypeChip type={data.type} />} />
                    <BulletRow icon={<TimelineIcon fontSize="small" color="action" />}   label="Time per station"  value={data.perStation} />
                    <BulletRow icon={<CheckRoundedIcon fontSize="small" color="action" />} label="Status"         value={<StatusChip state={data.statusState} />} />
                </Stack>

                {/* Access code — inline label + pill input (exact look) */}
                <Stack
                    direction={{ xs: "column", sm: "row" }}
                    alignItems={{ sm: "center" }}
                    spacing={1.5}
                    sx={{ mb: 2 }}
                >
                    <Typography
                        variant="body2"
                        fontWeight={600}
                        sx={{ minWidth: 220 }}
                    >
                        Enter access code/ exam code:
                    </Typography>

                    <TextField
                        required
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        size="small"
                        fullWidth
                        sx={{
                            "& .MuiOutlinedInput-root": {
                                height: 40,
                                borderRadius: 2,
                                backgroundColor: "#fff",
                                "& fieldset": { borderColor: "#E0E0E0" },
                                "&:hover fieldset": { borderColor: "#D5D5D5" },
                                "&.Mui-focused fieldset": { borderColor: "#D5D5D5" }
                            }
                        }}
                        slotProps={{
                            input: { inputProps: { "aria-label": "Access code" } }
                        }}
                    />
                </Stack>

                {/* Description */}
                <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" fontWeight={600} sx={{ mb: .75 }}>
                        Circuit description:
                    </Typography>
                    <Paper variant="outlined" sx={{ borderRadius: 2, p: 1.25, position: "relative", bgcolor: "grey.50" }}>
                        <Typography variant="body2" color="text.secondary">
                            This circuit will be the midterm exam of your Human Muscle course of this semester
                        </Typography>
                        <IconButton size="small" sx={{ position: "absolute", right: 6, bottom: 6 }}>
                            <EditOutlinedIcon fontSize="small" />
                        </IconButton>
                    </Paper>
                </Box>

                {/* Academic integrity */}
                <Box>
                    <Typography variant="h6" fontWeight={800} sx={{ mb: 1 }}>
                        Academic integrity form
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        I affirm that all work I submit is my own and that I will uphold the principles of academic honesty.
                        I will not plagiarize, cheat, or seek unauthorized help, and I will follow all assignment and exam
                        guidelines. I understand that any violation of academic integrity may result in disciplinary action.
                    </Typography>
                    <FormControlLabel
                        control={<Checkbox checked={agree} onChange={(e) => setAgree(e.target.checked)} />}
                        label="I have read and agree to this declaration."
                    />
                </Box>
            </DialogContent>

            <Divider />
            <DialogActions sx={{ p: { xs: 2, sm: 2.5 } }}>
                <Button onClick={onClose} color="inherit">Close</Button>
                <Button
                    variant="contained"
                    onClick={() => {
                        if (canStart) {
                            onStart({ code: code.trim(), agree });
                        }
                    }}
                    disabled={!canStart}
                    sx={{ bgcolor: "#635bff", "&:hover": { bgcolor: "#554fff" } }}
                >
                    Start
                </Button>
            </DialogActions>
        </Dialog>
    );
}

/* -------------------- Page -------------------- */
export default function Stations() {
    const navigate = useNavigate();

    // ---- Role: show "Create exam" only for teacher
    const role = React.useMemo(() => {
        const raw = (localStorage.getItem("osce-role") || "student").toLowerCase();
        return raw === "teacher" ? "teacher" : "student";
    }, []);

    // ---- User id for X-User-Id header (required by backend)
    const userId = React.useMemo(
        () => localStorage.getItem("osce-user-id") || "",
        []
    );

    React.useEffect(() => {
        if (!userId) {
            // If not logged in / no user id, send them to login page
            // (you can remove this if you handle it elsewhere)
            navigate("/login");
        }
    }, [userId, navigate]);

    // ---- Search / filter / sort / pagination state
    const [qRaw, setQRaw] = React.useState("");
    const [q, setQ] = React.useState("");
    const [filters, setFilters] = React.useState({
        status: "all",        // "all" | "submitted" | "not_submitted" | "graded" | "in_progress" | "not_started"
        difficulty: "all",    // "all" | "Low" | "Medium" | "High"
        type: "all",          // "all" | "Exam" | "Practice"
    });
    const [sort, setSort] = React.useState({ key: "progress", dir: "desc" }); // "progress" | "name" | "timeLimit"
    const [page, setPage] = React.useState(1);
    const [pageSize] = React.useState(24);
    const [items, setItems] = React.useState([]);
    const [loading, setLoading] = React.useState(false);

    // debounce search text
    React.useEffect(() => {
        const id = setTimeout(() => setQ(qRaw.trim().toLowerCase()), 200);
        return () => clearTimeout(id);
    }, [qRaw]);

    // ---- Map frontend sort state -> backend sort string
    const encodeSort = React.useCallback((s) => {
        if (!s) return "progress_desc";
        const { key, dir } = s;
        if (key === "name") {
            return dir === "asc" ? "name_asc" : "name_desc";
        }
        if (key === "timeLimit") {
            return dir === "asc" ? "time_asc" : "time_desc";
        }
        // default progress
        return dir === "asc" ? "progress_asc" : "progress_desc";
    }, []);

    // ---- Load circuits from backend (no mock)
    const loadCircuits = React.useCallback(
        async ({ q, filters, sort, page, pageSize }) => {
            setLoading(true);
            try {
                const params = new URLSearchParams();
                params.set("search", q || "");
                params.set("status", filters.status || "all");
                params.set("difficulty", filters.difficulty || "all");
                params.set("type", filters.type || "all");
                params.set("sort", encodeSort(sort));
                params.set("page", String(page));
                params.set("page_size", String(pageSize));

                const res = await fetch(`${API_BASE}/api/circuits?${params.toString()}`, {
                    headers: {
                        "Content-Type": "application/json",
                        "X-User-Id": userId || "",
                    },
                    credentials: "include", // if you later use cookies
                });

                if (!res.ok) {
                    let msg = `Failed to load circuits (${res.status})`;
                    try {
                        const err = await res.json();
                        if (err && err.detail) msg = err.detail;
                    } catch (_) { /* ignore */ }
                    console.error(msg);
                    setItems([]);
                    return;
                }

                const data = await res.json();
                // Backend shape: { items: CircuitItemOut[], total: number }
                setItems(Array.isArray(data.items) ? data.items : []);
            } catch (e) {
                console.error("Error loading circuits", e);
                setItems([]);
            } finally {
                setLoading(false);
            }
        },
        [encodeSort, userId]
    );

    // Load whenever query/sort/filters/page change
    React.useEffect(() => {
        if (!userId) return;
        loadCircuits({ q, filters, sort, page, pageSize });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [q, filters, sort, page, pageSize, userId]);

    // ---- Modal selection
    const [selected, setSelected] = React.useState(null);
    const [open, setOpen] = React.useState(false);

    const handleOpen = (item) => {
        setSelected(item);
        setOpen(true);
    };

    // ---- Start circuit: call /api/circuits/{exam_id}/access then navigate
    const handleStart = React.useCallback(
        async ({ code, agree }) => {
            if (!selected) return;
            if (!userId) {
                navigate("/login");
                return;
            }

            try {
                const res = await fetch(
                    `${API_BASE}/api/circuits/${selected.id}/access`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "X-User-Id": userId || "",
                        },
                        body: JSON.stringify({
                            access_code: code,
                            accept_integrity: !!agree,
                        }),
                        credentials: "include",
                    }
                );

                if (!res.ok) {
                    let msg = `Failed to start circuit (${res.status})`;
                    try {
                        const err = await res.json();
                        if (err && err.detail) msg = err.detail;
                    } catch (_) {}
                    window.alert(msg);
                    return;
                }

                const data = await res.json();
                // data: { ok, circuit_id, total_stations, name }

                setOpen(false);

                const circuitId = data.circuit_id ?? selected.id;

                if (role === "teacher") {
                    navigate("/marking", {
                        state: { circuitId, code },
                    });
                } else {
                    // PASS EVERYTHING NEEDED TO VIRTUALPATIENT
                    navigate("/chat", {
                        state: {
                            circuitId,
                            stations: selected.stations,
                            timeLimitMin: selected.timeLimit,
                            name: selected.name,
                        },
                    });
                }
            } catch (e) {
                console.error("Error starting circuit", e);
                window.alert("Unexpected error starting circuit. Please try again.");
            }
        },
        [selected, role, navigate, userId]
    );

    // ---- Menus for sort/filter
    const [sortAnchor, setSortAnchor] = React.useState(null);
    const [filterAnchor, setFilterAnchor] = React.useState(null);

    const openSort = (e) => setSortAnchor(e.currentTarget);
    const closeSort = () => setSortAnchor(null);
    const openFilter = (e) => setFilterAnchor(e.currentTarget);
    const closeFilter = () => setFilterAnchor(null);

    return (
        // Page background from theme
        <Box sx={{ bgcolor: "background.default", minHeight: "100vh" }}>
            {/* Full-width container; use horizontal padding only */}
            <Container maxWidth={false} sx={{ px: { xs: 2, md: 4 }, py: 2 }}>
                {/* Header strip (white, subtle border) */}
                <Box
                    sx={{
                        bgcolor: "#fff",
                        borderRadius: "20px",
                        border: "1px solid",
                        borderColor: "divider",
                        p: { xs: 1.5, md: 2 },
                        mb: 2,
                    }}
                >
                    <Grid container spacing={2} alignItems="center">
                        {/* Left: avatar + title + subtitle */}
                        <Grid item xs={12} md={4}>
                            <Stack direction="row" spacing={1.5} alignItems="center">
                                <Avatar sx={{ bgcolor: "grey.200", width: 48, height: 48 }} />
                                <Box>
                                    <Typography variant="h4" fontWeight={800} lineHeight={1.1}>
                                        OSCE Circuits
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        Start new stations or resume old ones !
                                    </Typography>
                                </Box>
                            </Stack>
                        </Grid>

                        {/* Center: search */}
                        <Grid item xs={12} md={5}>
                            <TextField
                                fullWidth
                                size="small"
                                placeholder="Search anything here.."
                                value={qRaw}
                                onChange={(e) => {
                                    setQRaw(e.target.value);
                                    setPage(1); // reset to first page when searching
                                }}
                                sx={{ "& .MuiOutlinedInput-root": { borderRadius: "99px", backgroundColor: "#fff" } }}
                                slotProps={{
                                    input: {
                                        startAdornment: (
                                            <InputAdornment position="start">
                                                <SearchIcon fontSize="small" />
                                            </InputAdornment>
                                        ),
                                        endAdornment: (
                                            <InputAdornment position="end">
                                                <IconButton size="small"><SearchIcon /></IconButton>
                                            </InputAdornment>
                                        ),
                                    },
                                }}
                            />
                        </Grid>

                        {/* Right: bell + user pill */}
                        <Grid item xs={12} md={3}>
                            <Stack direction="row" spacing={1} justifyContent={{ xs: "flex-start", md: "flex-end" }}>
                                <IconButton><NotificationsNoneOutlinedIcon /></IconButton>
                                <Button
                                    variant="outlined"
                                    sx={{ borderRadius: "99px", px: 1.5, textTransform: "none" }}
                                    startIcon={<Avatar sx={{ width: 22, height: 22, bgcolor: "grey.300" }} />}
                                >
                                    User
                                </Button>
                            </Stack>
                        </Grid>
                    </Grid>
                </Box>

                {/* Actions row */}
                <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
                    <TextField
                        placeholder="Join test"
                        size="small"
                        sx={{ width: 300, "& .MuiOutlinedInput-root": { borderRadius: "99px", backgroundColor: "#fff", pr: 0.5 } }}
                        slotProps={{
                            input: {
                                endAdornment: (
                                    <InputAdornment position="end">
                                        <IconButton size="small"><SearchIcon /></IconButton>
                                    </InputAdornment>
                                ),
                            },
                        }}
                    />

                    {/* Sort menu */}
                    <Button
                        variant="outlined"
                        startIcon={<SortIcon />}
                        sx={{ textTransform: "none", borderRadius: "12px" }}
                        onClick={openSort}
                    >
                        Sort
                    </Button>
                    <Menu anchorEl={sortAnchor} open={Boolean(sortAnchor)} onClose={closeSort}>
                        <MenuItem onClick={() => { setSort({ key: "progress", dir: "desc" }); closeSort(); }}>
                            Progress ↓
                        </MenuItem>
                        <MenuItem onClick={() => { setSort({ key: "name", dir: "asc" }); closeSort(); }}>
                            Name A–Z
                        </MenuItem>
                        <MenuItem onClick={() => { setSort({ key: "timeLimit", dir: "asc" }); closeSort(); }}>
                            Time limit ↑
                        </MenuItem>
                    </Menu>

                    {/* Filter menu */}
                    <Button
                        variant="outlined"
                        startIcon={<TuneIcon />}
                        sx={{ textTransform: "none", borderRadius: "12px" }}
                        onClick={openFilter}
                    >
                        Filter
                    </Button>
                    <Menu anchorEl={filterAnchor} open={Boolean(filterAnchor)} onClose={closeFilter}>
                        <MenuItem onClick={() => { setFilters((f) => ({ ...f, status: "all" })); setPage(1); closeFilter(); }}>Status: All</MenuItem>
                        <MenuItem onClick={() => { setFilters((f) => ({ ...f, status: "graded" })); setPage(1); closeFilter(); }}>Status: Graded</MenuItem>
                        <MenuItem onClick={() => { setFilters((f) => ({ ...f, status: "submitted" })); setPage(1); closeFilter(); }}>Status: Submitted</MenuItem>
                        <MenuItem onClick={() => { setFilters((f) => ({ ...f, status: "not_submitted" })); setPage(1); closeFilter(); }}>Status: Not submitted</MenuItem>
                        <Divider />
                        <MenuItem onClick={() => { setFilters((f) => ({ ...f, difficulty: "all" })); setPage(1); closeFilter(); }}>Difficulty: All</MenuItem>
                        <MenuItem onClick={() => { setFilters((f) => ({ ...f, difficulty: "Low" })); setPage(1); closeFilter(); }}>Difficulty: Low</MenuItem>
                        <MenuItem onClick={() => { setFilters((f) => ({ ...f, difficulty: "Medium" })); setPage(1); closeFilter(); }}>Difficulty: Medium</MenuItem>
                        <MenuItem onClick={() => { setFilters((f) => ({ ...f, difficulty: "High" })); setPage(1); closeFilter(); }}>Difficulty: High</MenuItem>
                        <Divider />
                        <MenuItem onClick={() => { setFilters((f) => ({ ...f, type: "all" })); setPage(1); closeFilter(); }}>Type: All</MenuItem>
                        <MenuItem onClick={() => { setFilters((f) => ({ ...f, type: "Exam" })); setPage(1); closeFilter(); }}>Type: Exam</MenuItem>
                        <MenuItem onClick={() => { setFilters((f) => ({ ...f, type: "Practice" })); setPage(1); closeFilter(); }}>Type: Practice</MenuItem>
                    </Menu>

                    {/* Create exam — teacher only */}
                    {role === "teacher" && (
                        <Button
                            variant="contained"
                            onClick={() => navigate("/create-exam")}
                            sx={{
                                textTransform: "none",
                                borderRadius: "999px",
                                px: 3,
                                bgcolor: "#635bff",
                                "&:hover": { bgcolor: "#554fff" }
                            }}
                        >
                            Create exam
                        </Button>
                    )}
                    <Box sx={{ flex: 1 }} />
                </Stack>

                {/* List layout */}
                <Paper
                    elevation={0}
                    sx={{
                        p: 2,
                        borderRadius: 2,
                        border: "1px solid",
                        borderColor: "divider",
                        bgcolor: "#fff",
                        overflowX: "auto",
                    }}
                >
                    {/* Table header */}
                    <Box
                        sx={{
                            px: 2,
                            py: 1.25,
                            mb: 1.25,
                            borderRadius: 1.5,
                            bgcolor: "#fff",
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 2,
                            alignItems: "center",
                            minWidth: 760,
                        }}
                    >
                        <Box sx={{ minWidth: 120 }}>
                            <Typography variant="caption" color="text.secondary">Type</Typography>
                        </Box>
                        <Box sx={{ minWidth: 260, flex: "2 1 260px" }}>
                            <Typography variant="caption" color="text.secondary">Name</Typography>
                        </Box>
                        <Box sx={{ minWidth: 140 }}>
                            <Typography variant="caption" color="text.secondary">Difficulty</Typography>
                        </Box>
                        <Box sx={{ minWidth: 120 }}>
                            <Typography variant="caption" color="text.secondary">Status</Typography>
                        </Box>
                        <Box sx={{ minWidth: 180 }}>
                            <Typography variant="caption" color="text.secondary">Release date</Typography>
                        </Box>
                    </Box>

                    <Stack spacing={1.25} sx={{ minWidth: 760 }}>
                        {(loading ? [] : items).map(item => (
                            <CircuitRow key={item.id} item={item} onOpen={handleOpen} />
                        ))}

                        {/* simple empty state */}
                        {!loading && items.length === 0 && (
                            <Paper sx={{ p: 3, textAlign: "center", borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
                                <Typography variant="body2" color="text.secondary">
                                    No circuits match your filters.
                                </Typography>
                            </Paper>
                        )}
                    </Stack>
                </Paper>
            </Container>

            {/* Centered detail modal */}
            <CircuitDetailModal
                open={open}
                data={selected}
                onClose={() => setOpen(false)}
                onStart={handleStart}
            />
        </Box>
    );
}
