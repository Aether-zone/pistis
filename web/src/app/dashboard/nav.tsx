'use client';

import { SidenavGroup, SidenavGroupLabel, SidenavItem } from '@aether-zone/kosmos';
import { usePathname, useRouter } from 'next/navigation';
import type { MouseEvent } from 'react';

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
 *
 * `SidenavItem` renders a plain anchor and offers no way to swap the element,
 * so a `next/link` cannot supply its markup. Navigation is routed by hand
 * instead, which keeps the transition client-side; the real `href` is still
 * there, so opening in a new tab and the status bar behave normally. What is
 * lost against `<Link>` is prefetching on hover.
 */
export function Nav({ heading, items }: NavProps) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <SidenavGroup>
      <SidenavGroupLabel className={styles.navGroupLabel}>
        {heading}
      </SidenavGroupLabel>

      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <SidenavItem
            key={item.href}
            href={item.href}
            active={active}
            onClick={(event: MouseEvent<HTMLAnchorElement>) => {
              // Leave modified clicks to the browser: new tab, new window,
              // download, and anything that is not a plain left click.
              if (
                event.defaultPrevented ||
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              ) {
                return;
              }

              event.preventDefault();
              router.push(item.href);
            }}
          >
            {item.label}
          </SidenavItem>
        );
      })}
    </SidenavGroup>
  );
}
