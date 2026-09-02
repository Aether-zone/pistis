import type {
  AdminUserDTO,
  MembershipDTO,
  MembershipRole,
  OrganizationDTO,
  Pageable,
  UserDTO,
} from '@pistis/contract';
import Link from 'next/link';
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
      <p className={styles.error} role="alert">
        {organization.message}
      </p>
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

  return (
    <>
      <Notice notice={notice} />

      <p className={styles.crumb}>
        <Link href="/dashboard/organizations">Organizations</Link> /{' '}
        {organization.data.name}
      </p>

      <div className={styles.sectionHead}>
        <h2>{organization.data.name}</h2>
        <span className={styles.count}>{organization.data.slug}</span>
      </div>

      <dl className={styles.facts}>
        <div>
          <dt>Slug</dt>
          <dd className={styles.mono}>{organization.data.slug}</dd>
        </div>
        <div>
          <dt>Description</dt>
          <dd>{organization.data.description ?? '—'}</dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>{when(organization.data.createdAt)}</dd>
        </div>
        <div>
          <dt>Your role</dt>
          <dd>{myRole ?? (viewer?.admin ? 'administrator' : '—')}</dd>
        </div>
      </dl>

      <div className={styles.sectionHead}>
        <h3>Members</h3>
        <span className={styles.count}>{memberList.length}</span>
      </div>

      <div className={styles.scroller}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Joined</th>
              {canManage ? <th /> : null}
            </tr>
          </thead>
          <tbody>
            {memberList.map((member) => {
              // Only owners may touch another owner, which is what stops an
              // admin from demoting the people who appointed them.
              const editable =
                canManage && (member.role !== 'owner' || canManageOwners);

              return (
                <tr key={member.id}>
                  <td>{member.user.name}</td>
                  <td className={styles.mono}>{member.user.email}</td>
                  <td>
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
                        <select
                          className={styles.input}
                          name="role"
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
                        </select>
                        <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
                      </ActionForm>
                    ) : (
                      member.role
                    )}
                  </td>
                  <td>{when(member.createdAt)}</td>
                  {canManage ? (
                    <td>
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
                          <SubmitButton variant="danger" pendingLabel="Removing…">
                            Remove
                          </SubmitButton>
                        </ActionForm>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {canManage ? (
        <details className={styles.details}>
          <summary className={styles.summary}>Add a member</summary>
          <ActionForm action={addMember} className={styles.form}>
            <input
              type="hidden"
              name="organizationId"
              value={organization.data.id}
            />
            <label className={styles.field} htmlFor="memberUserId">
              <span className={styles.label}>User</span>
              {candidates.length > 0 ? (
                <select className={styles.input} id="memberUserId" name="userId" required>
                  {candidates.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} · {user.email}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className={styles.input}
                  id="memberUserId"
                  name="userId"
                  placeholder="User id"
                  required
                />
              )}
            </label>
            <label className={styles.field} htmlFor="memberRole">
              <span className={styles.label}>Role</span>
              <select
                className={styles.input}
                id="memberRole"
                name="role"
                defaultValue="member"
              >
                {ROLES.filter(
                  (role) => role !== 'owner' || canManageOwners,
                ).map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </label>
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
