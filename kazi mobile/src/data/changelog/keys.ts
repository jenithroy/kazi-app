export const changelogKeys = {
  all: ['changelog'] as const,
  commits: () => [...changelogKeys.all, 'commits'] as const,
};
