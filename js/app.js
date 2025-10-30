// ===== SUPABASE CONFIGURATION =====
const SUPABASE_URL = 'https://sxkmoiwpyxjyqrcctmhh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4a21vaXdweXhqeXFyY2N0bWhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4NDQ1NzUsImV4cCI6MjA3NzQyMDU3NX0.XTdNkdJFCa__oY1v1IZpNq0QDriJS6qDktKhSvT3aCo';

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ===== APPLICATION STATE =====
let appData = {};
let currentUser = null;
let currentAudioPlayer = null;
let audioCache = new Map(); // Cache for audio URLs to reduce API calls
let isLoading = false;

// Default data structure
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
    
    // Check if Supabase library is loaded
    if (!window.supabase) {
        console.error('❌ Supabase library not loaded. Make sure to include the Supabase script.');
        return;
    }
    
    // Load admin settings
    await loadAdminSettings();
    
    // Check auth status
    await checkAuthStatus();
    
    // Load and display tracks
    await loadTracks();
    
    // Setup event listeners
    setupEventListeners();
    
    console.log('✅ Application initialized');
}

// ===== AUTHENTICATION =====
async function checkAuthStatus() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            currentUser = user;
            updateAuthUI();
        }
    } catch (error) {
        console.warn('Not authenticated:', error);
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
    } else {
        authBtn.style.display = 'inline-block';
        userBtn.style.display = 'none';
        adminBtn.style.display = 'none';
        logoutBtn.style.display = 'none';
    }
}

async function checkIfAdmin() {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('is_admin')
            .eq('id', currentUser.id)
            .single();
        
        if (data && data.is_admin) {
            document.getElementById('adminBtn').style.display = 'inline-block';
        }
    } catch (error) {
        console.warn('Could not check admin status:', error);
    }
}

