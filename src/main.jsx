import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import Auth from "./Auth.jsx";
import { supabase, supabaseConfigured } from "./supabaseClient.js";

function Root() {
  const [session, setSession] = useState(undefined); // undefined = carregando

  useEffect(() => {
    if (!supabaseConfigured) { setSession(null); return; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!supabaseConfigured) return <Auth />; // mostra aviso de configuração pendente

  if (session === undefined) {
    return <div style={{ padding: 40, fontFamily: "sans-serif", color: "#8A9489" }}>Carregando…</div>;
  }

  if (!session) return <Auth onSignedIn={() => {}} />;

  return <App onLogout={() => supabase.auth.signOut()} userEmail={session.user.email} />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
