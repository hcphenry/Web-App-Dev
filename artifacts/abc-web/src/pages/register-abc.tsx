import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { 
  useCreateRecord, 
  useListMyRecords, 
  getListMyRecordsQueryKey,
  type CreateRecordRequest 
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowRight, ArrowLeft, CheckCircle2, MessageCircle, 
  BrainCircuit, Activity, Lightbulb, History, FileText
} from "lucide-react";

export default function RegisterAbc() {
  const [step, setStep] = useState(1);
  const [showHistory, setShowHistory] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<Partial<CreateRecordRequest>>({
    intensidad: 5
  });
  const [wantsReflection, setWantsReflection] = useState(false);

  const { data: records, isLoading: loadingRecords } = useListMyRecords();
  
  const createMut = useCreateRecord({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMyRecordsQueryKey() });
        toast({ title: "¡Excelente!", description: "Tu registro ABC ha sido guardado exitosamente." });
        resetForm();
        setShowHistory(true);
      }
    }
  });

  const resetForm = () => {
    setFormData({ intensidad: 5 });
    setWantsReflection(false);
    setStep(1);
  };

  const nextStep = () => {
    if (step === 1 && !formData.situacion) { toast({ variant: "destructive", title: "Completa el campo", description: "Describe la situación para continuar." }); return; }
    if (step === 2 && !formData.pensamientos) { toast({ variant: "destructive", title: "Completa el campo", description: "Escribe tus pensamientos para continuar." }); return; }
    if (step === 3 && (!formData.emocion || !formData.conducta)) { toast({ variant: "destructive", title: "Completa los campos", description: "Indica tu emoción y conducta para continuar." }); return; }
    
    setStep(s => s + 1);
  };

  const prevStep = () => setStep(s => s - 1);

  const submitForm = () => {
    createMut.mutate({ 
      data: formData as CreateRecordRequest 
    });
  };

  const steps = [
    { num: 1, title: "Situación", icon: MessageCircle },
    { num: 2, title: "Pensamiento", icon: BrainCircuit },
    { num: 3, title: "Emoción y Conducta", icon: Activity },
    { num: 4, title: "Reflexión", icon: Lightbulb },
    { num: 5, title: "Resumen", icon: CheckCircle2 },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Registro ABC</h1>
            <p className="text-muted-foreground mt-1">Identifica y gestiona tus reacciones emocionales</p>
          </div>
          <Button 
            variant={showHistory ? "default" : "outline"}
            onClick={() => setShowHistory(!showHistory)}
            className="rounded-full shadow-sm"
          >
            {showHistory ? <><FileText className="w-4 h-4 mr-2" /> Nuevo Registro</> : <><History className="w-4 h-4 mr-2" /> Historial</>}
          </Button>
        </div>

        {showHistory ? (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {loadingRecords ? (
              <div className="text-center py-12 text-muted-foreground">Cargando registros...</div>
            ) : !records?.length ? (
              <div className="text-center py-16 glass-panel rounded-3xl border-dashed">
                <div className="bg-secondary/50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-8 h-8 text-primary/50" />
                </div>
                <h3 className="text-xl font-display font-semibold">No hay registros aún</h3>
                <p className="text-muted-foreground mt-2 max-w-md mx-auto">Comienza a registrar tus situaciones para entender mejor tus patrones emocionales y conductuales.</p>
                <Button onClick={() => setShowHistory(false)} className="mt-6 rounded-full">Crear mi primer registro</Button>
              </div>
            ) : (
              <div className="grid gap-6">
                {records.map(record => (
                  <div key={record.id} className="glass-panel p-6 rounded-2xl hover:shadow-lg transition-shadow duration-300">
                    <div className="flex justify-between items-start mb-4">
                      <div className="text-sm font-medium text-primary bg-primary/10 px-3 py-1 rounded-full">
                        {format(new Date(record.createdAt), "d 'de' MMMM, yyyy - HH:mm", { locale: es })}
                      </div>
                    </div>
                    
                    <div className="grid sm:grid-cols-3 gap-6">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-foreground font-semibold">
                          <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs">A</span>
                          Situación
                        </div>
                        <p className="text-sm text-muted-foreground bg-white/50 p-3 rounded-xl min-h-20">{record.situacion}</p>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-foreground font-semibold">
                          <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs">B</span>
                          Pensamientos
                        </div>
                        <p className="text-sm text-muted-foreground bg-white/50 p-3 rounded-xl min-h-20">{record.pensamientos}</p>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-foreground font-semibold">
                          <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-xs">C</span>
                          Consecuencia
                        </div>
                        <div className="text-sm text-muted-foreground bg-white/50 p-3 rounded-xl min-h-20 space-y-2">
                          <div className="flex justify-between items-center border-b border-border/50 pb-2">
                            <span className="font-medium text-foreground capitalize">{record.emocion}</span>
                            <span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-xs font-bold">{record.intensidad}/10</span>
                          </div>
                          <p>{record.conducta}</p>
                        </div>
                      </div>
                    </div>
                    {record.reflexion && (
                      <div className="mt-4 pt-4 border-t border-border/50">
                        <div className="flex items-center gap-2 text-foreground font-semibold mb-2">
                          <Lightbulb className="w-4 h-4 text-amber-500" />
                          Pensamiento Alternativo
                        </div>
                        <p className="text-sm text-muted-foreground italic">"{record.reflexion}"</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="max-w-2xl mx-auto">
            {/* Progress Stepper */}
            <div className="mb-10">
              <div className="flex justify-between items-center relative">
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-secondary rounded-full -z-10"></div>
                <div 
                  className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-primary rounded-full -z-10 transition-all duration-500 ease-out"
                  style={{ width: `${((step - 1) / (steps.length - 1)) * 100}%` }}
                ></div>
                
                {steps.map((s) => {
                  const Icon = s.icon;
                  const isActive = step >= s.num;
                  const isCurrent = step === s.num;
                  
                  return (
                    <div key={s.num} className="flex flex-col items-center gap-2">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                        isActive ? 'bg-primary border-primary text-primary-foreground shadow-lg shadow-primary/20' : 'bg-white border-border text-muted-foreground'
                      } ${isCurrent ? 'ring-4 ring-primary/20 ring-offset-2 ring-offset-background scale-110' : ''}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className={`text-xs font-medium hidden sm:block absolute -bottom-6 whitespace-nowrap ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {s.title}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Form Area */}
            <div className="glass-panel p-6 sm:p-10 rounded-[2rem] shadow-xl relative min-h-[400px]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="h-full flex flex-col"
                >
                  {/* STEP 1: A */}
                  {step === 1 && (
                    <div className="space-y-6 flex-1">
                      <div className="space-y-2">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-100 text-blue-700 font-display font-bold text-2xl mb-2">A</div>
                        <h2 className="text-2xl font-display font-bold text-foreground">Situación o Estímulo</h2>
                        <p className="text-muted-foreground">Describe qué ocurrió de forma objetiva. ¿Quién?, ¿Qué?, ¿Dónde? Imagina que eres una cámara de video grabando los hechos.</p>
                      </div>
                      
                      <div className="space-y-3 mt-8">
                        <Label htmlFor="situacion" className="text-base">¿Qué sucedió?</Label>
                        <Textarea 
                          id="situacion"
                          placeholder="Ej: Mi pareja no me llamó en todo el día y llegó tarde a casa..."
                          className="min-h-[150px] resize-none text-base rounded-xl bg-white/50 focus:bg-white"
                          value={formData.situacion || ""}
                          onChange={e => setFormData({...formData, situacion: e.target.value})}
                          autoFocus
                        />
                        <p className="text-xs text-muted-foreground bg-blue-50/50 p-3 rounded-lg border border-blue-100">
                          <strong className="text-blue-700">Tip:</strong> Evita interpretaciones en este paso. Concéntrate solo en los hechos observables.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* STEP 2: B */}
                  {step === 2 && (
                    <div className="space-y-6 flex-1">
                      <div className="space-y-2">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-purple-100 text-purple-700 font-display font-bold text-2xl mb-2">B</div>
                        <h2 className="text-2xl font-display font-bold text-foreground">Pensamiento Automático</h2>
                        <p className="text-muted-foreground">¿Qué te dijiste a ti mismo en ese momento? ¿Qué pasó por tu mente justo cuando ocurrió la situación?</p>
                      </div>
                      
                      <div className="space-y-3 mt-8">
                        <Label htmlFor="pensamientos" className="text-base">¿Qué pensaste?</Label>
                        <Textarea 
                          id="pensamientos"
                          placeholder="Ej: 'Seguro ya no le intereso', 'Siempre me hace lo mismo', 'No soy importante'..."
                          className="min-h-[150px] resize-none text-base rounded-xl bg-white/50 focus:bg-white"
                          value={formData.pensamientos || ""}
                          onChange={e => setFormData({...formData, pensamientos: e.target.value})}
                          autoFocus
                        />
                      </div>
                    </div>
                  )}

                  {/* STEP 3: C */}
                  {step === 3 && (
                    <div className="space-y-6 flex-1">
                      <div className="space-y-2">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-teal-100 text-teal-700 font-display font-bold text-2xl mb-2">C</div>
                        <h2 className="text-2xl font-display font-bold text-foreground">Emoción y Conducta</h2>
                        <p className="text-muted-foreground">¿Cómo te sentiste y qué hiciste como resultado de lo que pensaste?</p>
                      </div>
                      
                      <div className="space-y-6 mt-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-3">
                            <Label htmlFor="emocion" className="text-base">¿Qué emoción sentiste?</Label>
                            <Input 
                              id="emocion"
                              placeholder="Ej: Tristeza, Cólera, Ansiedad..."
                              className="h-12 rounded-xl bg-white/50 focus:bg-white"
                              value={formData.emocion || ""}
                              onChange={e => setFormData({...formData, emocion: e.target.value})}
                              autoFocus
                            />
                          </div>
                          
                          <div className="space-y-4">
                            <div className="flex justify-between items-center">
                              <Label className="text-base">Intensidad (1-10)</Label>
                              <span className="font-bold text-primary bg-primary/10 px-3 py-1 rounded-full">{formData.intensidad || 5}</span>
                            </div>
                            <Slider 
                              min={1} max={10} step={1}
                              value={[formData.intensidad || 5]}
                              onValueChange={(val) => setFormData({...formData, intensidad: val[0]})}
                              className="py-2"
                            />
                          </div>
                        </div>

                        <div className="space-y-3 pt-4">
                          <Label htmlFor="conducta" className="text-base">¿Qué hiciste físicamente como respuesta?</Label>
                          <Textarea 
                            id="conducta"
                            placeholder="Ej: Me fui a dormir, le grité, me quedé callado..."
                            className="min-h-[100px] resize-none text-base rounded-xl bg-white/50 focus:bg-white"
                            value={formData.conducta || ""}
                            onChange={e => setFormData({...formData, conducta: e.target.value})}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* STEP 4: Reflexión */}
                  {step === 4 && (
                    <div className="space-y-6 flex-1">
                      <div className="space-y-2">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-100 text-amber-700 font-display font-bold text-2xl mb-2">
                          <Lightbulb className="w-6 h-6" />
                        </div>
                        <h2 className="text-2xl font-display font-bold text-foreground">Pensamiento Alternativo</h2>
                        <p className="text-muted-foreground">Opcional: Desafía tu pensamiento automático inicial y busca una perspectiva más realista o funcional.</p>
                      </div>
                      
                      <div className="space-y-6 mt-8">
                        <div className="flex items-center justify-between bg-white p-4 rounded-xl border">
                          <div className="space-y-0.5">
                            <Label className="text-base font-semibold">¿Deseas reflexionar?</Label>
                            <p className="text-sm text-muted-foreground">Plantear una alternativa para la próxima vez</p>
                          </div>
                          <Switch 
                            checked={wantsReflection} 
                            onCheckedChange={setWantsReflection} 
                          />
                        </div>

                        <AnimatePresence>
                          {wantsReflection && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="space-y-3 overflow-hidden"
                            >
                              <Label htmlFor="reflexion" className="text-base">Pensamiento alternativo</Label>
                              <Textarea 
                                id="reflexion"
                                placeholder="Ej: Pudo haber tenido un problema en el trabajo, no significa que no le interese..."
                                className="min-h-[150px] resize-none text-base rounded-xl bg-white/50 focus:bg-white"
                                value={formData.reflexion || ""}
                                onChange={e => setFormData({...formData, reflexion: e.target.value})}
                                autoFocus
                              />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  )}

                  {/* STEP 5: Resumen */}
                  {step === 5 && (
                    <div className="space-y-6 flex-1">
                      <div className="text-center mb-8">
                        <h2 className="text-2xl font-display font-bold text-foreground">Revisa tu Registro</h2>
                        <p className="text-muted-foreground">Verifica que todo esté correcto antes de guardar.</p>
                      </div>
                      
                      <div className="grid gap-4 bg-white/50 p-6 rounded-2xl border">
                        <div className="grid sm:grid-cols-[40px_1fr] gap-4 pb-4 border-b border-border/50">
                          <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">A</div>
                          <div>
                            <span className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Situación</span>
                            <p className="text-foreground mt-1">{formData.situacion}</p>
                          </div>
                        </div>
                        
                        <div className="grid sm:grid-cols-[40px_1fr] gap-4 pb-4 border-b border-border/50">
                          <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-sm">B</div>
                          <div>
                            <span className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Pensamiento</span>
                            <p className="text-foreground mt-1">{formData.pensamientos}</p>
                          </div>
                        </div>
                        
                        <div className="grid sm:grid-cols-[40px_1fr] gap-4 pb-4 border-b border-border/50">
                          <div className="w-10 h-10 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center font-bold text-sm">C</div>
                          <div>
                            <span className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Consecuencia</span>
                            <div className="flex gap-2 items-center mt-1 mb-2">
                              <span className="capitalize font-medium text-foreground">{formData.emocion}</span>
                              <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded font-bold">Nivel: {formData.intensidad}/10</span>
                            </div>
                            <p className="text-foreground">{formData.conducta}</p>
                          </div>
                        </div>

                        {wantsReflection && formData.reflexion && (
                          <div className="grid sm:grid-cols-[40px_1fr] gap-4 pt-2">
                            <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center">
                              <Lightbulb className="w-5 h-5" />
                            </div>
                            <div>
                              <span className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Reflexión Alternativa</span>
                              <p className="text-foreground mt-1 italic">"{formData.reflexion}"</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>

              {/* Navigation Buttons */}
              <div className="mt-8 pt-6 border-t border-border flex justify-between">
                <Button 
                  variant="outline" 
                  onClick={prevStep}
                  disabled={step === 1 || createMut.isPending}
                  className="rounded-xl px-6 h-12"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" /> Atrás
                </Button>

                {step < 5 ? (
                  <Button 
                    onClick={nextStep}
                    className="rounded-xl px-8 h-12 shadow-lg shadow-primary/20"
                  >
                    Siguiente <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                ) : (
                  <Button 
                    onClick={submitForm}
                    disabled={createMut.isPending}
                    className="rounded-xl px-8 h-12 bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-600/20"
                  >
                    {createMut.isPending ? "Guardando..." : "Guardar Registro"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
