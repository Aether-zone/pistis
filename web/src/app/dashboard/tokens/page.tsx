import {
  Alert,
  AlertDescription,
  Badge,
  Card,
  Heading,
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@aether-zone/kosmos';
import type { AdminTokenDTO } from '@pistis/contract';
import { redirect } from 'next/navigation';

import { callWithSession } from '@/lib/session-api';
import { ActionForm, SubmitButton } from '../action-form';
import { revokeToken } from '../actions';
import styles from '../dashboard.module.css';
import { Notice } from '../notice';
import { Yes } from '../yes';

export const metadata = { title: 'Tokens' };
export const dynamic = 'force-dynamic';

function when(value: Date | string): string {
  return new Date(value).toISOString().replace('T', ' ').slice(0, 16);
}

export default async function TokensPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const notice = (await searchParams).notice;
  const result = await callWithSession<AdminTokenDTO[]>('/api/admin/tokens');

  if (result === null) {
    redirect('/login');
  }

  if (!result.ok) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{result.message}</AlertDescription>
      </Alert>
    );
  }

  const tokenList = result.data;

  return (
    <>
      <Notice notice={notice} />

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <Heading level={2} size="heading-small">
            Issued tokens
          </Heading>
          <Badge variant="outline" size="sm">
            {tokenList.filter((token) => token.active).length} active of{' '}
            {tokenList.length}
          </Badge>
        </div>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kind</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Scopes</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Active</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tokenList.length === 0 ? (
                <TableRow>
                  <TableEmpty colSpan={8}>Nothing issued yet.</TableEmpty>
                </TableRow>
              ) : (
                tokenList.map((token) => (
                  <TableRow key={`${token.kind}-${token.id}`}>
                    <TableCell>{token.kind}</TableCell>
                    <TableCell className={styles.mono}>
                      {token.clientId}
                    </TableCell>
                    <TableCell className={styles.mono}>
                      {token.userId ?? '—'}
                    </TableCell>
                    <TableCell className={styles.mono}>
                      {token.scopes.join(' ')}
                    </TableCell>
                    <TableCell>{when(token.issuedAt)}</TableCell>
                    <TableCell>{when(token.expiresAt)}</TableCell>
                    <TableCell>
                      <Yes value={token.active} />
                    </TableCell>
                    <TableCell>
                      {token.active ? (
                        <ActionForm
                          action={revokeToken}
                          className={styles.inlineForm}
                        >
                          <input
                            type="hidden"
                            name="tokenId"
                            value={token.id}
                          />
                          <input type="hidden" name="kind" value={token.kind} />
                          <SubmitButton
                            variant="danger"
                            pendingLabel="Revoking…"
                          >
                            Revoke
                          </SubmitButton>
                        </ActionForm>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </section>
    </>
  );
}
