"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  registerSchema,
  type RegisterFormData,
} from "@/lib/validations/auth";
import { apiFetch, ApiError } from "@/lib/api";
import { setToken } from "@/lib/auth";
import { CONTACT_EMAIL } from "@/lib/legal";
import type { TokenResponse } from "@/lib/types";

export default function RegisterPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: "",
      full_name: "",
      chess_online_nick: "",
      current_elo: 1500,
      target_elo: 2000,
      password: "",
      confirmPassword: "",
      acceptedTerms: false,
    },
  });

  const { isSubmitting } = form.formState;

  async function onSubmit(data: RegisterFormData) {
    setServerError(null);
    try {
      const response = await apiFetch<TokenResponse>("/api/v1/users/register", {
        method: "POST",
        body: {
          username: data.username,
          full_name: data.full_name,
          chess_online_nick: data.chess_online_nick || undefined,
          current_elo: data.current_elo,
          target_elo: data.target_elo,
          password: data.password,
          accepted_terms: data.acceptedTerms,
        },
      });
      setToken(response.access_token);
      router.push("/partidas");
    } catch (error) {
      if (error instanceof ApiError) {
        setServerError(error.message);
      } else {
        setServerError("Error de conexión. Inténtalo de nuevo.");
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Crear cuenta</CardTitle>
        <CardDescription>
          Regístrate para empezar a mejorar tu ajedrez
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            {serverError && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm font-medium text-destructive">
                {serverError}
              </div>
            )}

            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Usuario</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Elige un nombre de usuario"
                      autoComplete="username"
                      disabled={isSubmitting}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="full_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre completo</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Tu nombre y apellidos"
                      autoComplete="name"
                      disabled={isSubmitting}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="chess_online_nick"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nick online (opcional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Chess.com o Lichess"
                      disabled={isSubmitting}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="current_elo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ELO actual</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={100}
                        max={3000}
                        disabled={isSubmitting}
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="target_elo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ELO objetivo</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={100}
                        max={3000}
                        disabled={isSubmitting}
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contraseña</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="Mínimo 6 caracteres"
                      autoComplete="new-password"
                      disabled={isSubmitting}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirmar contraseña</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="Repite tu contraseña"
                      autoComplete="new-password"
                      disabled={isSubmitting}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="acceptedTerms"
              render={({ field }) => (
                <FormItem>
                  <div className="flex flex-row items-start space-x-3 space-y-0 rounded-lg border p-3">
                    <FormControl>
                      <input
                        type="checkbox"
                        checked={field.value}
                        onChange={(e) => field.onChange(e.target.checked)}
                        onBlur={field.onBlur}
                        name={field.name}
                        disabled={isSubmitting}
                        className="mt-0.5 size-4 shrink-0 cursor-pointer accent-primary"
                        aria-label="Aceptar términos y privacidad"
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel className="font-normal leading-snug">
                        Declaro que soy mayor de 14 años y he leído y acepto
                        los{" "}
                        <a
                          href="/legal"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-primary underline underline-offset-2"
                        >
                          Términos y Condiciones
                        </a>{" "}
                        y la{" "}
                        <a
                          href="/privacidad"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-primary underline underline-offset-2"
                        >
                          Política de Privacidad
                        </a>
                        , incluido el tratamiento de mis partidas por la IA del
                        servicio.
                      </FormLabel>
                      <FormMessage />
                    </div>
                  </div>
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Creando cuenta...
                </>
              ) : (
                "Crear cuenta"
              )}
            </Button>
            <div className="flex w-full items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">o</span>
              <Separator className="flex-1" />
            </div>
            <p className="text-center text-sm text-muted-foreground">
              ¿Ya tienes cuenta?{" "}
              <Link
                href="/login"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Inicia sesión
              </Link>
            </p>
            <p className="text-center text-xs text-muted-foreground">
              <a href="/legal" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
                Aviso legal
              </a>
              {" · "}
              <a href="/privacidad" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
                Privacidad
              </a>
              {" · "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-2 hover:text-foreground">
                {CONTACT_EMAIL}
              </a>
            </p>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
