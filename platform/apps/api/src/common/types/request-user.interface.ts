import { UserRole } from '@dojo-hub/shared';

export interface RequestUser {
  id: string;
  email: string;
  name: string;
  /** The workspace this session is acting as. Every permission check reads this. */
  role: UserRole;
  /** Every role the account holds; the workspace is always one of them. */
  roles: UserRole[];
}
