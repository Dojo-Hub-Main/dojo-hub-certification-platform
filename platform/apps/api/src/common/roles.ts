import { UserRole } from '@dojo-hub/shared';

/**
 * An account holds a set of roles — any mix of Student, Evaluator and Admin — and each
 * session acts as one of them, its workspace. Everything that asks "what may this person
 * do right now?" reads the active workspace (RequestUser.role); only role management
 * and sign-in look at the whole set.
 */

/** Highest privilege first: the default workspace, and the value kept in the old column. */
export const ROLE_PRIORITY: readonly UserRole[] = [
  UserRole.ADMIN,
  UserRole.EVALUATOR,
  UserRole.STUDENT,
];

/**
 * The roles an account holds. The single `role` column is the fallback for a row the
 * roles backfill has not reached — for example one written by the previous version during
 * a deploy — so no account is ever read as having no role at all.
 */
export function rolesOf(user: {
  role: UserRole;
  roles?: UserRole[] | null;
}): UserRole[] {
  return user.roles && user.roles.length > 0
    ? sortRoles(user.roles)
    : [user.role];
}

export function sortRoles(roles: readonly UserRole[]): UserRole[] {
  return ROLE_PRIORITY.filter((r) => roles.includes(r));
}

/**
 * The role written to the old single `role` column alongside `roles`. Kept in step so the
 * previous version of the platform still reads a sensible role if a release is rolled back.
 */
export function primaryRole(roles: readonly UserRole[]): UserRole {
  return sortRoles(roles)[0] ?? UserRole.STUDENT;
}
