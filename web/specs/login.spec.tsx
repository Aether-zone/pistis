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
