'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import styles from './shell.module.css';

export interface NavItem {
  href: string;
  label: string;
}

export interface NavProps {
  heading: string;
  items: NavItem[];
}

/**
 * Client-side only for the active state — `usePathname` is what tells a link it
 * is the current one, and that cannot be known while rendering on the server
 * for a shared layout.
 */
export function Nav({ heading, items }: NavProps) {
  const pathname = usePathname();

  return (
    <>
      <p className={styles.navGroup}>{heading}</p>
      <nav className={styles.nav}>
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.link} ${active ? styles.active : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
