import { z } from "zod/v4";

export const loginSchema = z.object({
  username: z
    .string()
    .min(3, "El nombre de usuario debe tener al menos 3 caracteres")
    .max(50, "El nombre de usuario no puede exceder 50 caracteres"),
  password: z
    .string()
    .min(6, "La contraseña debe tener al menos 6 caracteres"),
});

export const registerSchema = z
  .object({
    username: z
      .string()
      .min(3, "El nombre de usuario debe tener al menos 3 caracteres")
      .max(50, "El nombre de usuario no puede exceder 50 caracteres"),
    full_name: z
      .string()
      .min(3, "El nombre debe tener al menos 3 caracteres")
      .max(150, "El nombre no puede exceder 150 caracteres"),
    chess_online_nick: z
      .string()
      .max(100, "El nick no puede exceder 100 caracteres")
      .optional()
      .or(z.literal("")),
    current_elo: z
      .number({ error: "Introduce un número válido" })
      .min(100, "El ELO mínimo es 100")
      .max(3000, "El ELO máximo es 3000"),
    target_elo: z
      .number({ error: "Introduce un número válido" })
      .min(100, "El ELO objetivo mínimo es 100")
      .max(3000, "El ELO objetivo máximo es 3000"),
    password: z
      .string()
      .min(6, "La contraseña debe tener al menos 6 caracteres"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

export type LoginFormData = z.infer<typeof loginSchema>;
export type RegisterFormData = z.infer<typeof registerSchema>;
