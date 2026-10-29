import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, HashRouter, Routes, Route, useParams } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import VortexCallback from "./components/VortexCallback";
import ProfilePage from "./components/ProfilePage";
import SharedAiPage from "./components/SharedAiPage";
import SvgAccessGate from "./components/SvgAccessGate";
import LegalReagreeModal from "./components/LegalReagreeModal";
import ActivityCaptchaModal from "./components/ActivityCaptchaModal";
import { isSvgShell } from "./lib/siteOrigin";
import { SURFACE_INDEX_PATHS } from "./lib/surfacePath";

const queryClient = new QueryClient();
const Router = isSvgShell() ? HashRouter : BrowserRouter;

function PublicProfileRoute() {
  const { username } = useParams();
  return <ProfilePage username={username || ""} />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <Router>
        <SvgAccessGate>
          <LegalReagreeModal />
          <ActivityCaptchaModal />
          <Routes>
            <Route path="/api/chat/callback" element={<VortexCallback />} />
            <Route path="/api/chat/finish" element={<VortexCallback />} />
            <Route path="/" element={<Index />} />
            {SURFACE_INDEX_PATHS.map((path) => (
              <Route key={path} path={path} element={<Index />} />
            ))}
            <Route path="/user/:username" element={<PublicProfileRoute />} />
            <Route path="/share/ai/:token" element={<SharedAiPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </SvgAccessGate>
      </Router>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
