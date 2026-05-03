import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { authFetch } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

type DocType = "DNI" | "CE" | "PASAPORTE";

interface ConsentText {
  version: string;
  text: string;
}
interface ExistingRecord {
  id: number;
  acceptedAt: string | null;
  fullName: string;
  documentType: string;
  documentNumber: string;
  consentVersion: string;
}

const DOC_OPTIONS: { value: DocType; label: string }[] = [
  { value: "DNI", label: "DNI" },
  { value: "CE", label: "Carné de Extranjería" },
  { value: "PASAPORTE", label: "Pasaporte" },
];

const SKY = "#0ea5e9";
const SKY_DARK = "#0369a1";

export default function ConsentimientoInformadoFormScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ assignmentId?: string }>();
  const assignmentId = params.assignmentId ? Number(params.assignmentId) : null;

  const [fullName, setFullName] = useState("");
  const [documentType, setDocumentType] = useState<DocType>("DNI");
  const [documentNumber, setDocumentNumber] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [readToBottom, setReadToBottom] = useState(false);

  const consentQ = useQuery<ConsentText>({
    queryKey: ["consentimiento-text"],
    queryFn: () => authFetch<ConsentText>("/api/consentimiento-informado/text"),
  });

  const mineQ = useQuery<ExistingRecord | null>({
    queryKey: ["consentimiento-mine"],
    queryFn: () => authFetch<ExistingRecord | null>("/api/consentimiento-informado/mine"),
  });

  const submit = useMutation({
    mutationFn: async () => {
      return authFetch<ExistingRecord>("/api/consentimiento-informado/mine", {
        method: "POST",
        body: JSON.stringify({
          assignmentId,
          accepted: true,
          fullName: fullName.trim(),
          documentType,
          documentNumber: documentNumber.trim(),
        }),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["my-assignments"] });
      await queryClient.invalidateQueries({ queryKey: ["consentimiento-mine"] });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "Consentimiento aceptado",
        "Tu aceptación quedó registrada en tu historia clínica electrónica.",
        [{ text: "OK", onPress: () => router.back() }],
      );
    },
    onError: (err: unknown) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("No se pudo guardar", err instanceof Error ? err.message : "Error desconocido");
    },
  });

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    if (contentSize.height - contentOffset.y - layoutMeasurement.height < 32) {
      setReadToBottom(true);
    }
  }

  const existing = mineQ.data ?? null;
  const loading = consentQ.isLoading || mineQ.isLoading;

  const canSubmit =
    !existing &&
    readToBottom &&
    accepted &&
    fullName.trim().length >= 3 &&
    documentNumber.trim().length >= 6 &&
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
          accessibilityLabel="Volver"
        >
          <Feather name="arrow-left" size={24} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Consentimiento</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]} numberOfLines={1}>
            Tratamiento de información digital
          </Text>
        </View>
        <View style={styles.backBtn} />
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 48 }]}
        keyboardShouldPersistTaps="handled"
        bottomOffset={20}
      >
        <View style={[styles.heroBox, { backgroundColor: SKY }]}>
          <Feather name="shield" size={22} color="#ffffff" />
          <Text style={styles.heroTitle}>Consentimiento Informado</Text>
          <Text style={styles.heroText}>
            Centro Psicológico ABC Positivamente · Lima, Perú. Cumple Ley N.° 29733 (Protección de Datos),
            Ley N.° 30024 y normativa del MINSA.
          </Text>
          {consentQ.data?.version && (
            <View style={styles.heroBadgeRow}>
              <View style={styles.heroBadge}>
                <Text style={styles.heroBadgeText}>Versión {consentQ.data.version}</Text>
              </View>
            </View>
          )}
        </View>

        {loading ? (
          <View style={{ paddingVertical: 32, alignItems: "center" }}>
            <ActivityIndicator color={SKY} size="large" />
          </View>
        ) : existing ? (
          <View
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: "#a7f3d0", borderRadius: colors.radius },
            ]}
          >
            <View style={styles.acceptedHead}>
              <View style={[styles.acceptedIcon, { backgroundColor: "#d1fae5" }]}>
                <Feather name="check-circle" size={22} color="#059669" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                  Ya aceptaste el consentimiento
                </Text>
                <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
                  {existing.acceptedAt
                    ? new Date(existing.acceptedAt).toLocaleString("es-PE")
                    : "—"}
                </Text>
              </View>
            </View>

            <InfoRow colors={colors} label="Nombre" value={existing.fullName} />
            <InfoRow
              colors={colors}
              label="Documento"
              value={`${existing.documentType} ${existing.documentNumber}`}
            />
            <InfoRow colors={colors} label="Versión aceptada" value={existing.consentVersion} />

            <Text style={[styles.helperHint, { color: colors.mutedForeground, marginTop: 12 }]}>
              Si necesitas revocar o modificar tu consentimiento, contáctanos por el formulario de reclamaciones.
            </Text>
          </View>
        ) : (
          <>
            <View
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
              ]}
            >
              <View style={styles.cardHead}>
                <Feather name="file-text" size={18} color={SKY_DARK} />
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                  Lee el documento completo
                </Text>
              </View>
              <Text style={[styles.cardSub, { color: colors.mutedForeground, marginBottom: 10 }]}>
                Desplázate hasta el final para poder aceptarlo.
              </Text>
              <View
                style={[
                  styles.scrollBox,
                  { backgroundColor: "#f0f9ff", borderColor: "#bae6fd", borderRadius: colors.radius },
                ]}
              >
                <ScrollView
                  onScroll={handleScroll}
                  scrollEventThrottle={64}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                >
                  <Text style={[styles.consentText, { color: colors.foreground }]}>
                    {consentQ.data?.text ?? ""}
                  </Text>
                </ScrollView>
              </View>
              {!readToBottom ? (
                <View style={[styles.inlineNote, { backgroundColor: "#fef3c7" }]}>
                  <Feather name="alert-circle" size={14} color="#b45309" />
                  <Text style={[styles.inlineNoteText, { color: "#b45309" }]}>
                    Aún no has leído todo el documento.
                  </Text>
                </View>
              ) : (
                <View style={[styles.inlineNote, { backgroundColor: "#d1fae5" }]}>
                  <Feather name="check-circle" size={14} color="#047857" />
                  <Text style={[styles.inlineNoteText, { color: "#047857" }]}>
                    Has leído el documento completo.
                  </Text>
                </View>
              )}
            </View>

            <View
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
              ]}
            >
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                Tus datos para la firma electrónica
              </Text>
              <Text style={[styles.cardSub, { color: colors.mutedForeground, marginBottom: 12 }]}>
                Quedarán como evidencia legal de tu aceptación.
              </Text>

              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Nombre completo</Text>
              <TextInput
                value={fullName}
                onChangeText={setFullName}
                placeholder="Como aparece en tu documento"
                placeholderTextColor={colors.mutedForeground}
                style={inputStyle}
                testID="input-fullname"
              />

              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 12 }]}>
                Tipo de documento
              </Text>
              <View style={styles.docTypeRow}>
                {DOC_OPTIONS.map((d) => {
                  const selected = documentType === d.value;
                  return (
                    <Pressable
                      key={d.value}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setDocumentType(d.value);
                      }}
                      style={({ pressed }) => [
                        styles.docTypeChip,
                        {
                          backgroundColor: selected ? SKY : colors.card,
                          borderColor: selected ? SKY : colors.border,
                          opacity: pressed ? 0.85 : 1,
                        },
                      ]}
                      testID={`doctype-${d.value}`}
                    >
                      <Text
                        style={[
                          styles.docTypeText,
                          { color: selected ? "#ffffff" : colors.foreground },
                        ]}
                      >
                        {d.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 12 }]}>
                Número de documento
              </Text>
              <TextInput
                value={documentNumber}
                onChangeText={(t) => setDocumentNumber(t.replace(/[^a-zA-Z0-9]/g, ""))}
                placeholder="Ej. 12345678"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="number-pad"
                style={inputStyle}
                testID="input-docnum"
              />

              <Pressable
                onPress={() => {
                  if (!readToBottom) return;
                  Haptics.selectionAsync();
                  setAccepted(!accepted);
                }}
                disabled={!readToBottom}
                style={({ pressed }) => [
                  styles.acceptBox,
                  {
                    backgroundColor: "#f0f9ff",
                    borderColor: "#bae6fd",
                    borderRadius: colors.radius,
                    opacity: !readToBottom ? 0.55 : pressed ? 0.85 : 1,
                  },
                ]}
                testID="checkbox-accept"
                accessibilityRole="checkbox"
                accessibilityState={{ checked: accepted, disabled: !readToBottom }}
              >
                <View
                  style={[
                    styles.checkbox,
                    {
                      backgroundColor: accepted ? SKY : "#ffffff",
                      borderColor: accepted ? SKY : "#bae6fd",
                    },
                  ]}
                >
                  {accepted && <Feather name="check" size={14} color="#ffffff" />}
                </View>
                <Text style={[styles.acceptText, { color: colors.foreground }]}>
                  He leído y comprendo el consentimiento informado.{" "}
                  <Text style={{ fontFamily: "Inter_600SemiBold" }}>
                    Acepto libre, voluntaria, informada e inequívocamente
                  </Text>{" "}
                  el tratamiento de mis datos por el Centro Psicológico ABC Positivamente conforme a la Ley N.° 29733 y la normativa del MINSA.
                </Text>
              </Pressable>

              <Pressable
                onPress={() => submit.mutate()}
                disabled={!canSubmit}
                style={({ pressed }) => [
                  styles.submitBtn,
                  {
                    backgroundColor: SKY,
                    borderRadius: colors.radius,
                    opacity: !canSubmit ? 0.5 : pressed ? 0.85 : 1,
                  },
                ]}
                testID="btn-accept-consent"
              >
                {submit.isPending ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <Feather name="shield" size={18} color="#ffffff" />
                    <Text style={styles.submitText}>Aceptar y firmar electrónicamente</Text>
                  </>
                )}
              </Pressable>

              {!canSubmit && !submit.isPending && (
                <Text style={[styles.helperHint, { color: colors.mutedForeground, marginTop: 10 }]}>
                  {!readToBottom
                    ? "Lee el documento completo para continuar."
                    : !accepted
                    ? "Marca la casilla para aceptar."
                    : fullName.trim().length < 3
                    ? "Ingresa tu nombre completo."
                    : documentNumber.trim().length < 6
                    ? "Ingresa un número de documento válido."
                    : ""}
                </Text>
              )}
            </View>
          </>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

