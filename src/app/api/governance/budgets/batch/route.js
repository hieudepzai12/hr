import { withAuth } from '@/lib/auth';
import { createBudgetBatch } from '@/lib/governance-service';
import { governanceResponse } from '@/lib/governance-response';

export const POST = withAuth(async (req,ctx,user) => governanceResponse(
  () => req.json().catch(()=>null).then(body=>createBudgetBatch(body,user)),201,
));