// ===== TRACK MANAGEMENT =====
async function loadTracks() {
    try {
        isLoading = true;
        console.log('📥 Loading tracks from Supabase...');
        
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

async function uploadTrack(file, metadata) {
    try {
        if (!currentUser) {
            showNotification('❌ You must be logged in to upload', false);
            return false;
        }
        
        showNotification('📤 Uploading track...', false);
        
        // Upload audio file to Supabase Storage
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
        const filePath = `${currentUser.id}/${fileName}`;
        
        const { error: uploadError } = await supabase.storage
            .from('audio')
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: false
            });
        
        if (uploadError) throw uploadError;
        
        // Get public URL
        const { data: { publicUrl } } = supabase.storage
            .from('audio')
            .getPublicUrl(filePath);
        
        // Create track record in database
        const { data: track, error: dbError } = await supabase
            .from('tracks')
            .insert([{
                name: metadata.name,
                artist: metadata.artist,
                genre: metadata.genre,
                uploaded_by: currentUser.id,
                plays: 0,
                duration: 0,
                cover_data: metadata.cover || null
            }])
            .select()
            .single();
        
        if (dbError) throw dbError;
        
        showNotification('✅ Track uploaded successfully!', true);
        audioCache.clear(); // Clear cache
        await loadTracks();
        return true;
    } catch (error) {
        console.error('❌ Error uploading track:', error);
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
        
        // Get track info first
        const { data: track, error: fetchError } = await supabase
            .from('tracks')
            .select('*')
            .eq('id', trackId)
            .single();
        
        if (fetchError) throw fetchError;
        
        // Check ownership (optional - admin bypass)
        if (track.uploaded_by !== currentUser.id) {
            const isAdmin = (await checkIfAdmin());
            if (!isAdmin) {
                showNotification('❌ You can only delete your own tracks', false);
                return false;
            }
        }
        
        // Delete from database
        const { error: dbError } = await supabase
            .from('tracks')
            .delete()
            .eq('id', trackId);
        
        if (dbError) throw dbError;
        
        // Delete from storage (fire and forget)
        deleteAudioFile(trackId);
        
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

async function deleteAudioFile(trackId) {
    try {
        // This assumes audio files are named by track ID
        const { error } = await supabase.storage
            .from('audio')
            .remove([`${currentUser.id}/${trackId}.mp3`]);
        
        if (error) console.warn('Warning: Could not delete audio file:', error);
    } catch (error) {
        console.warn('Error deleting audio:', error);
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
        // Check cache first
        if (audioCache.has(trackId)) {
            return audioCache.get(trackId);
        }
        
        const track = appData.tracks.find(t => t.id === trackId);
        if (!track) {
            console.warn('Track not found:', trackId);
            return null;
        }
        
        // Get public URL from storage
        // Construct path based on uploaded_by user ID
        const path = `${track.uploaded_by}/audio-${trackId}.mp3`;
        
        const { data: { publicUrl } } = supabase.storage
            .from('audio')
            .getPublicUrl(path);
        
        // Cache the URL
        audioCache.set(trackId, publicUrl);
        return publicUrl;
    } catch (error) {
        console.error('Error getting audio URL:', error);
        return null;
    }
}

// Firefox audio fix: Use blob URL for better replay support
async function getAudioBlobUrl(trackId) {
    try {
        const track = appData.tracks.find(t => t.id === trackId);
        if (!track) return null;
        
        const path = `${track.uploaded_by}/audio-${trackId}.mp3`;
        
        const { data, error } = await supabase.storage
            .from('audio')
            .download(path);
        
        if (error) throw error;
        
        // Create blob URL for better Firefox compatibility
        const blob = new Blob([data], { type: 'audio/mpeg' });
        const blobUrl = URL.createObjectURL(blob);
        
        return blobUrl;
    } catch (error) {
        console.error('Error creating audio blob:', error);
        return null;
    }
}

// ===== ADMIN SETTINGS =====
async function loadAdminSettings() {
    try {
        const { data, error } = await supabase
            .from('admin_settings')
            .select('*')
            .single();
        
        if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
        
        if (data) {
            appData = { ...appData, ...data };
        } else {
            // Create default settings
            await createDefaultAdminSettings();
        }
        
        applyTheme();
    } catch (error) {
        console.warn('Error loading admin settings:', error);
        applyTheme(); // Apply defaults
    }
}

async function createDefaultAdminSettings() {
    try {
        const { error } = await supabase
            .from('admin_settings')
            .insert([{
                platform_name: defaultData.platformName,
                platform_desc: defaultData.platformDesc,
                hero_title: defaultData.heroTitle,
                hero_desc: defaultData.heroDesc,
                section_title: defaultData.sectionTitle,
                footer_text: defaultData.footerText,
                colors: defaultData.colors
            }]);
        
        if (error) throw error;
        
        // Reload settings
        await loadAdminSettings();
    } catch (error) {
        console.error('Error creating default settings:', error);
    }
}

async function saveAdminSettings(settings) {
    try {
        if (!currentUser) {
            showNotification('❌ You must be an admin', false);
            return false;
        }
        
        const { error } = await supabase
            .from('admin_settings')
            .update(settings)
            .eq('id', appData.id);
        
        if (error) throw error;
        
        appData = { ...appData, ...settings };
        applyTheme();
        showNotification('✅ Settings saved!', true);
        return true;
    } catch (error) {
        console.error('Error saving settings:', error);
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
            <div class="music-cover">🎵</div>
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
            ${currentUser && currentUser.id === track.uploaded_by ? `
                <div class="music-controls">
                    <button class="btn-small btn-delete" onclick="deleteTrack('${track.id}')">🗑️ Delete</button>
                </div>
            ` : ''}
        </div>
    `).join('');
    
    // Load audio players after render
    setTimeout(() => {
        loadAudioPlayers();
    }, 100);
}

async function loadAudioPlayers() {
    for (const track of appData.tracks) {
        const playerDiv = document.getElementById(`player-${track.id}`);
        if (!playerDiv) continue;
        
        // Check if already has audio element
        if (playerDiv.querySelector('audio')) continue;
        
        try {
            // Try to get audio URL (Supabase public URL)
            const audioUrl = await getAudioUrl(track.id);
            
            if (audioUrl) {
                const audio = document.createElement('audio');
                audio.id = `audio-${track.id}`;
                audio.controls = true;
                audio.controlsList = 'nodownload';
                audio.preload = 'metadata';
                
                // Add Firefox-specific handling
                audio.addEventListener('play', function() {
                    console.log('🎵 Playing:', track.name);
                    incrementPlayCount(track.id);
                }, { once: true });
                
                // Firefox compatibility: reload on play to fix replay issues
                audio.addEventListener('play', function() {
                    if (navigator.userAgent.includes('Firefox')) {
                        // Reset current time for Firefox
                        if (this.currentTime === this.duration || isNaN(this.currentTime)) {
                            this.currentTime = 0;
                        }
                    }
                });
                
                audio.addEventListener('pause', function() {
                    // Auto-reset at end for seamless replay
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
                
                // Trigger metadata load
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

// ===== ADMIN PANEL =====
function openAdmin() {
    document.getElementById('adminOverlay').classList.add('active');
    populateAdminForm();
}

function closeAdmin() {
    document.getElementById('adminOverlay').classList.remove('active');
}

function populateAdminForm() {
    if (appData.colors) {
        document.getElementById('colorDanger').value = appData.colors.danger || '#c17b6b';
        document.getElementById('colorSuccess').value = appData.colors.success || '#7ba98a';
        document.getElementById('colorWarm').value = appData.colors.accentWarm || '#d4a574';
    }
    
    document.getElementById('platformName').value = appData.platformName || '';
    document.getElementById('platformDesc').value = appData.platformDesc || '';
    document.getElementById('heroTitle').value = appData.heroTitle || '';
    document.getElementById('heroDesc').value = appData.heroDesc || '';
    document.getElementById('sectionTitle').value = appData.sectionTitle || '';
    document.getElementById('footerText').value = appData.footerText || '';
}

function saveAdminForm() {
    const updates = {
        platform_name: document.getElementById('platformName').value,
        platform_desc: document.getElementById('platformDesc').value,
        hero_title: document.getElementById('heroTitle').value,
        hero_desc: document.getElementById('heroDesc').value,
        section_title: document.getElementById('sectionTitle').value,
        footer_text: document.getElementById('footerText').value,
        colors: {
            ...appData.colors,
            danger: document.getElementById('colorDanger').value,
            success: document.getElementById('colorSuccess').value,
            accentWarm: document.getElementById('colorWarm').value
        }
    };
    
    saveAdminSettings(updates);
}

function applyTheme() {
    if (!appData.colors) return;
    
    const colors = appData.colors;
    document.documentElement.style.setProperty('--danger', colors.danger || '#c17b6b');
    document.documentElement.style.setProperty('--success', colors.success || '#7ba98a');
    document.documentElement.style.setProperty('--accent-warm', colors.accentWarm || '#d4a574');
    document.documentElement.style.setProperty('--primary-bg', colors.primaryBg || '#faf8f3');
    document.documentElement.style.setProperty('--secondary-bg', colors.secondaryBg || '#f0ebe3');
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

function switchToSignUp() {
    document.getElementById('signInForm').style.display = 'none';
    document.getElementById('signUpForm').style.display = 'block';
}

function switchToSignIn() {
    document.getElementById('signUpForm').style.display = 'none';
    document.getElementById('signInForm').style.display = 'block';
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
        showNotification('❌ Please select a file', false);
        return;
    }
    
    const metadata = {
        name: document.getElementById('trackName').value,
        artist: document.getElementById('trackArtist').value,
        genre: document.getElementById('trackGenre').value
    };
    
    if (await uploadTrack(file, metadata)) {
        document.getElementById('uploadForm').reset();
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
            document.getElementById('adminOverlay').classList.remove('active');
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
}

// ===== AUTO-INITIALIZE =====
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}