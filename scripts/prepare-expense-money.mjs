import { copyFileSync } from 'node:fs';

// Publish the same pure allocation function used by the server.
copyFileSync(new URL('../tgcloud/lib/money.js', import.meta.url), new URL('../web/expense-money.js', import.meta.url));
