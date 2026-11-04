"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabaseClient_1 = require("../supabaseClient");
const router = (0, express_1.Router)();
// POST /api/auth/register
router.post('/register', async (req, res) => {
    try {
        const { username, password, phone, avatarUrl } = req.body;
        if (!username || !username.trim() || !password || !password.trim()) {
            res.status(400).json({ error: 'Username and password are required' });
            return;
        }
        if (password.length < 6) {
            res.status(400).json({ error: 'Password must be at least 6 characters' });
            return;
        }
        const cleanUsername = username.trim();
        const cleanPhone = phone ? phone.trim() : null;
        // 1. Check if username is already taken
        const { data: existingUser } = await supabaseClient_1.supabase
            .from('profiles')
            .select('id')
            .ilike('username', cleanUsername)
            .maybeSingle();
        if (existingUser) {
            res.status(400).json({ error: 'Username is already taken' });
            return;
        }
        // 2. Check if phone is already taken (if provided)
        if (cleanPhone) {
            const { data: existingPhone } = await supabaseClient_1.supabase
                .from('profiles')
                .select('id')
                .eq('phone', cleanPhone)
                .maybeSingle();
            if (existingPhone) {
                res.status(400).json({ error: 'Phone number is already registered' });
                return;
            }
        }
        // 3. Create synthetic internal email (never exposed to user, no MX or email checks needed with admin API)
        const baseIdentifier = cleanPhone
            ? cleanPhone.replace(/\D/g, '')
            : cleanUsername.toLowerCase().replace(/[^a-z0-9]/g, '');
        const internalEmail = `${baseIdentifier}@roomie.internal`;
        // 4. Create user via Supabase Admin (bypasses MX checks, marks email verified)
        const { data: authData, error: authError } = await supabaseClient_1.supabase.auth.admin.createUser({
            email: internalEmail,
            password: password.trim(),
            email_confirm: true,
            user_metadata: { username: cleanUsername, phone: cleanPhone || '' },
        });
        if (authError || !authData.user) {
            res.status(400).json({ error: authError?.message || 'Failed to create user' });
            return;
        }
        const userId = authData.user.id;
        // 5. Create profile record
        const { data: profile, error: profileError } = await supabaseClient_1.supabase
            .from('profiles')
            .insert({
            id: userId,
            username: cleanUsername,
            phone: cleanPhone,
            avatar_url: avatarUrl || '🧑',
            total_credits: 0,
            level: 1,
            xp: 0,
            streak_days: 0,
            is_admin: false,
            house_id: null,
        })
            .select()
            .single();
        if (profileError) {
            // Rollback auth user
            await supabaseClient_1.supabase.auth.admin.deleteUser(userId);
            res.status(500).json({ error: 'Profile creation failed: ' + profileError.message });
            return;
        }
        // 6. Sign in to obtain session tokens
        const { data: loginData, error: loginError } = await supabaseClient_1.supabaseAnon.auth.signInWithPassword({
            email: internalEmail,
            password: password.trim(),
        });
        if (loginError || !loginData.session) {
            res.status(200).json({
                message: 'Account created successfully. Please log in.',
                user: authData.user,
                profile,
            });
            return;
        }
        res.status(201).json({
            session: loginData.session,
            profile,
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message || 'Server error during registration' });
    }
});
// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { identifier, username, phone, password } = req.body;
        const loginIdentifier = (identifier || username || phone || '').trim();
        if (!loginIdentifier || !password || !password.trim()) {
            res.status(400).json({ error: 'Username/phone and password are required' });
            return;
        }
        // 1. Find profile by username or phone
        const { data: profile, error: profileError } = await supabaseClient_1.supabase
            .from('profiles')
            .select('*')
            .or(`username.ilike.${loginIdentifier},phone.eq.${loginIdentifier}`)
            .maybeSingle();
        if (profileError || !profile) {
            res.status(400).json({ error: 'Invalid username/phone or password' });
            return;
        }
        // 2. Fetch auth user to get exact internal email
        const { data: authUser, error: authUserError } = await supabaseClient_1.supabase.auth.admin.getUserById(profile.id);
        if (authUserError || !authUser?.user?.email) {
            res.status(400).json({ error: 'User authentication record not found' });
            return;
        }
        // 3. Authenticate password
        const { data: loginData, error: loginError } = await supabaseClient_1.supabaseAnon.auth.signInWithPassword({
            email: authUser.user.email,
            password: password.trim(),
        });
        if (loginError || !loginData.session) {
            res.status(401).json({ error: 'Invalid username/phone or password' });
            return;
        }
        res.json({
            session: loginData.session,
            profile,
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message || 'Server error during login' });
    }
});
exports.default = router;
