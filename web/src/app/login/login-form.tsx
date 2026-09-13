'use client';

import {
  Alert,
  AlertDescription,
  Button,
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
import { useActionState, type CSSProperties } from 'react';

import { submitLogin, type LoginFormState } from './actions';
import { BrandPanel } from './brand-panel';
import { readableInkFor } from './readable-ink';
import styles from './login.module.css';

export interface LoginFormProps {
  clientName?: string;
  /**
   * The client's colour, where there is a client.
   *
   * Absent for the dashboard sign-in, which has none to take one from, and the
   * stylesheet falls back to kosmos's own primary — so there is no blue written
   * down twice.
   */
  primaryColor?: string;
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
  primaryColor,
  scopes,
  hiddenFields,
  blockedReason,
}: LoginFormProps) {
  const [state, formAction, pending] = useActionState(submitLogin, INITIAL);

  /*
   * The colour reaches CSS as a custom property rather than a class: it comes
   * from the database per request, so there is no finite set of classes it
   * could be. Every rule in the stylesheet reads `--brand`, so this one
   * declaration is the whole difference between two clients — and setting
   * nothing leaves the stylesheet's own fallback in place.
   */
  const brand = primaryColor
    ? ({
        '--brand': primaryColor,
        /*
         * Chosen here rather than mixed toward white in CSS. A client may pick
         * a pale colour, and near-white text on it cannot be read — which is
         * what the first version of this panel did.
         */
        '--brand-ink': readableInkFor(primaryColor),
      } as CSSProperties)
    : undefined;

  if (blockedReason) {
    /*
     * No client name and the workspace's own colour, even though a rejected
     * request may well have carried one: the request was refused because the
     * client or the redirect URI could not be verified, so dressing the page as
     * that client would be vouching for something this server just declined to
     * trust.
     */
    return (
      <main className={styles.page}>
        <div className={styles.split}>
          <BrandPanel />
          <div className={styles.form}>
            <Heading level={1} size="heading" className={styles.heading}>
              Sign in
            </Heading>
            {/* Alert defaults to role="alert"; this is a standing explanation
                rather than something that just went wrong, so it stays a
                status the way the plain markup had it. */}
            <Alert role="status">
              <AlertDescription>{blockedReason}</AlertDescription>
            </Alert>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page} style={brand}>
      <div className={styles.split}>
        <BrandPanel clientName={clientName} />

        <Form action={formAction} className={styles.form}>
          <div>
            <Heading level={1} size="heading" className={styles.heading}>
              {clientName ? `Log in to ${clientName}` : 'Sign in'}
            </Heading>
            <Text as="p" size="body-small" className={styles.lede}>
              {clientName
                ? 'Log in using your official email'
                : 'Sign in to manage clients, users and tokens.'}
            </Text>
          </div>

          <div className={styles.fields}>
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
          </div>

          {/*
            Allow comes first in the DOM deliberately. Pressing Enter in a field
            submits a form through its *first* submit button, so with Cancel
            first, typing an email and password and hitting Enter denied the
            request — the client received `error=access_denied` from someone who
            had just signed in successfully. `.actions` reverses the row so the
            buttons still read Cancel, Allow left to right.
          */}
          <div className={clientName ? styles.actions : undefined}>
            <Button
              type="submit"
              name="decision"
              value="allow"
              variant="primary"
              className={styles.submit}
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
          </div>
        </Form>
      </div>
    </main>
  );
}
