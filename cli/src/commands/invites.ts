import { Command } from 'commander';
import { api } from '../client.js';
import { json, table } from '../output.js';
import { resolveIdFromItems } from '../utils.js';
import { autoDetectProject } from './projects.js';

interface ProjectInvite {
  id: string;
  email: string;
  role: string;
  status: string;
  invited_by: string;
  created_at: string;
}

interface InviteResult {
  status: 'added' | 'invited';
  user_id?: string;
  invite_code?: string;
}

interface ClaimResult {
  claimed: boolean;
  role?: string;
}

export function registerInvites(program: Command): void {
  const invites = program.command('invite').alias('invites').description('Manage project invites');

  invites
    .command('list')
    .description('List pending invites')
    .argument('[project]', 'Project ID or slug')
    .option('--project <id>', 'Project ID or slug')
    .option('--json', 'JSON output')
    .action(async (project, opts) => {
      const pid = await autoDetectProject(opts.project ?? project);
      const data = await api<ProjectInvite[]>('GET', `/projects/${pid}/invites`);
      if (opts.json) return json(data);
      table(data, ['id', 'email', 'role', 'status', 'created_at']);
    });

  invites
    .command('create')
    .description('Invite a user to a project by email')
    .requiredOption('--project <id>', 'Project ID or slug')
    .requiredOption('--email <email>', 'Email address')
    .requiredOption('--role <role>', 'Role (owner/editor/viewer)')
    .option('--json', 'JSON output')
    .action(async (opts) => {
      const pid = await autoDetectProject(opts.project);
      const data = await api<InviteResult>('POST', `/projects/${pid}/invite`, {
        email: opts.email,
        role: opts.role,
      });
      if (opts.json) return json(data);
      console.log(`Invite result: ${data.status}`);
      if (data.user_id) console.log(`User ID: ${data.user_id}`);
      if (data.invite_code) console.log(`Invite Code: ${data.invite_code}`);
    });

  invites
    .command('cancel')
    .description('Cancel a pending invite')
    .argument('<id>', 'Invite ID or email')
    .requiredOption('--project <id>', 'Project ID or slug')
    .option('--json', 'JSON output')
    .action(async (id, opts) => {
      const pid = await autoDetectProject(opts.project);
      const inviteId = await resolveInviteId(id, pid);
      await api('DELETE', `/projects/${pid}/invites/${inviteId}`);
      const result = { id: inviteId, deleted: true };
      if (opts.json) return json(result);
      console.log(`Cancelled invite: ${inviteId}`);
    });

  invites
    .command('claim')
    .description('Claim any pending invite for the current user')
    .requiredOption('--project <id>', 'Project ID or slug')
    .option('--json', 'JSON output')
    .action(async (opts) => {
      const pid = await autoDetectProject(opts.project);
      const data = await api<ClaimResult>('POST', `/projects/${pid}/claim-invite`);
      if (opts.json) return json(data);
      console.log(data.claimed ? `Claimed invite as ${data.role}` : 'No pending invite to claim');
    });
}

async function resolveInviteId(id: string, project: string): Promise<string> {
  const invites = await api<ProjectInvite[]>('GET', `/projects/${project}/invites`);
  return resolveIdFromItems(id, invites, {
    label: 'Invite',
    fields: ['id', 'email'],
    formatter: (invite) => `${invite.id}  ${invite.email}  ${invite.role}`,
    caseInsensitive: true,
  });
}
