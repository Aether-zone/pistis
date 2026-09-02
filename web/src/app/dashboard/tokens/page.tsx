import type { AdminTokenDTO } from '@pistis/contract';
import { redirect } from 'next/navigation';

import { callWithSession } from '@/lib/session-api';
import { ActionForm, SubmitButton } from '../action-form';
import { revokeToken } from '../actions';
import styles from '../dashboard.module.css';
import { Notice } from '../notice';

export const metadata = { title: 'Tokens' };
export const dynamic = 'force-dynamic';

function when(value: Date | string): string {
  return new Date(value).toISOString().replace('T', ' ').slice(0, 16);
}

function Yes({ value }: { value: boolean }) {
  return (
    <span className={`${styles.badge} ${value ? styles.yes : styles.no}`}>
      {value ? 'yes' : 'no'}
    </span>
  );
}

export default async function TokensPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const notice = (await searchParams).notice;
  const result = await callWithSession<AdminTokenDTO[]>('/api/admin/tokens');

  if (result === null) {
    redirect('/login');
  }

  if (!result.ok) {
    return <p className={styles.error} role="alert">{result.message}</p>;
  }

  const tokenList = result.data;

  return (
    <>
      <Notice notice={notice} />
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2>Issued tokens</h2>
        <span className={styles.count}>
          {tokenList.filter((token) => token.active).length} active of{' '}
          {tokenList.length}
        </span>
      </div>

      <div className={styles.scroller}>
        {tokenList.length === 0 ? (
          <p className={styles.empty}>Nothing issued yet.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Kind</th>
                <th>Client</th>
                <th>Subject</th>
                <th>Scopes</th>
                <th>Issued</th>
                <th>Expires</th>
                <th>Active</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tokenList.map((token) => (
                <tr key={`${token.kind}-${token.id}`}>
                  <td>{token.kind}</td>
                  <td className={styles.mono}>{token.clientId}</td>
                  <td className={styles.mono}>{token.userId ?? '—'}</td>
                  <td className={styles.mono}>{token.scopes.join(' ')}</td>
                  <td>{when(token.issuedAt)}</td>
                  <td>{when(token.expiresAt)}</td>
                  <td>
                    <Yes value={token.active} />
                  </td>
                  <td>
                    {token.active ? (
                      <ActionForm
                        action={revokeToken}
                        className={styles.inlineForm}
                      >
                        <input type="hidden" name="tokenId" value={token.id} />
                        <input type="hidden" name="kind" value={token.kind} />
                        <SubmitButton variant="danger" pendingLabel="Revoking…">
                          Revoke
                        </SubmitButton>
                      </ActionForm>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
    </>
  );
}
