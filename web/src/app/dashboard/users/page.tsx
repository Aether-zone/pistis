import type { AdminUserDTO } from '@pistis/contract';
import { redirect } from 'next/navigation';

import { callWithSession } from '@/lib/session-api';
import { ActionForm, SubmitButton } from '../action-form';
import { createUser, setPassword } from '../actions';
import styles from '../dashboard.module.css';
import { Notice } from '../notice';

export const metadata = { title: 'Users' };
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
    return <p className={styles.error} role="alert">{result.message}</p>;
  }

  const userList = result.data;

  return (
    <>
      <Notice notice={notice} />
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2>Users</h2>
        <span className={styles.count}>{userList.length}</span>
      </div>

      <div className={styles.scroller}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Admin</th>
              <th>Password set</th>
              <th>Created</th>
              <th>Reset password</th>
            </tr>
          </thead>
          <tbody>
            {userList.map((user) => (
              <tr key={user.id}>
                <td className={styles.mono}>{user.email}</td>
                <td>{user.name}</td>
                <td>
                  <Yes value={user.admin} />
                </td>
                <td>
                  <Yes value={user.hasPassword} />
                </td>
                <td>{when(user.createdAt)}</td>
                <td>
                  <ActionForm
                    action={setPassword}
                    className={styles.inlineForm}
                  >
                    <input type="hidden" name="userId" value={user.id} />
                    <input
                      className={styles.input}
                      name="password"
                      type="password"
                      placeholder="New password"
                      minLength={12}
                      required
                      aria-label={`New password for ${user.email}`}
                    />
                    <SubmitButton pendingLabel="Setting…">Set</SubmitButton>
                  </ActionForm>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details className={styles.details}>
        <summary className={styles.summary}>Create a user</summary>
        <ActionForm action={createUser} className={styles.form}>
          <label className={styles.field} htmlFor="userName">
                <span className={styles.label}>Name</span>
                <input
                  className={styles.input}
                  id="userName"
                  name="name"
                  required
                />
              </label>
              <label className={styles.field} htmlFor="userEmail">
                <span className={styles.label}>Email</span>
                <input
                  className={styles.input}
                  id="userEmail"
                  name="email"
                  type="email"
                  required
                />
              </label>
              <label className={styles.field} htmlFor="userPassword">
                <span className={styles.label}>
                  Password (12 characters or more)
                </span>
                <input
                  className={styles.input}
                  id="userPassword"
                  name="password"
                  type="password"
                  minLength={12}
                  required
                />
              </label>
              <div className={styles.field}>
                <span className={styles.label}>Role</span>
                <label className={styles.check}>
                  <input type="checkbox" name="admin" />
                  <span>Administrator</span>
                </label>
              </div>
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
