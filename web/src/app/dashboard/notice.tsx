import { Alert, AlertDescription } from '@aether-zone/kosmos';

import styles from './dashboard.module.css';

/** Flash message carried in the query string by destructive actions. */
export function Notice({ notice }: { notice?: string | string[] }) {
  if (typeof notice !== 'string' || !notice) {
    return null;
  }

  return (
    // Alert is role="alert" by default; this reports something that already
    // succeeded, so it stays the status it was.
    <Alert variant="success" role="status" className={styles.notice}>
      <AlertDescription>{notice}</AlertDescription>
    </Alert>
  );
}