function InfoRow({
  colors,
  label,
  value,
}: {
  colors: ReturnType<typeof useColors>;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.foreground }]}>{value}</Text>
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
  heroBox: { padding: 16, borderRadius: 16, marginBottom: 20, gap: 6 },
  heroTitle: { color: "#ffffff", fontFamily: "Inter_700Bold", fontSize: 18 },
  heroText: { color: "#e0f2fe", fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 18 },
  heroBadgeRow: { flexDirection: "row", marginTop: 8 },
  heroBadge: {
    backgroundColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  heroBadgeText: { color: "#ffffff", fontFamily: "Inter_500Medium", fontSize: 11, letterSpacing: 0.5 },
  card: { borderWidth: 1, padding: 16, marginBottom: 16 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  cardTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  cardSub: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 2 },
  scrollBox: { borderWidth: 1, padding: 12, height: 240 },
  consentText: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19 },
  inlineNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    alignSelf: "flex-start",
    marginTop: 10,
  },
  inlineNoteText: { fontFamily: "Inter_500Medium", fontSize: 12 },
  fieldLabel: { fontFamily: "Inter_500Medium", fontSize: 12, marginBottom: 6 },
  input: {
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
  },
  docTypeRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  docTypeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  docTypeText: { fontFamily: "Inter_500Medium", fontSize: 13 },
  acceptBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderWidth: 1,
    marginTop: 16,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  acceptText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 18 },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    marginTop: 16,
  },
  submitText: { color: "#ffffff", fontFamily: "Inter_600SemiBold", fontSize: 15 },
  helperHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    textAlign: "center",
  },
  acceptedHead: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  acceptedIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  infoRow: { paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#e2e8f0" },
  infoLabel: { fontFamily: "Inter_500Medium", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 },
  infoValue: { fontFamily: "Inter_400Regular", fontSize: 14, marginTop: 2 },
});
