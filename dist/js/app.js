// ===== SUPABASE CONFIGURATION =====
const SUPABASE_URL = 'https://sxkmoiwpyxjyqrcctmhh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4a21vaXdweXhqeXFyY2N0bWhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4NDQ1NzUsImV4cCI6MjA3NzQyMDU3NX0.XTdNkdJFCa__oY1v1IZpNq0QDriJS6qDktKhSvT3aCo';

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ===== APPLICATION STATE =====
let appData = {};
let currentUser = null;
let currentUserAdmin = false;
let currentAudioPlayer = null;
let audioCache = new Map();
let isLoading = false;

const defaultData = {
    platformName: 'Resonance',
    platformDesc: 'Share your music with the world. Resonance is a platform for independent musicians to amplify their voice and connect with listeners worldwide.',
    heroTitle: 'Discover Unknown Artists',
    heroDesc: 'Share your music with the world. Resonance is a platform for independent musicians to amplify their voice and connect with listeners worldwide.',
    sectionTitle: 'Featured Tracks',
    footerText: '© 2024 Resonance. All rights reserved. Amplifying Independent Music.',
    colors: {
        primaryBg: '#faf8f3',
        secondaryBg: '#f0ebe3',
        accentLight: '#e8ddf5',
        accentWarm: '#d4a574',
        accentDark: '#8b6f47',
        textPrimary: '#2a2520',
        textSecondary: '#5a5450',
        border: '#e0d5ca',
        success: '#7ba98a',
        danger: '#c17b6b'
    }
};

// ===== INITIALIZATION =====
async function init() {
    console.log('🚀 Initializing application...');
    
    if (!window.supabase) {
        console.error('❌ Supabase library not loaded');
        return;
    }
    
    await loadAdminSettings();
    await checkAuthStatus();
    await loadTracks();
    setupEventListeners();
    
    console.log('✅ Application initialized');
}

// ===== AUTHENTICATION =====
async function checkAuthStatus() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            currentUser = user;
            
            // Ensure user exists in users table
            await ensureUserExists(user);
            
            updateAuthUI();
        }
    } catch (error) {
        console.warn('Not authenticated:', error);
    }
}

async function ensureUserExists(user) {
    try {
        const { data: existingUser, error: fetchError } = await supabase
            .from('users')
            .select('id')
            .eq('id', user.id)
            .single();
        
        if (!existingUser && fetchError && fetchError.code === 'PGRST116') {
            // User doesn't exist, create them
            const { error: insertError } = await supabase
                .from('users')
                .insert([{
                    id: user.id,
                    email: user.email,
                    username: user.email.split('@')[0]
                }]);
            
            if (insertError) {
                console.warn('Could not create user record:', insertError);
            } else {
                console.log('✅ User record created');
            }
        }
    } catch (error) {
        console.warn('Error ensuring user exists:', error);
    }
}

async function signUp(email, password, username) {
    try {
        showNotification('📝 Creating account...', false);
        
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { username }
            }
        });
        
        if (error) throw error;
        
        currentUser = data.user;
        
        // Create user record
        await ensureUserExists(data.user);
        
        showNotification('✅ Account created! Check your email to confirm.', true);
        updateAuthUI();
        return true;
    } catch (error) {
        showNotification(`❌ Sign up failed: ${error.message}`, false);
        return false;
    }
}

async function signIn(email, password) {
    try {
        showNotification('🔓 Signing in...', false);
        
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });
        
        if (error) throw error;
        
        currentUser = data.user;
        showNotification('✅ Signed in successfully!', true);
        updateAuthUI();
        closeAuthPanel();
        return true;
    } catch (error) {
        showNotification(`❌ Sign in failed: ${error.message}`, false);
        return false;
    }
}

async function logout() {
    try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        
        currentUser = null;
        currentUserAdmin = false;
        audioCache.clear();
        showNotification('👋 Logged out successfully!', true);
        updateAuthUI();
        await loadTracks();
    } catch (error) {
        showNotification(`❌ Logout failed: ${error.message}`, false);
    }
}

