import { Feather } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
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

const EMOTIONS: { key: string; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { key: "Tristeza", label: "Tristeza", icon: "cloud-rain" },
  { key: "Ansiedad", label: "Ansiedad", icon: "wind" },
  { key: "Ira", label: "Ira", icon: "zap" },
  { key: "Miedo", label: "Miedo", icon: "alert-triangle" },
  { key: "Frustración", label: "Frustración", icon: "x-octagon" },
  { key: "Vergüenza", label: "Vergüenza", icon: "eye-off" },
  { key: "Culpa", label: "Culpa", icon: "user-x" },
  { key: "Alegría", label: "Alegría", icon: "sun" },
  { key: "Calma", label: "Calma", icon: "feather" },
];

interface CreatedRecord {
  id: number;
}

export default function AbcFormScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ assignmentId?: string }>();
  const assignmentId = params.assignmentId ? Number(params.assignmentId) : null;

  const [situacion, setSituacion] = useState<string>("");
  const [pensamientos, setPensamientos] = useState<string>("");
  const [emocion, setEmocion] = useState<string>("");
  const [intensidad, setIntensidad] = useState<number>(5);
  const [conducta, setConducta] = useState<string>("");
  const [reflexion, setReflexion] = useState<string>("");

  const submit = useMutation({
    mutationFn: async (): Promise<{ record: CreatedRecord; completeFailed: boolean }> => {
      if (assignmentId) {
        try {
          await authFetch(`/api/tareas/mine/${assignmentId}/start`, { method: "POST" });
        } catch {
          // ok if already started
        }
      }
      const record = await authFetch<CreatedRecord>("/api/records", {
        method: "POST",
        body: JSON.stringify({
          situacion: situacion.trim(),
          pensamientos: pensamientos.trim(),
          emocion: emocion.trim(),
          intensidad,
          conducta: conducta.trim(),
          reflexion: reflexion.trim() ? reflexion.trim() : null,
        }),
      });
      let completeFailed = false;
      if (assignmentId) {
        try {
          await authFetch(`/api/tareas/mine/${assignmentId}/complete`, { method: "POST" });
        } catch {
          completeFailed = true;
        }
      }
      return { record, completeFailed };
    },
    onSuccess: async ({ completeFailed }) => {
      await queryClient.invalidateQueries({ queryKey: ["my-assignments"] });
      if (completeFailed && assignmentId) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        Alert.alert(
          "Registro guardado",
          "Tu Registro ABC se guardó, pero no pudimos marcar la tarea como completada. ¿Quieres reintentar?",
          [
            { text: "Después", style: "cancel", onPress: () => router.back() },
            {
              text: "Reintentar",
              onPress: async () => {
                try {
                  await authFetch(`/api/tareas/mine/${assignmentId}/complete`, { method: "POST" });
                  await queryClient.invalidateQueries({ queryKey: ["my-assignments"] });
                  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  router.back();
                } catch (e) {
                  Alert.alert(
                    "No se pudo completar la tarea",
                    e instanceof Error ? e.message : "Error desconocido",
                    [{ text: "OK", onPress: () => router.back() }],
                  );
                }
              },
            },
          ],
        );
        return;
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("¡Registro guardado!", "Tu Registro ABC fue enviado correctamente.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    },
    onError: (err: unknown) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("No se pudo guardar", err instanceof Error ? err.message : "Error desconocido");
    },
  });

  const canSubmit =
    situacion.trim().length > 0 &&
    pensamientos.trim().length > 0 &&
    emocion.trim().length > 0 &&
    conducta.trim().length > 0 &&
    !submit.isPending;

  const inputStyle = [
    styles.input,
    {
      backgroundColor: colors.card,
      borderColor: colors.border,
      color: colors.foreground,
      borderRadius: colors.radius,
    },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.5 : 1 }]}
          testID="back-button"
        >
          <Feather name="arrow-left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Registro ABC</Text>
        <View style={styles.backBtn} />
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        bottomOffset={20}
      >
        <Section
          step="A"
          title="Situación activadora"
          hint="¿Qué pasó? Describe el evento o detonante."
          colors={colors}
        >
          <TextInput
            value={situacion}
            onChangeText={setSituacion}
            placeholder="Ej. Discusión con un familiar..."
            placeholderTextColor={colors.mutedForeground}
            multiline
            style={[inputStyle, { minHeight: 96, textAlignVertical: "top" }]}
            testID="situacion-input"
          />
        </Section>

        <Section
          step="B"
          title="Pensamientos / Creencias"
          hint="¿Qué pensaste en ese momento?"
          colors={colors}
        >
          <TextInput
            value={pensamientos}
            onChangeText={setPensamientos}
            placeholder="Ej. Pensé que no me valoran..."
            placeholderTextColor={colors.mutedForeground}
            multiline
            style={[inputStyle, { minHeight: 96, textAlignVertical: "top" }]}
            testID="pensamientos-input"
          />
        </Section>

        <Section
          step="C"
          title="Emoción"
          hint="Selecciona o escribe lo que sentiste"
          colors={colors}
        >
          <View style={styles.chipRow}>
            {EMOTIONS.map((e) => {
              const selected = emocion === e.key;
              return (
                <Pressable
                  key={e.key}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setEmocion(e.key);
                  }}
                  style={({ pressed }) => [
                    styles.chip,
                    {
                      backgroundColor: selected ? colors.primary : colors.card,
                      borderColor: selected ? colors.primary : colors.border,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <Feather
                    name={e.icon}
                    size={14}
                    color={selected ? colors.primaryForeground : colors.mutedForeground}
                  />
                  <Text
                    style={[
                      styles.chipText,
                      { color: selected ? colors.primaryForeground : colors.foreground },
                    ]}
                  >
                    {e.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            value={emocion}
            onChangeText={setEmocion}
            placeholder="O escribe otra emoción"
            placeholderTextColor={colors.mutedForeground}
            style={[inputStyle, { marginTop: 12 }]}
            testID="emocion-input"
          />

          <Text style={[styles.intensityLabel, { color: colors.foreground }]}>
            Intensidad: {intensidad}/10
          </Text>
          <View style={styles.intensityRow}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
              const active = n <= intensidad;
              return (
                <Pressable
                  key={n}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setIntensidad(n);
                  }}
                  style={({ pressed }) => [
                    styles.intensityDot,
                    {
                      backgroundColor: active ? colors.primary : colors.muted,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                  testID={`intensity-${n}`}
                >
                  <Text
                    style={[
                      styles.intensityNum,
                      { color: active ? colors.primaryForeground : colors.mutedForeground },
                    ]}
                  >
                    {n}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Section>

        <Section
          step="D"
          title="Conducta"
          hint="¿Qué hiciste como reacción?"
          colors={colors}
        >
          <TextInput
            value={conducta}
            onChangeText={setConducta}
            placeholder="Ej. Me alejé y guardé silencio..."
            placeholderTextColor={colors.mutedForeground}
            multiline
            style={[inputStyle, { minHeight: 80, textAlignVertical: "top" }]}
            testID="conducta-input"
          />
        </Section>

        <Section
          step="E"
          title="Reflexión (opcional)"
          hint="¿Qué aprendiste? ¿Qué harías diferente?"
          colors={colors}
        >
          <TextInput
            value={reflexion}
            onChangeText={setReflexion}
            placeholder="Tu reflexión..."
            placeholderTextColor={colors.mutedForeground}
            multiline
            style={[inputStyle, { minHeight: 80, textAlignVertical: "top" }]}
            testID="reflexion-input"
          />
        </Section>

        <Pressable
          onPress={() => submit.mutate()}
          disabled={!canSubmit}
          style={({ pressed }) => [
            styles.submitBtn,
            {
              backgroundColor: colors.primary,
              borderRadius: colors.radius,
              opacity: !canSubmit ? 0.5 : pressed ? 0.85 : 1,
            },
          ]}
          testID="submit-record"
        >
          {submit.isPending ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <>
              <Feather name="check" size={18} color={colors.primaryForeground} />
              <Text style={[styles.submitText, { color: colors.primaryForeground }]}>
                Guardar registro
              </Text>
            </>
          )}
        </Pressable>
      </KeyboardAwareScrollView>
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
        <View style={[styles.stepBubble, { backgroundColor: colors.primary }]}>
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
  headerTitle: { flex: 1, textAlign: "center", fontFamily: "Inter_600SemiBold", fontSize: 17 },
  scroll: { padding: 20 },
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
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: { fontFamily: "Inter_500Medium", fontSize: 13 },
  intensityLabel: { fontFamily: "Inter_500Medium", fontSize: 14, marginTop: 16, marginBottom: 8 },
  intensityRow: { flexDirection: "row", gap: 6, justifyContent: "space-between" },
  intensityDot: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  intensityNum: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    marginTop: 8,
  },
  submitText: { fontFamily: "Inter_600SemiBold", fontSize: 16 },
});
