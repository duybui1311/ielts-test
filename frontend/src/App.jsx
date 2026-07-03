import React, { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import { Box, CircularProgress } from "@mui/material";
import { ColorModeProvider } from "./theme/ColorModeContext";
import Navbar from "./component/navbar";
import TopBar from "./component/TopBar";
import ScrollTopFab from "./component/ScrollTopFab";
import { FadeIn } from "./component/ui";
import ProtectedRoute from "./component/ProtectedRoute";
import { getRole } from "./auth";

// Every page is code-split so the initial bundle only carries the app shell.
// Routes load on demand behind the <Suspense> fallback below.
const Login            = lazy(() => import("./pages/login"));
const Signup           = lazy(() => import("./pages/signup"));
const Dashboard        = lazy(() => import("./pages/dashboard"));
const TeacherDashboard = lazy(() => import("./pages/teacherDashboard"));
const CreateNewExam    = lazy(() => import("./pages/CreateNewExam"));
const ResetPassword    = lazy(() => import("./pages/ResetPassword"));
const ProgressReport   = lazy(() => import("./pages/ProgressReport"));
const VerifyEmail      = lazy(() => import("./pages/VerifyEmail"));
const Privacy          = lazy(() => import("./pages/Privacy"));
const Terms            = lazy(() => import("./pages/Terms"));
const FlashcardPage    = lazy(() => import("./pages/flashcard"));
const ExamList         = lazy(() => import("./pages/ExamList"));
const TestManage       = lazy(() => import("./pages/TestManage"));
const TaskEdit         = lazy(() => import("./pages/TaskEdit"));
const Admin            = lazy(() => import("./pages/Admin"));
const ExamTake         = lazy(() => import("./pages/ExamTake"));
const ExamResults      = lazy(() => import("./pages/ExamResults"));
const History          = lazy(() => import("./pages/History"));
const Settings         = lazy(() => import("./pages/Settings"));
const Help             = lazy(() => import("./pages/Help"));
const Writing          = lazy(() => import("./pages/Writing"));
const Speaking         = lazy(() => import("./pages/Speaking"));
const Review           = lazy(() => import("./pages/Review"));
const ReviewQueue      = lazy(() => import("./pages/ReviewQueue"));
const Practice         = lazy(() => import("./pages/Practice"));
const ResultView       = lazy(() => import("./pages/ResultView"));

// Centered fallback while a lazy route chunk loads.
function PageLoader() {
    return (
        <Box sx={{ display: "grid", placeItems: "center", minHeight: "60vh" }}>
            <CircularProgress />
        </Box>
    );
}

// /review is the teacher grading queue for teachers/admins, and the student's
// spaced-repetition review for students.
function ReviewRoute() {
    return getRole() === "student" ? <ReviewQueue /> : <Review />;
}

function PrivateLayout() {
    const [navWidth, setNavWidth] = React.useState(72);
    const [mobileOpen, setMobileOpen] = React.useState(false);
    const location = useLocation();

    // Close the mobile nav drawer whenever the route changes.
    React.useEffect(() => { setMobileOpen(false); }, [location.pathname]);

    const activeKey = React.useMemo(() => {
        const p = location.pathname;
        if (p.startsWith("/exams"))             return "exams";
        if (p.startsWith("/exam/"))             return "exams";
        if (p.startsWith("/results/"))          return "exams";
        if (p.startsWith("/dashboard"))         return "dashboard";
        if (p.startsWith("/teacher_dashboard")) return "teacher";
        if (p.startsWith("/manage-tests"))      return "manage";
        if (p.startsWith("/task/"))             return "manage";
        if (p.startsWith("/admin"))             return "admin";
        if (p.startsWith("/create-exam"))       return "create";
        if (p.startsWith("/writing"))           return "writing";
        if (p.startsWith("/speaking"))          return "speaking";
        if (p.startsWith("/practice"))          return "practice";
        if (p.startsWith("/review"))            return "review";
        if (p.startsWith("/flashcard"))         return "flashcard";
        if (p.startsWith("/history"))           return "history";
        if (p.startsWith("/settings"))          return "settings";
        if (p.startsWith("/help"))              return "help";
        return "exams";
    }, [location.pathname]);

    return (
        <>
            <Navbar
                activeKey={activeKey}
                onWidthChange={setNavWidth}
                mobileOpen={mobileOpen}
                onMobileClose={() => setMobileOpen(false)}
                onMobileOpen={() => setMobileOpen(true)}
            />
            <Box
                component="main"
                sx={(theme) => ({
                    // Desktop offsets for the fixed rail; phone/tablet use the full
                    // width since the nav is a bottom dock + overlay drawer.
                    ml: { xs: 0, lg: `${navWidth}px` },
                    minHeight: "100vh",
                    bgcolor: theme.palette.background.default,
                    transition: theme.transitions.create("margin-left"),
                    p: { xs: 2, md: 3 },
                    // Clear the fixed bottom dock (and the iOS home indicator) on
                    // phone/tablet; desktop has no dock so it keeps the normal pad.
                    pb: { xs: "calc(76px + env(safe-area-inset-bottom))", lg: 3 },
                })}
            >
                <TopBar />
                <Suspense fallback={<PageLoader />}>
                    <FadeIn key={location.pathname}>
                        <Outlet />
                    </FadeIn>
                </Suspense>
            </Box>
            <ScrollTopFab />
        </>
    );
}

export default function App() {
    return (
        <ColorModeProvider>
            <BrowserRouter>
                <Suspense fallback={<PageLoader />}>
                    <Routes>
                        {/* Public */}
                        <Route path="/login" element={<Login />} />
                        <Route path="/signup" element={<Signup />} />
                        <Route path="/reset-password" element={<ResetPassword />} />
                        <Route path="/verify-email" element={<VerifyEmail />} />
                        <Route path="/privacy" element={<Privacy />} />
                        <Route path="/terms" element={<Terms />} />

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
                            <Route path="/manage-tests"        element={<TestManage />} />
                            <Route path="/task/:kind/:taskId"  element={<TaskEdit />} />
                            <Route path="/admin"               element={<Admin />} />
                            <Route path="/create-exam"         element={<CreateNewExam />} />
                            <Route path="/writing"             element={<Writing />} />
                            <Route path="/speaking"            element={<Speaking />} />
                            <Route path="/practice"            element={<Practice />} />
                            <Route path="/practice/:subSkill"  element={<Practice />} />
                            <Route path="/result/:kind/:submissionId" element={<ResultView />} />
                            <Route path="/review"              element={<ReviewRoute />} />
                            <Route path="/flashcard"           element={<FlashcardPage />} />
                            <Route path="/history"             element={<History />} />
                            <Route path="/report/:userId"      element={<ProgressReport />} />
                            <Route path="/settings"            element={<Settings />} />
                            <Route path="/help"                element={<Help />} />
                        </Route>

                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </Suspense>
            </BrowserRouter>
        </ColorModeProvider>
    );
}