function updateAuthUI() {
    const authBtn = document.getElementById('authBtn');
    const userBtn = document.getElementById('userBtn');
    const adminBtn = document.getElementById('adminBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    
    if (currentUser) {
        authBtn.style.display = 'none';
        userBtn.style.display = 'inline-block';
        logoutBtn.style.display = 'inline-block';
        
        // Check if user is admin
        checkIfAdmin();
        
        // Update upload section
        const uploadSection = document.getElementById('uploadSection');
        if (uploadSection) {
            uploadSection.style.display = 'block';
        }
    } else {
        authBtn.style.display = 'inline-block';
        userBtn.style.display = 'none';
        adminBtn.style.display = 'none';
        logoutBtn.style.display = 'none';
        
        const uploadSection = document.getElementById('uploadSection');
        if (uploadSection) {
            uploadSection.style.display = 'none';
        }
    }
}

async function checkIfAdmin() {
    try {
        if (!currentUser) return;
        
        const { data, error } = await supabase
            .from('users')
            .select('is_admin')
            .eq('id', currentUser.id)
            .single();
        
        if (data && data.is_admin) {
            currentUserAdmin = true;
            document.getElementById('adminBtn').style.display = 'inline-block';
        } else {
            currentUserAdmin = false;
            document.getElementById('adminBtn').style.display = 'none';
        }
    } catch (error) {
        console.warn('Could not check admin status:', error);
        currentUserAdmin = false;
    }
}

// ===== TRACK MANAGEMENT =====
async function loadTracks() {
    try {
        isLoading = true;
        console.log('📥 Loading tracks...');
        
        const { data: tracks, error } = await supabase
            .from('tracks')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        appData.tracks = tracks || [];
        console.log(`✅ Loaded ${appData.tracks.length} tracks`);
        
        renderTracks();
        updateStats();
    } catch (error) {
        console.error('❌ Error loading tracks:', error);
        showNotification('Error loading tracks', false);
    } finally {
        isLoading = false;
    }
}

async function uploadTrack(file, coverFile, metadata) {
    try {
        console.log('🎵 [UPLOAD] Starting upload process...');
        
        // DEBUG: Check authentication
        if (!currentUser) {
            console.error('❌ [UPLOAD] No currentUser found');
            showNotification('❌ You must be logged in to upload', false);
            return false;
        }
        
        console.log('✅ [UPLOAD] CurrentUser authenticated:', {
            id: currentUser.id,
            email: currentUser.email
        });
        
        // DEBUG: Verify user exists in users table
        const { data: userRecord, error: userCheckError } = await supabase
            .from('users')
            .select('id, is_admin')
            .eq('id', currentUser.id)
            .single();
        
        if (userCheckError) {
            console.warn('⚠️ [UPLOAD] User record check error:', userCheckError);
        } else {
            console.log('✅ [UPLOAD] User record found:', userRecord);
        }
        
        // DEBUG: Get current session to verify auth token
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        console.log('🔑 [UPLOAD] Session info:', {
            hasSession: !!session,
            sessionError: sessionError,
            user: session?.user?.id
        });
        
        showNotification('📤 Uploading track...', false);
        
        // Upload audio file
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
        const filePath = `${currentUser.id}/${fileName}`;
        
        console.log('📁 [UPLOAD] File path:', filePath);
        
        const { error: uploadError } = await supabase.storage
            .from('audio')
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: false
            });
        
        if (uploadError) {
            console.error('❌ [UPLOAD] Storage upload error:', uploadError);
            throw uploadError;
        }
        
        console.log('✅ [UPLOAD] Audio file uploaded to storage');
        
        // Upload cover image if provided
        let coverData = null;
        if (coverFile) {
            try {
                const reader = new FileReader();
                coverData = await new Promise((resolve, reject) => {
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(coverFile);
                });
                console.log('✅ [UPLOAD] Cover image processed');
            } catch (coverError) {
                console.warn('⚠️ [UPLOAD] Could not process cover image:', coverError);
            }
        }
        
        // Create track record
        const trackData = {
            name: metadata.name,
            artist: metadata.artist,
            genre: metadata.genre,
            uploaded_by: currentUser.id,
            plays: 0,
            duration: 0,
            cover_data: coverData || null
        };
        
        console.log('📝 [UPLOAD] Track data to insert:', trackData);
        
        const { data: track, error: dbError } = await supabase
            .from('tracks')
            .insert([trackData])
            .select()
            .single();
        
        if (dbError) {
            console.error('❌ [UPLOAD] Database insert error:', {
                message: dbError.message,
                code: dbError.code,
                details: dbError.details,
                hint: dbError.hint,
                fullError: dbError
            });
            throw dbError;
        }
        
        console.log('✅ [UPLOAD] Track record created:', track);
        
        showNotification('✅ Track uploaded successfully!', true);
        audioCache.clear();
        await loadTracks();
        return true;
    } catch (error) {
        console.error('❌ [UPLOAD] Error uploading track:', error);
        console.error('❌ [UPLOAD] Full error object:', {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint
        });
        showNotification(`Upload failed: ${error.message}`, false);
        return false;
    }
}

