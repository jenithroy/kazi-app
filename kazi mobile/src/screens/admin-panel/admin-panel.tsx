import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { useToast } from '@/components/toast/toast-provider';
import { HeaderAccount } from '@/components/ui/header-account';
import { Icon } from '@/components/ui/icon';
import { PermissionNotice } from '@/components/ui/permission-notice';
import { isBlocked, ScreenGate } from '@/components/ui/screen-gate';
import { useBackHandler } from '@/lib/use-back-handler';
import { useScrollTop } from '@/lib/use-scroll-top';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useTheme } from '@/theme/theme-provider';
import * as haptics from '@/lib/haptics';
import { fontFamily, radii } from '@/theme';
import {
  useAdminMatrix,
  useCreateRole,
  useDeleteRole,
  useSaveRoleDraft,
  useSetPersonRole,
  useUpdateRole,
} from '@/data/admin-panel/hooks';
import {
  EMPTY_DRAFT,
  GROUP_CAPABILITIES,
  type AccessLevel,
  type DiffRow,
  type GroupCapability,
  type PersonRow,
  type RoleDraft,
  type RoleFields,
  type SectionRow,
} from '@/data/admin-panel/types';
import { countLevels, isDowngrade, isSuperTier, LEVEL_LABEL } from '@/data/admin-panel/utils';

import { ChatGroupsCard } from './chat-groups-card';
import { ConfirmSheet } from '@/components/ui/confirm-sheet';
import { DirtyBar } from './dirty-bar';
import { FinanceTabsCard } from './finance-tabs-card';
import { NotificationsCard } from './notifications-card';
import { PagesCard } from './pages-card';
import { PeopleSheet } from './people-sheet';
import { ReviewSheet } from './review-sheet';
import { RoleEditorSheet } from './role-editor-sheet';
import { RoleList } from './role-list';
import { RoleSummaryCard } from './role-summary-card';

interface PendingConfirm {
  title: string;
  body: string;
  confirmLabel: string;
  tone?: 'danger' | 'primary';
  run: () => void;
  /**
   * Which sheet raised this. Two modals on screen at once is unreliable on
   * iOS, so the sheet that asked steps aside and comes back afterwards —
   * whichever way the question is answered.
   */
  restore?: 'review' | 'people' | 'editor';
}

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err ?? 'Unknown error'));

/**
 * Roles & permissions.
 *
 * Access is a property of the job, not the person: a role is edited here and
 * everybody holding it moves together. Every switch is a row in
 * `position_permissions` — the same table the database reads when it decides
 * whether a query may return a row — so what this screen shows is what is
 * actually enforced, not a mobile-side copy of it.
 *
 * The web page puts the roles rail and the matrix side by side; a phone picks a
 * role first and opens its pages on their own. Everything else is the same
 * page: nothing is written as it is tapped, edits collect in a draft, the whole
 * batch goes up together, and the screen refuses to be walked away from while
 * that draft exists.
 */
