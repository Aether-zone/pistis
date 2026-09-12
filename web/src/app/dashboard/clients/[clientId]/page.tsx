import {
  Alert,
  AlertDescription,
  Badge,
  BreadcrumbItem,
  Breadcrumbs,
  Card,
  CardContent,
  Checkbox,
  Field,
  Heading,
  Input,
  Label,
  Select,
  Text,
} from '@aether-zone/kosmos';
import type {
  AdminClientDTO,
  MembershipRole,
  OrganizationDTO,
  Pageable,
} from '@pistis/contract';
import { notFound, redirect } from 'next/navigation';

import { callWithSession } from '@/lib/session-api';
import { ActionForm, SubmitButton } from '../../action-form';
import { deleteClient, editClient, rotateSecret } from '../../actions';
import styles from '../../dashboard.module.css';
import { Notice } from '../../notice';

export const dynamic = 'force-dynamic';

const GRANT_TYPES = [
  'authorization_code',
  'refresh_token',
  'client_credentials',
] as const;

/** Ordered by authority, matching organon's own ordering. */
const ORGANIZATION_ROLES: MembershipRole[] = ['member', 'admin', 'owner'];

function when(value: Date | string): string {
  return new Date(value).toISOString().replace('T', ' ').slice(0, 16);
}

/**
 * One client: what it is, and everything about it an admin may change.
 *
 * The table this is reached from lists clients; editing happens here. Keeping
 * both would mean two surfaces for the same fields, and the table had no room
 * to offer scopes or grant types without becoming a form pretending to be a
 * list.
 *
 * What is *not* editable is on the facts list rather than in the form: the
 * client id is the client's identity — its own configuration names it — and the
 * secret can only be replaced, never read back.
 */
