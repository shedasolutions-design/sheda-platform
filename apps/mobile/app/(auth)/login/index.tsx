"use client";

import InterBold from "@/components/Text/InterBold";
import InterRegular from "@/components/Text/InterRegular";
import { View, TouchableOpacity, ScrollView, Keyboard } from "react-native";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { router } from "expo-router";
import Button from "@/components/common/Button";
import InterSemiBold from "@/components/Text/InterSemiBold";
import Breaker from "@/components/Breaker";
import StyledTextInput from "@/components/input/textInput";
import Socials from "@/components/Socials";
import { useAuth } from "@/hooks/useShedaApi";
import { useApi } from "@/contexts/ApiContext";
import { useGoogleAuth } from "@/hooks/useGoogleAuth";
import { useWallet } from "@/contexts/WalletContext";
import { useEffect, useState, useRef, useCallback } from "react";
import FeedbackModal from "@/components/common/FeedbackModal";

const loginSchema = z.object({
  identifier: z.string().min(3, { message: "Please enter a valid email, phone, or username." }),
  password: z
    .string()
    .min(5, { message: "Password must be at least 5 characters." }),
});

type LoginFormData = z.infer<typeof loginSchema>;

const Login = () => {
  const { login, isLoading, error, clearError, isAuthenticated } = useAuth();
  const { socialLogin } = useApi();
  const { signInWithGoogle } = useGoogleAuth();
  // Phase A settles from local storage within milliseconds of the provider
  // mounting, so by the time a login round-trip completes this is reliable
  // without adding any wait of its own.
  const { hasLocalWallet } = useWallet();
  const [hasAttemptedLogin, setHasAttemptedLogin] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const isSubmitting = useRef(false);
  const [modalConfig, setModalConfig] = useState<{
    isVisible: boolean;
    type: "success" | "error" | "info" | "loading";
    title: string;
    message?: string;
  }>({
    isVisible: false,
    type: "info",
    title: "",
  });

  const showModal = useCallback(
    (
      type: "success" | "error" | "info" | "loading",
      title: string,
      message?: string
    ) => {
      setModalConfig({ isVisible: true, type, title, message });
    },
    []
  );

  const hideModal = useCallback(() => {
    setModalConfig((prev) => ({ ...prev, isVisible: false }));
  }, []);

  const {
    control,
    handleSubmit,
    setError: setFormError,
    clearErrors,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: "", password: "" },
  });

  // ────── Clear stale errors on mount ──────
  useEffect(() => {
    clearError();
    setHasAttemptedLogin(false);
  }, []);

  // ────── Navigation on success ──────
  useEffect(() => {
    if (isAuthenticated && hasAttemptedLogin) {
      isSubmitting.current = false;
      showModal("success", "Welcome Back!", "Login successful. Redirecting…");
      const timer = setTimeout(() => {
        hideModal();
        // A returning user with a wallet already on this device goes straight
        // in — WalletContext's Phase B reconnects it in the background.
        //
        // Everyone else lands on wallet setup instead of home. Signing in on a
        // new phone previously dropped you on the dashboard with no wallet and
        // no route back to the one you already own; wallet-setup is where
        // create, import, and "restore from Google backup" all live.
        router.replace(hasLocalWallet ? "/(tabs)/home" : "/wallet-setup");
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, hasAttemptedLogin, hasLocalWallet]);

  // ────── Handle API errors ──────
  useEffect(() => {
    if (!error || !hasAttemptedLogin) return;
    isSubmitting.current = false;

    const errLower = error.toLowerCase();

    // Map to field-level or show modal
    if (
      errLower.includes("password") ||
      errLower.includes("incorrect") ||
      errLower.includes("wrong")
    ) {
      setFormError("password", { type: "manual", message: error });
    } else if (
      errLower.includes("not found") ||
      errLower.includes("no account") ||
      errLower.includes("user")
    ) {
      setFormError("identifier", { type: "manual", message: error });
    } else if (
      errLower.includes("network") ||
      errLower.includes("connect") ||
      errLower.includes("timeout") ||
      errLower.includes("server")
    ) {
      showModal("error", "Connection Error", error);
    } else {
      showModal("error", "Login Failed", error);
    }

    clearError();
  }, [error]);

  const onSubmit = useCallback(
    (data: LoginFormData) => {
      if (isSubmitting.current) return; // Prevent double-tap
      isSubmitting.current = true;
      Keyboard.dismiss();
      clearErrors();
      setHasAttemptedLogin(true);
      login(data.identifier, data.password);
    },
    [login, clearErrors]
  );

  const handleGoogleSignIn = useCallback(async () => {
    // Only guard against a double-tap while a sign-in is genuinely in
    // flight. Readiness is handled inside signInWithGoogle(), which waits
    // rather than discarding the tap — returning early here is what made
    // the button feel dead on a cold screen.
    if (isGoogleLoading) return;
    setIsGoogleLoading(true);
    clearErrors();
    try {
      const idToken = await signInWithGoogle();
      // Reuse the same success effect email/password login already has —
      // it fires on isAuthenticated + hasAttemptedLogin, and socialLogin
      // dispatches SET_AUTHENTICATED just like login() does.
      setHasAttemptedLogin(true);
      await socialLogin({ token: idToken, provider: "google" });
    } catch (err: any) {
      showModal("error", "Google Sign-In Failed", err?.message || "Please try again.");
    } finally {
      setIsGoogleLoading(false);
    }
  }, [isGoogleLoading, signInWithGoogle, socialLogin, clearErrors, showModal]);

  // Show loading modal only while actively submitting
  const showLoading = isLoading && hasAttemptedLogin && isSubmitting.current;

  return (
    <ScrollView
      className="flex-1 bg-white"
      contentContainerStyle={{ flexGrow: 1 }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="container mx-auto max-w-2xl" style={{ padding: 20 }}>
        <FeedbackModal
          isVisible={modalConfig.isVisible || showLoading}
          type={showLoading ? "loading" : modalConfig.type}
          title={showLoading ? "Signing In" : modalConfig.title}
          message={showLoading ? "Verifying your credentials…" : modalConfig.message}
          onClose={!showLoading ? hideModal : undefined}
          showRetry={modalConfig.type === "error" && (modalConfig.message?.toLowerCase().includes("connect") || modalConfig.message?.toLowerCase().includes("network") || false)}
          retryAction={() => {
            hideModal();
            handleSubmit(onSubmit)();
          }}
        />

        {/* Header */}
        <InterBold className="text-2xl lg:text-4xl mt-16">Log in</InterBold>

        {/* Form */}
        <View className="mt-8">
          {/* ── Identifier (Email/Phone/Username) ── */}
          <View className="mb-2">
            <InterRegular className="py-1">Email, Phone or Username</InterRegular>
            <Controller
              control={control}
              name="identifier"
              render={({ field }) => (
                <StyledTextInput
                  placeholder="Email, Phone or Username"
                  value={field.value}
                  onChangeText={(text: string) => {
                    field.onChange(text);
                    if (errors.identifier) clearErrors("identifier");
                  }}
                  onBlur={field.onBlur}
                  autoCapitalize="none"
                  autoComplete="username"
                />
              )}
            />
            {errors.identifier && (
              <InterRegular className="text-red-500 text-xs mt-1">
                {errors.identifier.message}
              </InterRegular>
            )}
          </View>

          {/* ── Password ── */}
          <View className="my-4">
            <InterRegular className="py-1">Password</InterRegular>
            <Controller
              control={control}
              name="password"
              render={({ field }) => (
                <StyledTextInput
                  isPassword
                  placeholder="********"
                  value={field.value}
                  onChangeText={(text: string) => {
                    field.onChange(text);
                    if (errors.password) clearErrors("password");
                  }}
                  onBlur={field.onBlur}
                  autoComplete="password"
                />
              )}
            />
            {errors.password && (
              <InterRegular className="text-red-500 text-xs mt-1">
                {errors.password.message}
              </InterRegular>
            )}

            <TouchableOpacity 
              onPress={() => router.push("/(auth)/forget-pass")}
              className="self-end my-1"
            >
              <InterRegular className="text-sm">
                Forgot password?
              </InterRegular>
            </TouchableOpacity>
          </View>

          {/* ── Global API error (non-field) ── */}
          {errors.root && (
            <InterRegular className="text-red-500 text-sm text-center mb-3 px-2">
              {errors.root.message}
            </InterRegular>
          )}

          <Button
            className="rounded-xl"
            onPress={handleSubmit(onSubmit)}
            disabled={showLoading}
          >
            <InterSemiBold className="text-background text-base">
              {showLoading ? "Signing in…" : "Log in"}
            </InterSemiBold>
          </Button>
        </View>

        {/* Socials & Sign-up */}
        <View>
          <View className="py-4">
            <Breaker breakText="Or Login with" />
          </View>
          <Socials
            onGooglePress={handleGoogleSignIn}
            isGoogleLoading={isGoogleLoading}
            statusText="Taking you to Google…"
          />

          <TouchableOpacity 
            onPress={() => router.push("/(auth)/signup")}
            className="text-center mt-4 flex-row justify-center"
          >
            <InterRegular className="mr-1">Don't have an account?</InterRegular>
            <InterBold className="">Sign up</InterBold>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
};

export default Login;