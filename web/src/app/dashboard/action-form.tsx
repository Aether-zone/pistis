'use client';

import {
  Alert,
  AlertDescription,
  Button,
  Code,
  Form,
} from '@aether-zone/kosmos';
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
    <Form action={formAction} className={className}>
      {state.error ? (
        <Alert variant="destructive" className={styles.formAlert}>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      {state.message ? (
        <Alert variant="success" role="status" className={styles.formAlert}>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}

      {state.secret ? (
        <Alert variant="warning" role="status" className={styles.formAlert}>
          <AlertDescription>
            Secret for <strong>{state.secret.clientId}</strong> — copy it now,
            it is stored only as a hash and cannot be shown again.
          </AlertDescription>
          {/* A sibling of the description rather than inside it: `block` makes
              this a <pre>, which cannot legally sit in the <p> that
              AlertDescription renders. */}
          <Code block className={styles.secretValue}>
            {state.secret.clientSecret}
          </Code>
        </Alert>
      ) : null}

      {children}
    </Form>
  );
}

export interface SubmitButtonProps {
  children: ReactNode;
  pendingLabel?: string;
  variant?: 'primary' | 'danger' | 'quiet';
}

/** Maps this app's three button roles onto kosmos's variants. */
const VARIANTS = {
  primary: 'primary',
  danger: 'destructive',
  quiet: 'secondary',
} as const;

/** Reads the enclosing form's pending state, which only works from inside it. */
export function SubmitButton({
  children,
  pendingLabel,
  variant = 'quiet',
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      variant={VARIANTS[variant]}
      size="sm"
      type="submit"
      disabled={pending}
    >
      {pending ? (pendingLabel ?? children) : children}
    </Button>
  );
}
