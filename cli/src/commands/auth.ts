import { Command } from 'commander';
import { api } from '../client.js';
import { json } from '../output.js';

interface Membership {
  org_id: string;
  role: string;
}

interface AuthMe {
  user_id: string;
  email: string;
  org_id: string;
  role: string;
  memberships?: Membership[];
}

export function registerAuth(program: Command): void {
  const auth = program.command('auth').description('Inspect authentication context');

  auth
    .command('me')
    .description('Show the authenticated user identity')
    .option('--json', 'JSON output')
    .action(async (opts) => {
      const data = await api<AuthMe>('GET', '/auth/me');
      if (opts.json) return json(data);
      console.log(`User: ${data.user_id}`);
      console.log(`Email: ${data.email}`);
      console.log(`Org: ${data.org_id}`);
      console.log(`Role: ${data.role}`);
      if (Array.isArray(data.memberships) && data.memberships.length > 0) {
        console.log('Memberships:');
        for (const membership of data.memberships) {
          console.log(`  ${membership.org_id}  ${membership.role}`);
        }
      }
    });
}
