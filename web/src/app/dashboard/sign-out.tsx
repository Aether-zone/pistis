'use client';

import { Button } from '@aether-zone/kosmos';

import { signOut } from '../login/actions';

export function SignOut() {
  return (
    <form action={signOut}>
      <Button variant="secondary" size="sm" type="submit">
        Sign out
      </Button>
    </form>
  );
}
