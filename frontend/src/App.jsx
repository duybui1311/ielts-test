import React from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import { Box, CssBaseline } from "@mui/material";
import Login from "./pages/login";
import Dashboard from "./pages/dashboard";
import Stations from "./pages/stations";
import TeacherDashboard from "./pages/teacherDashboard";
import Navbar from "./component/navbar";
import ProtectedRoute from "./component/ProtectedRoute";
import CreateNewExam from "./pages/CreateNewExam";
import Marking from "./pages/grading";
import DoingExamPage from "./pages/RealPatient";
import FlashcardPage from "./pages/flashcard";
import ExamList from "./pages/ExamList";
import ExamTake from "./pages/ExamTake";
import ExamResults from "./pages/ExamResults";

const isAuthed = () => !!localStorage.getItem("osce-auth");

function PrivateLayout() {
    const [navWidth, setNavWidth] = React.useState(72);
    const location = useLocation();

    const activeKey = React.useMemo(() => {
        const p = location.pathname;
        if (p.startsWith("/exams"))        return "exams";
        if (p.startsWith("/exam/"))        return "exams";
        if (p.startsWith("/results/"))     return "exams";
        if (p.startsWith("/dashboard"))    return "dashboard";
        if (p.startsWith("/flashcard"))    return "flashcard";
        if (p.startsWith("/stations"))     return "stations";
        if (p.startsWith("/chat") || p.startsWith("/realexam")) return "chat";
        if (p.startsWith("/history"))      return "history";
        if (p.startsWith("/settings"))     return "settings";
        if (p.startsWith("/help"))         return "help";
        return "exams";
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
                    p: { xs: 2, md: 3 },
                })}
            >
                <Outlet />
            </Box>
        </>
    );
}

export default function App() {
    return (
        <BrowserRouter>
            <CssBaseline />
            <Routes>
                {/* Public */}
                <Route path="/login" element={<Login />} />

                {/* Private — all share the collapsible side navbar */}
                <Route
                    element={
                        <ProtectedRoute isAuthenticated={isAuthed()}>
                            <PrivateLayout />
                        </ProtectedRoute>
                    }
                >
                    <Route path="/"                    element={<Navigate to="/exams" replace />} />
                    <Route path="/exams"               element={<ExamList />} />
                    <Route path="/exam/:attemptId"     element={<ExamTake />} />
                    <Route path="/results/:attemptId"  element={<ExamResults />} />
                    <Route path="/dashboard"           element={<Dashboard />} />
                    <Route path="/flashcard"           element={<FlashcardPage />} />
                    <Route path="/stations"            element={<Stations />} />
                    <Route path="/chat"                element={<DoingExamPage />} />
                    <Route path="/teacher_dashboard"   element={<TeacherDashboard />} />
                    <Route path="/create-exam"         element={<CreateNewExam />} />
                    <Route path="/marking"             element={<Marking />} />
                    <Route path="/settings"            element={<div />} />
                    <Route path="/help"                element={<div />} />
                </Route>

                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </BrowserRouter>
    );
}
