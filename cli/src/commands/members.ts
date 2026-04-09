import { Command } from 'commander';
import { api } from '../client.js';
import { json, table } from '../output.js';
import { resolveIdFromItems } from '../utils.js';
import { autoDetectProject } from './projects.js';

interface ProjectMember {
  id: string;
  user_id: string;
  email: string | null;
  role: string;
  invited_by: string | null;
  created_at: string;
}

interface ProjectRoleResponse {
  role: string;
}

interface OrgMember {
  user_id: string;
  email: string;
  display_name: string | null;
  role: string;
}

export function registerMembers(program: Command): void {
  const members = program.command('member').alias('members').description('Manage project members');

  members
    .command('list')
    .description('List project members')
    .argument('[project]', 'Project ID or slug')
    .option('--project <id>', 'Project ID or slug')
    .option('--json', 'JSON output')
    .action(async (project, opts) => {
      const pid = await autoDetectProject(opts.project ?? project);
      const data = await api<ProjectMember[]>('GET', `/projects/${pid}/members`);
      if (opts.json) return json(data);
      table(data, ['id', 'user_id', 'email', 'role', 'created_at']);
    });

  members
    .command('add')
    .description('Add a member to a project')
    .requiredOption('--project <id>', 'Project ID or slug')
    .requiredOption('--user <id>', 'User ID')
    .requiredOption('--role <role>', 'Role (owner/editor/viewer)')
    .option('--email <email>', 'User email')
    .option('--json', 'JSON output')
    .action(async (opts) => {
      const pid = await autoDetectProject(opts.project);
      const data = await api<ProjectMember>('POST', `/projects/${pid}/members`, {
        user_id: opts.user,
        role: opts.role,
        ...(opts.email && { email: opts.email }),
      });
      if (opts.json) return json(data);
      console.log(`Added project member: ${data.id} (${data.role})`);
    });

  members
    .command('update')
    .description('Update a project member role')
    .argument('<id>', 'Member ID, user ID, or email')
    .requiredOption('--role <role>', 'Role (owner/editor/viewer)')
    .option('--project <id>', 'Project ID or slug (used to resolve non-UUID identifiers)')
    .option('--json', 'JSON output')
    .action(async (id, opts) => {
      const memberId = await resolveMemberId(id, opts.project);
      const data = await api<ProjectMember>('PATCH', `/project-members/${memberId}`, {
        role: opts.role,
      });
      if (opts.json) return json(data);
      console.log(`Updated project member: ${data.id} (${data.role})`);
    });

  members
    .command('remove')
    .description('Remove a project member')
    .argument('<id>', 'Member ID, user ID, or email')
    .option('--project <id>', 'Project ID or slug (used to resolve non-UUID identifiers)')
    .option('--json', 'JSON output')
    .action(async (id, opts) => {
      const memberId = await resolveMemberId(id, opts.project);
      await api('DELETE', `/project-members/${memberId}`);
      const result = { id: memberId, deleted: true };
      if (opts.json) return json(result);
      console.log(`Removed project member: ${memberId}`);
    });

  members
    .command('my-role')
    .description('Show your effective role on a project')
    .requiredOption('--project <id>', 'Project ID or slug')
    .option('--json', 'JSON output')
    .action(async (opts) => {
      const pid = await autoDetectProject(opts.project);
      const data = await api<ProjectRoleResponse>('GET', `/projects/${pid}/my-role`);
      if (opts.json) return json(data);
      console.log(`Role: ${data.role}`);
    });

  const orgMembers = program
    .command('org-member')
    .alias('org-members')
    .description('Search org members');

  orgMembers
    .command('search')
    .description('Search for org members')
    .argument('<query>', 'Search query')
    .option('--json', 'JSON output')
    .action(async (query, opts) => {
      const data = await api<{ data: OrgMember[] }>('GET', `/org-members/search?q=${encodeURIComponent(query)}`);
      if (opts.json) return json(data);
      table(data.data ?? [], ['user_id', 'email', 'display_name', 'role']);
    });
}

async function resolveMemberId(id: string, project?: string): Promise<string> {
  if (!project) {
    return id;
  }

  const pid = await autoDetectProject(project);
  const members = await api<ProjectMember[]>('GET', `/projects/${pid}/members`);
  return resolveIdFromItems(id, members, {
    label: 'Member',
    fields: ['id', 'user_id', 'email'],
    formatter: (member) => `${member.id}  ${member.user_id}  ${member.email ?? ''}  ${member.role}`,
    caseInsensitive: true,
  });
}
