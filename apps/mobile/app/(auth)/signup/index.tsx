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
import Socials from "@/components/Socials";
import StyledTextInput from "@/components/input/textInput";
import { useAuth } from "@/hooks/useShedaApi";
import { useApi } from "@/contexts/ApiContext";
import { useGoogleAuth } from "@/hooks/useGoogleAuth";
import { useEffect, useState, useRef, useCallback } from "react";
import FeedbackModal from "@/components/common/FeedbackModal";
import nearWalletService from "@/services/nearWallet";

// ────── Zod Schema (includes confirm password) ──────
const signupSchema = z
  .object({
    email: z.string().email({ message: "Please enter a valid email address." }),
    password: z
      .string()
      .min(8, { message: "Password must be at least 8 characters." })
      .regex(/[A-Z]/, { message: "Password must contain at least one uppercase letter." })
      .regex(/[0-9]/, { message: "Password must contain at least one number." }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

type SignupFormData = z.infer<typeof signupSchema>;

const Signup = () => {
  const { signup, isLoading, error, clearError, isAuthenticated } = useAuth();
  const { socialLogin } = useApi();
  const { signInWithGoogle } = useGoogleAuth();
  const [hasAttemptedSignup, setHasAttemptedSignup] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const isSubmitting = useRef(false);
  // Google is also a sign-in route. If the account already existed, this
  // person must not be handed a second wallet, so the success effect is
  // suppressed and they go straight Home instead.
  const existingGoogleUser = useRef(false);
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
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  // ────── Clear stale errors on mount ──────
  useEffect(() => {
    clearError();
    setHasAttemptedSignup(false);
  }, []);

  // ────── Navigate on signup success ──────
  useEffect(() => {
    // Wait while Google is still resolving: socialLogin marks the session
    // authenticated before it returns whether the account is new. Routing
    // during that window would provision a wallet for a returning user.
    if (isGoogleLoading || existingGoogleUser.current) return;
    if (isAuthenticated && hasAttemptedSignup) {
      isSubmitting.current = false;
      showModal("success", "Account Created!", "Setting up your wallet…");
      const timer = setTimeout(() => {
        hideModal();
        // The provision screen creates the wallet automatically and owns the
        // progress UI; it reads the email from the authenticated user.
        router.replace("/wallet-setup/provision");
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, hasAttemptedSignup, isGoogleLoading]);

  // ────── Handle API errors ──────
  useEffect(() => {
    if (!error || !hasAttemptedSignup) return;
    isSubmitting.current = false;

    const errLower = error.toLowerCase();

    if (
      errLower.includes("already") ||
      errLower.includes("exists") ||
      errLower.includes("registered") ||
      errLower.includes("duplicate")
    ) {
      setFormError("email", {
        type: "manual",
        message: "This email is already registered. Try signing in instead.",
      });
    } else if (
      errLower.includes("email") ||
      errLower.includes("invalid")
    ) {
      setFormError("email", { type: "manual", message: error });
    } else if (errLower.includes("password")) {
      setFormError("password", { type: "manual", message: error });
    } else if (
      errLower.includes("network") ||
      errLower.includes("connect") ||
      errLower.includes("timeout") ||
      errLower.includes("server")
    ) {
      showModal("error", "Connection Error", error);
    } else {
      showModal("error", "Signup Failed", error);
    }

    clearError();
  }, [error]);

  const onSubmit = useCallback(
    (data: SignupFormData) => {
      if (isSubmitting.current) return;

      // The backend requires a near_account_id at signup — this is the same
      // deterministic preview id shown later on the wallet-setup screen, not
      // an actually-created on-chain account (that still happens separately,
      // and optionally, via /wallet-setup).
      const nearAccountId = nearWalletService.getPreviewAccountId(data.email);
      if (!nearAccountId) {
        setFormError("email", {
          type: "manual",
          message: "Couldn't derive a wallet id from this email — try a different one.",
        });
        return;
      }

      isSubmitting.current = true;
      Keyboard.dismiss();
      clearErrors();
      setHasAttemptedSignup(true);
      signup({
        email: data.email,
        password: data.password,
        username: data.email,
        near_account_id: nearAccountId,
      });
    },
    [signup, clearErrors, setFormError]
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
      // Reuse the same success effect email/password signup already has —
      // it fires on isAuthenticated + hasAttemptedSignup, and socialLogin
      // dispatches SET_AUTHENTICATED just like signup() does.
      setHasAttemptedSignup(true);
      const result = await socialLogin({ token: idToken, provider: "google" });
      if (!result?.isNewUser) {
        // Already had an account: no wallet to provision. Keep the previous
        // returning-user destination (create/import/restore) and suppress the
        // new-account effect.
        existingGoogleUser.current = true;
        router.replace("/wallet-setup");
      }
    } catch (err: any) {
      showModal("error", "Google Sign-In Failed", err?.message || "Please try again.");
    } finally {
      setIsGoogleLoading(false);
    }
  }, [isGoogleLoading, signInWithGoogle, socialLogin, clearErrors, showModal]);

  const showLoading = isLoading && hasAttemptedSignup && isSubmitting.current;

  return (
    <ScrollView
      className="flex-1 bg-white"
      contentContainerStyle={{ flexGrow: 1 }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="container max-w-2xl mx-auto" style={{ padding: 20 }}>
        <FeedbackModal
          isVisible={modalConfig.isVisible || showLoading}
          type={showLoading ? "loading" : modalConfig.type}
          title={showLoading ? "Creating Account" : modalConfig.title}
          message={showLoading ? "Setting up your account…" : modalConfig.message}
          onClose={!showLoading ? hideModal : undefined}
          showRetry={modalConfig.type === "error" && (modalConfig.message?.toLowerCase().includes("connect") || modalConfig.message?.toLowerCase().includes("network") || false)}
          retryAction={() => {
            hideModal();
            handleSubmit(onSubmit)();
          }}
        />

        {/* Header */}
        <InterBold className="text-2xl lg:text-4xl mt-16">Sign up</InterBold>

        {/* Form */}
        <View className="mt-8">
          {/* Email */}
          <View className="mb-2">
            <InterRegular className="py-1">Email</InterRegular>
            <Controller
              control={control}
              name="email"
              render={({ field }) => (
                <StyledTextInput
                  placeholder="example@email.com"
                  value={field.value}
                  onChangeText={(text: string) => {
                    field.onChange(text);
                    if (errors.email) clearErrors("email");
                  }}
                  onBlur={field.onBlur}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                />
              )}
            />
            {errors.email && (
              <InterRegular className="text-red-500 text-xs mt-1">
                {errors.email.message}
              </InterRegular>
            )}
          </View>

          {/* Password */}
          <View className="my-4">
            <InterRegular className="py-1">Create a password</InterRegular>
            <Controller
              control={control}
              name="password"
              render={({ field }) => (
                <StyledTextInput
                  isPassword
                  placeholder="must be 8 characters"
                  value={field.value}
                  onChangeText={(text: string) => {
                    field.onChange(text);
                    if (errors.password) clearErrors("password");
                  }}
                  onBlur={field.onBlur}
                  autoComplete="new-password"
                />
              )}
            />
            {errors.password && (
              <InterRegular className="text-red-500 text-xs mt-1">
                {errors.password.message}
              </InterRegular>
            )}
          </View>

          {/* Confirm Password */}
          <View className="my-4">
            <InterRegular className="py-1">Confirm Password</InterRegular>
            <Controller
              control={control}
              name="confirmPassword"
              render={({ field }) => (
                <StyledTextInput
                  isPassword
                  placeholder="repeat password"
                  value={field.value}
                  onChangeText={(text: string) => {
                    field.onChange(text);
                    if (errors.confirmPassword) clearErrors("confirmPassword");
                  }}
                  onBlur={field.onBlur}
                  autoComplete="new-password"
                />
              )}
            />
            {errors.confirmPassword && (
              <InterRegular className="text-red-500 text-xs mt-1">
                {errors.confirmPassword.message}
              </InterRegular>
            )}
          </View>

          {/* Global API error */}
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
              {showLoading ? "Creating account…" : "Sign up"}
            </InterSemiBold>
          </Button>
        </View>

        {/* Socials & Login */}
        <View>
          <View className="py-4">
            <Breaker breakText="Or Register with" />
          </View>
          <Socials
            onGooglePress={handleGoogleSignIn}
            isGoogleLoading={isGoogleLoading}
            statusText="Taking you to Google…"
          />

          <TouchableOpacity 
            onPress={() => router.push("/(auth)/login")}
            className="text-center mt-4 flex-row justify-center"
          >
            <InterRegular className="mr-1">Already have an account?</InterRegular>
            <InterBold className="">Log in</InterBold>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
};

export default Signup;