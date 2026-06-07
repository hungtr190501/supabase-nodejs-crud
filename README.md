# Supabase Headless CMS & Database Admin Dashboard 🚀

A fully dynamic, dark-mode headless CMS and Database Explorer app built with Node.js and Supabase. Deploy it on your Android device with DroidDeploy and expose it globally. 

## Features
- **Supabase Authentication**: Integrated SignUp / Login / LogOut.
- **Interactive Swagger API Docs**: View and test REST endpoints dynamically at `/api-docs`!
- **Home Dashboard Screen**: Visually browse database statistics, latency status, database health, and quick links.
- **Dynamic Tables Selector**: Automatically reads and displays all tables in your database schema.
- **Dynamic Column Input Generator**: Auto-inspects database columns types (`boolean`, `number`, `text`, `timestamp`) and renders corresponding form fields.
- **Direct File Storage Upload**: Integrated drag-and-drop zone that uploads images/files to Supabase Storage.
- **Storage Diagnostics**: Visual uploader checks if bucket permissions exist, providing step-by-step SQL scripts to resolve bucket policy drops on failure.
- **GUI Table & Column Editors**: Create new tables and add new columns to active tables visually without typing SQL!
- **Auto-reconnection Tunnel**: Persistent public internet URL with built-in 5-second automatic reconnects on drops.

---

## 1. Setup Database Metadata & Storage Helpers (CRITICAL)

To enable dynamic table loading, column scanning, and storage upload, you **must run the following script** in your Supabase project's **SQL Editor**:

```sql
-- ==========================================
-- 1. Helper to list all public tables
-- ==========================================
create or replace function get_tables()
returns table(table_name text)
security definer
as $$
select table_name::text
from information_schema.tables
where table_schema = 'public'
  and table_type = 'BASE TABLE';
$$ language sql;

-- ==========================================
-- 2. Helper to fetch column schemas
-- ==========================================
create or replace function get_columns(t_name text)
returns table(column_name text, data_type text, is_nullable text)
security definer
as $$
select 
  c.column_name::text, 
  c.data_type::text, 
  c.is_nullable::text
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name = t_name;
$$ language sql;

-- ==========================================
-- 3. Helper to run raw SQL from Console
-- ==========================================
create or replace function execute_sql(sql_query text)
returns json
security definer
as $$
declare
  result json;
begin
  -- Try to run query as a select statement to return rows
  execute 'select json_agg(t) from (' || sql_query || ') t' into result;
  return result;
exception
  when others then
    -- Run as DDL/Write statement (e.g. CREATE TABLE)
    execute sql_query;
    return json_build_object('status', 'success');
end;
$$ language plpgsql;

-- ==========================================
-- 4. Setup Public uploads Storage bucket
-- ==========================================
insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', true)
on conflict (id) do nothing;

-- Set storage security policies to allow upload/download
create policy "Public insert objects"
on storage.objects for insert
with check (bucket_id = 'uploads');

create policy "Public read objects"
on storage.objects for select
using (bucket_id = 'uploads');
```

---

## 2. API Documentation

Once the app is running in DroidDeploy (locally on port `3000` or via global tunnel), navigate to **`/api-docs`** in your browser. 
- You will see the **Swagger UI** containing full API endpoint details.
- To execute requests from the Swagger page, click **Authorize** at the top and paste your Supabase session `access_token` (which you can inspect in your browser's Local Storage or retrieve after logging in).

---

## 3. Deploying on DroidDeploy

1. Commit and push the changes to your repository:
   ```bash
   git add .
   git commit -m "add swagger api documentation, home dashboard, and storage diagnostics"
   git push
   ```
2. Open the project detail screen in **DroidDeploy**.
3. Create your `.env` file containing the Supabase credentials if not already present:
   ```env
   PORT=3000
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```
4. Click **Stop** and **Deploy** again to restart the Node.js server.
5. Activate the **Public Domain Tunnel** to fetch your global URL.
6. Open the link on any browser to view the dynamic explorer!
