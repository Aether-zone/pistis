import styles from './login.module.css';

export interface BrandPanelProps {
  /** The client being signed in to, where there is one. */
  clientName?: string;
}

/**
 * The coloured half: what you are signing in to.
 *
 * Deliberately says the *client's* name rather than pistis's. Somebody who
 * followed a link from another application has no reason to recognise the
 * authorization server, and a sign-in page branded as a service they have never
 * heard of is the shape a phishing page takes — so the page names the thing
 * they were already using. Falls back to pistis only for its own dashboard,
 * where pistis *is* what you are signing in to.
 */
export function BrandPanel({ clientName }: BrandPanelProps) {
  return (
    <aside className={styles.brand}>
      <div>
        <p className={styles.wordmark}>{clientName ?? 'Pistis'}</p>
        <p className={styles.tagline}>
          {clientName
            ? 'Signing in with your Pistis account'
            : 'Clients, users and tokens'}
        </p>
      </div>

      <div className={styles.brandBody}>
        <Illustration />
        <p className={styles.brandHeading}>One account</p>
        <p className={styles.brandText}>
          {clientName
            ? `Your Pistis account signs you in to ${clientName} and everything else in the workspace.`
            : 'The same account signs you in to every application in the workspace.'}
        </p>
      </div>

      <p className={styles.legal}>Secured by Pistis</p>
    </aside>
  );
}

/**
 * Drawn in the current text colour rather than a fixed palette, so it works
 * against whatever colour the client chose.
 *
 * `aria-hidden` because the heading and blurb beside it already say what it
 * says; announcing it would repeat them.
 */
function Illustration() {
  return (
    <svg
      className={styles.illustration}
      viewBox="0 0 120 96"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {/* A shield: the one thing every sign-in page is claiming to be. */}
      <path d="M60 12 92 24v26c0 18-13 31-32 36-19-5-32-18-32-36V24Z" />
      <path d="M47 50l10 10 18-20" />
      <path d="M22 74h-14M112 74h-14" opacity="0.55" />
      <circle cx="16" cy="30" r="3" opacity="0.55" />
      <circle cx="104" cy="18" r="3" opacity="0.55" />
    </svg>
  );
}
