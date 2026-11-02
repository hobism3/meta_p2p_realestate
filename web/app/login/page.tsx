"use client";

import {useEffect,useState,type FormEvent} from "react";
import {clearAccessToken,getAccessToken,setAccessToken} from "../../lib/client-auth";
import {safeAuthDestination} from "../../lib/auth-return";
import {useUiLocale} from "../../lib/ui-locale";

type Mode = "login"|"signup"|"recover";
type Me = {userId:string;name:string;mode:string};
type AuthResponse = {error?:string;access_token?:string;requiresConfirmation?:boolean;message?:string};
function destination():string {
  if(typeof window==="undefined")return "/";
  return safeAuthDestination(new URLSearchParams(window.location.search).get("next"));
}
export default function LoginPage(){
  const {tr,en}=useUiLocale();
  const [mode,setMode]=useState<Mode>("login");
  const [email,setEmail]=useState(""),[name,setName]=useState("");
  const [password,setPassword]=useState(""),[confirm,setConfirm]=useState("");
  const [me,setMe]=useState<Me|null>(null);
  const [error,setError]=useState(""),[notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false),[showPassword,setShowPassword]=useState(false);
  const [hydrated,setHydrated]=useState(false);
  const [nextPath,setNextPath]=useState("/");
  const loadMe=async()=>{
    const token=getAccessToken();
    if(!token){setMe(null);return;}
    try{
      const r=await fetch("/api/auth/me",{headers:{Authorization:`Bearer ${token}`},cache:"no-store"});
      if(!r.ok){setMe(null);clearAccessToken();return;}
      setMe((await r.json()) as Me);
    }catch{setMe(null);}
  };
  useEffect(()=>{
    const q=new URLSearchParams(window.location.search).get("mode");
    if(q==="signup"||q==="recover")setMode(q);
    setNextPath(destination());
    const e=new URLSearchParams(window.location.search).get("error");
    if(e==="unconfigured")setError("서버 인증 미설정입니다. 관리자에게 문의하세요.");
    else if(e==="provider")setError("지원하지 않는 로그인 방식입니다.");
    else if(e)setError("로그인 과정에서 오류가 발생했습니다.");
    void loadMe();
    setHydrated(true);
  },[]);
  const switchMode=(m:Mode)=>{setMode(m);setError("");setNotice("");setPassword("");setConfirm("");};
  const submit=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();
    if(busy)return;
    setError("");setNotice("");
    if(!email.trim()){setError("이메일을 입력해주세요.");return;}
    if(mode==="signup"){
      if(name.trim().length<2){setError("이름을 2자 이상 입력해주세요.");return;}
      if(password.length<10||!/[A-Za-z]/.test(password)||!/[0-9]/.test(password)){
        setError("비밀번호는 영문과 숫자를 포함해 10자 이상 입력해주세요.");return;
      }
      if(password!==confirm){setError("비밀번호 확인이 일치하지 않습니다.");return;}
    }else if(mode==="login"&&!password){setError("비밀번호를 입력해주세요.");return;}
    setBusy(true);
    try{
      const endpoint=mode==="signup"?"/api/auth/signup":mode==="recover"?"/api/auth/recover":"/api/auth/login";
      const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify(mode==="signup"?{email:email.trim(),password,name:name.trim()}:
          mode==="recover"?{email:email.trim()}:{email:email.trim(),password})});
      const data=(await r.json()) as AuthResponse;
      if(!r.ok){setError(data.error??"요청을 처리하지 못했습니다.");return;}
      setPassword("");setConfirm("");
      if(mode==="recover"){setNotice(data.message??"비밀번호 재설정 안내를 확인해주세요.");return;}
      if(mode==="signup"&&data.requiresConfirmation){
        setNotice(data.message??"인증 메일을 확인한 뒤 로그인해주세요.");
        setMode("login");
        return;
      }
      if(!data.access_token){setError("인증 토큰이 없습니다. 다시 시도해주세요.");return;}
      setAccessToken(data.access_token);
      await loadMe();
      window.location.assign(destination());
    }catch(ex){setError(ex instanceof Error?ex.message:"네트워크 오류");}
    finally{setBusy(false);}
  };
  const logout=async()=>{
    const token=getAccessToken();
    try{if(token)await fetch("/api/auth/logout",{method:"POST",headers:{Authorization:`Bearer ${token}`}});}
    finally{clearAccessToken();setMe(null);}
  };
  return <div className="auth-layout">
    <section className="auth-intro">
      <span className="intro-kicker">{tr("DirectHome · 계정","DirectHome · Account")}</span>
      <h1>{tr("집주인도, 집을 찾는 사람도","Owners and home seekers")}<br/>{tr("하나의 계정으로.","One account for both.")}</h1>
      <p>{tr("집주인은 내 매물과 방문 예약을 관리하고, 방문자는 마음에 드는 집에 문의하고 일정을 신청할 수 있습니다.","Manage your listings and visit requests, or browse homes and start conversations.")}</p>
      <div className="auth-role-links"><a href="/owner">{tr("⌂ 집주인이라면 →","⌂ I'm an owner →")}</a><a href="/#properties">{tr("⌕ 집을 구한다면 →","⌕ I'm looking for a home →")}</a></div>
    </section>
    <section className="card auth-box">
      {me?<><span className="eyebrow">SIGNED IN</span><h2>{tr("로그인되어 있습니다","You're signed in")}</h2>
        <p>{me.name}</p><p className="meta">{tr("계정 유형은 이용 화면을 제한하지 않습니다.","Both owner and visitor workflows are available with one account.")}</p>
        <div className="auth-actions">{nextPath !== "/" ? <a className="btn" href={nextPath}>{tr("이전 작업으로 돌아가기","Return to previous task")}</a> : null}<a className="btn" href="/owner">{tr("내 집 관리","Owner hub")}</a><a className="btn ghost" href="/#properties">{tr("집 찾기","Explore homes")}</a></div>
        <button className="btn ghost" onClick={()=>void logout()}>{tr("로그아웃","Log out")}</button></>:
      <>
        <div className="auth-tabs" role="tablist" aria-label={tr("계정 이용 방법","Account options")}>
          <button role="tab" aria-selected={mode==="login"} disabled={!hydrated} className={mode==="login"?"is-active":""} type="button" onClick={()=>switchMode("login")}>{tr("로그인","Log in")}</button>
          <button role="tab" aria-selected={mode==="signup"} disabled={!hydrated} className={mode==="signup"?"is-active":""} type="button" onClick={()=>switchMode("signup")}>{tr("회원가입","Sign up")}</button>
        </div>
        <h2>{mode==="signup"?tr("이메일로 회원가입","Create an account"):mode==="recover"?tr("비밀번호 재설정","Reset password"):tr("다시 오신 것을 환영해요","Welcome back")}</h2>
        <p className="meta">{mode==="signup"?tr("Google 계정 없이도 이메일과 비밀번호로 가입할 수 있습니다.","Sign up with email, no Google account required."):mode==="recover"?tr("가입에 사용한 이메일로 재설정 안내를 보내드립니다.","We'll send reset instructions to your email."):tr("Google 또는 이메일·비밀번호로 로그인하세요.","Continue with Google or email and password.")}</p>
        <form className="auth-form" onSubmit={e=>void submit(e)}>
          {mode==="signup"?<label htmlFor="signup-name">이름
            <input id="signup-name" autoComplete="name" maxLength={40} required value={name}
              onChange={e=>setName(e.target.value)} placeholder={tr("표시할 이름","Your display name")}/>
          </label>:null}
          <label htmlFor="auth-email">이메일
            <input id="auth-email" type="email" autoComplete="email" inputMode="email" maxLength={254} required
              value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/>
          </label>
          {mode!=="recover"?<div className="auth-password-field">
            <label htmlFor="auth-password">{tr("비밀번호","Password")}</label>
            <div className="auth-password-row"><input id="auth-password" type={showPassword?"text":"password"}
              autoComplete={mode==="signup"?"new-password":"current-password"}
              minLength={mode==="signup"?10:undefined} required value={password}
              onChange={e=>setPassword(e.target.value)} placeholder={mode==="signup"?tr("영문 + 숫자, 10자 이상","10+ letters and numbers"):tr("비밀번호","Password")}/>
              <button type="button" disabled={!hydrated} aria-label={showPassword?"비밀번호 숨기기":"비밀번호 보기"} onClick={()=>setShowPassword(v=>!v)}>{showPassword?tr("숨기기","Hide"):tr("보기","Show")}</button>
            </div>
          </div>:null}
          {mode==="signup"?<label htmlFor="auth-confirm">비밀번호 확인
            <input id="auth-confirm" type={showPassword?"text":"password"} autoComplete="new-password" required
              value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder={tr("한 번 더 입력해주세요","Repeat password")}/>
          </label>:null}
          {mode==="login"?<button type="button" disabled={!hydrated} className="auth-text-link" onClick={()=>switchMode("recover")}>{tr("비밀번호를 잊으셨나요?","Forgot password?")}</button>:null}
          <button type="submit" className="btn auth-submit" disabled={busy||!hydrated}>{busy?tr("처리 중...","Working..."):mode==="signup"?tr("회원가입","Sign up"):mode==="recover"?tr("재설정 메일 보내기","Send reset email"):tr("로그인","Log in")}</button>
        </form>
        {error?<p role="alert" className="error">{error}</p>:null}
        {notice?<p role="status" className="auth-notice">{notice}</p>:null}
        {mode==="recover"?<button type="button" disabled={!hydrated} className="auth-text-link" onClick={()=>switchMode("login")}>{tr("← 로그인으로 돌아가기","← Back to sign in")}</button>:null}
        <div className="auth-divider"><span>{tr("또는","OR")}</span></div>
        <a className="btn ghost auth-google" href={"/api/auth/oauth?provider=google&next=" + encodeURIComponent(nextPath)}>{tr("Google로 계속하기 ↗","Continue with Google ↗")}</a>
        <p className="meta auth-footnote">{tr("이메일 인증이 활성화된 경우 메일의 확인 링크를 눌러야 로그인할 수 있습니다. 서로 다른 두 계정으로 집주인·방문자 역할을 테스트할 수 있습니다.","If email verification is enabled, follow the confirmation link. Use two different accounts to test the owner and visitor roles.")}</p>
      </>}
    </section>
  </div>;
}
