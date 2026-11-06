const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const fs = require('fs');

// Load .env.local
const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (m) {
    let v = m[2] || '';
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    env[m[1]] = v.trim();
  }
});

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

function decrypt(payload) {
  const key = crypto.createHash('sha256').update(env.TOKEN_ENC_KEY).digest();
  const [iv64, tag64, data64] = payload.split('.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv64, 'base64'));
  decipher.setAuthTag(Buffer.from(tag64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data64, 'base64')), decipher.final()]).toString('utf8');
}

const MERCHANDISING_COMMENT = `🚀 Gostou do conteúdo? Siga nosso perfil para acompanhar mais análises e dicas práticas! Também atuamos diretamente com gestão de tráfego pago, marketing digital e estratégias de escala para o seu negócio. Se quiser acelerar seus resultados, envie um Direct ou clique no link da bio! 📲`;

async function main() {
  console.log("=== 1. Buscando conta do Instagram ===");
  const { data: accounts } = await sb.from('ig_accounts').select('*').limit(1);
  if (!accounts || !accounts[0]) {
    console.error("Nenhuma conta encontrada!");
    return;
  }
  const acc = accounts[0];
  const token = decrypt(acc.access_token);
  const igUserId = acc.ig_user_id;
  console.log("Conta:", acc.username, "IG ID:", igUserId);

  console.log("\n=== 2. Buscando posts publicados ===");
  const { data: publishedPosts } = await sb.from('posts').select('*').eq('status', 'published');
  console.log(`Encontrados ${publishedPosts.length} posts publicados.`);

  for (const p of publishedPosts) {
    console.log(`\nPost ID: ${p.id} | IG Media ID: ${p.ig_media_id} | Caption: ${(p.caption || '').slice(0, 30)}...`);
    if (!p.ig_media_id) {
      console.log("Sem ig_media_id, pulando...");
      continue;
    }

    // Checar se já comentou
    const graphUrl = token.startsWith('IG') ? 'https://graph.instagram.com/v23.0' : 'https://graph.facebook.com/v23.0';
    
    // Lista comentários do post
    const resComments = await fetch(`${graphUrl}/${p.ig_media_id}/comments?fields=id,text,from&access_token=${token}`);
    const commentsData = await resComments.json();
    const existingComments = commentsData.data || [];
    console.log(`Comentários existentes: ${existingComments.length}`);

    const alreadyHasMerch = existingComments.some(c => c.text && c.text.includes("gestão de tráfego"));
    if (alreadyHasMerch) {
      console.log("Já possui comentário de merchandising! Pulando.");
      continue;
    }

    console.log("Postando comentário de merchandising...");
    const postRes = await fetch(`${graphUrl}/${p.ig_media_id}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ message: MERCHANDISING_COMMENT })
    });
    const postJson = await postRes.json();
    if (postJson.id) {
      console.log(`✅ Comentário publicado com sucesso! ID: ${postJson.id}`);
      const updatedAuto = { ...(p.automation || {}), first_comment: MERCHANDISING_COMMENT, first_comment_id: postJson.id };
      await sb.from('posts').update({
        automation: updatedAuto,
        updated_at: new Date().toISOString()
      }).eq('id', p.id);
    } else {
      console.error("❌ Falha ao comentar:", postJson);
    }
  }

  console.log("\n=== 3. Atualizando posts agendados com o primeiro comentário padrão ===");
  const { data: scheduledPosts } = await sb.from('posts').select('*').in('status', ['scheduled', 'draft']);
  console.log(`Encontrados ${scheduledPosts.length} posts agendados/rascunho.`);
  for (const sp of scheduledPosts) {
    const auto = sp.automation || {};
    if (!auto.first_comment) {
      auto.first_comment = MERCHANDISING_COMMENT;
      await sb.from('posts').update({
        automation: auto,
        updated_at: new Date().toISOString()
      }).eq('id', sp.id);
      console.log(`✅ Post agendado ${sp.id} (${(sp.caption || '').slice(0, 25)}...) configurado com primeiro comentário!`);
    } else {
      console.log(`Post agendado ${sp.id} já tem first_comment configurado.`);
    }
  }
}

main().catch(console.error);
