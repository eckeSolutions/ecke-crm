import { zodResolver } from "@hookform/resolvers/zod";
import {
  EckeCard,
  EckeField,
  EckeInput,
  EckeWordmark,
} from "@ds/stencil/react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Navigate, useLocation } from "react-router-dom";
import { z } from "zod";

import { supabase } from "@/lib/supabase";
import { Form, SubmitButton } from "@/shell/Form";

import { useAuth } from "./AuthProvider";
import "./LoginPage.css";

const loginSchema = z.object({
  email: z
    .string()
    .min(1, "E-Mail wird benötigt")
    .email("Ungültige E-Mail-Adresse"),
  password: z.string().min(1, "Passwort wird benötigt"),
});

type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const { session } = useAuth();
  const location = useLocation();
  const [authError, setAuthError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  // Already signed in — bounce straight past the login screen, honoring the
  // deep link RequireAuth stashed in location.state.
  if (session) {
    const from = (location.state as { from?: Location } | null)?.from;
    return <Navigate to={from?.pathname ?? "/"} replace />;
  }

  const onSubmit = async (values: LoginForm) => {
    setAuthError(null);
    const { error } = await supabase.auth.signInWithPassword(values);
    if (error) setAuthError(error.message);
  };

  return (
    <main className="login-page">
      <EckeCard surface="solid" className="login-page__card">
        {/* A light-DOM wrapper, not layout on the card itself: ecke-card is
            `shadow: true` and slots its children into a .card div in its own
            shadow tree, so flex/gap set on the host governs nothing — the
            slotted children are laid out in the shadow formatting context.
            One wrapper element restores vertical rhythm between the wordmark
            and the form. */}
        <div className="login-page__stack">
          <EckeWordmark />
          <Form onSubmit={handleSubmit(onSubmit)}>
            <Controller
              control={control}
              name="email"
              render={({ field }) => (
                <EckeField label="E-Mail" error={errors.email?.message}>
                  <EckeInput
                    type="email"
                    value={field.value}
                    invalid={!!errors.email}
                    onEckeInput={(e) => field.onChange(e.detail)}
                    onEckeChange={field.onBlur}
                  />
                </EckeField>
              )}
            />
            <Controller
              control={control}
              name="password"
              render={({ field }) => (
                <EckeField label="Passwort" error={errors.password?.message}>
                  <EckeInput
                    type="password"
                    value={field.value}
                    invalid={!!errors.password}
                    onEckeInput={(e) => field.onChange(e.detail)}
                    onEckeChange={field.onBlur}
                  />
                </EckeField>
              )}
            />
            {authError && (
              <p role="alert" className="login-page__error">
                {authError}
              </p>
            )}
            <SubmitButton disabled={isSubmitting} emphasis="primary">
              {isSubmitting ? "Anmelden…" : "Anmelden"}
            </SubmitButton>
          </Form>
        </div>
      </EckeCard>
    </main>
  );
}
