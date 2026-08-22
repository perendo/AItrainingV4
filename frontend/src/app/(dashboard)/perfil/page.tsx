"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, ShieldCheck, UserCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ThemeToggle } from "@/components/theme-toggle";
import { getCurrentUser, updateUserProfile, ApiError } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { UserResponse, UserUpdate } from "@/lib/types";
import {
  profileSchema,
  type ProfileFormData,
} from "@/lib/validations/profile";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-ES", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function PerfilPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      full_name: "",
      chess_online_nick: "",
      current_elo: 1500,
      target_elo: 2000,
      newPassword: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    getCurrentUser()
      .then((u) => {
        setUser(u);
        form.reset({
          full_name: u.full_name,
          chess_online_nick: u.chess_online_nick ?? "",
          current_elo: u.current_elo,
          target_elo: u.target_elo,
          newPassword: "",
          confirmPassword: "",
        });
      })
      .catch((error: unknown) => {
        setLoadError(
          error instanceof ApiError
            ? error.message
            : "No se pudo cargar tu perfil. Inténtalo de nuevo.",
        );
      })
      .finally(() => setLoading(false));
  }, [form, router]);

  const { isSubmitting } = form.formState;

  async function onSubmit(data: ProfileFormData) {
    setServerError(null);
    setSaved(false);

    const payload: UserUpdate = {
      full_name: data.full_name,
      chess_online_nick: data.chess_online_nick || undefined,
      current_elo: data.current_elo,
      target_elo: data.target_elo,
    };
    if (data.newPassword) {
      payload.password = data.newPassword;
    }

    try {
      const updated = await updateUserProfile(payload);
      setUser(updated);
      setSaved(true);
      form.reset({
        full_name: updated.full_name,
        chess_online_nick: updated.chess_online_nick ?? "",
        current_elo: updated.current_elo,
        target_elo: updated.target_elo,
        newPassword: "",
        confirmPassword: "",
      });
    } catch (error) {
      if (error instanceof ApiError) {
        setServerError(error.message);
      } else {
        setServerError("Error de conexión. Inténtalo de nuevo.");
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Mi perfil</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Revisa y edita tus datos, ELO y contraseña.
          </p>
        </div>
        <ThemeToggle />
      </div>

      {loadError && (
        <Alert variant="destructive">
          <AlertTitle>Error al cargar el perfil</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : user ? (
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-6"
            noValidate
          >
            {serverError && (
              <Alert variant="destructive">
                <AlertTitle>No se pudieron guardar los cambios</AlertTitle>
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            )}

            {saved && (
              <Alert>
                <ShieldCheck className="size-4" />
                <AlertTitle>Cambios guardados</AlertTitle>
                <AlertDescription>
                  Tu perfil se actualizó correctamente.
                </AlertDescription>
              </Alert>
            )}

            <Card>
              <CardHeader className="flex flex-row items-center gap-4">
                <UserCircle className="size-6 text-muted-foreground" />
                <div>
                  <CardTitle>Datos del perfil</CardTitle>
                  <CardDescription>
                    Miembro desde {formatDate(user.created_at)} · Usuario:{" "}
                    <span className="font-medium">{user.username}</span>
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
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

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                            onChange={(e) =>
                              field.onChange(Number(e.target.value))
                            }
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
                            onChange={(e) =>
                              field.onChange(Number(e.target.value))
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center gap-4">
                <ShieldCheck className="size-6 text-muted-foreground" />
                <div>
                  <CardTitle>Contraseña</CardTitle>
                  <CardDescription>
                    Déjala en blanco si no quieres cambiarla.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nueva contraseña</FormLabel>
                      <FormControl>
                        <PasswordInput
                          placeholder="Mínimo 6 caracteres"
                          autoComplete="new-password"
                          disabled={isSubmitting}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Usa el icono del ojo para mostrarla u ocultarla.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirmar nueva contraseña</FormLabel>
                      <FormControl>
                        <PasswordInput
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
              </CardContent>
              <CardFooter className="justify-end">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    "Guardar cambios"
                  )}
                </Button>
              </CardFooter>
            </Card>
          </form>
        </Form>
      ) : null}
    </div>
  );
}
