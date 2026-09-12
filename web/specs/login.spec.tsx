import React from 'react';
import { render, screen } from '@testing-library/react';

import { LoginForm } from '../src/app/login/login-form';
import { readOAuthParams, toHiddenFields } from '../src/app/login/oauth-params';

jest.mock('../src/app/login/actions', () => ({
  submitLogin: jest.fn(),
}));

describe('readOAuthParams', () => {
  it('returns null when the page is opened outside an authorization flow', () => {
    expect(readOAuthParams({})).toBeNull();
    expect(readOAuthParams({ scope: 'profile' })).toBeNull();
  });

  it('reads an authorization request', () => {
    expect(
      readOAuthParams({
        response_type: 'code',
        client_id: 'my-client',
        redirect_uri: 'https://client.example/callback',
        scope: 'profile email',
        state: 'xyz',
        code_challenge: 'abc',
        code_challenge_method: 'S256',
      }),
    ).toEqual({
      response_type: 'code',
      client_id: 'my-client',
      redirect_uri: 'https://client.example/callback',
      scope: 'profile email',
      state: 'xyz',
      code_challenge: 'abc',
      code_challenge_method: 'S256',
    });
  });

  it('takes the first value when a parameter is repeated', () => {
    expect(readOAuthParams({ client_id: ['first', 'second'] })?.client_id).toBe(
      'first',
    );
  });

  it('drops a code_challenge_method it does not recognise', () => {
    expect(
      readOAuthParams({ client_id: 'c', code_challenge_method: 'MD5' })
        ?.code_challenge_method,
    ).toBeUndefined();
  });
});

describe('toHiddenFields', () => {
  it('omits absent parameters so they are not submitted as empty strings', () => {
    const fields = toHiddenFields({
      response_type: 'code',
      client_id: 'my-client',
    });

    expect(fields).toEqual([
      ['response_type', 'code'],
      ['client_id', 'my-client'],
    ]);
  });
});

/** The custom property the stylesheet reads the client's colour from. */
const brandOf = (): string =>
  screen.getByRole('main').style.getPropertyValue('--brand');

describe('LoginForm', () => {
  it('renders the credential fields', () => {
    render(<LoginForm hiddenFields={[]} />);

    expect(screen.getByLabelText('Email address')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
  });

  it('names the client and lists what it is asking for', () => {
    render(
      <LoginForm
        clientName="Example Client"
        scopes={[{ name: 'profile', description: 'View your name' }]}
        hiddenFields={[['client_id', 'my-client']]}
      />,
    );

    expect(screen.getByText('Example Client')).toBeTruthy();
    expect(screen.getByText('View your name')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Allow' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  it('round-trips the authorization request through hidden fields', () => {
    const { container } = render(
      <LoginForm
        clientName="Example Client"
        hiddenFields={[
          ['client_id', 'my-client'],
          ['state', 'xyz'],
        ]}
      />,
    );

    const hidden = Array.from(
      container.querySelectorAll('input[type="hidden"]'),
    ).map((input) => [
      input.getAttribute('name'),
      input.getAttribute('value'),
    ]);

    expect(hidden).toEqual([
      ['client_id', 'my-client'],
      ['state', 'xyz'],
    ]);
  });

  /*
   * The colour reaches CSS as a custom property because it comes from the
   * database per request — there is no finite set of classes it could be — so
   * what is worth asserting is that it lands on the element the stylesheet
   * reads it from.
   */
  it('dresses the page in the client’s colour', () => {
    render(
      <LoginForm
        clientName="Rivigo"
        primaryColor="#0f766e"
        hiddenFields={[]}
      />,
    );

    expect(brandOf()).toBe('#0f766e');
  });

  it('sets no colour when there is no client, leaving the stylesheet’s', () => {
    /*
     * The dashboard sign-in has no client to take one from, and the fallback is
     * kosmos's own primary in CSS — so the workspace's blue is not written down
     * a second time here.
     */
    render(<LoginForm hiddenFields={[]} />);

    expect(brandOf()).toBe('');
  });

  it('names the client rather than pistis, so the page looks like what it is', () => {
    /*
     * Somebody who followed a link from another application has no reason to
     * recognise the authorization server, and a sign-in branded as a service
     * they have never heard of is the shape a phishing page takes.
     */
    render(<LoginForm clientName="Rivigo" hiddenFields={[]} />);

    expect(screen.getByRole('heading', { name: 'Log in to Rivigo' }))
      .toBeTruthy();
  });

  it('does not dress a refused request as the client that sent it', () => {
    /*
     * The request was refused because the client or the redirect URI could not
     * be verified, so naming that client here would be vouching for something
     * this server just declined to trust.
     */
    render(
      <LoginForm
        clientName="Impostor"
        primaryColor="#ff0000"
        hiddenFields={[]}
        blockedReason="Unknown client."
      />,
    );

    expect(screen.queryByText(/Impostor/)).toBeNull();
    expect(brandOf()).toBe('');
  });

  it('offers no Cancel button outside an authorization flow', () => {
    render(<LoginForm hiddenFields={[]} />);

    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
  });

  it('shows no credential fields when it cannot sign anyone in', () => {
    // Rendering a usable-looking form here produced a page that accepted a
    // password and then answered with an unrelated message about who is asking.
    render(<LoginForm hiddenFields={[]} blockedReason="Unknown client." />);

    expect(screen.getByRole('status').textContent).toBe('Unknown client.');
    expect(screen.queryByLabelText('Email address')).toBeNull();
    expect(screen.queryByLabelText('Password')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
