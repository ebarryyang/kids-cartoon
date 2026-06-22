import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import ContentManager from "@/pages/ContentManager";
import TimelineEditor from "@/pages/TimelineEditor";
import UserManager from "@/pages/UserManager";
import Settings from "@/pages/Settings";
import ActivationCodeManager from "@/pages/ActivationCodeManager";
import DriveManager from "@/pages/DriveManager";
import HonorManager from "@/pages/HonorManager";
import CourseMaterialManager from "@/pages/CourseMaterialManager";
import ExerciseManager from "@/pages/ExerciseManager";
import DashboardLayout from "@/layouts/DashboardLayout";

// Simple auth guard
const RequireAuth = ({ children }: { children: JSX.Element }) => {
  const isAuthenticated = localStorage.getItem('admin_token') !== null;
  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        <Route path="/" element={<RequireAuth><DashboardLayout /></RequireAuth>}>
          <Route index element={<Home />} />
          <Route path="content" element={<ContentManager />} />
          <Route path="content/edit/:id" element={<TimelineEditor />} />
          <Route path="activation-codes" element={<ActivationCodeManager />} />
          <Route path="drive" element={<DriveManager />} />
          <Route path="materials" element={<CourseMaterialManager />} />
          <Route path="exercises" element={<ExerciseManager />} />
          <Route path="honor" element={<HonorManager />} />
          <Route path="users" element={<UserManager />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </Router>
  );
}
