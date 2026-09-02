import type {
  AdminClientDTO,
  AdminTokenDTO,
  AdminUserDTO,
  OrganizationDTO,
  Pageable,
} from '@pistis/contract';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { callWithSession } from '@/lib/session-api';
import styles from './dashboard.module.css';
import { Notice } from './notice';

export const metadata = { title: 'Overview' };
export const dynamic = 'force-dynamic';

interface Tile {
  href: string;
  label: string;
  value: string;
  hint?: string;
}

/**
 * Counts across the sections the sidebar links to. Each figure is a link, so
 * the overview is a way in rather than a dead end.
 */
export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const notice = (await searchParams).notice;

  const [clients, users, tokens, organizations] = await Promise.all([
    callWithSession<AdminClientDTO[]>('/api/admin/clients'),
    callWithSession<AdminUserDTO[]>('/api/admin/users'),
    callWithSession<AdminTokenDTO[]>('/api/admin/tokens'),
    callWithSession<Pageable<OrganizationDTO>>('/api/organizations?perPage=1'),
  ]);

  if ([clients, users, tokens, organizations].some((r) => r === null)) {
    redirect('/login');
  }

  // A non-admin reaches this page legitimately; the management figures are
  // simply not theirs to see, so they are omitted rather than errored over.
  const tiles: Tile[] = [];

  if (organizations?.ok) {
    tiles.push({
      href: '/dashboard/organizations',
      label: 'Organizations',
      value: String(organizations.data.totalNumberOfElements),
      hint: 'you belong to',
    });
  }

  if (clients?.ok) {
    tiles.push({
      href: '/dashboard/clients',
      label: 'OAuth clients',
      value: String(clients.data.length),
    });
  }

  if (users?.ok) {
    tiles.push({
      href: '/dashboard/users',
      label: 'Users',
      value: String(users.data.length),
    });
  }

  if (tokens?.ok) {
    const active = tokens.data.filter((token) => token.active).length;

    tiles.push({
      href: '/dashboard/tokens',
      label: 'Active tokens',
      value: String(active),
      hint: `of ${tokens.data.length} issued`,
    });
  }

  return (
    <>
      <Notice notice={notice} />

      <div className={styles.sectionHead}>
        <h2>Overview</h2>
      </div>

      <div className={styles.tiles}>
        {tiles.map((tile) => (
          <Link className={styles.tile} href={tile.href} key={tile.href}>
            <span className={styles.tileValue}>{tile.value}</span>
            <span className={styles.tileLabel}>{tile.label}</span>
            {tile.hint ? (
              <span className={styles.tileHint}>{tile.hint}</span>
            ) : null}
          </Link>
        ))}
      </div>

      {tiles.length === 0 ? (
        <p className={styles.empty}>Nothing to show yet.</p>
      ) : null}
    </>
  );
}
