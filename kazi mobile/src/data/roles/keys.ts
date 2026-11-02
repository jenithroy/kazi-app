export const rolesKeys = {
  all: ['roles'] as const,
  page: () => [...rolesKeys.all, 'page'] as const,
};