async function deleteTrack(trackId) {
    try {
        if (!currentUser) {
            showNotification('❌ You must be logged in', false);
            return false;
        }
        
        if (!confirm('Are you sure you want to delete this track?')) {
            return false;
        }
        
        // Get track info
        const { data: track, error: fetchError } = await supabase
            .from('tracks')
            .select('*')
            .eq('id', trackId)
            .single();
        
        if (fetchError) throw fetchError;
        
        // Check ownership
        if (track.uploaded_by !== currentUser.id && !currentUserAdmin) {
            showNotification('❌ You can only delete your own tracks', false);
            return false;
        }
        
        // Delete from database
        const { error: dbError } = await supabase
            .from('tracks')
            .delete()
            .eq('id', trackId);
        
        if (dbError) throw dbError;
        
        showNotification('✅ Track deleted successfully!', true);
        audioCache.clear();
        await loadTracks();
        return true;
    } catch (error) {
        console.error('❌ Error deleting track:', error);
        showNotification(`Delete failed: ${error.message}`, false);
        return false;
    }
}

async function incrementPlayCount(trackId) {
    try {
        const track = appData.tracks.find(t => t.id === trackId);
        if (!track) return;
        
        const newPlays = (track.plays || 0) + 1;
        
        const { error } = await supabase
            .from('tracks')
            .update({ plays: newPlays })
            .eq('id', trackId);
        
        if (error) throw error;
        
        track.plays = newPlays;
        updateStats();
    } catch (error) {
        console.warn('Could not update play count:', error);
    }
}

// ===== AUDIO PLAYBACK =====
async function getAudioUrl(trackId) {
    try {
        if (audioCache.has(trackId)) {
            return audioCache.get(trackId);
        }
        
        const track = appData.tracks.find(t => t.id === trackId);
        if (!track) {
            console.warn('Track not found:', trackId);
            return null;
        }
        
        const path = `${track.uploaded_by}/${trackId}-audio`;
        
        const { data: { publicUrl } } = supabase.storage
            .from('audio')
            .getPublicUrl(path);
        
        audioCache.set(trackId, publicUrl);
        return publicUrl;
    } catch (error) {
        console.error('Error getting audio URL:', error);
        return null;
    }
}

// ===== ADMIN SETTINGS =====
async function loadAdminSettings() {
    try {
        console.log('📥 Loading admin settings from database...');
        
        const { data, error } = await supabase
            .from('admin_settings')
            .select('*')
            .single();
        
        if (error && error.code !== 'PGRST116') {
            console.error('❌ Database error:', error);
            throw error;
        }
        
        if (data) {
            console.log('✅ Admin settings loaded:', data);
            console.log('🎨 Colors from DB:', data.colors);
            appData = { ...appData, ...data };
            console.log('📊 Updated appData:', appData);
        } else {
            console.log('⚠️ No admin settings found, creating default...');
            await createDefaultAdminSettings();
        }
        
        applyTheme();
    } catch (error) {
        console.warn('⚠️ Error loading admin settings:', error);
        applyTheme();
    }
}

