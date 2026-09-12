'use client';

import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  Field,
  Form,
  Heading,
  Input,
  Label,
  List,
  ListItem,
  Text,
} from '@aether-zone/kosmos';
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

/**
 * Kosmos owns the surface, typography and controls here; the local stylesheet
 * is layout only. Its rules are unlayered while kosmos ships its utilities in
 * `@layer utilities`, so a plain class overrides one without needing to
 * out-specify it.
 */
export function LoginForm({
  clientName,
  scopes,
  hiddenFields,
  blockedReason,
}: LoginFormProps) {
  const [state, formAction, pending] = useActionState(submitLogin, INITIAL);

  if (blockedReason) {
    return (
      <main className={styles.page}>
        <Card className={styles.card}>
          <CardHeader>
            <Heading level={1} size="heading">
              Sign in
            </Heading>
          </CardHeader>
          <CardContent>
            {/* Alert defaults to role="alert"; this is a standing explanation
                rather than something that just went wrong, so it stays a
                status the way the plain markup had it. */}
            <Alert role="status">
              <AlertDescription>{blockedReason}</AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <Card className={styles.card}>
        <Form action={formAction}>
          <CardHeader>
            <Heading level={1} size="heading">
              Sign in
            </Heading>
            <CardDescription>
              {clientName ? (
                <>
                  <strong>{clientName}</strong> wants to access your account.
                </>
              ) : (
                'Sign in to manage clients, users and tokens.'
              )}
            </CardDescription>
          </CardHeader>

          <CardContent className={styles.content}>
            {hiddenFields.map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}

            <Field>
              <Label htmlFor="username">Email address</Label>
              <Input
                id="username"
                name="username"
                type="email"
                autoComplete="username"
                error={Boolean(state.error)}
                required
              />
            </Field>

            <Field>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                error={Boolean(state.error)}
                required
              />
            </Field>

            {scopes && scopes.length > 0 ? (
              <div className={styles.scopes}>
                <Text size="label" weight="semibold">
                  This will allow it to:
                </Text>
                <List variant="bulleted" spacing="tight">
                  {scopes.map((scope) => (
                    <ListItem key={scope.name}>{scope.description}</ListItem>
                  ))}
                </List>
              </div>
            ) : null}

            {state.error ? (
              <Alert variant="destructive">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            ) : null}
          </CardContent>

          {/*
            Allow comes first in the DOM deliberately. Pressing Enter in a field
            submits a form through its *first* submit button, so with Cancel
            first, typing an email and password and hitting Enter denied the
            request — the client received `error=access_denied` from someone who
            had just signed in successfully. `.actions` reverses the row so the
            buttons still read Cancel, Allow left to right.
          */}
          <CardFooter className={styles.actions}>
            <Button
              type="submit"
              name="decision"
              value="allow"
              disabled={pending}
            >
              {pending ? 'Signing in…' : clientName ? 'Allow' : 'Sign in'}
            </Button>
            {clientName ? (
              <Button
                variant="secondary"
                type="submit"
                name="decision"
                value="deny"
                disabled={pending}
              >
                Cancel
              </Button>
            ) : null}
          </CardFooter>
        </Form>
      </Card>
    </main>
  );
}
