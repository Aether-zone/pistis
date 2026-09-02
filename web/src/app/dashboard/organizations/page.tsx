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
      <p className={styles.error} role="alert">
        {result.message}
      </p>
    );
  }

  const organizations = result.data.items;

  return (
    <>
      <Notice notice={notice} />

      <div className={styles.sectionHead}>
        <h2>Organizations</h2>
        <span className={styles.count}>{result.data.totalNumberOfElements}</span>
      </div>

      <div className={styles.scroller}>
        {organizations.length === 0 ? (
          <p className={styles.empty}>
            You do not belong to any organization yet. Creating one makes you
            its owner.
          </p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Slug</th>
                <th>Description</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {organizations.map((organization) => (
                <tr key={organization.id}>
                  <td>
                    <Link href={`/dashboard/organizations/${organization.id}`}>
                      {organization.name}
                    </Link>
                  </td>
                  <td className={styles.mono}>{organization.slug}</td>
                  <td className={styles.wrap}>
                    {organization.description ?? '—'}
                  </td>
                  <td>{when(organization.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <details className={styles.details}>
        <summary className={styles.summary}>Create an organization</summary>
        <ActionForm action={createOrganization} className={styles.form}>
          <label className={styles.field} htmlFor="organizationName">
            <span className={styles.label}>Name</span>
            <input
              className={styles.input}
              id="organizationName"
              name="name"
              required
            />
          </label>
          <label className={styles.field} htmlFor="organizationSlug">
            <span className={styles.label}>
              Slug (lowercase, hyphen separated)
            </span>
            <input
              className={styles.input}
              id="organizationSlug"
              name="slug"
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              required
            />
          </label>
          <label className={styles.field} htmlFor="organizationDescription">
            <span className={styles.label}>Description (optional)</span>
            <input
              className={styles.input}
              id="organizationDescription"
              name="description"
            />
          </label>
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