async function createDefaultAdminSettings() {
    try {
        const { data, error } = await supabase
            .from('admin_settings')
            .insert([{
                platform_name: defaultData.platformName,
                platform_desc: defaultData.platformDesc,
                hero_title: defaultData.heroTitle,
                hero_desc: defaultData.heroDesc,
                section_title: defaultData.sectionTitle,
                footer_text: defaultData.footerText,
                colors: defaultData.colors
            }])
            .select();
        
        if (error) throw error;
        
        if (data && data[0]) {
            appData = { ...appData, ...data[0] };
        }
    } catch (error) {
        console.error('Error creating default settings:', error);
    }
}

async function saveAdminSettings(settings) {
    try {
        if (!currentUserAdmin) {
            showNotification('❌ You must be an admin', false);
            return false;
        }
        
        console.log('💾 Saving admin settings...', settings);
        console.log('🔍 Current appData.id:', appData.id);
        
        // If appData doesn't have id, this is a new record - insert instead
        if (!appData.id) {
            console.log('📝 Creating new admin_settings record...');
            const { data, error } = await supabase
                .from('admin_settings')
                .insert([settings])
                .select();
            
            if (error) {
                console.error('❌ INSERT Error:', error);
                throw error;
            }
            if (data && data[0]) {
                appData = { ...appData, ...data[0] };
                console.log('✅ New record created:', data[0]);
                console.log('🎨 Colors in DB:', data[0].colors);
            }
        } else {
            // Update existing record
            console.log('🔄 Updating existing admin_settings record with ID:', appData.id);
            console.log('📤 Sending to DB:', JSON.stringify(settings));
            
            const { data, error } = await supabase
                .from('admin_settings')
                .update(settings)
                .eq('id', appData.id)
                .select();
            
            if (error) {
                console.error('❌ UPDATE Error:', error);
                throw error;
            }
            
            // Use returned data if available
            if (data && data[0]) {
                appData = { ...appData, ...data[0] };
                console.log('✅ Record updated from DB:', data[0]);
                console.log('🎨 Colors in DB response:', data[0].colors);
            } else {
                appData = { ...appData, ...settings };
                console.log('✅ Record updated (local):', appData);
            }
        }
        
        console.log('📥 Loading fresh settings from database...');
        // Reload settings to ensure we have latest data
        await loadAdminSettings();
        
        showNotification('✅ Settings saved!', true);
        return true;
    } catch (error) {
        console.error('❌ Error saving settings:', error);
        showNotification(`Save failed: ${error.message}`, false);
        return false;
    }
}

// ===== RENDERING =====
function renderTracks() {
    const container = document.getElementById('musicContainer');
    if (!container) return;
    
    if (appData.tracks.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">No tracks yet. Upload some music to get started!</p>';
        return;
    }
    
    container.innerHTML = appData.tracks.map(track => `
        <div class="music-card" data-track-id="${track.id}">
            <div class="music-cover">${track.cover_data ? `<img src="${track.cover_data}" style="width: 100%; height: 100%; object-fit: cover;">` : '🎵'}</div>
            <div class="music-info">
                <h3>${track.name}</h3>
                <p>${track.artist}</p>
                <p style="font-size: 0.8rem; color: var(--text-secondary);">${track.genre || 'Genre'}</p>
            </div>
            <div class="music-player" id="player-${track.id}">
                <div style="text-align: center; color: var(--text-secondary); padding: 1rem;">
                    ⏳ Loading...
                </div>
            </div>
            <div class="music-meta">
                <span>▶️ ${track.plays || 0} plays</span>
                <span>${track.duration ? formatDuration(track.duration) : '--:--'}</span>
            </div>
            ${currentUser && (currentUser.id === track.uploaded_by || currentUserAdmin) ? `
                <div class="music-controls">
                    <button class="btn-small btn-delete" onclick="deleteTrack('${track.id}')">🗑️ Delete</button>
                </div>
            ` : ''}
        </div>
    `).join('');
    
    setTimeout(() => {
        loadAudioPlayers();
    }, 100);
}

