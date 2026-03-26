import { Link, useLocation } from "wouter";
import { useGetMe, useLogout } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { Brain, LogOut, LayoutDashboard, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Navbar() {
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: user } = useGetMe({ query: { retry: false } });
  
  const logoutMut = useLogout({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        queryClient.setQueryData(getGetMeQueryKey(), null);
        setLocation("/login");
      }
    }
  });

  if (!user) return null;

  return (
    <nav className="sticky top-0 z-50 w-full glass-panel border-b border-white/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-2">
            <div className="bg-primary/10 p-2 rounded-xl text-primary">
              <Brain className="h-6 w-6" />
            </div>
            <span className="font-display font-bold text-xl text-foreground">
              ABC<span className="text-primary font-normal">TCC</span>
            </span>
          </div>

          <div className="flex items-center gap-4">
            {user.role === "admin" ? (
              <Link 
                href="/admin" 
                className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium transition-colors ${
                  location === '/admin' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
              >
                <LayoutDashboard className="w-4 h-4" />
                <span className="hidden sm:inline">Panel Admin</span>
              </Link>
            ) : (
              <Link 
                href="/register-abc" 
                className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium transition-colors ${
                  location === '/register-abc' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span className="hidden sm:inline">Mis Registros</span>
              </Link>
            )}

            <div className="h-8 w-px bg-border mx-2"></div>

            <div className="flex items-center gap-3">
              <div className="hidden md:flex flex-col items-end">
                <span className="text-sm font-semibold text-foreground leading-none">{user.name}</span>
                <span className="text-xs text-muted-foreground">{user.role === 'admin' ? 'Administrador' : 'Paciente'}</span>
              </div>
              
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => logoutMut.mutate()}
                disabled={logoutMut.isPending}
                className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full"
                title="Cerrar sesión"
              >
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
