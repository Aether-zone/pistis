import {
  Alert,
  AlertDescription,
  Badge,
  BreadcrumbItem,
  Breadcrumbs,
  Card,
  CardContent,
  Field,
  Heading,
  Input,
  Label,
  Select,
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@aether-zone/kosmos';
import type {
  AdminUserDTO,
  MembershipDTO,
  MembershipRole,
  OrganizationDTO,
  Pageable,
  UserDTO,
} from '@pistis/contract';
import { notFound, redirect } from 'next/navigation';

import { callWithSession } from '@/lib/session-api';
import { ActionForm, SubmitButton } from '../../action-form';
import { addMember, removeMember, updateMemberRole } from '../../actions';
import styles from '../../dashboard.module.css';
import { Notice } from '../../notice';

export const dynamic = 'force-dynamic';

const ROLES: MembershipRole[] = ['owner', 'admin', 'member'];

function when(value: Date | string): string {
  return new Date(value).toISOString().replace('T', ' ').slice(0, 16);
}

export default async function OrganizationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const notice = (await searchParams).notice;

  const [organization, members, me] = await Promise.all([
    callWithSession<OrganizationDTO>(`/api/organizations/${id}`),
    callWithSession<Pageable<MembershipDTO>>(
      `/api/organizations/${id}/members?perPage=200`,
    ),
    callWithSession<UserDTO & { admin?: boolean }>('/api/auth/me'),
  ]);

  if (organization === null || members === null || me === null) {
    redirect('/login');
  }

  if (!organization.ok) {
    // 403 and 404 are deliberately the same answer from the api — a caller with
    // no membership is not told whether the organization exists.
    if (organization.status === 403 || organization.status === 404) {
      notFound();
    }

    return (
      <Alert variant="destructive">
        <AlertDescription>{organization.message}</AlertDescription>
      </Alert>
    );
  }

  const memberList: MembershipDTO[] = members.ok ? members.data.items : [];
  const viewer = me.ok ? me.data : null;
  const myRole = memberList.find(
    (member) => member.user.id === viewer?.id,
  )?.role;

  // Mirrors the CASL rules on the api. The api is still the authority; this
  // only avoids offering controls that would be refused.
  const canManage =
    viewer?.admin === true || myRole === 'owner' || myRole === 'admin';
  const canManageOwners = viewer?.admin === true || myRole === 'owner';

  // Only an admin can list users, so the picker degrades to an id field.
  const users = canManage
    ? await callWithSession<AdminUserDTO[]>('/api/admin/users')
    : null;
  const candidates: AdminUserDTO[] = users?.ok
    ? users.data.filter(
        (user) => !memberList.some((member) => member.user.id === user.id),
      )
    : [];

  const facts = [
    { term: 'Slug', value: organization.data.slug, mono: true },
    { term: 'Description', value: organization.data.description ?? '—' },
    { term: 'Created', value: when(organization.data.createdAt) },
    {
      term: 'Your role',
      value: myRole ?? (viewer?.admin ? 'administrator' : '—'),
    },
  ];

  return (
    <>
      <Notice notice={notice} />

      <Breadcrumbs className={styles.crumb}>
        <BreadcrumbItem href="/dashboard/organizations">
          Organizations
        </BreadcrumbItem>
        <BreadcrumbItem current>{organization.data.name}</BreadcrumbItem>
      </Breadcrumbs>

      <div className={styles.sectionHead}>
        <Heading level={2} size="heading-small">
          {organization.data.name}
        </Heading>
        <Badge variant="outline" size="sm">
          {organization.data.slug}
        </Badge>
      </div>

      <Card className={styles.factsCard}>
        <CardContent>
          <dl className={styles.facts}>
            {facts.map((fact) => (
              <div key={fact.term}>
                <dt>
                  <Text as="span" size="label" tone="muted">
                    {fact.term}
                  </Text>
                </dt>
                <dd className={fact.mono ? styles.mono : undefined}>
                  {fact.value}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <div className={styles.sectionHead}>
        <Heading level={3} size="heading-small">
          Members
        </Heading>
        <Badge variant="outline" size="sm">
          {memberList.length}
        </Badge>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
              {canManage ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {memberList.length === 0 ? (
              <TableRow>
                <TableEmpty colSpan={canManage ? 5 : 4}>
                  No members yet.
                </TableEmpty>
              </TableRow>
            ) : (
              memberList.map((member) => {
                // Only owners may touch another owner, which is what stops an
                // admin from demoting the people who appointed them.
                const editable =
                  canManage && (member.role !== 'owner' || canManageOwners);

                return (
                  <TableRow key={member.id}>
                    <TableCell>{member.user.name}</TableCell>
                    <TableCell className={styles.mono}>
                      {member.user.email}
                    </TableCell>
                    <TableCell>
                      {editable ? (
                        <ActionForm
                          action={updateMemberRole}
                          className={styles.inlineForm}
                        >
                          <input
                            type="hidden"
                            name="organizationId"
                            value={organization.data.id}
                          />
                          <input
                            type="hidden"
                            name="userId"
                            value={member.user.id}
                          />
                          <Select
                            className={styles.select}
                            name="role"
                            size="sm"
                            defaultValue={member.role}
                            aria-label={`Role for ${member.user.email}`}
                          >
                            {ROLES.filter(
                              (role) => role !== 'owner' || canManageOwners,
                            ).map((role) => (
                              <option key={role} value={role}>
                                {role}
                              </option>
                            ))}
                          </Select>
                          <SubmitButton pendingLabel="Saving…">
                            Save
                          </SubmitButton>
                        </ActionForm>
                      ) : (
                        member.role
                      )}
                    </TableCell>
                    <TableCell>{when(member.createdAt)}</TableCell>
                    {canManage ? (
                      <TableCell>
                        {editable ? (
                          <ActionForm
                            action={removeMember}
                            className={styles.inlineForm}
                          >
                            <input
                              type="hidden"
                              name="organizationId"
                              value={organization.data.id}
                            />
                            <input
                              type="hidden"
                              name="userId"
                              value={member.user.id}
                            />
                            <SubmitButton
                              variant="danger"
                              pendingLabel="Removing…"
                            >
                              Remove
                            </SubmitButton>
                          </ActionForm>
                        ) : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {canManage ? (
        <details className={styles.details}>
          <summary className={styles.summary}>Add a member</summary>
          <ActionForm action={addMember} className={styles.form}>
            <input
              type="hidden"
              name="organizationId"
              value={organization.data.id}
            />

            <Field>
              <Label htmlFor="memberUserId">User</Label>
              {candidates.length > 0 ? (
                <Select
                  className={styles.select}
                  id="memberUserId"
                  name="userId"
                  size="sm"
                  required
                >
                  {candidates.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} · {user.email}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  id="memberUserId"
                  name="userId"
                  size="sm"
                  placeholder="User id"
                  required
                />
              )}
            </Field>

            <Field>
              <Label htmlFor="memberRole">Role</Label>
              <Select
                className={styles.select}
                id="memberRole"
                name="role"
                size="sm"
                defaultValue="member"
              >
                {ROLES.filter(
                  (role) => role !== 'owner' || canManageOwners,
                ).map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </Select>
            </Field>

            <div className={styles.span}>
              <SubmitButton variant="primary" pendingLabel="Adding…">
                Add member
              </SubmitButton>
            </div>
          </ActionForm>
        </details>
      ) : null}
    </>
  );
}
