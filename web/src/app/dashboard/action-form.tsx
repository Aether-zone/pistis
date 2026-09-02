'use client';

import { useActionState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

import type { DashboardState } from './actions';
import styles from './dashboard.module.css';

const INITIAL: DashboardState = {};

export interface ActionFormProps {
  action: (state: DashboardState, form: FormData) => Promise<DashboardState>;
  children: ReactNode;
  className?: string;
}

/**
 * Wraps a server action with its own result state, so each form reports its own
 * outcome — a one-time client secret in particular has to be shown next to the
 * form that produced it, since the api will not return it again.
 *
 * `children` is deliberately plain nodes rather than a render prop: this is a
 * client component, and a function passed from the server page cannot cross the
 * boundary. Buttons read the pending state from `useFormStatus` instead.
 */
export function ActionForm({ action, children, className }: ActionFormProps) {
  const [state, formAction] = useActionState(action, INITIAL);

  return (
    <form action={formAction} className={className}>
      {state.error ? (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      ) : null}

      {state.message ? (
        <p className={styles.ok} role="status">
          {state.message}
        </p>
      ) : null}

      {state.secret ? (
        <p className={styles.secret} role="status">
          Secret for <strong>{state.secret.clientId}</strong> — copy it now, it
          is stored only as a hash and cannot be shown again.
          <code className={styles.secretValue}>{state.secret.clientSecret}</code>
        </p>
      ) : null}

      {children}
    </form>
  );
}

export interface SubmitButtonProps {
  children: ReactNode;
  pendingLabel?: string;
  variant?: 'primary' | 'danger' | 'quiet';
}

/** Reads the enclosing form's pending state, which only works from inside it. */
export function SubmitButton({
  children,
  pendingLabel,
  variant = 'quiet',
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button className={styles[variant]} type="submit" disabled={pending}>
      {pending ? (pendingLabel ?? children) : children}
    </button>
  );
}
