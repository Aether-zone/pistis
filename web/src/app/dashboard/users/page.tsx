import {
  Alert,
  AlertDescription,
  Badge,
  Card,
  Checkbox,
  Field,
  Heading,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@aether-zone/kosmos';
import type { AdminUserDTO } from '@pistis/contract';
import { redirect } from 'next/navigation';

import { callWithSession } from '@/lib/session-api';
import { ActionForm, SubmitButton } from '../action-form';
import { createUser, setPassword } from '../actions';
import styles from '../dashboard.module.css';
import { Notice } from '../notice';
import { Yes } from '../yes';

export const metadata = { title: 'Users' };
export const dynamic = 'force-dynamic';

function when(value: Date | string): string {
  return new Date(value).toISOString().replace('T', ' ').slice(0, 16);
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const notice = (await searchParams).notice;
  const result = await callWithSession<AdminUserDTO[]>('/api/admin/users');

  if (result === null) {
    redirect('/login');
  }

  if (!result.ok) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{result.message}</AlertDescription>
      </Alert>
    );
  }

  const userList = result.data;

  return (
    <>
      <Notice notice={notice} />

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <Heading level={2} size="heading-small">
            Users
          </Heading>
          <Badge variant="outline" size="sm">
            {userList.length}
          </Badge>
        </div>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Admin</TableHead>
                <TableHead>Password set</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Reset password</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {userList.length === 0 ? (
                <TableRow>
                  <TableEmpty colSpan={6}>No users yet.</TableEmpty>
                </TableRow>
              ) : (
                userList.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className={styles.mono}>{user.email}</TableCell>
                    <TableCell>{user.name}</TableCell>
                    <TableCell>
                      <Yes value={user.admin} />
                    </TableCell>
                    <TableCell>
                      <Yes value={user.hasPassword} />
                    </TableCell>
                    <TableCell>{when(user.createdAt)}</TableCell>
                    <TableCell>
                      <ActionForm
                        action={setPassword}
                        className={styles.inlineForm}
                      >
                        <input type="hidden" name="userId" value={user.id} />
                        <Input
                          name="password"
                          type="password"
                          size="sm"
                          placeholder="New password"
                          minLength={12}
                          required
                          aria-label={`New password for ${user.email}`}
                        />
                        <SubmitButton pendingLabel="Setting…">Set</SubmitButton>
                      </ActionForm>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>

        <details className={styles.details}>
          <summary className={styles.summary}>Create a user</summary>
          <ActionForm action={createUser} className={styles.form}>
            <Field>
              <Label htmlFor="userName">Name</Label>
              <Input id="userName" name="name" size="sm" required />
            </Field>

            <Field>
              <Label htmlFor="userEmail">Email</Label>
              <Input
                id="userEmail"
                name="email"
                type="email"
                size="sm"
                required
              />
            </Field>

            <Field>
              <Label htmlFor="userPassword">
                Password (12 characters or more)
              </Label>
              <Input
                id="userPassword"
                name="password"
                type="password"
                size="sm"
                minLength={12}
                required
              />
            </Field>

            <Field>
              <Text size="label" weight="semibold">
                Role
              </Text>
              <Label className={styles.check}>
                <Checkbox name="admin" />
                <Text as="span" size="body-small">
                  Administrator
                </Text>
              </Label>
            </Field>

            <div className={styles.span}>
              <SubmitButton variant="primary" pendingLabel="Creating…">
                Create user
              </SubmitButton>
            </div>
          </ActionForm>
        </details>
      </section>
    </>
  );
}
