require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const swaggerJSDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

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

// Swagger UI configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Supabase Headless CMS & Database API',
      version: '1.0.0',
      description: 'Fully dynamic REST API endpoints to manage database tables, columns, rows, and raw SQL scripts using your Supabase credentials.',
    },
    servers: [
      {
        url: '/',
        description: 'API base URL',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Authenticate by entering your Supabase session access_token (JWT).'
        }
      }
    },
    security: [{ BearerAuth: [] }]
  },
  apis: ['./index.js'],
};

const swaggerSpec = swaggerJSDoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

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

// --- API DOCUMENTATION & ROUTES ---

/**
 * @openapi
 * /api/config:
 *   get:
 *     summary: Retrieve public connection keys for the frontend client
 *     security: []
 *     responses:
 *       200:
 *         description: Connection settings retrieved successfully
 */

/**
 * @openapi
 * /api/tables:
 *   get:
 *     summary: Get a list of all tables in the public schema
 *     responses:
 *       200:
 *         description: Array of table metadata objects
 */
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

/**
 * @openapi
 * /api/tables/{tableName}/columns:
 *   get:
 *     summary: Get column schemas and datatypes for a table
 *     parameters:
 *       - in: path
 *         name: tableName
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Column metadata retrieved successfully
 */
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

/**
 * @openapi
 * /api/tables/{tableName}/rows:
 *   get:
 *     summary: Get all data rows inside a table
 *     parameters:
 *       - in: path
 *         name: tableName
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Array of rows from the database
 *   post:
 *     summary: Insert a new row/record into a table
 *     parameters:
 *       - in: path
 *         name: tableName
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       201:
 *         description: Row inserted successfully
 */
app.get('/api/tables/:tableName/rows', authenticateUser, async (req, res) => {
  const { tableName } = req.params;
  try {
    let query = supabase.from(tableName).select('*');
    
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

/**
 * @openapi
 * /api/tables/{tableName}/rows/{id}:
 *   put:
 *     summary: Update an existing row in a table (assumes 'id' is primary key)
 *     parameters:
 *       - in: path
 *         name: tableName
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Row updated successfully
 *   delete:
 *     summary: Delete a row in a table (assumes 'id' is primary key)
 *     parameters:
 *       - in: path
 *         name: tableName
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Row deleted successfully
 */
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

/**
 * @openapi
 * /api/sql:
 *   post:
 *     summary: Run raw SQL queries/DDL commands directly on the database
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               query:
 *                 type: string
 *     responses:
 *       200:
 *         description: Query executed successfully
 */
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
  console.log(`[READY] Swagger documentation available at http://localhost:${port}/api-docs`);
});
