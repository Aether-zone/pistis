import type { AdminClientDTO } from '@pistis/contract';
import { redirect } from 'next/navigation';

import { callWithSession } from '@/lib/session-api';
import { ActionForm, SubmitButton } from '../action-form';
import { createClient, deleteClient, rotateSecret } from '../actions';
import styles from '../dashboard.module.css';
import { Notice } from '../notice';

export const metadata = { title: 'OAuth clients' };
export const dynamic = 'force-dynamic';

const GRANT_TYPES = [
  'authorization_code',
  'refresh_token',
  'client_credentials',
] as const;

function Yes({ value }: { value: boolean }) {
  return (
    <span className={`${styles.badge} ${value ? styles.yes : styles.no}`}>
      {value ? 'yes' : 'no'}
    </span>
  );
}

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
    return <p className={styles.error} role="alert">{result.message}</p>;
  }

  const clientList = result.data;

  return (
    <>
      <Notice notice={notice} />
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2>OAuth clients</h2>
        <span className={styles.count}>{clientList.length}</span>
      </div>

      <div className={styles.scroller}>
        {clientList.length === 0 ? (
          <p className={styles.empty}>
            No clients yet. Register one below — the authorization flow needs
            one before it can start.
          </p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>client_id</th>
                <th>Name</th>
                <th>Confidential</th>
                <th>Redirect URIs</th>
                <th>Grants</th>
                <th>Scopes</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {clientList.map((client) => (
                <tr key={client.id}>
                  <td className={styles.mono}>{client.clientId}</td>
                  <td>{client.name}</td>
                  <td>
                    <Yes value={client.confidential} />
                  </td>
                  <td className={`${styles.mono} ${styles.wrap}`}>
                    {client.redirectUris.join(' ')}
                  </td>
                  <td className={styles.mono}>
                    {client.grantTypes.join(' ')}
                  </td>
                  <td className={styles.mono}>{client.scopes.join(' ')}</td>
                  <td>
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
                    ) : null}{' '}
                    <ActionForm
                      action={deleteClient}
                      className={styles.inlineForm}
                    >
                      <input
                        type="hidden"
                        name="clientId"
                        value={client.clientId}
                      />
                      <SubmitButton variant="danger" pendingLabel="Deleting…">
                        Delete
                      </SubmitButton>
                    </ActionForm>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <details className={styles.details}>
        <summary className={styles.summary}>Register a client</summary>
        <ActionForm action={createClient} className={styles.form}>
          <label className={styles.field} htmlFor="clientId">
                <span className={styles.label}>client_id</span>
                <input
                  className={styles.input}
                  id="clientId"
                  name="clientId"
                  required
                />
              </label>
              <label className={styles.field} htmlFor="clientName">
                <span className={styles.label}>Name</span>
                <input
                  className={styles.input}
                  id="clientName"
                  name="name"
                  required
                />
              </label>
              <label className={styles.field} htmlFor="redirectUris">
                <span className={styles.label}>
                  Redirect URIs (space separated)
                </span>
                <input
                  className={styles.input}
                  id="redirectUris"
                  name="redirectUris"
                  required
                />
              </label>
              <label className={styles.field} htmlFor="scopes">
                <span className={styles.label}>Scopes (space separated)</span>
                <input
                  className={styles.input}
                  id="scopes"
                  name="scopes"
                  defaultValue="profile email"
                  required
                />
              </label>
              <div className={`${styles.field} ${styles.span}`}>
                <span className={styles.label}>Grant types</span>
                <div className={styles.checks}>
                  {GRANT_TYPES.map((grant) => (
                    <label className={styles.check} key={grant}>
                      <input
                        type="checkbox"
                        name="grantTypes"
                        value={grant}
                        defaultChecked={grant !== 'client_credentials'}
                      />
                      <span className={styles.mono}>{grant}</span>
                    </label>
                  ))}
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      name="confidential"
                      defaultChecked
                    />
                    <span>
                      Confidential (issue a secret; public clients must use
                      PKCE)
                    </span>
                  </label>
                </div>
              </div>
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
