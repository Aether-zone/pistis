import styles from './dashboard.module.css';

/** Flash message carried in the query string by destructive actions. */
export function Notice({ notice }: { notice?: string | string[] }) {
  if (typeof notice !== 'string' || !notice) {
    return null;
  }

  return (
    <p className={styles.ok} role="status">
      {notice}
    </p>
  );
}
