import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signIn, signingIn, error } = useAuth();

  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);

  const onSubmit = async () => {
    if (!email.trim() || !password) return;
    const ok = await signIn(email.trim().toLowerCase(), password);
    if (ok) router.replace("/tasks");
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
        bottomOffset={20}
      >
        <View style={[styles.logoCircle, { backgroundColor: colors.primary }]}>
          <Text style={styles.logoText}>ABC</Text>
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>Positivamente</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Tu espacio para registrar y reflexionar
        </Text>

        <View style={styles.form}>
          <Text style={[styles.label, { color: colors.foreground }]}>Correo electrónico</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="tu@correo.com"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            style={[
              styles.input,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                color: colors.foreground,
                borderRadius: colors.radius,
              },
            ]}
            testID="email-input"
          />

          <Text style={[styles.label, { color: colors.foreground, marginTop: 16 }]}>Contraseña</Text>
          <View style={[
            styles.passwordRow,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: colors.radius,
            },
          ]}>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="password"
              style={[styles.passwordInput, { color: colors.foreground }]}
              testID="password-input"
            />
            <Pressable
              onPress={() => setShowPassword((v) => !v)}
              hitSlop={12}
              style={styles.eyeBtn}
            >
              <Feather
                name={showPassword ? "eye-off" : "eye"}
                size={20}
                color={colors.mutedForeground}
              />
            </Pressable>
          </View>

          {error ? (
            <View style={[styles.errorBox, { backgroundColor: colors.destructive + "15", borderColor: colors.destructive + "55" }]}>
              <Feather name="alert-circle" size={16} color={colors.destructive} />
              <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={onSubmit}
            disabled={signingIn || !email.trim() || !password}
            style={({ pressed }) => [
              styles.submitBtn,
              {
                backgroundColor: colors.primary,
                borderRadius: colors.radius,
                opacity: signingIn || !email.trim() || !password ? 0.5 : pressed ? 0.85 : 1,
              },
            ]}
            testID="login-submit"
          >
            {signingIn ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={[styles.submitText, { color: colors.primaryForeground }]}>Ingresar</Text>
            )}
          </Pressable>

          <Text style={[styles.helper, { color: colors.mutedForeground }]}>
            ¿No tienes acceso? Solicítalo a tu psicóloga o al centro.
          </Text>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 24, alignItems: "stretch" },
  logoCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  logoText: {
    color: "#ffffff",
    fontFamily: "Inter_700Bold",
    fontSize: 26,
    letterSpacing: 1,
  },
  title: {
    textAlign: "center",
    fontFamily: "Inter_700Bold",
    fontSize: 28,
  },
  subtitle: {
    textAlign: "center",
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    marginTop: 6,
    marginBottom: 32,
  },
  form: { width: "100%" },
  label: { fontFamily: "Inter_500Medium", fontSize: 14, marginBottom: 8 },
  input: {
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
  },
  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    paddingRight: 12,
  },
  passwordInput: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  eyeBtn: { padding: 4 },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 16,
  },
  errorText: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 13 },
  submitBtn: {
    marginTop: 24,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  submitText: { fontFamily: "Inter_600SemiBold", fontSize: 16 },
  helper: {
    marginTop: 20,
    textAlign: "center",
    fontFamily: "Inter_400Regular",
    fontSize: 13,
  },
});
