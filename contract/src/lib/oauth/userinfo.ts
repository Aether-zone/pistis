import { z } from 'zod';

export const userInfoSchema = z.object({
    sub: z.uuid(),
    name: z.string(),
    email: z.email(),
    updated_at: z.number(),
});

export type UserInfoDTO = z.infer<typeof userInfoSchema>;
