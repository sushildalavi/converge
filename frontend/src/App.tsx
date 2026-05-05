import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import WorkflowDetail from "./pages/WorkflowDetail";
import DeadLetters from "./pages/DeadLetters";
import WorkerHealth from "./pages/WorkerHealth";
import { Activity, AlertTriangle, LayoutDashboard, Server } from "lucide-react";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/deadletters", label: "Dead Letters", icon: AlertTriangle },
  { to: "/workers", label: "Workers", icon: Server },
];

function Sidebar() {
  return (
    <aside className="w-56 shrink-0 bg-gray-900 border-r border-gray-800 min-h-screen flex flex-col">
      {/* logo */}
      <div className="px-5 py-5 border-b border-gray-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Activity size={16} className="text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-none">ReplayForge</p>
            <p className="text-gray-500 text-xs mt-0.5">Workflow Debugger</p>
          </div>
        </div>
      </div>

      {/* nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/30"
                  : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
              }`
            }
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* footer */}
      <div className="px-5 py-4 border-t border-gray-800">
        <p className="text-gray-600 text-xs">v0.1.0 · Redis Streams</p>
      </div>
    </aside>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen bg-[#0a0f1e]">
        <Sidebar />
        <div className="flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/workflows/:workflowId" element={<WorkflowDetail />} />
            <Route path="/deadletters" element={<DeadLetters />} />
            <Route path="/workers" element={<WorkerHealth />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}
