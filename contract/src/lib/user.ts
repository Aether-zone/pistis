import { z } from 'zod';

const userSchema = z.object({
    id: z.uuid(),
    name: z.string().min(1),
    email: z.email(),
    createdAt: z.date(),
    updatedAt: z.date()
})

// zod's .omit() takes a mask object, not an array of keys. The array form
// throws ("Unrecognized key: 0") the moment the schema is evaluated, and infers
// `never` for every surviving field.
const createUserSchema = userSchema.omit({
    id: true,
    createdAt: true,
    updatedAt: true
});

export type UserDTO = z.infer<typeof userSchema>;
export type CreateUserDTO = z.infer<typeof createUserSchema>;