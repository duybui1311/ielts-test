import React from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import { Box } from "@mui/material";
import { ColorModeProvider } from "./theme/ColorModeContext";
import Login from "./pages/login";
import Dashboard from "./pages/dashboard";
import TeacherDashboard from "./pages/teacherDashboard";
import Navbar from "./component/navbar";
import ProtectedRoute from "./component/ProtectedRoute";
import CreateNewExam from "./pages/CreateNewExam";
import FlashcardPage from "./pages/flashcard";
import ExamList from "./pages/ExamList";
import ExamTake from "./pages/ExamTake";
import ExamResults from "./pages/ExamResults";
import History from "./pages/History";
import Settings from "./pages/Settings";
import Help from "./pages/Help";
import Writing from "./pages/Writing";
import Speaking from "./pages/Speaking";
import Review from "./pages/Review";

function PrivateLayout() {
    const [navWidth, setNavWidth] = React.useState(72);
    const location = useLocation();

    const activeKey = React.useMemo(() => {
        const p = location.pathname;
        if (p.startsWith("/exams"))             return "exams";
        if (p.startsWith("/exam/"))             return "exams";
        if (p.startsWith("/results/"))          return "exams";
        if (p.startsWith("/dashboard"))         return "dashboard";
        if (p.startsWith("/teacher_dashboard")) return "teacher";
        if (p.startsWith("/create-exam"))       return "create";
        if (p.startsWith("/writing"))           return "writing";
        if (p.startsWith("/speaking"))          return "speaking";
        if (p.startsWith("/review"))            return "review";
        if (p.startsWith("/flashcard"))         return "flashcard";
        if (p.startsWith("/history"))           return "history";
        if (p.startsWith("/settings"))          return "settings";
        if (p.startsWith("/help"))              return "help";
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
        <ColorModeProvider>
            <BrowserRouter>
                <Routes>
                    {/* Public */}
                    <Route path="/login" element={<Login />} />

                    {/* Private — all share the collapsible side navbar */}
                    <Route
                        element={
                            <ProtectedRoute>
                                <PrivateLayout />
                            </ProtectedRoute>
                        }
                    >
                        <Route path="/"                    element={<Navigate to="/exams" replace />} />
                        <Route path="/exams"               element={<ExamList />} />
                        <Route path="/exam/:attemptId"     element={<ExamTake />} />
                        <Route path="/results/:attemptId"  element={<ExamResults />} />
                        <Route path="/dashboard"           element={<Dashboard />} />
                        <Route path="/teacher_dashboard"   element={<TeacherDashboard />} />
                        <Route path="/create-exam"         element={<CreateNewExam />} />
                        <Route path="/writing"             element={<Writing />} />
                        <Route path="/speaking"            element={<Speaking />} />
                        <Route path="/review"              element={<Review />} />
                        <Route path="/flashcard"           element={<FlashcardPage />} />
                        <Route path="/history"             element={<History />} />
                        <Route path="/settings"            element={<Settings />} />
                        <Route path="/help"                element={<Help />} />
                    </Route>

                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </BrowserRouter>
        </ColorModeProvider>
    );
}
