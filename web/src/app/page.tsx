import { redirect } from 'next/navigation';

import { getSessionToken } from '@/lib/session';


export const dynamic = 'force-dynamic';

/**
 * The root is a signpost, not a page.
 *
 * Only the presence of a session cookie is checked, not its validity: the
 * dashboard verifies it against the api anyway and sends a stale one back to
 * sign in, so calling the api twice would buy nothing.
 */
export default async function RootPage() {
  redirect((await getSessionToken()) ? '/dashboard' : '/login');
}
