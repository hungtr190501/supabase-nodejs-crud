require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('WARNING: Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment variables!');
  console.log('Please configure them in your .env file or DroidDeploy environment settings.');
}

const supabase = (supabaseUrl && supabaseAnonKey) ? createClient(supabaseUrl, supabaseAnonKey) : null;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API Routes

// 1. Get all items
app.get('/api/items', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase client not initialized. Check your environment variables (SUPABASE_URL and SUPABASE_ANON_KEY).' });
  }
  try {
    const { data, error } = await supabase
      .from('items')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2. Create a new item
app.post('/api/items', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase client not initialized. Check your environment variables.' });
  }
  const { name, description } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }
  try {
    const { data, error } = await supabase
      .from('items')
      .insert([{ name, description }])
      .select();

    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (error) {
    console.error('Error creating item:', error);
    res.status(500).json({ error: error.message });
  }
});

// 3. Update an item
app.put('/api/items/:id', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase client not initialized. Check your environment variables.' });
  }
  const { id } = req.params;
  const { name, description } = req.body;
  try {
    const { data, error } = await supabase
      .from('items')
      .update({ name, description })
      .eq('id', id)
      .select();

    if (error) throw error;
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json(data[0]);
  } catch (error) {
    console.error('Error updating item:', error);
    res.status(500).json({ error: error.message });
  }
});

// 4. Delete an item
app.delete('/api/items/:id', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase client not initialized. Check your environment variables.' });
  }
  const { id } = req.params;
  try {
    const { error } = await supabase
      .from('items')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true, message: 'Item deleted successfully' });
  } catch (error) {
    console.error('Error deleting item:', error);
    res.status(500).json({ error: error.message });
  }
});

// Fallback to serving public/index.html for any frontend requests
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`[READY] Server is running on port ${port}`);
  console.log(`[READY] Open http://localhost:${port} in your browser`);
});
