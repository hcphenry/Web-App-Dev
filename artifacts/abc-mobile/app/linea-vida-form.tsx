import { Feather } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { authFetch } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

type EventoTipo = "positivo" | "negativo" | "neutral";

interface Evento {
  id: string;
  edad: string;
  titulo: string;
  descripcion: string;
  tipo: EventoTipo;
  emocion: string;
  aprendizaje: string;
}

interface CreatedRecord {
  id: number;
}

const TIPO_META: Record<EventoTipo, { label: string; color: string; icon: keyof typeof Feather.glyphMap }> = {
  positivo: { label: "Positivo", color: "#10b981", icon: "smile" },
  negativo: { label: "Difícil", color: "#ef4444", icon: "cloud-rain" },
  neutral: { label: "Neutro", color: "#64748b", icon: "circle" },
};

function newEvento(): Evento {
  return {
    id: Math.random().toString(36).slice(2),
    edad: "",
    titulo: "",
    descripcion: "",
    tipo: "neutral",
    emocion: "",
    aprendizaje: "",
  };
}

export default function LineaVidaFormScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ assignmentId?: string }>();
  const assignmentId = params.assignmentId ? Number(params.assignmentId) : null;

  const [presente, setPresente] = useState("");
  const [reflexion, setReflexion] = useState("");
  const [fortalezas, setFortalezas] = useState("");
  const [aprendizajes, setAprendizajes] = useState("");
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [draft, setDraft] = useState<Evento | null>(null);

  const stats = useMemo(() => {
    const pos = eventos.filter((e) => e.tipo === "positivo").length;
    const neg = eventos.filter((e) => e.tipo === "negativo").length;
    const neu = eventos.filter((e) => e.tipo === "neutral").length;
    return { pos, neg, neu, total: eventos.length };
  }, [eventos]);

  const inputStyle = [
    styles.input,
    {
      backgroundColor: colors.card,
      borderColor: colors.border,
      color: colors.foreground,
      borderRadius: colors.radius,
    },
  ];

  function startDraft() {
    Haptics.selectionAsync();
    setDraft(newEvento());
  }

  function saveDraft() {
    if (!draft) return;
    if (!draft.edad.trim() || !draft.titulo.trim()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert("Faltan datos", "Por favor indica al menos la edad y un título para este evento.");
      return;
    }
    const idx = eventos.findIndex((e) => e.id === draft.id);
    if (idx >= 0) {
      const next = [...eventos];
      next[idx] = draft;
      setEventos(next);
    } else {
      setEventos([...eventos, draft]);
    }
    setDraft(null);
    Haptics.selectionAsync();
  }

  function removeEvento(id: string) {
    Alert.alert("¿Eliminar este evento?", "Esta acción no se puede deshacer.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: () => {
          setEventos(eventos.filter((e) => e.id !== id));
          Haptics.selectionAsync();
        },
      },
    ]);
  }

  const submit = useMutation({
    mutationFn: async (): Promise<{ record: CreatedRecord }> => {
      const ordered = [...eventos].sort(
        (a, b) => Number(a.edad) - Number(b.edad),
      );
      const record = await authFetch<CreatedRecord>("/api/linea-vida/mine", {
        method: "POST",
        body: JSON.stringify({
          assignmentId,
          presenteCircunstancias: presente.trim() || null,
          reflexionPatrones: reflexion.trim() || null,
          fortalezasVitales: fortalezas.trim() || null,
          aprendizajesGenerales: aprendizajes.trim() || null,
          eventos: ordered,
        }),
      });
      return { record };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["my-assignments"] });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "¡Línea de vida guardada!",
        "Gracias por compartir tu historia. Tu psicóloga podrá revisarla.",
        [{ text: "OK", onPress: () => router.back() }],
      );
    },
    onError: (err: unknown) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("No se pudo guardar", err instanceof Error ? err.message : "Error desconocido");
    },
  });

  const canSubmit =
    presente.trim().length > 0 &&
    eventos.length > 0 &&
    !draft &&
    !submit.isPending;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.5 : 1 }]}
          testID="back-button"
          accessibilityLabel="Volver"
        >
          <Feather name="arrow-left" size={24} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Línea de Vida</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]} numberOfLines={1}>
            Tu historia, paso a paso
          </Text>
        </View>
        <View style={styles.backBtn} />
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 48 }]}
        keyboardShouldPersistTaps="handled"
        bottomOffset={20}
      >
        <View style={[styles.heroBox, { backgroundColor: "#a855f7" }]}>
          <Feather name="activity" size={22} color="#ffffff" />
          <Text style={styles.heroTitle}>Reconoce tu historia</Text>
          <Text style={styles.heroText}>
            Recorre los momentos clave de tu vida: lo bueno, lo difícil y lo que aprendiste.
            Tómate tu tiempo, no hay respuestas correctas o incorrectas.
          </Text>
        </View>

        <Section step="1" title="Tu presente" hint="¿Cómo describirías el momento que vives hoy?" colors={colors}>
          <TextInput
            value={presente}
            onChangeText={setPresente}
            placeholder="Ej. Estoy en un proceso de cambio profesional importante..."
            placeholderTextColor={colors.mutedForeground}
            multiline
            style={[inputStyle, { minHeight: 110, textAlignVertical: "top" }]}
            testID="input-presente"
          />
        </Section>

        <Section
          step="2"
          title="Tus eventos de vida"
          hint="Agrega los momentos que marcaron quién eres hoy."
          colors={colors}
        >
          {eventos.length > 0 && (
            <View style={[styles.statsRow]}>
              <Text style={[styles.statText, { color: colors.foreground }]}>
                {stats.total} {stats.total === 1 ? "evento" : "eventos"}
              </Text>
              <View style={styles.statDots}>
                <StatChip color={TIPO_META.positivo.color} label={`${stats.pos} positivos`} />
                <StatChip color={TIPO_META.negativo.color} label={`${stats.neg} difíciles`} />
                <StatChip color={TIPO_META.neutral.color} label={`${stats.neu} neutros`} />
              </View>
            </View>
          )}

          {eventos
            .slice()
            .sort((a, b) => Number(a.edad) - Number(b.edad))
            .map((e) => (
              <View
                key={e.id}
                style={[
                  styles.eventCard,
                  { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
                ]}
                testID={`evento-card-${e.id}`}
              >
                <View style={[styles.eventDot, { backgroundColor: TIPO_META[e.tipo].color }]} />
                <View style={{ flex: 1 }}>
                  <View style={styles.eventTopRow}>
                    <Text style={[styles.eventAge, { color: colors.mutedForeground }]}>
                      {e.edad} años
                    </Text>
                    <View
                      style={[
                        styles.eventBadge,
                        { backgroundColor: TIPO_META[e.tipo].color + "22" },
                      ]}
                    >
                      <Text style={[styles.eventBadgeText, { color: TIPO_META[e.tipo].color }]}>
                        {TIPO_META[e.tipo].label}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.eventTitle, { color: colors.foreground }]}>{e.titulo}</Text>
                  {e.descripcion ? (
                    <Text style={[styles.eventDesc, { color: colors.mutedForeground }]}>
                      {e.descripcion}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  onPress={() => setDraft(e)}
                  hitSlop={8}
                  style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.5 : 1 }]}
                  accessibilityLabel="Editar evento"
                >
                  <Feather name="edit-2" size={16} color={colors.mutedForeground} />
                </Pressable>
                <Pressable
                  onPress={() => removeEvento(e.id)}
                  hitSlop={8}
                  style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.5 : 1 }]}
                  accessibilityLabel="Eliminar evento"
                >
                  <Feather name="trash-2" size={16} color={colors.destructive} />
                </Pressable>
              </View>
            ))}

          {draft ? (
            <View
              style={[
                styles.draftBox,
                { backgroundColor: colors.muted, borderColor: colors.border, borderRadius: colors.radius },
              ]}
            >
              <Text style={[styles.draftTitle, { color: colors.foreground }]}>
                {eventos.some((e) => e.id === draft.id) ? "Editar evento" : "Nuevo evento"}
              </Text>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                <View style={{ width: 90 }}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Edad</Text>
                  <TextInput
                    value={draft.edad}
                    onChangeText={(t) => setDraft({ ...draft, edad: t.replace(/[^0-9]/g, "") })}
                    placeholder="0"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="number-pad"
                    style={inputStyle}
                    testID="input-evento-edad"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Título</Text>
                  <TextInput
                    value={draft.titulo}
                    onChangeText={(t) => setDraft({ ...draft, titulo: t })}
                    placeholder="Ej. Mudanza familiar"
                    placeholderTextColor={colors.mutedForeground}
                    style={inputStyle}
                    testID="input-evento-titulo"
                  />
                </View>
              </View>

              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 12 }]}>
                ¿Cómo lo viviste?
              </Text>
              <View style={styles.tipoRow}>
                {(Object.keys(TIPO_META) as EventoTipo[]).map((t) => {
                  const meta = TIPO_META[t];
                  const selected = draft.tipo === t;
                  return (
                    <Pressable
                      key={t}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setDraft({ ...draft, tipo: t });
                      }}
                      style={({ pressed }) => [
                        styles.tipoChip,
                        {
                          backgroundColor: selected ? meta.color : colors.card,
                          borderColor: selected ? meta.color : colors.border,
                          opacity: pressed ? 0.85 : 1,
                        },
                      ]}
                      testID={`tipo-${t}`}
                    >
                      <Feather
                        name={meta.icon}
                        size={14}
                        color={selected ? "#ffffff" : meta.color}
                      />
                      <Text
                        style={[
                          styles.tipoText,
                          { color: selected ? "#ffffff" : colors.foreground },
                        ]}
                      >
                        {meta.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 12 }]}>
                Describe brevemente (opcional)
              </Text>
              <TextInput
                value={draft.descripcion}
                onChangeText={(t) => setDraft({ ...draft, descripcion: t })}
                placeholder="¿Qué pasó? ¿Quién estuvo?"
                placeholderTextColor={colors.mutedForeground}
                multiline
                style={[inputStyle, { minHeight: 70, textAlignVertical: "top" }]}
              />

              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 12 }]}>
                Emoción asociada (opcional)
              </Text>
              <TextInput
                value={draft.emocion}
                onChangeText={(t) => setDraft({ ...draft, emocion: t })}
                placeholder="Ej. alegría, tristeza, miedo..."
                placeholderTextColor={colors.mutedForeground}
                style={inputStyle}
              />

              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 12 }]}>
                ¿Qué aprendiste? (opcional)
              </Text>
              <TextInput
                value={draft.aprendizaje}
                onChangeText={(t) => setDraft({ ...draft, aprendizaje: t })}
                placeholder="Tu reflexión..."
                placeholderTextColor={colors.mutedForeground}
                multiline
                style={[inputStyle, { minHeight: 60, textAlignVertical: "top" }]}
              />

              <View style={styles.draftActions}>
                <Pressable
                  onPress={() => setDraft(null)}
                  style={({ pressed }) => [
                    styles.secondaryBtn,
                    { borderColor: colors.border, borderRadius: colors.radius, opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Text style={[styles.secondaryText, { color: colors.foreground }]}>Cancelar</Text>
                </Pressable>
                <Pressable
                  onPress={saveDraft}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    { backgroundColor: "#a855f7", borderRadius: colors.radius, opacity: pressed ? 0.85 : 1 },
                  ]}
                  testID="btn-save-evento"
                >
                  <Feather name="check" size={16} color="#ffffff" />
                  <Text style={styles.primaryText}>Guardar evento</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              onPress={startDraft}
              style={({ pressed }) => [
                styles.addBtn,
                {
                  borderColor: "#a855f7",
                  borderRadius: colors.radius,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
              testID="btn-add-evento"
            >
              <Feather name="plus-circle" size={18} color="#a855f7" />
              <Text style={[styles.addBtnText, { color: "#a855f7" }]}>
                {eventos.length === 0 ? "Agregar tu primer evento" : "Agregar otro evento"}
              </Text>
            </Pressable>
          )}
        </Section>

        <Section
          step="3"
          title="Reflexión final"
          hint="Mira tu línea completa. ¿Qué notas?"
          colors={colors}
        >
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
            Patrones que reconoces (opcional)
          </Text>
          <TextInput
            value={reflexion}
            onChangeText={setReflexion}
            placeholder="¿Hay temas o emociones que se repiten?"
            placeholderTextColor={colors.mutedForeground}
            multiline
            style={[inputStyle, { minHeight: 70, textAlignVertical: "top" }]}
            testID="input-reflexion"
          />

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 14 }]}>
            Tus fortalezas (opcional)
          </Text>
          <TextInput
            value={fortalezas}
            onChangeText={setFortalezas}
            placeholder="¿Qué te ha permitido seguir adelante?"
            placeholderTextColor={colors.mutedForeground}
            multiline
            style={[inputStyle, { minHeight: 70, textAlignVertical: "top" }]}
            testID="input-fortalezas"
          />

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 14 }]}>
            Aprendizajes generales (opcional)
          </Text>
          <TextInput
            value={aprendizajes}
            onChangeText={setAprendizajes}
            placeholder="¿Qué te llevas de toda tu historia?"
            placeholderTextColor={colors.mutedForeground}
            multiline
            style={[inputStyle, { minHeight: 70, textAlignVertical: "top" }]}
            testID="input-aprendizajes"
          />
        </Section>

        <Pressable
          onPress={() => submit.mutate()}
          disabled={!canSubmit}
          style={({ pressed }) => [
            styles.submitBtn,
            {
              backgroundColor: "#a855f7",
              borderRadius: colors.radius,
              opacity: !canSubmit ? 0.5 : pressed ? 0.85 : 1,
            },
          ]}
          testID="btn-save-linea-vida"
        >
          {submit.isPending ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <>
              <Feather name="check-circle" size={18} color="#ffffff" />
              <Text style={styles.submitText}>Guardar línea de vida</Text>
            </>
          )}
        </Pressable>

        {!canSubmit && !submit.isPending && (
          <Text style={[styles.helperHint, { color: colors.mutedForeground }]}>
            {draft
              ? "Termina de guardar el evento que estás editando."
              : !presente.trim()
              ? "Cuéntanos sobre tu presente para continuar."
              : eventos.length === 0
              ? "Agrega al menos un evento para guardar."
              : ""}
          </Text>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

function StatChip({ color, label }: { color: string; label: string }) {
  return (
    <View style={[styles.statChip, { backgroundColor: color + "22" }]}>
      <View style={[styles.statDot, { backgroundColor: color }]} />
      <Text style={[styles.statChipText, { color }]}>{label}</Text>
    </View>
  );
}

function Section({
  step,
  title,
  hint,
  colors,
  children,
}: {
  step: string;
  title: string;
  hint: string;
  colors: ReturnType<typeof useColors>;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={[styles.stepBubble, { backgroundColor: "#a855f7" }]}>
          <Text style={styles.stepText}>{step}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
          <Text style={[styles.sectionHint, { color: colors.mutedForeground }]}>{hint}</Text>
        </View>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { textAlign: "center", fontFamily: "Inter_600SemiBold", fontSize: 17 },
  headerSub: { textAlign: "center", fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  scroll: { padding: 20 },
  heroBox: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 24,
    gap: 6,
  },
  heroTitle: { color: "#ffffff", fontFamily: "Inter_700Bold", fontSize: 18 },
  heroText: { color: "#fdf4ff", fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 18 },
  section: { marginBottom: 24 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  stepBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  stepText: { color: "#ffffff", fontFamily: "Inter_700Bold", fontSize: 16 },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16 },
  sectionHint: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 2 },
  input: {
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
  },
  fieldLabel: { fontFamily: "Inter_500Medium", fontSize: 12, marginBottom: 6 },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    flexWrap: "wrap",
    gap: 8,
  },
  statText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  statDots: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  statChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statDot: { width: 6, height: 6, borderRadius: 3 },
  statChipText: { fontFamily: "Inter_500Medium", fontSize: 11 },
  eventCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 14,
    borderWidth: 1,
    gap: 10,
    marginBottom: 10,
  },
  eventDot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  eventTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
    flexWrap: "wrap",
  },
  eventAge: { fontFamily: "Inter_500Medium", fontSize: 12 },
  eventBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  eventBadgeText: { fontFamily: "Inter_500Medium", fontSize: 11 },
  eventTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  eventDesc: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 4 },
  iconBtn: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  draftBox: { borderWidth: 1, padding: 14, marginTop: 4 },
  draftTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  tipoRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  tipoChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  tipoText: { fontFamily: "Inter_500Medium", fontSize: 13 },
  draftActions: { flexDirection: "row", gap: 10, marginTop: 16, justifyContent: "flex-end" },
  secondaryBtn: { paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1 },
  secondaryText: { fontFamily: "Inter_500Medium", fontSize: 13 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  primaryText: { color: "#ffffff", fontFamily: "Inter_600SemiBold", fontSize: 13 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderWidth: 2,
    borderStyle: "dashed",
  },
  addBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    marginTop: 8,
  },
  submitText: { color: "#ffffff", fontFamily: "Inter_600SemiBold", fontSize: 16 },
  helperHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    textAlign: "center",
    marginTop: 10,
  },
});
