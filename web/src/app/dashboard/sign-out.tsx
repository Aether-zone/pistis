'use client';

import { signOut } from '../login/actions';
import styles from './dashboard.module.css';

export function SignOut() {
  return (
    <form action={signOut} className={styles.inlineForm}>
      <button className={styles.quiet} type="submit">
        Sign out
      </button>
    </form>
  );
}
