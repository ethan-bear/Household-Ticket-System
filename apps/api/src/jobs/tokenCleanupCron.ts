import cron from 'node-cron';
import { prisma } from '../lib/prisma';

/**
 * Daily cron: runs at 2:00 AM every day
 * Cleans up expired RevokedToken rows to keep the table lean.
 */
export function startTokenCleanupCron(): void {
  cron.schedule('0 2 * * *', async () => {
    console.log('[TokenCleanup] Cleaning up expired revoked tokens...');
    try {
      const result = await prisma.revokedToken.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      console.log(`[TokenCleanup] Deleted ${result.count} expired token(s)`);
    } catch (err) {
      console.error('[TokenCleanup] Error:', err);
    }
  });

  console.log('[TokenCleanup] Scheduled daily at 02:00');
}