export function AdminPanel() {
  const theme = useTheme();
  const toast = useToast();
  const { can } = useAuth();

  const canAdminister = can('admin-panel');
  // Moving somebody between roles writes to `people`, which RLS gates on
  // employees-edit — not on admin. Someone can be allowed to shape a role
  // without being allowed to decide who holds it.
  const canManagePeople = can('employees-hr');

  const matrixQuery = useAdminMatrix();
  const { data: matrix } = matrixQuery;
  const saveDraft = useSaveRoleDraft();
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();
  const setPersonRole = useSetPersonRole();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The role editor and the role list draw into the same ScrollView slot.
  const scrollRef = useScrollTop(selectedId ?? 'roles');
  const [draft, setDraft] = useState<RoleDraft>(EMPTY_DRAFT);
  const [roleQuery, setRoleQuery] = useState('');
  const [pageQuery, setPageQuery] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [editor, setEditor] = useState<'new' | 'edit' | null>(null);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [busyPersonId, setBusyPersonId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Both read only from `draft`, so they sit above the data gate — the back
  // handler below is a hook and has to be declared before it.
  const changeCount =
    Object.keys(draft.levels).length +
    Object.keys(draft.tabs).length +
    Object.keys(draft.personal).length +
    Object.keys(draft.groups).length +
    Object.keys(draft.notifications).length +
    (draft.superAdmin !== null ? 1 : 0);
  const dirty = changeCount > 0;

  /** Flash at someone trying to walk away mid-edit. */
  const nudge = () => toast.show({ message: 'Save or discard your changes first', tone: 'warn' });

  const backToRoles = () => {
    setSelectedId(null);
    setPageQuery('');
    setPeopleOpen(false);
    setError(null);
  };

  // A role's matrix is a view inside this route, so system back has to close
  // it — through the same unsaved-changes guard the header chevron uses, not
  // around it.
  useBackHandler(() => {
    if (!selectedId) return false;
    if (dirty) {
      nudge();
      return true;
    }
    backToRoles();
    return true;
  });

  if (isBlocked(matrixQuery) || !matrix) return <ScreenGate queries={[matrixQuery]} header={<ScreenHeader title="Roles & permissions" />} />;

  const { roles, sections, financeTabs, perms, tabPerms, groupRights, notificationCategories, notificationPerms, people } = matrix;
  const activePeople = people.filter((p) => p.active);
  const selectedRole = roles.find((r) => r.id === selectedId) ?? null;

  const savedSuper = isSuperTier(selectedRole?.tier ?? 0);
  const isSuperAdmin = draft.superAdmin ?? savedSuper;
  const locked = !canAdminister || isSuperAdmin;

  const holdersOf = (roleId: string) => activePeople.filter((p) => p.positionId === roleId);
  const holders = selectedRole ? holdersOf(selectedRole.id) : [];
  const labelOfRole = (positionId: string | null) => roles.find((r) => r.id === positionId)?.label ?? '';

  const savedLevel = (sectionId: string): AccessLevel => perms[selectedId ?? '']?.[sectionId] ?? 'none';
  const savedTabLevel = (tabId: string): AccessLevel => tabPerms[selectedId ?? '']?.[tabId] ?? 'none';
  // Opt-out default: a category with no row for this position is on, not off
  // — see 0114_notification_categories.sql's own header for why.
  const savedNotification = (categoryId: string): boolean => notificationPerms[selectedId ?? '']?.[categoryId] ?? true;
  const levelFor = (sectionId: string): AccessLevel =>
    isSuperAdmin ? 'edit' : draft.levels[sectionId] ?? savedLevel(sectionId);
  const tabLevelFor = (tabId: string): AccessLevel =>
    isSuperAdmin ? 'edit' : draft.tabs[tabId] ?? savedTabLevel(tabId);
  const personalFor = (section: SectionRow): boolean => draft.personal[section.id] ?? section.isPersonal;
  // No tier-4 short-circuit here, unlike Pages/Finance tabs/Chat groups —
  // notify()'s category gate is a plain per-position lookup with no special
  // case for super admin, so an admin really can switch one off for a tier-4
  // role and have it take effect. The switch shows the real row, not a fiction.
  const notificationFor = (categoryId: string): boolean => draft.notifications[categoryId] ?? savedNotification(categoryId);

  // Chat groups. `app_can_create_group()` short-circuits on tier 4, so a
  // super admin has both regardless of what its row says — the switches show
  // that rather than the row, the same way the page matrix reads as all-edit.
  const savedGroup = (capability: GroupCapability): boolean =>
    groupRights[selectedId ?? '']?.[capability] ?? false;
  const groupFor = (capability: GroupCapability): boolean =>
    isSuperAdmin ? true : (draft.groups[capability] ?? savedGroup(capability));

  const resetDraft = () => setDraft(EMPTY_DRAFT);

  /** Wrap anything that would throw the draft away. */
  const guard = (fn: () => void) => () => {
    if (dirty) {
      nudge();
      return;
    }
    fn();
  };

  /** Stage one edit, or drop it again if it lands back on the saved value. */
  function stage<K extends 'levels' | 'tabs' | 'personal' | 'notifications'>(
    bucket: K,
    key: string,
    value: RoleDraft[K][string],
    saved: RoleDraft[K][string],
  ) {
    setError(null);
    setDraft((d) => {
      const next = { ...d, [bucket]: { ...d[bucket] } } as RoleDraft;
      if (value === saved) delete next[bucket][key];
      else next[bucket][key] = value;
      return next;
    });
  }

  const setSectionLevel = (sectionId: string, level: AccessLevel) => {
    if (locked) return;
    stage('levels', sectionId, level, savedLevel(sectionId));
  };

  const setTabLevel = (tabId: string, level: AccessLevel) => {
    if (locked) return;
    stage('tabs', tabId, level, savedTabLevel(tabId));
  };

  const setNotificationCategory = (categoryId: string, value: boolean) => {
    if (locked) return;
    stage('notifications', categoryId, value, savedNotification(categoryId));
  };

  const setPersonal = (section: SectionRow, value: boolean) => {
    if (!canAdminister) return;
    stage('personal', section.id, value, section.isPersonal);
  };

  const setGroupCapability = (capability: GroupCapability, value: boolean) => {
    if (locked) return;
    setError(null);
    setDraft((d) => {
      const groups = { ...d.groups };
      if (value === savedGroup(capability)) delete groups[capability];
      else groups[capability] = value;
      return { ...d, groups };
    });
  };

  /** Every page at once — still only staged. */
  const setAll = (level: AccessLevel) => {
    if (locked) return;
    setDraft((d) => {
      const levels = { ...d.levels };
      for (const s of sections) {
        if (savedLevel(s.id) === level) delete levels[s.id];
        else levels[s.id] = level;
      }
      return { ...d, levels };
    });
  };

  /**
   * Super admin, as a switch at the end of the matrix. It is a tier, not a
   * permission row: tier 4 is what the database treats as unreducible, and a
   * trigger fills in every page and finance tab the moment a role reaches it.
   */
  const setSuperAdmin = (on: boolean) => {
    if (!canAdminister) return;
    setError(null);
    setDraft((d) => {
      const next: RoleDraft = { ...d, superAdmin: on === savedSuper ? null : on };
      // With super admin on, every page is granted whatever the switches say,
      // and the database would refuse a staged reduction outright. Drop them
      // rather than carry a pending change that cannot land.
      if (on) {
        next.levels = {};
        next.tabs = {};
        next.groups = {};
      }
      return next;
    });
  };

  // ---- The draft, as something to read -------------------------------------

  const diffs: DiffRow[] = [
    ...Object.entries(draft.levels).map(([id, to]) => {
      const from = savedLevel(id);
      return {
        key: `page:${id}`,
        kind: 'page' as const,
        name: sections.find((s) => s.id === id)?.label ?? id,
        group: 'Page access',
        from: LEVEL_LABEL[from],
        to: LEVEL_LABEL[to],
        removal: isDowngrade(from, to),
      };
    }),
    ...Object.entries(draft.tabs).map(([id, to]) => {
      const from = savedTabLevel(id);
      return {
        key: `tab:${id}`,
        kind: 'tab' as const,
        name: financeTabs.find((t) => t.id === id)?.label ?? id,
        group: 'Finance tab',
        from: LEVEL_LABEL[from],
        to: LEVEL_LABEL[to],
        removal: isDowngrade(from, to),
      };
    }),
    ...Object.entries(draft.personal).map(([id, to]) => ({
      key: `personal:${id}`,
      kind: 'personal' as const,
      name: sections.find((s) => s.id === id)?.label ?? id,
      group: 'Own records only',
      from: to ? 'off' : 'on',
      to: to ? 'on' : 'off',
      removal: to,
    })),
    ...Object.entries(draft.groups).map(([key, to]) => {
      const capability = GROUP_CAPABILITIES.find((c) => c.key === key);
      return {
        key: `group:${key}`,
        kind: 'group' as const,
        name: capability?.label ?? key,
        group: 'Chat groups',
        from: to ? 'off' : 'on',
        to: to ? 'on' : 'off',
        removal: !to,
      };
    }),
    ...Object.entries(draft.notifications).map(([id, to]) => ({
      key: `notification:${id}`,
      kind: 'notification' as const,
      name: notificationCategories.find((c) => c.id === id)?.label ?? id,
      group: 'Notifications',
      from: to ? 'off' : 'on',
      to: to ? 'on' : 'off',
      removal: !to,
    })),
    ...(draft.superAdmin !== null
      ? [
          {
            key: 'super',
            kind: 'super' as const,
            name: 'Super admin',
            group: 'Tier',
            from: draft.superAdmin ? 'off' : 'on',
            to: draft.superAdmin ? 'on' : 'off',
            removal: !draft.superAdmin,
          },
        ]
      : []),
  ];

  const draftCounts = countLevels(sections, levelFor, isSuperAdmin);

  // ---- Committing ----------------------------------------------------------

  const handleApply = () => {
    if (!selectedRole || !canAdminister || !dirty) return;
    setError(null);
    saveDraft.mutate(
      {
        roleId: selectedRole.id,
        draft,
        roleLabel: selectedRole.label,
        holders: holders.map((h) => h.name),
        changeCount,
      },
      {
        onSuccess: () => {
          resetDraft();
          setReviewOpen(false);
          toast.show({ message: `Access updated for ${selectedRole.label}`, tone: 'ok' });
        },
        // The draft stays put, so nothing is lost and the save can be retried.
        onError: (err) => setError(messageOf(err)),
      },
    );
  };

  const askApply = () => {
    // Dropping super admin is destructive in a way worth stopping on, and it
    // cannot un-grant what tier 4 already handed out.
    if (draft.superAdmin === false && selectedRole) {
      setReviewOpen(false);
      setConfirm({
        title: `Remove super admin from ${selectedRole.label}?`,
        body: 'It keeps edit on every page it was given — those switches simply become editable again, so turn off whatever it shouldn’t have. Its record scope drops to own records.',
        confirmLabel: 'Remove',
        run: handleApply,
        restore: 'review',
      });
      return;
    }
    handleApply();
  };

  const handleDiscard = () => {
    resetDraft();
    setReviewOpen(false);
    setError(null);
    toast.show({ message: 'Changes discarded', tone: 'bad' });
  };

  // ---- The role itself -----------------------------------------------------

  const submitRole = (fields: RoleFields) => {
    setError(null);
    const mutation = editor === 'edit' ? updateRole : createRole;
    mutation.mutate(fields, {
      onSuccess: () => {
        setEditor(null);
        if (editor === 'new') setSelectedId(fields.id);
        toast.show({ message: editor === 'edit' ? 'Role saved' : `${fields.label} created`, tone: 'ok' });
      },
      onError: (err) => setError(messageOf(err)),
    });
  };

  const askDeleteRole = () => {
    if (!selectedRole) return;
    setEditor(null);
    setConfirm({
      title: `Delete ${selectedRole.label}?`,
      body: 'Its permissions go with it. Anyone who held it would hold no role at all.',
      confirmLabel: 'Delete',
      restore: 'editor',
      run: () => {
        deleteRole.mutate(selectedRole.id, {
          onSuccess: () => {
            setEditor(null);
            setSelectedId(null);
            toast.show({ message: `${selectedRole.label} deleted`, tone: 'bad' });
          },
          onError: (err) => setError(messageOf(err)),
        });
      },
    });
  };

  // ---- People, written as you go -------------------------------------------

  const movePerson = (person: PersonRow, positionId: string | null, done: string) => {
    setBusyPersonId(person.id);
    setPersonRole.mutate(
      { personId: person.id, positionId, personName: person.name },
      {
        onSuccess: () => toast.show({ message: done, tone: 'ok' }),
        onError: (err) => toast.show({ message: messageOf(err), tone: 'bad' }),
        onSettled: () => setBusyPersonId(null),
      },
    );
  };

  const addPerson = (person: PersonRow) => {
    if (!selectedRole || !canManagePeople) return;
    const current = labelOfRole(person.positionId);
    const apply = () => movePerson(person, selectedRole.id, `${person.name} → ${selectedRole.label}`);
    if (current) {
      setPeopleOpen(false);
      setConfirm({
        title: `Move ${person.name}?`,
        body: `They hold “${current}”. Moving them to “${selectedRole.label}” replaces it — a person holds one role.`,
        confirmLabel: 'Move',
        tone: 'primary',
        run: apply,
        restore: 'people',
      });
      return;
    }
    apply();
  };

  const removePerson = (person: PersonRow) => {
    if (!selectedRole || !canManagePeople) return;
    setPeopleOpen(false);
    setConfirm({
      title: `Take ${person.name} out of ${selectedRole.label}?`,
      body: 'They will hold no role, which means no access to any screen until you give them one.',
      confirmLabel: 'Remove',
      run: () => movePerson(person, null, `${person.name} has no role`),
      restore: 'people',
    });
  };

  /**
   * Put back whichever sheet stepped aside to ask the question. The role
   * editor is the exception on the way through: a confirmed delete takes the
   * role with it, so there is nothing left to edit.
   */
  const restoreAfterConfirm = (pending: PendingConfirm | null, cancelled: boolean) => {
    if (pending?.restore === 'review') setReviewOpen(true);
    else if (pending?.restore === 'people') setPeopleOpen(true);
    else if (pending?.restore === 'editor' && cancelled) setEditor('edit');
  };

  const confirmSheet = (
    <ConfirmSheet
      visible={!!confirm}
      title={confirm?.title ?? ''}
      body={confirm?.body ?? ''}
      confirmLabel={confirm?.confirmLabel ?? 'Confirm'}
      tone={confirm?.tone}
      busy={saveDraft.isPending || deleteRole.isPending}
      onCancel={() => {
        const pending = confirm;
        setConfirm(null);
        restoreAfterConfirm(pending, true);
      }}
      onConfirm={() => {
        const pending = confirm;
        setConfirm(null);
        haptics.committed();
        pending?.run();
        // The action is in flight; whatever it does on success (closing the
        // review sheet, dropping the selected role) lands after this.
        restoreAfterConfirm(pending, false);
      }}
    />
  );

  // ---- The roles rail ------------------------------------------------------

  if (!selectedRole) {
    return (
      <View style={[styles.flex, { backgroundColor: theme.background }]}>
        <ScreenHeader
          title="Roles & permissions"
          subtitle={`${roles.length} roles · ${sections.length} pages`}
          rightSlot={
            canAdminister ? (
              <Pressable
                onPress={() => {
                  setError(null);
                  setEditor('new');
                }}
                style={[
                  styles.addButton,
                  {
                    backgroundColor: theme.accent,
                    boxShadow: theme.scheme === 'light' ? '0 6px 16px -10px rgba(20,122,87,0.9)' : undefined,
                  },
                ]}
              >
                <Icon name="plus" size={18} color={theme.accentText} />
              </Pressable>
            ) : (
              <HeaderAccount size="sm" />
            )
          }
        />
        <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
          <PermissionNotice
            section="admin-panel"
            message="View only — you can see how roles are configured, but only roles with edit access to the Admin Panel can change them."
          />
          <Text style={[styles.lede, { color: theme.textSecondary }]}>
            Access belongs to the role, not the person. Change a role and everyone holding it changes with it.
          </Text>
          <RoleList
            roles={roles}
            query={roleQuery}
            onQueryChange={setRoleQuery}
            countsFor={(r) =>
              countLevels(sections, (id) => perms[r.id]?.[id] ?? 'none', isSuperTier(r.tier))
            }
            holdersFor={(id) => holdersOf(id).length}
            sectionCount={sections.length}
            peopleCount={activePeople.filter((p) => p.positionId).length}
            onPick={(id) => {
              setSelectedId(id);
              setPageQuery('');
              setError(null);
            }}
          />
        </ScrollView>

        <RoleEditorSheet
          visible={editor === 'new'}
          onClose={() => setEditor(null)}
          role={null}
          existingIds={roles.map((r) => r.id)}
          holderCount={0}
          busy={createRole.isPending}
          error={error}
          onSubmit={submitRole}
          onDelete={askDeleteRole}
        />
        {confirmSheet}
      </View>
    );
  }

  // ---- One role's matrix ---------------------------------------------------

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <ScreenHeader
        title={selectedRole.label}
        subtitle={`${holders.length} ${holders.length === 1 ? 'person' : 'people'} · ${
          isSuperAdmin ? 'all pages' : `${draftCounts.edit} edit · ${draftCounts.view} view`
        }`}
        onBack={guard(backToRoles)}
        rightSlot={
          canAdminister && !isSuperAdmin ? (
            <Pressable
              onPress={guard(() => {
                setError(null);
                setEditor('edit');
              })}
              style={[styles.editButton, { borderColor: theme.border, backgroundColor: theme.surface }]}
            >
              <Icon name="edit-2" size={13} color={theme.textPrimary} />
            </Pressable>
          ) : undefined
        }
      />

      <ScrollView ref={scrollRef} contentContainerStyle={[styles.content, dirty ? styles.contentDirty : null]}>
        <PermissionNotice
          section="admin-panel"
          message="View only — you can see how this role is configured, but only roles with edit access to the Admin Panel can change it."
        />

        <RoleSummaryCard
          role={selectedRole}
          counts={draftCounts}
          isSuperAdmin={isSuperAdmin}
          dirty={dirty}
          changeCount={changeCount}
          holders={holders}
          onOpenPeople={() => setPeopleOpen(true)}
        />

        <PagesCard
          sections={sections}
          query={pageQuery}
          onQueryChange={setPageQuery}
          levelFor={levelFor}
          isChanged={(id) => draft.levels[id] !== undefined}
          personalFor={personalFor}
          isPersonalChanged={(id) => draft.personal[id] !== undefined}
          onLevel={setSectionLevel}
          onPersonal={canAdminister ? setPersonal : undefined}
          onSetAll={setAll}
          locked={locked}
          isSuperAdmin={isSuperAdmin}
          superAdminChanged={draft.superAdmin !== null}
          canToggleSuperAdmin={canAdminister}
          onSuperAdmin={setSuperAdmin}
        />

        <FinanceTabsCard
          tabs={financeTabs}
          levelFor={tabLevelFor}
          isChanged={(id) => draft.tabs[id] !== undefined}
          onLevel={setTabLevel}
          locked={locked}
        />

        <ChatGroupsCard
          valueFor={groupFor}
          isChanged={(capability) => draft.groups[capability] !== undefined}
          onToggle={setGroupCapability}
          locked={locked}
          isSuperAdmin={isSuperAdmin}
        />

        <NotificationsCard
          categories={notificationCategories}
          valueFor={notificationFor}
          isChanged={(id) => draft.notifications[id] !== undefined}
          onToggle={setNotificationCategory}
          locked={locked}
        />

        <View style={[styles.noteCard, { backgroundColor: theme.surfaceRaised, borderColor: theme.border }]}>
          <Text style={[styles.noteTitle, { color: theme.textPrimary }]}>How this applies</Text>
          <Text style={[styles.noteBody, { color: theme.textSecondary }]}>
            These switches are the rows the database itself reads — a saved change binds on the next request,
            including for anyone already signed in.{'\n'}
            The app&apos;s own menus catch up when the person next opens it.{'\n'}
            A person holds one role; there are no individual overrides.
          </Text>
        </View>
      </ScrollView>

      {dirty ? (
        <DirtyBar
          count={changeCount}
          roleLabel={selectedRole.label}
          peopleCount={holders.length}
          onDiscard={handleDiscard}
          onReview={() => setReviewOpen(true)}
        />
      ) : null}

      <ReviewSheet
        visible={reviewOpen && dirty}
        onClose={() => setReviewOpen(false)}
        roleLabel={selectedRole.label}
        holderCount={holders.length}
        diffs={diffs}
        applying={saveDraft.isPending}
        error={error}
        onApply={askApply}
      />

      <PeopleSheet
        visible={peopleOpen}
        onClose={() => setPeopleOpen(false)}
        role={selectedRole}
        holders={holders}
        candidates={activePeople.filter((p) => p.positionId !== selectedRole.id)}
        roleLabel={labelOfRole}
        canManage={canManagePeople}
        busyPersonId={busyPersonId}
        onAdd={addPerson}
        onRemove={removePerson}
      />

      <RoleEditorSheet
        visible={editor === 'edit'}
        onClose={() => setEditor(null)}
        role={selectedRole}
        existingIds={roles.map((r) => r.id)}
        holderCount={holders.length}
        busy={updateRole.isPending || deleteRole.isPending}
        error={error}
        onSubmit={submitRole}
        onDelete={askDeleteRole}
      />

      {confirmSheet}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 20, paddingTop: 14, paddingBottom: 40, gap: 16 },
  contentDirty: { paddingBottom: 120 },
  lede: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 13 * 1.55, paddingHorizontal: 2 },
  addButton: { width: 36, height: 36, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  editButton: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteCard: { borderRadius: radii.lg, borderWidth: 1, padding: 15, gap: 6 },
  noteTitle: { fontFamily: fontFamily.semibold, fontSize: 13 },
  noteBody: { fontFamily: fontFamily.mono, fontSize: 11, lineHeight: 11 * 1.65 },
});
