import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Brain, Loader2 } from "lucide-react";
import { useLogin, useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const loginSchema = z.object({
  email: z.string().email("Correo electrónico inválido"),
  password: z.string().min(1, "La contraseña es requerida"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Redirect if already logged in
  useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      retry: false,
      refetchOnWindowFocus: false,
    },
    request: {
      headers: { "Accept": "application/json" }
    }
  });

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const loginMut = useLogin({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        queryClient.setQueryData(getGetMeQueryKey(), data.user);
        toast({ title: "Bienvenido", description: `Has iniciado sesión como ${data.user.name}` });
        if (data.user.role === "admin") {
          setLocation("/admin");
        } else {
          setLocation("/register-abc");
        }
      },
      onError: () => {
        toast({
          variant: "destructive",
          title: "Error de autenticación",
          description: "Correo o contraseña incorrectos",
        });
      }
    }
  });

  const onSubmit = (data: LoginForm) => {
    loginMut.mutate({ data });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden bg-background">
      {/* Background Image & Overlay */}
      <div className="absolute inset-0 z-0">
        <img 
          src={`${import.meta.env.BASE_URL}images/hero-bg.png`} 
          alt="Abstract calm background" 
          className="w-full h-full object-cover opacity-60 mix-blend-multiply"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 to-background/90 backdrop-blur-[2px]"></div>
      </div>

      <div className="w-full max-w-md p-4 relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white shadow-xl shadow-primary/20 mb-4 border border-white/50">
            <Brain className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl font-display font-bold text-foreground tracking-tight">ABC<span className="text-primary font-normal"> Positivamente</span></h1>
          <p className="text-muted-foreground mt-2 text-lg">Registro Emocional Terapéutico</p>
        </div>

        <div className="glass-panel p-8 rounded-[2rem] shadow-2xl shadow-primary/10">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground font-semibold ml-1">Correo Electrónico</Label>
              <Input 
                id="email" 
                type="email" 
                placeholder="tu@correo.com"
                className="rounded-xl h-12 bg-white/50 focus:bg-white transition-colors text-base"
                {...register("email")}
              />
              {errors.email && <p className="text-sm text-destructive ml-1">{errors.email.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground font-semibold ml-1">Contraseña</Label>
              <Input 
                id="password" 
                type="password" 
                placeholder="••••••••"
                className="rounded-xl h-12 bg-white/50 focus:bg-white transition-colors text-base"
                {...register("password")}
              />
              {errors.password && <p className="text-sm text-destructive ml-1">{errors.password.message}</p>}
            </div>

            <Button 
              type="submit" 
              className="w-full h-12 rounded-xl text-base font-semibold shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all hover:-translate-y-0.5"
              disabled={loginMut.isPending}
            >
              {loginMut.isPending ? (
                <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Iniciando sesión...</>
              ) : "Ingresar"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
