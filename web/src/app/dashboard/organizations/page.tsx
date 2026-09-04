import {
  Alert,
  AlertDescription,
  Badge,
  Card,
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
} from '@aether-zone/kosmos';
import type { OrganizationDTO, Pageable } from '@pistis/contract';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { callWithSession } from '@/lib/session-api';
import { ActionForm, SubmitButton } from '../action-form';
import { createOrganization } from '../actions';
import styles from '../dashboard.module.css';
import { Notice } from '../notice';

export const metadata = { title: 'Organizations' };
export const dynamic = 'force-dynamic';

function when(value: Date | string): string {
  return new Date(value).toISOString().replace('T', ' ').slice(0, 16);
}

export default async function OrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const notice = (await searchParams).notice;
  const result = await callWithSession<Pageable<OrganizationDTO>>(
    '/api/organizations?perPage=100',
  );

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

  const organizations = result.data.items;

  return (
    <>
      <Notice notice={notice} />

      <div className={styles.sectionHead}>
        <Heading level={2} size="heading-small">
          Organizations
        </Heading>
        <Badge variant="outline" size="sm">
          {result.data.totalNumberOfElements}
        </Badge>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {organizations.length === 0 ? (
              <TableRow>
                <TableEmpty colSpan={4}>
                  You do not belong to any organization yet. Creating one makes
                  you its owner.
                </TableEmpty>
              </TableRow>
            ) : (
              organizations.map((organization) => (
                <TableRow key={organization.id}>
                  <TableCell>
                    {/* kosmos's Link renders its own anchor with no way to
                        swap the element, so next/link stays and takes the
                        styling from the stylesheet. */}
                    <Link
                      className={styles.link}
                      href={`/dashboard/organizations/${organization.id}`}
                    >
                      {organization.name}
                    </Link>
                  </TableCell>
                  <TableCell className={styles.mono}>
                    {organization.slug}
                  </TableCell>
                  <TableCell className={styles.wrap}>
                    {organization.description ?? '—'}
                  </TableCell>
                  <TableCell>{when(organization.createdAt)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <details className={styles.details}>
        <summary className={styles.summary}>Create an organization</summary>
        <ActionForm action={createOrganization} className={styles.form}>
          <Field>
            <Label htmlFor="organizationName">Name</Label>
            <Input id="organizationName" name="name" size="sm" required />
          </Field>

          <Field>
            <Label htmlFor="organizationSlug">
              Slug (lowercase, hyphen separated)
            </Label>
            <Input
              id="organizationSlug"
              name="slug"
              size="sm"
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              required
            />
          </Field>

          <Field>
            <Label htmlFor="organizationDescription">
              Description (optional)
            </Label>
            <Input
              id="organizationDescription"
              name="description"
              size="sm"
            />
          </Field>

          <div className={styles.span}>
            <SubmitButton variant="primary" pendingLabel="Creating…">
              Create organization
            </SubmitButton>
          </div>
        </ActionForm>
      </details>
    </>
  );
}
