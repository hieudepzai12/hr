'use client';
import useFeedback from '@/lib/useFeedback';
import { useState } from 'react';
import Image from 'next/image';
import otisLogo from '../../../public/logo-otisminhchau2.png';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from 'lucide-react';

const fieldClass='h-12 w-full rounded-lg border border-slate-200 bg-[#f8fafc] pl-11 text-base text-ink outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 aria-invalid:border-red-500 aria-invalid:bg-red-50 aria-invalid:focus:border-red-500 aria-invalid:focus:ring-red-500/10 disabled:opacity-60';

export default function LoginPage() {
  const [fieldErrors,setFieldErrors]=useState({});
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [showPassword,setShowPassword]=useState(false);
  const [error,setError]=useFeedback('error');
  const {login,loading}=useAuth();
  const router=useRouter();
  const handleSubmit=async event=>{
    event.preventDefault();
    if(loading)return;
    setError('');
    const issues={
      email:!email.trim()?'Vui lòng nhập email đăng nhập.':event.currentTarget.elements.email.validity.typeMismatch?'Email không đúng định dạng.':'',
      password:!password?'Vui lòng nhập mật khẩu.':'',
    };
    setFieldErrors(issues);
    if(issues.email||issues.password){event.currentTarget.elements[issues.email?'email':'password'].focus();return;}
    const result=await login(email.trim(),password);
    if(result.success)router.replace('/');
    else setError(result.error);
  };

  return <main className="login-scene relative isolate flex min-h-dvh items-center justify-center overflow-hidden bg-[#102944] px-4 py-10 sm:px-6" style={{backgroundImage:'radial-gradient(ellipse at 15% 15%, #187eb0 0%, transparent 50%), radial-gradient(ellipse at 90% 90%, #176f87 0%, transparent 45%), linear-gradient(135deg, #102944, #163e65 55%, #102944)'}}>
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="login-glow login-glow--blue"/>
      <div className="login-glow login-glow--teal"/>
      <div className="login-orbit"><span/><span/></div>
      <div className="login-orbit login-orbit--secondary"><span/><span/></div>
      <svg className="absolute inset-0 h-full w-full opacity-25" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" fill="none">
        <path d="M-120 650C180 250 300 950 620 640S1160 100 1560 260M-80 710C220 310 340 1010 660 700S1200 160 1600 320" stroke="url(#login-line)" strokeWidth="1"/>
        <defs><linearGradient id="login-line" x1="0" y1="0" x2="1440" y2="900" gradientUnits="userSpaceOnUse"><stop stopColor="#71d9ff"/><stop offset=".5" stopColor="#71d9ff" stopOpacity="0"/><stop offset="1" stopColor="#92f5dc"/></linearGradient></defs>
      </svg>
      <div className="absolute -left-48 -top-48 h-[640px] w-[640px] rounded-full border border-white/10 p-16"><div className="h-full w-full rounded-full border border-white/10 p-16"><div className="h-full w-full rounded-full border border-white/10"/></div></div>
      <div className="absolute -bottom-64 -right-48 h-[720px] w-[720px] rounded-full border-[80px] border-white/[0.035]"/>
      <div className="absolute inset-0 opacity-[0.12]" style={{backgroundImage:'radial-gradient(#b9dafa 1px, transparent 1px)',backgroundSize:'28px 28px',maskImage:'linear-gradient(to right, black, transparent 40%, transparent 60%, black)'}}/>
    </div>
    <section aria-labelledby="login-title" className="login-entrance relative w-full max-w-[420px]">
      <div className="mb-7 flex flex-col items-center text-center">
        <div className="login-logo rounded-2xl bg-white p-3 shadow-lg"><Image src={otisLogo} alt="Logo OTIS Minh Châu" width={76} height={76} sizes="76px" priority className="h-[76px] w-[76px] object-contain"/></div>
        <p className="mt-5 text-xs font-semibold uppercase tracking-[.18em] text-blue-100">Hệ thống quản trị nội bộ</p>
      </div>
      <div className="login-card relative overflow-hidden rounded-2xl border border-white bg-white px-6 py-7 shadow-[0_24px_64px_-16px_rgba(0,0,0,.4)] sm:px-8 sm:py-8">
        <h1 id="login-title" className="mb-7 text-center text-2xl font-semibold tracking-tight text-[#142c4c]">Đăng nhập</h1>
        <form noValidate onSubmit={handleSubmit} className="space-y-5" aria-busy={loading}>
          <div><label htmlFor="login-email" className="mb-2 block text-sm font-medium text-ink">Email đăng nhập</label><div className="relative"><Mail size={18} aria-hidden="true" className="pointer-events-none absolute left-4 top-4 text-slate-400"/><input id="login-email" name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required disabled={loading} value={email} onChange={event=>{setEmail(event.target.value);setFieldErrors(current=>({...current,email:''}));}} aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email?'login-email-error':undefined} placeholder="Nhập email của bạn" className={fieldClass+' pr-4'}/></div>{fieldErrors.email&&<p id="login-email-error" role="alert" className="mt-2 text-sm text-red-600">{fieldErrors.email}</p>}</div>
          <div><label htmlFor="login-password" className="mb-2 block text-sm font-medium text-ink">Mật khẩu</label><div className="relative"><LockKeyhole size={18} aria-hidden="true" className="pointer-events-none absolute left-4 top-4 text-slate-400"/><input id="login-password" name="password" type={showPassword?'text':'password'} autoComplete="current-password" required disabled={loading} value={password} onChange={event=>{setPassword(event.target.value);setFieldErrors(current=>({...current,password:''}));}} aria-invalid={Boolean(fieldErrors.password)} aria-describedby={fieldErrors.password?'login-password-error':undefined} placeholder="Nhập mật khẩu" className={fieldClass+' pr-12'}/><button type="button" onClick={()=>setShowPassword(current=>!current)} aria-label={showPassword?'Ẩn mật khẩu':'Hiện mật khẩu'} aria-pressed={showPassword} aria-controls="login-password" className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-ink focus-ring">{showPassword?<EyeOff size={18}/>:<Eye size={18}/>}</button></div>{fieldErrors.password&&<p id="login-password-error" role="alert" className="mt-2 text-sm text-red-600">{fieldErrors.password}</p>}</div>
          {error&&<p role="alert" className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={loading} className="login-submit relative overflow-hidden flex h-12 w-full items-center justify-center gap-3 rounded-lg bg-[#244b80] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#193b69] focus-ring disabled:cursor-wait disabled:opacity-65">{loading?<><LoaderCircle size={18} className="animate-spin motion-reduce:animate-none" aria-hidden="true"/>Đang đăng nhập…</>:<>Đăng nhập<ArrowRight size={18} aria-hidden="true"/></>}</button>
        </form>
      </div>
      <p className="mt-6 text-center text-xs tracking-widest text-blue-100/70">OTIS MINH CHÂU</p>
    </section>
  </main>;
}
