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
import type { AdminClientDTO } from '@pistis/contract';
import { redirect } from 'next/navigation';

import { callWithSession } from '@/lib/session-api';
import { ActionForm, SubmitButton } from '../action-form';
import { createClient, deleteClient, rotateSecret } from '../actions';
import styles from '../dashboard.module.css';
import { Notice } from '../notice';
import { Yes } from '../yes';

export const metadata = { title: 'OAuth clients' };
export const dynamic = 'force-dynamic';

const GRANT_TYPES = [
  'authorization_code',
  'refresh_token',
  'client_credentials',
] as const;

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const notice = (await searchParams).notice;
  const result = await callWithSession<AdminClientDTO[]>('/api/admin/clients');

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

  const clientList = result.data;

  return (
    <>
      <Notice notice={notice} />

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <Heading level={2} size="heading-small">
            OAuth clients
          </Heading>
          <Badge variant="outline" size="sm">
            {clientList.length}
          </Badge>
        </div>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>client_id</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Confidential</TableHead>
                <TableHead>Redirect URIs</TableHead>
                <TableHead>Grants</TableHead>
                <TableHead>Scopes</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientList.length === 0 ? (
                <TableRow>
                  <TableEmpty colSpan={7}>
                    No clients yet. Register one below — the authorization flow
                    needs one before it can start.
                  </TableEmpty>
                </TableRow>
              ) : (
                clientList.map((client) => (
                  <TableRow key={client.id}>
                    <TableCell className={styles.mono}>
                      {client.clientId}
                    </TableCell>
                    <TableCell>{client.name}</TableCell>
                    <TableCell>
                      <Yes value={client.confidential} />
                    </TableCell>
                    <TableCell className={`${styles.mono} ${styles.wrap}`}>
                      {client.redirectUris.join(' ')}
                    </TableCell>
                    <TableCell className={styles.mono}>
                      {client.grantTypes.join(' ')}
                    </TableCell>
                    <TableCell className={styles.mono}>
                      {client.scopes.join(' ')}
                    </TableCell>
                    <TableCell>
                      <div className={styles.rowActions}>
                        {client.confidential ? (
                          <ActionForm
                            action={rotateSecret}
                            className={styles.inlineForm}
                          >
                            <input
                              type="hidden"
                              name="clientId"
                              value={client.clientId}
                            />
                            <SubmitButton pendingLabel="Rotating…">
                              Rotate secret
                            </SubmitButton>
                          </ActionForm>
                        ) : null}
                        <ActionForm
                          action={deleteClient}
                          className={styles.inlineForm}
                        >
                          <input
                            type="hidden"
                            name="clientId"
                            value={client.clientId}
                          />
                          <SubmitButton
                            variant="danger"
                            pendingLabel="Deleting…"
                          >
                            Delete
                          </SubmitButton>
                        </ActionForm>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>

        <details className={styles.details}>
          <summary className={styles.summary}>Register a client</summary>
          <ActionForm action={createClient} className={styles.form}>
            <Field>
              <Label htmlFor="clientId">client_id</Label>
              <Input id="clientId" name="clientId" size="sm" required />
            </Field>

            <Field>
              <Label htmlFor="clientName">Name</Label>
              <Input id="clientName" name="name" size="sm" required />
            </Field>

            <Field>
              <Label htmlFor="redirectUris">
                Redirect URIs (space separated)
              </Label>
              <Input id="redirectUris" name="redirectUris" size="sm" required />
            </Field>

            <Field>
              <Label htmlFor="scopes">Scopes (space separated)</Label>
              <Input
                id="scopes"
                name="scopes"
                size="sm"
                defaultValue="profile email"
                required
              />
            </Field>

            <Field className={styles.span}>
              {/* A group caption, not a label: it has no single control to
                  point at, so it must not be a <label>. */}
              <Text size="label" weight="semibold">
                Grant types
              </Text>
              <div className={styles.checks}>
                {GRANT_TYPES.map((grant) => (
                  <Label className={styles.check} key={grant}>
                    <Checkbox
                      name="grantTypes"
                      value={grant}
                      defaultChecked={grant !== 'client_credentials'}
                    />
                    <span className={styles.mono}>{grant}</span>
                  </Label>
                ))}
                <Label className={styles.check}>
                  <Checkbox name="confidential" defaultChecked />
                  <Text as="span" size="body-small">
                    Confidential (issue a secret; public clients must use PKCE)
                  </Text>
                </Label>
              </div>
            </Field>

            <div className={styles.span}>
              <SubmitButton variant="primary" pendingLabel="Registering…">
                Register client
              </SubmitButton>
            </div>
          </ActionForm>
        </details>
      </section>
    </>
  );
}
