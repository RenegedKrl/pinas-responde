export const metadata = { title: "Política de Privacidade · Pinas Responde" };

// Página exigida pela Meta para o app
export default function Privacidade() {
  return (
    <main className="main" style={{ margin: "0 auto" }}>
      <h1>Política de Privacidade</h1>
      <p>O Pinas Responde automatiza respostas a comentários e mensagens diretas em contas profissionais do Instagram, a pedido do dono da conta.</p>
      <h2>Dados coletados</h2>
      <p>Coletamos o identificador e o nome de usuário de quem comenta ou envia mensagem, o texto do comentário e o histórico de mensagens enviadas pela automação. O token de acesso da conta conectada é guardado criptografado.</p>
      <h2>Uso</h2>
      <p>Os dados são usados apenas para enviar as respostas configuradas e exibir métricas ao dono da conta. Não vendemos nem compartilhamos dados com terceiros.</p>
      <h2>Exclusão</h2>
      <p>O dono da conta pode desconectar o Instagram no painel a qualquer momento, o que apaga o token. Para solicitar a exclusão de dados, entre em contato pelo direct do perfil conectado.</p>
    </main>
  );
}