async function loadAudioPlayers() {
    for (const track of appData.tracks) {
        const playerDiv = document.getElementById(`player-${track.id}`);
        if (!playerDiv) continue;
        
        if (playerDiv.querySelector('audio')) continue;
        
        try {
            const audioUrl = await getAudioUrl(track.id);
            
            if (audioUrl) {
                const audio = document.createElement('audio');
                audio.id = `audio-${track.id}`;
                audio.controls = true;
                audio.controlsList = 'nodownload';
                audio.preload = 'metadata';
                
                audio.addEventListener('play', function() {
                    console.log('🎵 Playing:', track.name);
                    incrementPlayCount(track.id);
                }, { once: true });
                
                // Firefox compatibility
                audio.addEventListener('play', function() {
                    if (navigator.userAgent.includes('Firefox')) {
                        if (this.currentTime === this.duration || isNaN(this.currentTime)) {
                            this.currentTime = 0;
                        }
                    }
                });
                
                audio.addEventListener('pause', function() {
                    if (this.currentTime === this.duration || isNaN(this.currentTime)) {
                        this.currentTime = 0;
                    }
                });
                
                audio.addEventListener('error', function(e) {
                    console.error('Audio error:', e);
                    playerDiv.innerHTML = '<div style="color: var(--danger); padding: 1rem;">❌ Error loading audio</div>';
                });
                
                const source = document.createElement('source');
                source.src = audioUrl;
                source.type = 'audio/mpeg';
                audio.appendChild(source);
                
                playerDiv.innerHTML = '';
                playerDiv.appendChild(audio);
                
                audio.load();
            }
        } catch (error) {
            console.error(`Error loading audio for track ${track.id}:`, error);
            playerDiv.innerHTML = '<div style="color: var(--danger); padding: 1rem;">❌ Failed to load</div>';
        }
    }
}

function updateStats() {
    const totalTracks = appData.tracks.length;
    const totalPlays = appData.tracks.reduce((sum, track) => sum + (track.plays || 0), 0);
    const mostPlayed = appData.tracks.reduce((max, track) => 
        (track.plays || 0) > (max.plays || 0) ? track : max, { plays: 0 });
    
    document.getElementById('totalTracks').textContent = totalTracks;
    document.getElementById('totalPlays').textContent = totalPlays;
    document.getElementById('mostPlayed').textContent = mostPlayed.name || 'None';
}

// ===== MY MUSIC DASHBOARD =====
async function openUserDashboard() {
    if (!currentUser) {
        showNotification('Please sign in first', false);
        return;
    }
    
    const dashboard = document.getElementById('dashboardOverlay');
    if (dashboard) {
        document.getElementById('userEmail').textContent = currentUser.email;
        
        // Load user's tracks
        try {
            const { data: userTracks, error } = await supabase
                .from('tracks')
                .select('*')
                .eq('uploaded_by', currentUser.id)
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            
            const userTracksDiv = document.getElementById('userTracks');
            if (userTracks.length === 0) {
                userTracksDiv.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">You haven\'t uploaded any tracks yet.</p>';
            } else {
                userTracksDiv.innerHTML = userTracks.map(track => `
                    <div style="padding: 1rem; background: var(--secondary-bg); border-radius: 10px; display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <h4 style="margin: 0 0 0.5rem 0;">${track.name}</h4>
                            <p style="margin: 0; font-size: 0.9rem; color: var(--text-secondary);">${track.artist} • ${track.genre || 'No genre'}</p>
                            <p style="margin: 0.5rem 0 0 0; font-size: 0.8rem; color: var(--text-secondary);">▶️ ${track.plays || 0} plays</p>
                        </div>
                        <button class="btn-small btn-delete" onclick="deleteTrack('${track.id}'); openUserDashboard();">Delete</button>
                    </div>
                `).join('');
            }
        } catch (error) {
            console.error('Error loading user tracks:', error);
            document.getElementById('userTracks').innerHTML = '<p style="color: var(--danger);">Error loading tracks</p>';
        }
        
        dashboard.style.display = 'flex';
    }
}

