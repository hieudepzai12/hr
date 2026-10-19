import { withAuth } from '@/lib/auth';
import { listGovernance, governanceOptions, mutateGovernance } from '@/lib/governance-service';
import { governanceResponse } from '@/lib/governance-response';
export const GET = withAuth(async (req, { params }, user) => governanceResponse(async () => {
  const { resource } = await params;
  const search = new URL(req.url).searchParams;
  return search.get('options') === '1' ? governanceOptions(resource,user) : listGovernance(resource,search,user);
}));
export const POST = withAuth(async (req, { params }, user) => governanceResponse(async () => {
  const { resource } = await params;
  return mutateGovernance(resource,null,await req.json().catch(()=>null),user);
},201));
