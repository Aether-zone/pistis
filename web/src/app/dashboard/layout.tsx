import type { UserDTO } from '@pistis/contract';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { callWithSession } from '@/lib/session-api';
import { Nav } from './nav';
import styles from './shell.module.css';
import { SignOut } from './sign-out';

export const dynamic = 'force-dynamic';

const WORKSPACE = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/organizations', label: 'Organizations' },
];

const ADMINISTRATION = [
  { href: '/dashboard/clients', label: 'OAuth clients' },
  { href: '/dashboard/users', label: 'Users' },
  { href: '/dashboard/tokens', label: 'Tokens' },
];

/**
 * The application shell: toolbar across the top, sidebar down the left, and the
 * page in `main`. Authentication is checked once here rather than in each page,
 * so a section only ever renders for someone signed in.
 */
export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const me = await callWithSession<UserDTO & { admin?: boolean }>('/api/auth/me');

  if (me === null) {
    redirect('/login');
  }

  const user = me.ok ? me.data : null;

  return (
    <div className={styles.shell}>
      <header className={styles.toolbar}>
        <h1 className={styles.brand}>
          Pistis <span>· management</span>
        </h1>
        <div className={styles.toolbarRight}>
          {user ? (
            <span className={styles.who}>
              <span className={styles.whoName}>{user.name}</span>
              {user.admin ? <span className={styles.badge}>admin</span> : null}
            </span>
          ) : null}
          <SignOut />
        </div>
      </header>

      <aside className={styles.sidebar}>
        <Nav heading="Workspace" items={WORKSPACE} />
        <Nav heading="Administration" items={ADMINISTRATION} />
      </aside>

      <main className={styles.main}>{children}</main>
    </div>
  );
}
