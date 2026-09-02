import { z } from 'zod';

export const adminUserSchema = z.object({
    id: z.uuid(),
    name: z.string(),
    email: z.email(),
    admin: z.boolean(),
    hasPassword: z.boolean(),
    createdAt: z.date(),
    updatedAt: z.date()
});

export const createAdminUserSchema = z.object({
    name: z.string().min(1),
    email: z.email(),
    password: z.string().min(12),
    admin: z.boolean()
});

export const setPasswordSchema = z.object({
    password: z.string().min(12)
});

export type AdminUserDTO = z.infer<typeof adminUserSchema>;
export type CreateAdminUserDTO = z.infer<typeof createAdminUserSchema>;
export type SetPasswordDTO = z.infer<typeof setPasswordSchema>;
