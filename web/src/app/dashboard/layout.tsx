import {
  AppBar,
  AppBarSection,
  AppBarTitle,
  Badge,
  Sidenav,
  SidenavContent,
  Text,
} from '@aether-zone/kosmos';
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
 *
 * The grid is still local — kosmos supplies the bar and the sidebar, not the
 * page skeleton that arranges them.
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
      <AppBar size="sm" className={styles.toolbar}>
        <AppBarTitle>
          Pistis <span className={styles.brandSuffix}>· management</span>
        </AppBarTitle>

        <AppBarSection className={styles.toolbarRight}>
          {user ? (
            <Text size="body-small" tone="muted">
              <strong className={styles.whoName}>{user.name}</strong>
              {user.admin ? (
                <Badge variant="success" size="sm" className={styles.whoBadge}>
                  admin
                </Badge>
              ) : null}
            </Text>
          ) : null}
          <SignOut />
        </AppBarSection>
      </AppBar>

      <Sidenav className={styles.sidebar} aria-label="Sections">
        <SidenavContent className={styles.sidebarContent}>
          <Nav heading="Workspace" items={WORKSPACE} />
          <Nav heading="Administration" items={ADMINISTRATION} />
        </SidenavContent>
      </Sidenav>

      <main className={styles.main}>{children}</main>
    </div>
  );
}
