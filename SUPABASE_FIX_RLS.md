# Supabase Row-Level Security (RLS) Fix Guide

## ⚠️ CRITICAL: This must be run FIRST to fix upload errors!

The "new row violates row-level security policy" error happens because RLS policies are preventing users from uploading tracks.

---

## STEP 1: Fix RLS Policies (Copy & Paste These SQL Queries)

### 1.1 Fix TRACKS table - Allow users to upload their own tracks

```sql
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view all tracks" ON public.tracks;
DROP POLICY IF EXISTS "Users can insert own tracks" ON public.tracks;
DROP POLICY IF EXISTS "Users can update own tracks" ON public.tracks;
DROP POLICY IF EXISTS "Users can delete own tracks" ON public.tracks;
DROP POLICY IF EXISTS "Admins can manage all tracks" ON public.tracks;

-- Create new policies
CREATE POLICY "Users can view all tracks" ON public.tracks
FOR SELECT USING (true);

CREATE POLICY "Users can insert own tracks" ON public.tracks
FOR INSERT WITH CHECK (auth.uid() = uploaded_by);

CREATE POLICY "Users can update own tracks" ON public.tracks
FOR UPDATE USING (auth.uid() = uploaded_by) 
WITH CHECK (auth.uid() = uploaded_by);

CREATE POLICY "Users can delete own tracks" ON public.tracks
FOR DELETE USING (auth.uid() = uploaded_by);

-- Admins can do everything (requires is_admin = true in users table)
CREATE POLICY "Admins can manage all tracks" ON public.tracks
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE users.id = auth.uid() 
    AND users.is_admin = true
  )
);
```

### 1.2 Fix USERS table - Allow auto-creation of user records

```sql
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view users" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;

-- Create new policies
CREATE POLICY "Users can view users" ON public.users
FOR SELECT USING (true);

CREATE POLICY "Users can insert own profile" ON public.users
FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.users
FOR UPDATE USING (auth.uid() = id) 
WITH CHECK (auth.uid() = id);
```

### 1.3 Fix ADMIN_SETTINGS table - Allow admins to update

```sql
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can view settings" ON public.admin_settings;
DROP POLICY IF EXISTS "Admins can update settings" ON public.admin_settings;

-- Create new policies
CREATE POLICY "Anyone can view settings" ON public.admin_settings
FOR SELECT USING (true);

CREATE POLICY "Admins can update settings" ON public.admin_settings
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE users.id = auth.uid() 
    AND users.is_admin = true
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE users.id = auth.uid() 
    AND users.is_admin = true
  )
);
```

---

## STEP 2: How to Run the SQL

1. **Go to Supabase Dashboard**: https://app.supabase.com
2. **Select Your Project**: `sxkmoiwpyxjyqrcctmhh`
3. **Go to SQL Editor**: Left sidebar → "SQL Editor"
4. **Click "New Query"**
5. **Copy & Paste each SQL block above** (one at a time)
6. **Click "RUN"** for each query
7. **Wait for "Success" message**

**Status Check** ✓: After running all SQL, try uploading a track - it should work now!

---

## STEP 3: Make Yourself Admin (Optional but Recommended)

To access the Admin Panel and customize the platform:

### 3.1 Find Your User ID

1. Go to Supabase → **Authentication** → **Users**
2. Find your email address in the list
3. Copy your **User ID** (it looks like a UUID)

### 3.2 Make Yourself Admin

**Replace `YOUR_USER_ID` with the ID from step 3.1**, then run this SQL:

```sql
UPDATE public.users
SET is_admin = true
WHERE id = 'YOUR_USER_ID';
```

For example (don't copy this, use your actual ID):
```sql
UPDATE public.users
SET is_admin = true
WHERE id = '550e8400-e29b-41d4-a716-446655440000';
```

**Status Check** ✓: After running this SQL, refresh the app and you'll see the "⚙️ Admin" button!

---

## STEP 4: Test Everything

### Upload Test
- ✅ Click "Share Your Music" while logged in
- ✅ Upload a track with title, artist, and audio file
- ✅ Select a cover image (optional)
- ✅ Click "Upload Track"
- ✅ Track should appear in "Featured Tracks" section

### Admin Test (if you ran Step 3)
- ✅ You should see "⚙️ Admin" button in header
- ✅ Click it to open Admin Panel
- ✅ Customize platform name, colors, text
- ✅ Click "Save Changes"
- ✅ Changes should appear on page

### My Music Test
- ✅ Upload a track
- ✅ Click "👤 My Music" button
- ✅ You should see your uploaded tracks with play counts
- ✅ You can delete tracks from there

---

## Troubleshooting

### "Still getting RLS error?"
- ✅ Make sure you ran ALL three SQL blocks (TRACKS, USERS, ADMIN_SETTINGS)
- ✅ Make sure no errors appeared when running SQL
- ✅ Refresh the page and try again
- ✅ Clear browser cache (Ctrl+Shift+Delete)

### "Admin button doesn't appear?"
- ✅ Make sure you ran the "Make Yourself Admin" SQL
- ✅ Make sure you replaced `YOUR_USER_ID` with your actual ID
- ✅ Refresh the page

### "Can't access admin panel?"
- ✅ The app checks `is_admin` flag in users table
- ✅ Make sure the UPDATE query ran successfully
- ✅ Check that your user ID is correct in the Supabase Auth → Users page

---

## What These Changes Do

| Policy | Purpose |
|--------|---------|
| Users can insert own tracks | Lets regular users upload (FIXES THE ERROR!) |
| Users can view all tracks | Everyone can see all public tracks |
| Admins can manage all | Admins can delete/edit any track |
| Users can insert own profile | Auto-creates user record on signup |
| Admins can update settings | Only admins can change platform settings |

---

## Summary

1. **RUN the SQL** → Fixes upload error
2. **FIND YOUR USER ID** → For admin access
3. **RUN the admin SQL** → Make yourself admin
4. **TEST** → Upload, view My Music, customize as admin

**Time required**: ~5 minutes

That's it! Your platform should now be fully functional! 🎉