// ===== ADMIN PANEL =====
function openAdmin() {
    if (!currentUserAdmin) {
        showNotification('❌ Admin access required', false);
        return;
    }
    
    const overlay = document.getElementById('adminOverlay');
    if (overlay) {
        overlay.style.display = 'flex';
        populateAdminForm();
    }
}

function closeAdmin(event) {
    if (event && event.target.id !== 'adminOverlay') return;
    const overlay = document.getElementById('adminOverlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

function populateAdminForm() {
    // General Tab
    document.getElementById('platformName').value = appData.platform_name || '';
    document.getElementById('platformDesc').value = appData.platform_desc || '';
    document.getElementById('heroTitle').value = appData.hero_title || '';
    document.getElementById('heroDesc').value = appData.hero_desc || '';
    document.getElementById('sectionTitle').value = appData.section_title || '';
    document.getElementById('footerText').value = appData.footer_text || '';
    
    // Design Tab - Colors
    if (appData.colors) {
        document.getElementById('colorPrimaryBg').value = appData.colors.primaryBg || '#faf8f3';
        document.getElementById('colorSecondaryBg').value = appData.colors.secondaryBg || '#f0ebe3';
        document.getElementById('colorWarm').value = appData.colors.accentWarm || '#d4a574';
        document.getElementById('colorDanger').value = appData.colors.danger || '#c17b6b';
        document.getElementById('colorSuccess').value = appData.colors.success || '#7ba98a';
        document.getElementById('colorTextPrimary').value = appData.colors.textPrimary || '#2a2520';
    }
    
    // Design Tab - Other settings
    document.getElementById('headerBlur').value = appData.header_blur || 10;
    document.getElementById('footerBg').value = appData.footer_bg || '#2a2520';
}

async function saveAdminForm() {
    const logoFile = document.getElementById('logoUpload').files[0];
    
    console.log('📝 Building form updates...');
    
    // Build colors object with explicit values from form
    const newColors = {
        primaryBg: document.getElementById('colorPrimaryBg').value || '#faf8f3',
        secondaryBg: document.getElementById('colorSecondaryBg').value || '#f0ebe3',
        danger: document.getElementById('colorDanger').value || '#c17b6b',
        success: document.getElementById('colorSuccess').value || '#7ba98a',
        accentWarm: document.getElementById('colorWarm').value || '#d4a574',
        textPrimary: document.getElementById('colorTextPrimary').value || '#2a2520'
    };
    
    console.log('🎨 New colors from form:', newColors);
    
    const updates = {
        platform_name: document.getElementById('platformName').value,
        platform_desc: document.getElementById('platformDesc').value,
        hero_title: document.getElementById('heroTitle').value,
        hero_desc: document.getElementById('heroDesc').value,
        section_title: document.getElementById('sectionTitle').value,
        footer_text: document.getElementById('footerText').value,
        header_blur: parseInt(document.getElementById('headerBlur').value) || 10,
        footer_bg: document.getElementById('footerBg').value || '#2a2520',
        colors: newColors
    };
    
    console.log('📦 Full updates object:', updates);
    
    // Handle logo upload if file is selected
    if (logoFile) {
        try {
            const logoBase64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = reject;
                reader.readAsDataURL(logoFile);
            });
            updates.logo_data = logoBase64;
        } catch (error) {
            console.error('Error reading logo file:', error);
        }
    }
    
    await saveAdminSettings(updates);
}

