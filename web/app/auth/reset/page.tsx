"use client";
import {useEffect,useState,type FormEvent} from "react";
import {authHeaders,clearAccessToken,getAccessToken,setAccessToken} from "../../../lib/client-auth";

export default function ResetPasswordPage(){
  const [password,setPassword]=useState(""),[confirm,setConfirm]=useState("");
  const [ready,setReady]=useState(false),[busy,setBusy]=useState(false);
  const [error,setError]=useState(""),[done,setDone]=useState(false);
  useEffect(()=>{
    const hash=new URLSearchParams(window.location.hash.slice(1));
    if(hash.get("error")){setError("비밀번호 재설정 링크가 만료되었거나 유효하지 않습니다.");return;}
    const token=hash.get("access_token");
    if(token){
      setAccessToken(token);
      window.history.replaceState(null,"","/auth/reset");
    }
    setReady(!!(token||getAccessToken()));
  },[]);
  const submit=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();setError("");
    if(password.length<10||!/[A-Za-z]/.test(password)||!/[0-9]/.test(password)){
      setError("영문과 숫자를 포함해 10자 이상 입력해주세요.");return;
    }
    if(password!==confirm){setError("비밀번호 확인이 일치하지 않습니다.");return;}
    setBusy(true);
    try{
      const r=await fetch("/api/auth/password",{method:"POST",headers:{"Content-Type":"application/json",...authHeaders()},body:JSON.stringify({password})});
      const data=await r.json();
      if(!r.ok){setError(data.error??"비밀번호를 변경하지 못했습니다.");return;}
      clearAccessToken();
      setPassword("");setConfirm("");setDone(true);
    }catch(e){setError(e instanceof Error?e.message:"연결 오류");}
    finally{setBusy(false);}
  };
  return <div className="auth-layout auth-single">
    <section className="card auth-box">
      <span className="eyebrow">ACCOUNT RECOVERY</span>
      <h1>비밀번호 재설정</h1>
      {done?<><p role="status" className="auth-notice">새 비밀번호가 저장되었습니다.</p><a className="btn" href="/login">새 비밀번호로 로그인하기</a></>:
        !ready?<><p className="meta">이메일로 받은 비밀번호 재설정 링크에서 접속해주세요.</p><a className="btn ghost" href="/login">로그인으로 돌아가기</a></>:
        <form className="auth-form" onSubmit={e=>void submit(e)}>
          <label>새 비밀번호<input type="password" autoComplete="new-password" required minLength={10}
            value={password} onChange={e=>setPassword(e.target.value)} placeholder="영문·숫자 포함 10자 이상"/></label>
          <label>새 비밀번호 확인<input type="password" autoComplete="new-password" required minLength={10}
            value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>
          <button className="btn auth-submit" disabled={busy} type="submit">{busy?"변경 중...":"비밀번호 변경"}</button>
        </form>}
      {error?<p role="alert" className="error">{error}</p>:null}
    </section>
  </div>;
}
