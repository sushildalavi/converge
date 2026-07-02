import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { Toaster } from "sonner";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import WorkflowDetail from "./pages/WorkflowDetail";
import WorkerHealth from "./pages/WorkerHealth";
import DeadLetters from "./pages/DeadLetters";
import Streams from "./pages/Streams";
import Convergence from "./pages/Convergence";
import Chaos from "./pages/Chaos";
import { AppShell } from "./layouts/AppShell";
import { PageTransition } from "./components/Animated";

function WorkflowRedirect() {
  const { wfId } = useParams<{ wfId: string }>();
  return <Navigate to={`/app/workflows/${wfId ?? ""}`} replace />;
}

function AppRedirect({ to }: { to: string }) {
  return <Navigate to={to} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "var(--card)",
            border: "1px solid var(--border2)",
            color: "var(--text)",
            fontSize: 13,
            borderRadius: 6,
          },
        }}
      />

      <Routes>
        <Route path="/" element={<PageTransition><Landing /></PageTransition>} />

        <Route path="/app" element={<AppShell />}>
          <Route index element={<PageTransition><Dashboard /></PageTransition>} />
          <Route path="workers" element={<PageTransition><WorkerHealth /></PageTransition>} />
          <Route path="streams" element={<PageTransition><Streams /></PageTransition>} />
          <Route path="replay" element={<PageTransition><DeadLetters /></PageTransition>} />
          <Route path="convergence" element={<PageTransition><Convergence /></PageTransition>} />
          <Route path="chaos" element={<PageTransition><Chaos /></PageTransition>} />
          <Route path="workflows/:wfId" element={<PageTransition><WorkflowDetail /></PageTransition>} />
        </Route>

        <Route path="/workers" element={<AppRedirect to="/app/workers" />} />
        <Route path="/deadletters" element={<AppRedirect to="/app/replay" />} />
        <Route path="/workflows/:wfId" element={<WorkflowRedirect />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