function applyTheme() {
    console.log('🎨 Applying theme...');
    console.log('📊 appData:', appData);
    console.log('🎨 appData.colors:', appData.colors);
    console.log('🌊 appData.header_blur:', appData.header_blur);
    console.log('🦶 appData.footer_bg:', appData.footer_bg);
    
    // Set default colors if not present
    const colors = appData.colors || {
        primaryBg: '#faf8f3',
        secondaryBg: '#f0ebe3',
        accentWarm: '#d4a574',
        danger: '#c17b6b',
        success: '#7ba98a',
        textPrimary: '#2a2520'
    };
    
    console.log('🎨 Colors to apply:', colors);
    
    // Apply colors to CSS custom properties
    const cssVars = {
        '--danger': colors.danger || '#c17b6b',
        '--success': colors.success || '#7ba98a',
        '--accent-warm': colors.accentWarm || '#d4a574',
        '--primary-bg': colors.primaryBg || '#faf8f3',
        '--secondary-bg': colors.secondaryBg || '#f0ebe3',
        '--text-primary': colors.textPrimary || '#2a2520'
    };
    
    Object.entries(cssVars).forEach(([varName, value]) => {
        document.documentElement.style.setProperty(varName, value);
        console.log(`✅ Set ${varName} = ${value}`);
    });
    
    console.log('✅ CSS variables applied');
    
    // Force body background update
    document.body.style.backgroundColor = colors.primaryBg || '#faf8f3';
    console.log(`✅ Body background: ${colors.primaryBg || '#faf8f3'}`);
    
    // Apply header blur
    const header = document.querySelector('header');
    if (header) {
        const blurValue = appData.header_blur || 10;
        header.style.backdropFilter = `blur(${blurValue}px)`;
        header.style.backgroundColor = `rgba(250, 248, 243, ${1 - (blurValue / 30)})`;
        console.log(`✅ Header blur applied: ${blurValue}px`);
    } else {
        console.warn('⚠️ Header element not found');
    }
    
    // Apply footer background
    const footer = document.querySelector('footer');
    if (footer) {
        footer.style.backgroundColor = appData.footer_bg || '#2a2520';
        console.log(`✅ Footer background applied: ${appData.footer_bg || '#2a2520'}`);
    } else {
        console.warn('⚠️ Footer element not found');
    }
    
    // Apply logo
    if (appData.logo_data) {
        const logoIcon = document.querySelector('.logo-icon');
        if (logoIcon) {
            logoIcon.innerHTML = `<img src="${appData.logo_data}" style="height: 40px; width: auto; object-fit: contain;">`;
            logoIcon.style.display = 'flex';
            logoIcon.style.alignItems = 'center';
            logoIcon.style.justifyContent = 'center';
            console.log('✅ Logo applied');
        }
    }
    
    // Update UI text
    if (appData.platform_name) {
        const logoText = document.getElementById('logoText');
        if (logoText) {
            logoText.textContent = appData.platform_name;
            console.log('✅ Platform name updated');
        }
    }
    if (appData.hero_title) {
        const heroTitle = document.getElementById('heroTitle');
        if (heroTitle) {
            heroTitle.textContent = appData.hero_title;
            console.log('✅ Hero title updated');
        }
    }
    if (appData.hero_desc) {
        const heroDesc = document.getElementById('heroDesc');
        if (heroDesc) {
            heroDesc.textContent = appData.hero_desc;
            console.log('✅ Hero description updated');
        }
    }
    if (appData.section_title) {
        const sectionTitle = document.getElementById('sectionTitle');
        if (sectionTitle) {
            sectionTitle.textContent = appData.section_title;
            console.log('✅ Section title updated');
        }
    }
    if (appData.footer_text) {
        const footerText = document.getElementById('footerText');
        if (footerText) {
            footerText.textContent = appData.footer_text;
            console.log('✅ Footer text updated');
        }
    }
}

// ===== AUTHENTICATION PANEL =====
function toggleAuthPanel() {
    const panel = document.getElementById('authPanel');
    if (panel.style.display === 'none') {
        panel.style.display = 'block';
    } else {
        panel.style.display = 'none';
    }
}

function closeAuthPanel() {
    document.getElementById('authPanel').style.display = 'none';
}

async function handleSignIn(e) {
    e.preventDefault();
    const email = document.getElementById('signInEmail').value;
    const password = document.getElementById('signInPassword').value;
    await signIn(email, password);
}

async function handleSignUp(e) {
    e.preventDefault();
    const email = document.getElementById('signUpEmail').value;
    const password = document.getElementById('signUpPassword').value;
    const username = document.getElementById('signUpUsername').value;
    
    if (password !== document.getElementById('signUpPasswordConfirm').value) {
        showNotification('❌ Passwords do not match', false);
        return;
    }
    
    if (await signUp(email, password, username)) {
        document.getElementById('signUpForm').reset();
        switchToSignIn();
    }
}

