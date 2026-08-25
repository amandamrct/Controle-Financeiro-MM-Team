import React, { useState } from "react";
import { supabase, supabaseConfigured } from "./supabaseClient.js";

const C = {
  paper: "#F2F4EF",
  paperRaised: "#FFFFFF",
  ink: "#1F2A24",
  inkFaint: "#8A9489",
  line: "#C7CDBF",
  green: "#2F6F4E",
  greenSoft: "#DCE8DE",
  red: "#B23A2E",
};

export default function Auth({ onSignedIn }) {
  const [mode, setMode] = useState("login"); // 'login' | 'signup'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  if (!supabaseConfigured) {
    return (
      <div style={{ maxWidth: 420, margin: "80px auto", fontFamily: "sans-serif", padding: 20, textAlign: "center", color: C.ink }}>
        <h2>Configuração pendente</h2>
        <p style={{ color: C.inkFaint, fontSize: 14 }}>
          Defina <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> no arquivo <code>.env</code>
          (veja <code>.env.example</code>) pra ativar o login e o salvamento na nuvem.
        </p>
      </div>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg(error.message);
      else onSignedIn?.();
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setMsg(error.message);
      else setMsg("Conta criada! Verifique seu e-mail se a confirmação estiver ativada, ou já tente entrar.");
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: C.paper, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <form
        onSubmit={submit}
        style={{ background: C.paperRaised, border: `1px solid ${C.line}`, borderRadius: 8, padding: 28, width: 320, fontFamily: "sans-serif" }}
      >
        <h2 style={{ margin: "0 0 4px", color: C.ink }}>Controle Financeiro</h2>
        <p style={{ margin: "0 0 18px", color: C.inkFaint, fontSize: 13 }}>
          {mode === "login" ? "Entre pra acessar seus lançamentos." : "Crie sua conta."}
        </p>
        <label style={{ fontSize: 12, color: C.inkFaint }}>E-mail</label>
        <input
          type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          style={{ width: "100%", padding: "8px 10px", margin: "4px 0 12px", border: `1px solid ${C.line}`, borderRadius: 4, boxSizing: "border-box" }}
        />
        <label style={{ fontSize: 12, color: C.inkFaint }}>Senha</label>
        <input
          type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
          style={{ width: "100%", padding: "8px 10px", margin: "4px 0 12px", border: `1px solid ${C.line}`, borderRadius: 4, boxSizing: "border-box" }}
        />
        {msg && <div style={{ fontSize: 12.5, color: C.red, marginBottom: 10 }}>{msg}</div>}
        <button
          type="submit" disabled={loading}
          style={{ width: "100%", padding: "10px", background: C.ink, color: C.paper, border: "none", borderRadius: 4, fontWeight: 600, cursor: "pointer" }}
        >
          {loading ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar conta"}
        </button>
        <button
          type="button"
          onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMsg(""); }}
          style={{ width: "100%", marginTop: 10, background: "none", border: "none", color: C.green, fontSize: 12.5, cursor: "pointer" }}
        >
          {mode === "login" ? "Não tem conta? Criar uma" : "Já tem conta? Entrar"}
        </button>
      </form>
    </div>
  );
}