export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { clientId } = await params;
  const notice = (await searchParams).notice;

  const [client, organizations] = await Promise.all([
    callWithSession<AdminClientDTO>(
      `/api/admin/clients/${encodeURIComponent(clientId)}`,
    ),
    /*
     * For the binding picker. A failure here is not fatal — the page is worth
     * showing without it, and the select degrades to whatever is already set.
     */
    callWithSession<Pageable<OrganizationDTO>>(
      '/api/organizations?perPage=100',
    ),
  ]);

  if (client === null) {
    redirect('/login');
  }

  if (!client.ok) {
    if (client.status === 404) {
      notFound();
    }

    return (
      <Alert variant="destructive">
        <AlertDescription>{client.message}</AlertDescription>
      </Alert>
    );
  }

  const it: AdminClientDTO = client.data;
  const organizationList: OrganizationDTO[] = organizations?.ok
    ? organizations.data.items
    : [];

  const facts = [
    { term: 'client_id', value: it.clientId, mono: true },
    {
      term: 'Authentication',
      value: it.confidential
        ? 'Confidential — authenticates with a secret'
        : 'Public — must use PKCE',
    },
    { term: 'Created', value: when(it.createdAt) },
    { term: 'Last changed', value: when(it.updatedAt) },
  ];

  return (
    <div className={styles.page}>
      <Notice notice={notice} />

      <header className={styles.pageHead}>
        <Breadcrumbs className={styles.crumb}>
          <BreadcrumbItem href="/dashboard/clients">
            OAuth clients
          </BreadcrumbItem>
          <BreadcrumbItem current>{it.name}</BreadcrumbItem>
        </Breadcrumbs>

        <div className={styles.sectionHead}>
          <Heading level={2} size="heading-small">
            {it.name}
          </Heading>
          {/* The colour it will dress its own sign-in page in. */}
          <span className={styles.swatchCell}>
            <span
              className={styles.swatch}
              style={{ backgroundColor: it.primaryColor }}
            />
            <span className={styles.mono}>{it.primaryColor}</span>
          </span>
          {it.organization ? (
            <Badge variant="outline" size="sm">
              {organizationList.find(
                (organization) => organization.id === it.organization?.id,
              )?.name ?? it.organization.id}
              {' · '}
              {it.organization.role}
            </Badge>
          ) : null}
        </div>
      </header>

      <Card>
        <CardContent>
          <dl className={styles.facts}>
            {facts.map((fact) => (
              <div key={fact.term}>
                <dt>
                  <Text as="span" size="label" tone="muted">
                    {fact.term}
                  </Text>
                </dt>
                <dd className={fact.mono ? styles.mono : undefined}>
                  {fact.value}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <section className={styles.section}>
        <Heading level={3} size="heading-small">
          Settings
        </Heading>

        <Card>
          <CardContent>
            <ActionForm action={editClient} className={styles.form}>
              <input type="hidden" name="clientId" value={it.clientId} />

              <Field>
                <Label htmlFor="name">Name</Label>
                {/* Shown to whoever is asked to approve this client, so it is
                    the one field a person outside this dashboard ever reads. */}
                <Input
                  id="name"
                  name="name"
                  size="sm"
                  defaultValue={it.name}
                  required
                />
              </Field>

              <Field>
                <Label htmlFor="primaryColor">Primary colour</Label>
                <Input
                  id="primaryColor"
                  name="primaryColor"
                  type="color"
                  size="sm"
                  defaultValue={it.primaryColor}
                />
              </Field>

              <Field className={styles.span}>
                <Label htmlFor="redirectUris">
                  Redirect URIs (space separated)
                </Label>
                {/* Required by the api only for the authorization code grant —
                    a client that only uses client credentials has no browser
                    to send anywhere. */}
                <Input
                  id="redirectUris"
                  name="redirectUris"
                  size="sm"
                  defaultValue={it.redirectUris.join(' ')}
                />
              </Field>

              <Field className={styles.span}>
                <Label htmlFor="scopes">Scopes (space separated)</Label>
                <Input
                  id="scopes"
                  name="scopes"
                  size="sm"
                  defaultValue={it.scopes.join(' ')}
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
                        defaultChecked={it.grantTypes.includes(grant)}
                      />
                      <span className={styles.mono}>{grant}</span>
                    </Label>
                  ))}
                </div>
              </Field>

              <Field>
                <Label htmlFor="organizationId">Organization</Label>
                {/* Without one, a client credentials token belongs to no
                    tenant and every organization-scoped route refuses it.
                    Needs the `organizations` scope above, or the api refuses
                    the change. */}
                <Select
                  id="organizationId"
                  name="organizationId"
                  size="sm"
                  defaultValue={it.organization?.id ?? ''}
                >
                  <option value="">None — acts for whoever signed in</option>
                  {organizationList.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field>
                <Label htmlFor="organizationRole">
                  Role in that organization
                </Label>
                <Select
                  id="organizationRole"
                  name="organizationRole"
                  size="sm"
                  defaultValue={it.organization?.role ?? 'member'}
                >
                  {ORGANIZATION_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </Select>
              </Field>

              <div className={styles.span}>
                <SubmitButton variant="primary" pendingLabel="Saving…">
                  Save changes
                </SubmitButton>
              </div>
            </ActionForm>
          </CardContent>
        </Card>
      </section>

      <section className={styles.section}>
        <Heading level={3} size="heading-small">
          Credentials
        </Heading>

        <Card>
          <CardContent className={styles.rowActions}>
            {it.confidential ? (
              <ActionForm action={rotateSecret} className={styles.inlineForm}>
                <input type="hidden" name="clientId" value={it.clientId} />
                <SubmitButton pendingLabel="Rotating…">
                  Rotate secret
                </SubmitButton>
              </ActionForm>
            ) : (
              <Text as="p" size="body-small" tone="muted">
                A public client has no secret to rotate; it proves itself with
                PKCE instead.
              </Text>
            )}

            <ActionForm action={deleteClient} className={styles.inlineForm}>
              <input type="hidden" name="clientId" value={it.clientId} />
              {/* Redirects to the list, since the page it was opened from is
                  the record being removed. */}
              <SubmitButton variant="danger" pendingLabel="Deleting…">
                Delete client
              </SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
