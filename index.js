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

// Expose public URL and anon key to client
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY
  });
});

// Authentication Middleware: Verifies the JWT token from the Authorization header
const authenticateUser = async (req, res, next) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase client not initialized. Check server configurations.' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid authorization token.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Unauthorized: Invalid session or token expired.' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Authentication internal error: ' + err.message });
  }
};

// --- API ROUTES ---

// 1. Get list of all tables in the public schema
app.get('/api/tables', authenticateUser, async (req, res) => {
  try {
    const { data, error } = await supabase.rpc('get_tables');
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('Error fetching tables:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2. Get list of columns and datatypes for a specific table
app.get('/api/tables/:tableName/columns', authenticateUser, async (req, res) => {
  const { tableName } = req.params;
  try {
    const { data, error } = await supabase.rpc('get_columns', { t_name: tableName });
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error(`Error fetching columns for ${tableName}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// 3. Get all rows for a table dynamically
app.get('/api/tables/:tableName/rows', authenticateUser, async (req, res) => {
  const { tableName } = req.params;
  try {
    // If the table is 'items' and has a created_at field, order it. Otherwise, return unsorted.
    let query = supabase.from(tableName).select('*');
    
    // We try to fetch columns first to see if created_at exists for sorting
    const { data: columns } = await supabase.rpc('get_columns', { t_name: tableName });
    const hasCreatedAt = columns && columns.some(col => col.column_name === 'created_at');
    
    if (hasCreatedAt) {
      query = query.order('created_at', { ascending: false });
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error(`Error fetching rows for ${tableName}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// 4. Create a new row dynamically
app.post('/api/tables/:tableName/rows', authenticateUser, async (req, res) => {
  const { tableName } = req.params;
  try {
    const { data, error } = await supabase
      .from(tableName)
      .insert([req.body])
      .select();

    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (error) {
    console.error(`Error creating row in ${tableName}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// 5. Update a row dynamically (assumes ID primary key)
app.put('/api/tables/:tableName/rows/:id', authenticateUser, async (req, res) => {
  const { tableName, id } = req.params;
  try {
    const { data, error } = await supabase
      .from(tableName)
      .update(req.body)
      .eq('id', id)
      .select();

    if (error) throw error;
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Record not found' });
    }
    res.json(data[0]);
  } catch (error) {
    console.error(`Error updating row ${id} in ${tableName}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// 6. Delete a row dynamically (assumes ID primary key)
app.delete('/api/tables/:tableName/rows/:id', authenticateUser, async (req, res) => {
  const { tableName, id } = req.params;
  try {
    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true, message: 'Record deleted successfully' });
  } catch (error) {
    console.error(`Error deleting row ${id} in ${tableName}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// 7. Execute raw SQL (requires admin verification - protected by authenticated session)
app.post('/api/sql', authenticateUser, async (req, res) => {
  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ error: 'SQL Query query is required' });
  }
  try {
    const { data, error } = await supabase.rpc('execute_sql', { sql_query: query });
    if (error) throw error;
    res.json({ success: true, result: data });
  } catch (error) {
    console.error('Error running SQL statement:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve the index.html front-end for everything else
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`[READY] Dynamic CMS server running on port ${port}`);
  console.log(`[READY] Access panel at http://localhost:${port}`);
});
