require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
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

// --- DYNAMIC SWAGGER SPECIFICATION GENERATOR ---
const generateDynamicSwaggerSpec = async () => {
  const spec = {
    openapi: '3.0.0',
    info: {
      title: 'Supabase Dynamic Database CMS API',
      version: '1.0.0',
      description: 'REST API endpoints generated dynamically from active PostgreSQL tables and columns. Authenticate using Bearer JWT.',
    },
    servers: [
      {
        url: '/',
        description: 'Tunneled Server Base',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your Supabase session access_token (JWT) to authorize requests.'
        }
      },
      schemas: {}
    },
    security: [{ BearerAuth: [] }],
    paths: {}
  };

  if (!supabase) return spec;

  try {
    // 1. Fetch tables
    const { data: tables, error: tErr } = await supabase.rpc('get_tables');
    if (tErr || !tables) return spec;

    // 2. Loop tables to get columns and build Swagger schemas/paths
    for (const t of tables) {
      const tableName = typeof t === 'object' ? t.table_name : t;

      const { data: columns, error: cErr } = await supabase.rpc('get_columns', { t_name: tableName });
      if (cErr || !columns) continue;

      const schemaProperties = {};
      const requiredFields = [];

      columns.forEach(col => {
        const { column_name, data_type, is_nullable } = col;
        
        let type = 'string';
        let format = undefined;
        
        if (['integer', 'bigint', 'smallint'].includes(data_type)) {
          type = 'integer';
        } else if (['numeric', 'real', 'double precision'].includes(data_type)) {
          type = 'number';
        } else if (data_type === 'boolean') {
          type = 'boolean';
        } else if (['timestamp', 'timestamp without time zone', 'timestamp with time zone', 'date'].includes(data_type)) {
          type = 'string';
          format = 'date-time';
        }

        schemaProperties[column_name] = { type };
        if (format) schemaProperties[column_name].format = format;

        if (is_nullable === 'NO' && column_name !== 'id' && column_name !== 'created_at') {
          requiredFields.push(column_name);
        }
      });

      // Register schema
      spec.components.schemas[tableName] = {
        type: 'object',
        properties: schemaProperties,
      };
      if (requiredFields.length > 0) {
        spec.components.schemas[tableName].required = requiredFields;
      }

      // Add REST Paths for each table
      spec.paths[`/api/tables/${tableName}/rows`] = {
        get: {
          summary: `Get all rows from "${tableName}"`,
          tags: [tableName],
          responses: {
            200: {
              description: `List of rows from "${tableName}"`,
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: { $ref: `#/components/schemas/${tableName}` }
                  }
                }
              }
            }
          }
        },
        post: {
          summary: `Insert a new row into "${tableName}"`,
          tags: [tableName],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: Object.keys(schemaProperties)
                    .filter(k => k !== 'id' && k !== 'created_at')
                    .reduce((acc, key) => {
                      acc[key] = schemaProperties[key];
                      return acc;
                    }, {})
                }
              }
            }
          },
          responses: {
            201: {
              description: 'Row created successfully',
              content: {
                'application/json': {
                  schema: { $ref: `#/components/schemas/${tableName}` }
                }
              }
            }
          }
        }
      };

      spec.paths[`/api/tables/${tableName}/rows/{id}`] = {
        put: {
          summary: `Update a row by ID in "${tableName}"`,
          tags: [tableName],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Primary Key ID of the row to update'
            }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: Object.keys(schemaProperties)
                    .filter(k => k !== 'id' && k !== 'created_at')
                    .reduce((acc, key) => {
                      acc[key] = schemaProperties[key];
                      return acc;
                    }, {})
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Row updated successfully',
              content: {
                'application/json': {
                  schema: { $ref: `#/components/schemas/${tableName}` }
                }
              }
            }
          }
        },
        delete: {
          summary: `Delete a row by ID from "${tableName}"`,
          tags: [tableName],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Primary Key ID of the row to delete'
            }
          ],
          responses: {
            200: {
              description: 'Row deleted successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      message: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        }
      };
    }
  } catch (err) {
    console.error('Error generating dynamic Swagger schema:', err);
  }

  return spec;
};

// Mount Swagger UI dynamically - queries active DB schemas on request
app.use('/api-docs', swaggerUi.serve, async (req, res, next) => {
  try {
    req.swaggerDoc = await generateDynamicSwaggerSpec();
  } catch (err) {
    console.error('Swagger spec generation middleware error:', err);
  }
  next();
}, swaggerUi.setup());

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

// --- DYNAMIC REST ROUTINGS ---

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
  console.log(`[READY] Dynamic schema-based Swagger docs available at http://localhost:${port}/api-docs`);
});
