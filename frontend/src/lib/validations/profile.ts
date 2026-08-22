import { z } from "zod/v4";

export const profileSchema = z
  .object({
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
    newPassword: z
      .string()
      .refine((v) => v === "" || v.length >= 6, {
        message: "La contraseña debe tener al menos 6 caracteres",
      }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

export type ProfileFormData = z.infer<typeof profileSchema>;
