import React from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import { Box, CssBaseline } from "@mui/material";
import Login from "./pages/login.js";
import Dashboard from "./pages/dashboard";
import Stations from "./pages/stations";
import TeacherDashboard from "./pages/teacherDashboard";
import Navbar from "./component/navbar";
import ProtectedRoute from "./component/ProtectedRoute";
import CreateNewExam from "./pages/CreateNewExam";
import Marking from "./pages/grading";
import DoingExamPage from "./pages/RealPatient";
import FlashcardPage from "./pages/flashcard"

// Single source of truth for auth
const isAuthed = () => !!localStorage.getItem("osce-auth");

/* ---------- Layout that shows Navbar on all private pages ---------- */
function PrivateLayout() {
    const [navWidth, setNavWidth] = React.useState(72);
    const location = useLocation();

    const activeKey = React.useMemo(() => {
        const p = location.pathname;
        if (p.startsWith("/dashboard")) return "dashboard";
        if (p.startsWith("/flashcard")) return "flashcard";
        if (p.startsWith("/stations")) return "stations";
        if (p.startsWith("/chat") || p.startsWith("/realexam")) return "chat";
        if (p.startsWith("/history")) return "history";
        if (p.startsWith("/settings")) return "settings";
        if (p.startsWith("/help")) return "help";
        return "dashboard";
    }, [location.pathname]);

    return (
        <>
            <Navbar activeKey={activeKey} onWidthChange={setNavWidth} />
            <Box
                component="main"
                sx={(theme) => ({
                    ml: `${navWidth}px`,
                    minHeight: "100vh",
                    bgcolor: theme.palette.background.default,
                    transition: theme.transitions.create("margin-left"),
                    p: { xs: 2, md: 3 }
                })}
            >
                <Outlet />
            </Box>
        </>
    );
}

/* ----------------------------- App ----------------------------- */
export default function App() {
    return (
        <BrowserRouter>
            <CssBaseline />
            <Routes>
                {/* Public route: NO navbar */}
                <Route path="/login" element={<Login />} />

                {/* Private routes */}
                <Route
                    element={
                        <ProtectedRoute isAuthenticated={isAuthed()}>
                            <PrivateLayout />
                        </ProtectedRoute>
                    }
                >
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/flashcard" element={<FlashcardPage />} />
                    <Route path="/stations" element={<Stations />} />
                    <Route path="/chat" element={<DoingExamPage />} />
                    <Route path="/teacher_dashboard" element={<TeacherDashboard />} />
                    <Route path="/create-exam" element={<CreateNewExam />} />
                    <Route path="/marking" element={<Marking />} />
                    <Route path="/settings" element={<div />} />
                    <Route path="/help" element={<div />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </BrowserRouter>
    );
}