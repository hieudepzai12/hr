import { withAuth } from '@/lib/auth';
import { detailGovernance, mutateGovernance } from '@/lib/governance-service';
import { governanceResponse } from '@/lib/governance-response';
export const GET = withAuth(async (req,{params},user)=>governanceResponse(async()=>{const {resource,id}=await params;return detailGovernance(resource,id,user);}));
export const PUT = withAuth(async (req,{params},user)=>governanceResponse(async()=>{const {resource,id}=await params;return mutateGovernance(resource,id,await req.json().catch(()=>null),user);}));
export const PATCH = withAuth(async (req,{params},user)=>governanceResponse(async()=>{const {resource,id}=await params;return mutateGovernance(resource,id,await req.json().catch(()=>null),user,'transition');}));
export const DELETE = withAuth(async (req,{params},user)=>governanceResponse(async()=>{const {resource,id}=await params;return mutateGovernance(resource,id,{...await req.json().catch(()=>({})),action:'delete'},user,'delete');}));
