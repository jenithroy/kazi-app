/**
 * Data-source selector for the tasks module.
 *   reads  → Supabase when configured (a failed read throws; no mock fallback)
 *   writes → Supabase when configured, mirrored into the mock (see `liveWrite`)
 *
 * Live writes hit the reference ERP's own `tasks` collection, and the list is
 * invalidated on settle: the board column a task ends up in is resolved from
 * `task_columns` inside the write, so the row has to be read back.
 */

import { isSupabaseConfigured } from '@/lib/supabase';
import { liveRead } from '@/lib/supabase/read';
import { liveWrite } from '@/lib/supabase/write';

import * as live from './supabase';
import * as writeLive from './supabase-write';
import * as mock from './mock-api';

export const fetchTasks = isSupabaseConfigured
  ? liveRead('tasks', live.fetchTasks)
  : mock.fetchTasks;

// The assignee picker is the live Employee Directory — falling back to the
// mock roster is fine, it just means a denied read shows stand-in names.
export const fetchAssignees = isSupabaseConfigured
  ? liveRead('tasks/assignees', live.fetchAssignees)
  : mock.fetchAssignees;

export const saveTask = liveWrite('tasks/saveTask', writeLive.saveTask, mock.saveTask);
export const deleteTask = liveWrite('tasks/deleteTask', writeLive.deleteTask, mock.deleteTask);
export const restoreTask = liveWrite('tasks/restoreTask', writeLive.restoreTask, mock.restoreTask);
