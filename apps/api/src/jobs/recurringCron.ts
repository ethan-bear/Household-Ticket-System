import cron from 'node-cron';
import { generateDueInstances } from '../services/recurringService';

/**
 * Daily cron: runs at 6:00 AM every day
 * Generates ticket instances for active recurring templates.
 */
export function startRecurringCron(): void {
  cron.schedule('0 6 * * *', async () => {
    console.log('[RecurringCron] Running daily instance generation...');
    try {
      const count = await generateDueInstances();
      console.log(`[RecurringCron] Generated ${count} ticket instance(s)`);
    } catch (err) {
      console.error('[RecurringCron] Error:', err);
    }
  });

  console.log('[RecurringCron] Scheduled daily at 06:00');
}
