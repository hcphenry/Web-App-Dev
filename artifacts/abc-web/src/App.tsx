import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";

// Pages
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import RegisterAbc from "@/pages/register-abc";
import AdminDashboard from "@/pages/admin";
import PsicologoDashboard from "@/pages/psicologo";

const queryClient = new QueryClient();

function getRoleHome(role: string) {
  if (role === "admin") return "/admin";
  if (role === "psicologo") return "/psicologo";
  return "/register-abc";
}

// Auth Guard Component
function ProtectedRoute({ component: Component, requireRole }: { component: any, requireRole?: 'admin' | 'user' | 'psicologo' }) {
  const [location, setLocation] = useLocation();
  const { data: user, isLoading, error } = useGetMe({ 
    query: { queryKey: getGetMeQueryKey(), retry: false, refetchOnWindowFocus: false },
    request: { headers: { "Accept": "application/json" } } 
  });

  useEffect(() => {
    if (!isLoading) {
      if (error || !user) {
        setLocation("/login");
      } else if (requireRole && user.role !== requireRole) {
        setLocation(getRoleHome(user.role));
      }
    }
  }, [user, isLoading, error, location, setLocation, requireRole]);

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !user || (requireRole && user.role !== requireRole)) {
    return null; // Will redirect via useEffect
  }

  return <Component />;
}

// Redirect root based on auth status
function RootRouter() {
  const [location, setLocation] = useLocation();
  const { data: user, isLoading } = useGetMe({ query: { queryKey: getGetMeQueryKey(), retry: false } });

  useEffect(() => {
    if (!isLoading && location === '/') {
      if (user) {
        setLocation(getRoleHome(user.role));
      } else {
        setLocation('/login');
      }
    }
  }, [user, isLoading, location, setLocation]);

  if (location === '/') {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return null;
}

function Router() {
  return (
    <>
      <RootRouter />
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/register-abc">
          {() => <ProtectedRoute component={RegisterAbc} requireRole="user" />}
        </Route>
        <Route path="/admin">
          {() => <ProtectedRoute component={AdminDashboard} requireRole="admin" />}
        </Route>
        <Route path="/psicologo">
          {() => <ProtectedRoute component={PsicologoDashboard} requireRole="psicologo" />}
        </Route>
        <Route component={NotFound} />
      </Switch>
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