async function handleTrackUpload(e) {
    e.preventDefault();
    
    if (!currentUser) {
        showNotification('❌ You must be logged in to upload', false);
        return;
    }
    
    const file = document.getElementById('trackFile').files[0];
    if (!file) {
        showNotification('❌ Please select an audio file', false);
        return;
    }
    
    const coverFile = document.getElementById('trackCover').files[0];
    
    const metadata = {
        name: document.getElementById('trackName').value,
        artist: document.getElementById('trackArtist').value,
        genre: document.getElementById('trackGenre').value
    };
    
    if (await uploadTrack(file, coverFile, metadata)) {
        document.getElementById('uploadForm').reset();
        document.getElementById('trackCover').value = '';
    }
}

async function handleIssueSubmit(e) {
    e.preventDefault();
    
    const email = document.getElementById('issueEmail').value;
    const type = document.getElementById('issueType').value;
    const description = document.getElementById('issueDescription').value;
    const name = document.getElementById('issueName').value;
    
    // For now, just show success (in production, you'd send this to a backend)
    console.log('Issue report:', { name, email, type, description });
    showNotification('✅ Thank you! We received your report and will look into it.', true);
    
    document.getElementById('issueForm').reset();
    document.getElementById('issueModal').style.display = 'none';
}

// ===== MODAL MANAGEMENT =====
function handleShareMusic() {
    if (currentUser) {
        // User is logged in - scroll to upload section
        document.getElementById('uploadSection').scrollIntoView({ behavior: 'smooth' });
    } else {
        // User not logged in - show auth panel
        toggleAuthPanel();
    }
}

function closeDashboard(event) {
    if (event && event.target.id !== 'dashboardOverlay') return;
    const overlay = document.getElementById('dashboardOverlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

function closeModal(modalId, event) {
    if (event && event.target.id !== modalId) return;
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

function switchToSignIn(event) {
    if (event) event.preventDefault();
    document.getElementById('signInForm').style.display = 'block';
    document.getElementById('signUpForm').style.display = 'none';
}

function switchToSignUp(event) {
    if (event) event.preventDefault();
    document.getElementById('signInForm').style.display = 'none';
    document.getElementById('signUpForm').style.display = 'block';
}

function switchAdminTab(tabName) {
    // Hide all tabs
    document.getElementById('generalTab').classList.remove('active');
    document.getElementById('designTab').classList.remove('active');
    
    // Hide all tab buttons
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => btn.classList.remove('active'));
    
    // Show selected tab
    if (tabName === 'general') {
        document.getElementById('generalTab').classList.add('active');
        tabButtons[0].classList.add('active');
    } else if (tabName === 'design') {
        document.getElementById('designTab').classList.add('active');
        tabButtons[1].classList.add('active');
    }
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
    }
}

// ===== UTILITIES =====
function showNotification(message, isSuccess = true) {
    const notification = document.createElement('div');
    notification.className = 'notification' + (isSuccess ? '' : ' error');
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 4000);
}

function formatDuration(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function setupEventListeners() {
    // Header scroll
    window.addEventListener('scroll', () => {
        const header = document.querySelector('header');
        if (window.scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    });
    
    // Close panels on escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.getElementById('authPanel').style.display = 'none';
            document.getElementById('adminOverlay').style.display = 'none';
            document.getElementById('dashboardOverlay').style.display = 'none';
        }
    });
    
    // Upload form
    const uploadForm = document.getElementById('uploadForm');
    if (uploadForm) {
        uploadForm.addEventListener('submit', handleTrackUpload);
    }
    
    // Auth forms
    const signInForm = document.getElementById('signInForm');
    if (signInForm) {
        signInForm.addEventListener('submit', handleSignIn);
    }
    
    const signUpForm = document.getElementById('signUpForm');
    if (signUpForm) {
        signUpForm.addEventListener('submit', handleSignUp);
    }
    
    // Issue form
    const issueForm = document.getElementById('issueForm');
    if (issueForm) {
        issueForm.addEventListener('submit', handleIssueSubmit);
    }
}

// ===== AUTO-INITIALIZE =====
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}