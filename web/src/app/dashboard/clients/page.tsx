import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Field,
  Heading,
  Input,
  Label,
  Select,
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@aether-zone/kosmos';
import type {
  AdminClientDTO,
  OrganizationDTO,
  Pageable,
} from '@pistis/contract';
import { redirect } from 'next/navigation';

import { callWithSession } from '@/lib/session-api';
import { ActionForm, SubmitButton } from '../action-form';
import {
  createClient,
  deleteClient,
  rebindClient,
  rotateSecret,
} from '../actions';
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

/** Ordered by authority, matching organon's own ordering. */
const ORGANIZATION_ROLES = ['member', 'admin', 'owner'] as const;

/**
 * What the colour picker opens on for a new client.
 *
 * Stated here rather than imported from `@pistis/contract`, which exports the
 * same value as `DEFAULT_CLIENT_PRIMARY_COLOR` — the contract is consumed as
 * TypeScript source whose specifiers this bundler will not resolve at runtime,
 * so the web app can take *types* from it and not values.
 *
 * Safe to restate because it is only the swatch the picker starts on: the
 * canonical default lives on the column and in the request schema, and what
 * gets stored is whatever was submitted.
 */
const PICKER_DEFAULT_COLOR = '#2563eb';

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const notice = (await searchParams).notice;
  const result = await callWithSession<AdminClientDTO[]>('/api/admin/clients');
  /*
   * For the binding picker below. Fetched even when nothing is bound, because
   * the form is rendered on the same pass — and failing this must not take the
   * page down, since listing clients is the reason anybody came here.
   */
  const organizations = await callWithSession<Pageable<OrganizationDTO>>(
    '/api/organizations?perPage=100',
  );
  const organizationList = organizations?.ok ? organizations.data.items : [];

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
                <TableHead>Colour</TableHead>
                <TableHead>Redirect URIs</TableHead>
                <TableHead>Grants</TableHead>
                <TableHead>Scopes</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientList.length === 0 ? (
                <TableRow>
                  <TableEmpty colSpan={9}>
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
                    <TableCell>
                      {/* The value as well as the swatch: a colour nobody can
                          read back is one nobody can match something else to,
                          and two near-identical blues look the same in a 16px
                          square. */}
                      <span className={styles.swatchCell}>
                        <span
                          className={styles.swatch}
                          style={{ backgroundColor: client.primaryColor }}
                        />
                        <span className={styles.mono}>
                          {client.primaryColor}
                        </span>
                      </span>
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
                      {/* Editable in place: a binding names a uuid, so it is
                          the field most likely to need correcting, and
                          re-registering the client to fix one would issue a new
                          secret. Sending only this leaves the rest alone. */}
                      <ActionForm
                        action={rebindClient}
                        className={styles.inlineForm}
                      >
                        <input
                          type="hidden"
                          name="clientId"
                          value={client.clientId}
                        />
                        <Select
                          name="organizationId"
                          size="sm"
                          aria-label={`Organization for ${client.clientId}`}
                          defaultValue={client.organization?.id ?? ''}
                        >
                          <option value="">— none —</option>
                          {organizationList.map((organization) => (
                            <option key={organization.id} value={organization.id}>
                              {organization.name}
                            </option>
                          ))}
                        </Select>
                        <Select
                          name="organizationRole"
                          size="sm"
                          aria-label={`Role for ${client.clientId}`}
                          defaultValue={client.organization?.role ?? 'member'}
                        >
                          {ORGANIZATION_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </Select>
                        <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
                      </ActionForm>
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

        {/* A dialog rather than the disclosure this was: registering a client
            is a form with eight fields and a secret shown once at the end, and
            a page that grows an inline form that long buries the table it
            belongs to. */}
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="primary">Register a client</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Register a client</DialogTitle>
              <DialogDescription>
                The secret is generated here and shown once — it is stored
                hashed and cannot be read back.
              </DialogDescription>
            </DialogHeader>
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
              {/* Not required: a client that only uses client credentials has
                  no browser to send anywhere. The api enforces the real rule,
                  which is that the authorization code grant needs one. */}
              <Input id="redirectUris" name="redirectUris" size="sm" />
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

            <Field>
              <Label htmlFor="primaryColor">Primary colour</Label>
              {/* `type="color"` submits `#rrggbb` lowercased, which is exactly
                  what the schema accepts — so there is no spelling to normalise
                  and no free-text hex to get wrong. */}
              <Input
                id="primaryColor"
                name="primaryColor"
                type="color"
                size="sm"
                defaultValue={PICKER_DEFAULT_COLOR}
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

            <Field>
              <Label htmlFor="organizationId">Organization</Label>
              {/* For a client that acts with no person behind it. Its token
                  otherwise belongs to no tenant, and every organization-scoped
                  route refuses it. Needs the `organizations` scope above. */}
              <Select id="organizationId" name="organizationId" size="sm">
                <option value="">None — acts for whoever signed in</option>
                {organizationList.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field>
              <Label htmlFor="organizationRole">Role in that organization</Label>
              <Select
                id="organizationRole"
                name="organizationRole"
                size="sm"
                defaultValue="member"
              >
                {ORGANIZATION_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </Select>
            </Field>

              <DialogFooter className={styles.span}>
                <SubmitButton variant="primary" pendingLabel="Registering…">
                  Register client
                </SubmitButton>
              </DialogFooter>
            </ActionForm>
          </DialogContent>
        </Dialog>
      </section>
    </>
  );
}
