import { useQuery } from '@tanstack/react-query';

import * as api from './api';
import { rolesKeys } from './keys';

/** The roles and, when it can be read, the staff directory: one read, shared by everything on the screen. */
export function useRolesPage() {
  return useQuery({ queryKey: rolesKeys.page(), queryFn: api.fetchRolesPage, staleTime: 5 * 60 * 1000 });
}
