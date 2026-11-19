const { createClient } = require("@supabase/supabase-js");
const { STG_URL, STG_SECRET_KEY, QA_PASSWORD } = process.env;

if (!STG_URL || !STG_SECRET_KEY || !QA_PASSWORD) {
  console.error("Faltan STG_URL, STG_SECRET_KEY o QA_PASSWORD");
  process.exit(1);
}
if (!STG_URL.includes("rpxdxitntsmgcbbnuyox")) {
  console.error("STOP: esta URL no es la del staging");
  process.exit(1);
}

const users = require("./users.json");
const sb = createClient(STG_URL, STG_SECRET_KEY, { auth: { persistSession: false } });

async function main() {
  const { data: list, error: listError } = await sb.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw listError;

  for (const u of users) {
    let id = list.users.find((x) => x.email === u.email)?.id;
    if (!id) {
      const { data, error } = await sb.auth.admin.createUser({
        email: u.email,
        password: QA_PASSWORD,
        email_confirm: true,
        user_metadata: { nickname: u.nickname },
      });
      if (error) throw error;
      id = data.user.id;
    } else {
      const { error } = await sb.auth.admin.updateUserById(id, { password: QA_PASSWORD });
      if (error) throw error;
    }
    const { error } = await sb
      .from("profiles")
      .upsert({ id, email: u.email, nickname: u.nickname, ...u.profile });
    if (error) throw error;
    console.log("OK", u.key, u.email);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
