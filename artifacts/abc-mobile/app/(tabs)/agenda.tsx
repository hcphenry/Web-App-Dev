import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { authFetch } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

interface Sesion {
  id: number;
  fechaSesion: string;
  montoCobrado: string;
  moneda: string;
  estadoPago: "pagado" | "pendiente" | "deuda";
  fechaPago: string | null;
  metodoPago: string | null;
  notas: string | null;
  psicologoId: number;
  psicologoNombre: string;
  psicologoEmail: string;
}

function formatDateLong(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-PE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
}

function payLabel(s: Sesion["estadoPago"]): string {
  switch (s) {
    case "pagado": return "Pagada";
    case "pendiente": return "Pendiente";
    case "deuda": return "En deuda";
  }
}

export default function AgendaScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const { data, isLoading, isRefetching, refetch, error } = useQuery({
    queryKey: ["my-sessions"],
    queryFn: () => authFetch<Sesion[]>("/api/agenda/mis-sesiones"),
  });

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const grouped = useMemo(() => {
    const all = (data ?? []).slice().sort(
      (a, b) => new Date(a.fechaSesion).getTime() - new Date(b.fechaSesion).getTime(),
    );
    const now = Date.now();
    const upcoming = all.filter((s) => new Date(s.fechaSesion).getTime() >= now);
    const past = all.filter((s) => new Date(s.fechaSesion).getTime() < now).reverse();
    return { upcoming, past };
  }, [data]);

  const renderCard = (s: Sesion) => {
    const payColor =
      s.estadoPago === "pagado" ? colors.primary :
      s.estadoPago === "deuda" ? colors.destructive :
      colors.accentForeground;
    return (
      <View
        key={s.id}
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
        ]}
      >
        <View style={[styles.dateBubble, { backgroundColor: colors.accent }]}>
          <Feather name="calendar" size={20} color={colors.accentForeground} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardDate, { color: colors.foreground }]} numberOfLines={1}>
            {formatDateLong(s.fechaSesion)}
          </Text>
          <Text style={[styles.cardTime, { color: colors.mutedForeground }]}>
            {formatTime(s.fechaSesion)} hrs
          </Text>
          <View style={styles.metaRow}>
            <Feather name="user" size={12} color={colors.mutedForeground} />
            <Text style={[styles.metaText, { color: colors.mutedForeground }]} numberOfLines={1}>
              {s.psicologoNombre}
            </Text>
          </View>
          <View style={styles.bottomRow}>
            <View style={[styles.payBadge, { backgroundColor: payColor + "20" }]}>
              <View style={[styles.dot, { backgroundColor: payColor }]} />
              <Text style={[styles.payText, { color: payColor }]}>{payLabel(s.estadoPago)}</Text>
            </View>
            <Text style={[styles.amount, { color: colors.foreground }]}>
              {s.moneda} {Number(s.montoCobrado).toFixed(2)}
            </Text>
          </View>
          {s.notas ? (
            <Text style={[styles.notes, { color: colors.mutedForeground }]} numberOfLines={2}>
              {s.notas}
            </Text>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Mi agenda</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Tus sesiones programadas y pasadas
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : error ? (
        <View style={styles.centerBox}>
          <Feather name="wifi-off" size={32} color={colors.mutedForeground} />
          <Text style={[styles.errorTitle, { color: colors.foreground }]}>
            No pudimos cargar tu agenda
          </Text>
          <Text style={[styles.errorSub, { color: colors.mutedForeground }]}>
            {error instanceof Error ? error.message : "Error desconocido"}
          </Text>
          <Pressable
            onPress={() => refetch()}
            style={({ pressed }) => [
              styles.retryBtn,
              {
                backgroundColor: colors.primary,
                borderRadius: colors.radius,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={[styles.retryText, { color: colors.primaryForeground }]}>Reintentar</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.primary}
            />
          }
        >
          {grouped.upcoming.length === 0 && grouped.past.length === 0 ? (
            <View style={[styles.centerBox, { paddingTop: 60 }]}>
              <Feather name="calendar" size={32} color={colors.mutedForeground} />
              <Text style={[styles.errorTitle, { color: colors.foreground }]}>
                Sin sesiones registradas
              </Text>
              <Text style={[styles.errorSub, { color: colors.mutedForeground }]}>
                Cuando tu psicóloga programe una sesión, aparecerá aquí.
              </Text>
            </View>
          ) : null}

          {grouped.upcoming.length > 0 ? (
            <>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Próximas</Text>
              {grouped.upcoming.map(renderCard)}
            </>
          ) : null}

          {grouped.past.length > 0 ? (
            <>
              <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: grouped.upcoming.length ? 24 : 0 }]}>
                Anteriores
              </Text>
              {grouped.past.map(renderCard)}
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 24, paddingBottom: 16 },
  title: { fontFamily: "Inter_700Bold", fontSize: 24 },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 14, marginTop: 4 },
  scroll: { paddingHorizontal: 24, paddingTop: 8, gap: 12 },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16, marginBottom: 12 },
  card: {
    flexDirection: "row",
    gap: 14,
    padding: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  dateBubble: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  cardDate: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    textTransform: "capitalize",
  },
  cardTime: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 2 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  metaText: { fontFamily: "Inter_400Regular", fontSize: 13, flex: 1 },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    flexWrap: "wrap",
    gap: 8,
  },
  payBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  payText: { fontFamily: "Inter_500Medium", fontSize: 12 },
  amount: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  notes: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 8, fontStyle: "italic" },
  centerBox: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 8 },
  errorTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16, marginTop: 12, textAlign: "center" },
  errorSub: { fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center" },
  retryBtn: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 12 },
  retryText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
});
