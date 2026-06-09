import { Router } from 'express';
import { getAdminClient, getPublicClient } from '../lib/supabase.js';
import { requireAuthBasic } from '../middleware/auth.js';

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email e password são obrigatórios.' });
  }
  const { data, error } = await getPublicClient().auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session) {
    return res.status(401).json({ error: error?.message ?? 'Credenciais inválidas.' });
  }
  return res.status(200).json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_in: data.session.expires_in,
    user: { id: data.user.id, email: data.user.email },
  });
});

authRouter.post('/register', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email e password são obrigatórios.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'A senha deve ter no mínimo 8 caracteres.' });
  }
  const { data, error } = await getPublicClient().auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${process.env.PUBLIC_URL ?? ''}/` },
  });
  if (error) {
    if (error.message.toLowerCase().includes('already')) {
      return res.status(409).json({ error: 'Este e-mail já está cadastrado.' });
    }
    return res.status(400).json({ error: error.message });
  }
  return res.status(201).json({
    access_token: data.session?.access_token ?? null,
    refresh_token: data.session?.refresh_token ?? null,
    expires_in: data.session?.expires_in ?? null,
    user: { id: data.user?.id, email: data.user?.email },
    needsEmailConfirmation: !data.session,
  });
});

authRouter.post('/reset-password', async (req, res) => {
  const { email } = req.body ?? {};
  if (!email) return res.status(400).json({ error: 'email é obrigatório.' });

  const redirectTo = `${process.env.PUBLIC_URL ?? ''}/reset-password`;
  // Sempre 200 — não vazamos se o email existe.
  await getPublicClient().auth.resetPasswordForEmail(email, { redirectTo });
  return res.status(200).json({
    message: 'Se este e-mail estiver cadastrado, você receberá um link em breve.',
  });
});

authRouter.post('/update-password', requireAuthBasic, async (req, res) => {
  const { password } = req.body ?? {};
  if (!password || password.length < 8) {
    return res
      .status(400)
      .json({ error: 'A senha deve ter no mínimo 8 caracteres.' });
  }
  const { userId } = req.auth!;
  const { error } = await getAdminClient().auth.admin.updateUserById(userId, {
    password,
  });
  if (error) return res.status(400).json({ error: error.message });
  return res.status(200).json({ message: 'Senha atualizada com sucesso.' });
});

authRouter.get('/me', requireAuthBasic, async (req, res) => {
  const { userId, email } = req.auth!;
  const { data: clinic } = await getAdminClient()
    .from('clinics')
    .select('id, name, address, timezone, whatsapp_number, admin_email, settings')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  return res.status(200).json({ user: { id: userId, email }, clinic: clinic ?? null });
});
