import { Command } from 'commander';
import { api } from '../client.js';
import { json } from '../output.js';

interface Health {
  status: string;
  timestamp: string;
  db: {
    connected: boolean;
    version?: string;
    error?: string;
  };
}

export function registerHealth(program: Command): void {
  program
    .command('health')
    .description('Check Eden API health')
    .option('--json', 'JSON output')
    .action(async (opts) => {
      const data = await api<Health>('GET', '/health');
      if (opts.json) return json(data);
      console.log(`Status: ${data.status}`);
      console.log(`Timestamp: ${data.timestamp}`);
      console.log(`DB Connected: ${data.db.connected}`);
      if (data.db.version) console.log(`DB Version: ${data.db.version}`);
      if (data.db.error) console.log(`DB Error: ${data.db.error}`);
    });
}
