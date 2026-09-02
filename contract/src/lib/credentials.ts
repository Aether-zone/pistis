import { z } from 'zod';

const credentialsSchema = z.object({
    username: z.string(),
    password: z.string()
})


export type CredentialsDTO = z.infer<typeof credentialsSchema>;
