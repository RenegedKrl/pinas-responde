export const metadata = { title: "Termos de Uso · Pinas Responde" };

// Página exigida pelo TikTok e pela Meta para o app
export default function Termos() {
  return (
    <main className="main" style={{ margin: "0 auto" }}>
      <h1>Termos de Uso</h1>
      <p>O Pinas Responde é uma ferramenta interna do Pinas Studio para agendar publicações no Instagram e no TikTok e responder comentários e mensagens das próprias contas do estúdio.</p>
      <h2>Uso</h2>
      <p>Só publica conteúdo que o dono da conta enviou e aprovou no painel, no horário que ele escolheu. Nada é publicado sem essa aprovação.</p>
      <h2>Contas conectadas</h2>
      <p>O dono pode desconectar o Instagram ou o TikTok no painel a qualquer momento. Os tokens são guardados criptografados e apagados ao desconectar.</p>
      <h2>Privacidade</h2>
      <p>Veja a <a href="/privacidade">Política de Privacidade</a>.</p>
    </main>
  );
}
