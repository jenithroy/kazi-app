import { useQuery } from '@tanstack/react-query';

import * as api from './api';
import { changelogKeys } from './keys';

export function useCommitFeed() {
  return useQuery({
    queryKey: changelogKeys.commits(),
    queryFn: api.fetchCommitFeed,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
