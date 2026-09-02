'use client';

import type { ScopeDescriptorDTO } from '@pistis/contract';
import { useActionState } from 'react';

import { submitLogin, type LoginFormState } from './actions';
import styles from './login.module.css';

export interface LoginFormProps {
  clientName?: string;
  scopes?: ScopeDescriptorDTO[];
  hiddenFields: Array<[string, string]>;
  /**
   * Why this page cannot sign anyone in — no authorization request, or one the
   * api rejected. When set, the credential fields are not rendered at all:
   * there is nowhere for them to go, and offering them produced a form that
   * contradicted itself the moment it was submitted.
   */
  blockedReason?: string;
}

const INITIAL: LoginFormState = {};

export function LoginForm({
  clientName,
  scopes,
  hiddenFields,
  blockedReason,
}: LoginFormProps) {
  const [state, formAction, pending] = useActionState(submitLogin, INITIAL);

  if (blockedReason) {
    return (
      <section className={styles.form}>
        <h1 className={styles.heading}>Sign in</h1>
        <p className={styles.notice} role="status">
          {blockedReason}
        </p>
      </section>
    );
  }

  return (
    <form className={styles.form} action={formAction}>
      <h1 className={styles.heading}>Sign in</h1>

      <p className={styles.lead}>
        {clientName ? (
          <>
            <strong>{clientName}</strong> wants to access your account.
          </>
        ) : (
          'Sign in to manage clients, users and tokens.'
        )}
      </p>

      {hiddenFields.map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      <label className={styles.field} htmlFor="username">
        <span className={styles.label}>Email address</span>
        <input
          className={styles.input}
          id="username"
          name="username"
          type="email"
          autoComplete="username"
          required
        />
      </label>

      <label className={styles.field} htmlFor="password">
        <span className={styles.label}>Password</span>
        <input
          className={styles.input}
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>

      {scopes && scopes.length > 0 ? (
        <div className={styles.scopes}>
          <p className={styles.scopesHeading}>This will allow it to:</p>
          <ul className={styles.scopeList}>
            {scopes.map((scope) => (
              <li key={scope.name}>{scope.description}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {state.error ? (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      ) : null}

      <div className={styles.actions}>
        {clientName ? (
          <button
            className={styles.secondary}
            type="submit"
            name="decision"
            value="deny"
            disabled={pending}
          >
            Cancel
          </button>
        ) : null}
        <button
          className={styles.primary}
          type="submit"
          name="decision"
          value="allow"
          disabled={pending}
        >
          {pending ? 'Signing in…' : clientName ? 'Allow' : 'Sign in'}
        </button>
      </div>
    </form>
  );
}
