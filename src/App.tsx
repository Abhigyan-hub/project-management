import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";

import Landing from "@/pages/Landing";
import TeamAuth from "@/pages/TeamAuth";
import AdminLogin from "@/pages/AdminLogin";
import Dashboard from "@/pages/Dashboard";
import Tasks from "@/pages/Tasks";
import Projects from "@/pages/Projects";
import ProjectDetails from "@/pages/ProjectDetails";
import People from "@/pages/People";
import Users from "@/pages/Users";
import Teams from "@/pages/Teams";
import Calendar from "@/pages/Calendar";
import Reports from "@/pages/Reports";
import History from "@/pages/History";
import Team from "@/pages/Team";
import MyWork from "@/pages/MyWork";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/auth" element={<TeamAuth />} />
          <Route path="/admin-login" element={<AdminLogin />} />

          {/* Admin / super admin */}
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:projectId" element={<ProjectDetails />} />
          <Route path="/people" element={<People />} />
          <Route path="/users" element={<Users />} />
          <Route path="/teams" element={<Teams />} />
          <Route path="/reports" element={<Reports />} />

          {/* Admin / super admin / team leader */}
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/history" element={<History />} />

          {/* Team leader */}
          <Route path="/team" element={<Team />} />

          {/* Member */}
          <Route path="/my-work" element={<MyWork />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </QueryClientProvider>
  );
}
