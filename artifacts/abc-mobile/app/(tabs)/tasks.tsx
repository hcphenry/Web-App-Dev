import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { authFetch, useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

interface AbcAssignment {
  id: number;
  taskId: number;
  taskKey: string;
  taskName: string;
  taskDescription: string | null;
  status: "pendiente" | "en_progreso" | "completada" | "cancelada";
  dueAt: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

const SUPPORTED_TASK_KEYS = new Set([
  "registro-abc",
  "linea-de-vida",
  "consentimiento-informado",
]);

type SupportedRoute =
  | "/abc-form"
  | "/linea-vida-form"
  | "/consentimiento-informado-form";

const TASK_META: Record<
  string,
  { icon: keyof typeof Feather.glyphMap; bg: string; fg: string; route: SupportedRoute }
> = {
  "registro-abc": { icon: "edit-3", bg: "", fg: "", route: "/abc-form" },
  "linea-de-vida": { icon: "activity", bg: "#f3e8ff", fg: "#a855f7", route: "/linea-vida-form" },
  "consentimiento-informado": {
    icon: "shield",
    bg: "#e0f2fe",
    fg: "#0369a1",
    route: "/consentimiento-informado-form",
  },
};

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function statusLabel(s: AbcAssignment["status"]): string {
  switch (s) {
    case "pendiente": return "Pendiente";
    case "en_progreso": return "En progreso";
    case "completada": return "Completada";
    case "cancelada": return "Cancelada";
  }
}

export default function TasksScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut } = useAuth();

  const { data, isLoading, isRefetching, refetch, error } = useQuery({
    queryKey: ["my-assignments"],
    queryFn: async () => {
      const all = await authFetch<AbcAssignment[]>("/api/tareas/mine");
      return all.filter((a) => SUPPORTED_TASK_KEYS.has(a.taskKey));
    },
  });

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const handleLogout = async () => {
    await signOut();
    router.replace("/login");
  };

  const renderItem = ({ item }: { item: AbcAssignment }) => {
    const isDone = item.status === "completada";
    const statusColor =
      item.status === "completada" ? colors.primary :
      item.status === "en_progreso" ? colors.accentForeground :
      item.status === "cancelada" ? colors.destructive :
      colors.mutedForeground;
    const meta = TASK_META[item.taskKey];
    const route = meta?.route ?? "/abc-form";
    const iconBg = meta?.bg || colors.accent;
    const iconFg = meta?.fg || colors.accentForeground;
    const iconName = meta?.icon ?? "edit-3";

    return (
      <Pressable
        onPress={() => router.push({ pathname: route, params: { assignmentId: String(item.id) } })}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            borderRadius: colors.radius,
            opacity: pressed ? 0.92 : 1,
          },
        ]}
        testID={`assignment-${item.id}`}
      >
        <View style={[styles.iconBubble, { backgroundColor: iconBg }]}>
          <Feather name={iconName} size={22} color={iconFg} />
        </View>
        <View style={styles.cardBody}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>
            {item.taskName}
          </Text>
          {item.taskDescription ? (
            <Text style={[styles.cardDesc, { color: colors.mutedForeground }]} numberOfLines={2}>
              {item.taskDescription}
            </Text>
          ) : null}
          <View style={styles.cardMeta}>
            <View style={[styles.badge, { backgroundColor: statusColor + "20" }]}>
              <View style={[styles.dot, { backgroundColor: statusColor }]} />
              <Text style={[styles.badgeText, { color: statusColor }]}>{statusLabel(item.status)}</Text>
            </View>
            {item.dueAt ? (
              <Text style={[styles.dueText, { color: colors.mutedForeground }]}>
                Vence {formatDate(item.dueAt)}
              </Text>
            ) : null}
          </View>
        </View>
        <Feather
          name={isDone ? "check-circle" : "chevron-right"}
          size={22}
          color={isDone ? colors.primary : colors.mutedForeground}
        />
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.greeting, { color: colors.mutedForeground }]}>Hola,</Text>
          <Text style={[styles.userName, { color: colors.foreground }]} numberOfLines={1}>
            {user?.name ?? "Paciente"}
          </Text>
        </View>
        <Pressable
          onPress={handleLogout}
          hitSlop={12}
          style={({ pressed }) => [styles.logoutBtn, { opacity: pressed ? 0.6 : 1 }]}
          testID="logout-button"
        >
          <Feather name="log-out" size={20} color={colors.mutedForeground} />
        </Pressable>
      </View>

      <View style={styles.sectionHead}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Tus tareas</Text>
        <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>
          Toca una tarea para empezar
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : error ? (
        <View style={styles.centerBox}>
          <Feather name="wifi-off" size={32} color={colors.mutedForeground} />
          <Text style={[styles.errorTitle, { color: colors.foreground }]}>No pudimos cargar tus tareas</Text>
          <Text style={[styles.errorSub, { color: colors.mutedForeground }]}>
            {error instanceof Error ? error.message : "Error desconocido"}
          </Text>
          <Pressable
            onPress={() => refetch()}
            style={({ pressed }) => [
              styles.retryBtn,
              { backgroundColor: colors.primary, borderRadius: colors.radius, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={[styles.retryText, { color: colors.primaryForeground }]}>Reintentar</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 24 },
            (data ?? []).length === 0 && { flex: 1 },
          ]}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.primary}
            />
          }
          scrollEnabled={(data ?? []).length > 0}
          ListEmptyComponent={
            <View style={styles.centerBox}>
              <Feather name="inbox" size={32} color={colors.mutedForeground} />
              <Text style={[styles.errorTitle, { color: colors.foreground }]}>Sin tareas asignadas</Text>
              <Text style={[styles.errorSub, { color: colors.mutedForeground }]}>
                Tu psicóloga aún no te ha asignado tareas.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 24,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  greeting: { fontFamily: "Inter_400Regular", fontSize: 13 },
  userName: { fontFamily: "Inter_700Bold", fontSize: 22, marginTop: 2 },
  logoutBtn: { padding: 8 },
  sectionHead: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 12 },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 20 },
  sectionSub: { fontFamily: "Inter_400Regular", fontSize: 14, marginTop: 4 },
  listContent: { paddingHorizontal: 24, paddingTop: 8 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderWidth: 1,
    gap: 14,
  },
  iconBubble: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: { flex: 1 },
  cardTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16 },
  cardDesc: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 4 },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontFamily: "Inter_500Medium", fontSize: 12 },
  dueText: { fontFamily: "Inter_400Regular", fontSize: 12 },
  centerBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 8,
  },
  errorTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16, marginTop: 12, textAlign: "center" },
  errorSub: { fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center" },
  retryBtn: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 12 },
  retryText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
});
